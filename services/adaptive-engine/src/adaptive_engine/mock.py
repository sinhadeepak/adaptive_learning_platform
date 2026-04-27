"""AI-generated mock tests.

Composes a full-length mock paper for a target exam:
  1. Looks up the exam blueprint (NEET / JEE) — section weights, total Qs,
     duration, +/- marks per question.
  2. Picks topics from the user's catalog scoped to the exam.
  3. For each topic, retrieves IRT-calibrated questions from the Quiz bank
     and selects a mix matched to the blueprint's difficulty distribution.
  4. Returns the mock plan: ordered question IDs, sections, timer, scoring
     rules. The UI drives the actual session.
  5. Scoring reuses the same +/- rules + maps the raw score to an
     AIR projection through the existing rank calibration.

This is an MVP — first NEET/JEE. UPSC/CBSE follow once their blueprints
are calibrated. The bank is small (480 MCQs) so mocks are short by design
(20–30 Qs); full-length 180 Q NEET papers wait for content scaling.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

import structlog

from adaptive_engine.clients import (
    fetch_mastery,
    fetch_similar_problems,
    fetch_topic_catalog,
)
from adaptive_engine.rank import (
    EXAM_CALIBRATION,
    confidence_from_attempts,
    percentile_to_rank,
    readiness_to_percentile,
)

log = structlog.get_logger(__name__)


# Per-exam blueprint. For each section: name, share of total questions,
# +/- marks per item.
#
# All counts here are MVP — proportional to a real blueprint but scaled down
# to fit the 480-MCQ bank. As the bank grows (Sprint 6+) bump `totalQuestions`
# and the section counts to the real exam shape (NEET = 200 / JEE = 90).
MOCK_BLUEPRINTS: dict[str, dict[str, Any]] = {
    "NEET": {
        "name": "NEET (UG) — Quick Mock",
        "totalQuestions": 20,
        "durationMinutes": 25,
        "marksCorrect": 4,
        "marksWrong": -1,
        "marksUnanswered": 0,
        "maxMarks": 80,
        "sections": [
            {"name": "Physics", "share": 0.25},
            {"name": "Chemistry", "share": 0.25},
            {"name": "Biology", "share": 0.50},
        ],
    },
    "JEE": {
        "name": "JEE Main — Quick Mock",
        "totalQuestions": 20,
        "durationMinutes": 25,
        "marksCorrect": 4,
        "marksWrong": -1,
        "marksUnanswered": 0,
        "maxMarks": 80,
        "sections": [
            {"name": "Physics", "share": 0.33},
            {"name": "Chemistry", "share": 0.33},
            {"name": "Mathematics", "share": 0.34},
        ],
    },
}


# Difficulty mix — each mock blends easy/medium/hard regardless of section.
# Tuned so a competent student lands ~50–60% raw, matching a real exam's spread.
DIFFICULTY_MIX = {"easy": 0.30, "medium": 0.50, "hard": 0.20}


def supported_mock_exams() -> list[str]:
    return list(MOCK_BLUEPRINTS.keys())


async def _topics_for_section(exam_code: str, section_name: str) -> list[dict[str, Any]]:
    """Pull catalog topics for an exam, then filter by section name (subject).
    The catalog uses subject as the section equivalent (Physics, Chemistry,
    Biology, Maths). We rely on subjectName matching the section name."""
    catalog = await fetch_topic_catalog(exam_code)
    section_lc = section_name.lower()
    out = []
    for t in catalog:
        sn = (t.get("subjectName") or "").lower()
        # Allow loose match — "Mathematics" → catalog's "Maths", "Biology" → "Bio".
        if section_lc in sn or sn in section_lc:
            out.append(t)
    return out


def _select_for_section(
    candidates: list[dict[str, Any]],
    n_needed: int,
    user_mastery: dict[str, float],
) -> list[dict[str, Any]]:
    """Pick up to n_needed questions from a section's candidate pool. Mixes
    the difficulty distribution + biases toward topics where the learner has
    no signal yet (so the mock surfaces blind spots, not just review)."""
    if not candidates or n_needed <= 0:
        return []

    # Sort candidates so unfamiliar topics + average difficulty come first.
    def sort_key(q: dict[str, Any]) -> tuple[float, float]:
        topic_id = q.get("topicId", "")
        ewa = user_mastery.get(topic_id, 0.0)
        # Prefer topics with low or no signal (smaller ewa first), then easier.
        return (ewa, abs(q.get("difficultyB", 0.0)))

    pool = sorted(candidates, key=sort_key)
    return pool[:n_needed]


async def _candidates_for_topic(topic_id: str, want: int) -> list[dict[str, Any]]:
    """Pull `want` items from the Quiz bank for a topic. Limited by bank size."""
    return await fetch_similar_problems(topic_id, limit=max(want, 5))


# In-memory mock-session store. Keyed by mockId (uuid). Each entry holds
# the full plan (incl. correctMap) plus a `created_at` timestamp.
# TTL: 90 minutes — generous enough for exam duration + review time, short
# enough that orphans don't accumulate. Evicted lazily on read.
_MOCK_TTL_SECONDS = 90 * 60
_active_mocks: dict[str, dict[str, Any]] = {}


def _evict_expired() -> None:
    now = time.time()
    stale = [
        mid for mid, plan in _active_mocks.items()
        if now - plan.get("_createdAt", 0) > _MOCK_TTL_SECONDS
    ]
    for mid in stale:
        del _active_mocks[mid]


def _public_plan(plan: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of `plan` with the server-only fields stripped so the
    client can't read correct answers."""
    pub = dict(plan)
    pub.pop("_correctMap", None)
    pub.pop("_createdAt", None)
    return pub


def get_active_mock(mock_id: str) -> dict[str, Any] | None:
    _evict_expired()
    return _active_mocks.get(mock_id)


async def plan_mock(*, user_id: str, exam_code: str) -> dict[str, Any]:
    """Compose a mock plan. Returns the ordered question list + section
    metadata + timer + scoring rules. Plan is stateless; the UI drives the
    actual session."""
    bp = MOCK_BLUEPRINTS.get(exam_code.upper())
    if bp is None:
        return {
            "examCode": exam_code,
            "error": "unsupported_exam",
            "message": (
                f"No mock blueprint for '{exam_code}'. Supported: "
                + ", ".join(MOCK_BLUEPRINTS.keys())
            ),
        }

    mastery_rows = await fetch_mastery(user_id) if user_id else []
    user_mastery: dict[str, float] = {
        row["topicId"]: float(row.get("ewa", 0.0)) for row in mastery_rows
    }

    total = int(bp["totalQuestions"])
    section_plans = []
    all_questions: list[dict[str, Any]] = []

    for section in bp["sections"]:
        section_n = round(total * section["share"])
        topics = await _topics_for_section(exam_code, section["name"])
        # Distribute desired count across available topics evenly, then
        # fall back if some topics return fewer items than the share asks.
        per_topic = max(1, section_n // max(1, len(topics))) if topics else 0

        section_candidates: list[dict[str, Any]] = []
        for t in topics:
            items = await _candidates_for_topic(t["topicId"], per_topic + 2)
            section_candidates.extend(items)

        chosen = _select_for_section(section_candidates, section_n, user_mastery)
        # Build wire-shaped section payload.
        section_plans.append(
            {
                "name": section["name"],
                "questionCount": len(chosen),
                "fromIdx": len(all_questions),
                "toIdx": len(all_questions) + len(chosen),
            }
        )
        all_questions.extend(chosen)

    if not all_questions:
        return {
            "examCode": exam_code,
            "error": "empty_bank",
            "message": (
                f"Couldn't build a mock for {exam_code} — no published "
                "questions in the catalog for this exam yet."
            ),
        }

    mock_id = f"mock_{uuid.uuid4().hex[:16]}"
    plan = {
        "mockId": mock_id,
        "userId": user_id,
        "examCode": exam_code.upper(),
        "examName": bp["name"],
        "durationMinutes": bp["durationMinutes"],
        "totalQuestions": len(all_questions),
        "marksCorrect": bp["marksCorrect"],
        "marksWrong": bp["marksWrong"],
        "marksUnanswered": bp["marksUnanswered"],
        "maxMarks": bp["maxMarks"],
        "sections": section_plans,
        "questions": [
            {
                "id": q["id"],
                "topicId": q["topicId"],
                "stem": q["stem"],
                "choices": q["choices"],
                "difficultyB": q.get("difficultyB", 0.0),
                "language": q.get("language", "en"),
            }
            for q in all_questions
        ],
        "_correctMap": {q["id"]: q["correctIdx"] for q in all_questions},
        "_createdAt": time.time(),
        "source": "ai" if user_mastery else "heuristic",
    }
    _evict_expired()
    _active_mocks[mock_id] = plan
    log.info("mock_planned", mock_id=mock_id, exam=exam_code, n=len(all_questions))
    # Return only the public-safe view to the caller.
    return _public_plan(plan)


def score_mock(
    *,
    plan: dict[str, Any],
    answers: dict[str, int],
) -> dict[str, Any]:
    """Score a submitted mock. `answers` is {questionId: pickedIdx}.
    Returns score, accuracy, percentile, projected AIR + section breakdown.

    Plan must be the same dict returned by plan_mock — including the hidden
    _correctMap. In production this state lives in adaptive-engine and is
    keyed by (userId, mockId) so the client never sees correct answers
    until submission. For now (MVP) the caller round-trips it; we'll move
    to a stored attempt model when content scales.
    """
    bp_marks_correct = int(plan["marksCorrect"])
    bp_marks_wrong = int(plan["marksWrong"])
    correct_map: dict[str, int] = plan.get("_correctMap", {})

    total = int(plan["totalQuestions"])
    n_correct = 0
    n_wrong = 0
    n_unanswered = 0
    raw_score = 0

    section_stats: dict[str, dict[str, int]] = {
        s["name"]: {"correct": 0, "wrong": 0, "unanswered": 0, "total": s["questionCount"]}
        for s in plan["sections"]
    }
    # Build a question_id → section_name lookup using fromIdx/toIdx.
    qid_to_section: dict[str, str] = {}
    for sec in plan["sections"]:
        for q in plan["questions"][sec["fromIdx"] : sec["toIdx"]]:
            qid_to_section[q["id"]] = sec["name"]

    for q in plan["questions"]:
        qid = q["id"]
        picked = answers.get(qid)
        section_name = qid_to_section.get(qid, "Other")
        section = section_stats.setdefault(
            section_name, {"correct": 0, "wrong": 0, "unanswered": 0, "total": 0}
        )
        if picked is None:
            n_unanswered += 1
            section["unanswered"] += 1
            continue
        correct_idx = correct_map.get(qid, -1)
        if int(picked) == int(correct_idx):
            n_correct += 1
            section["correct"] += 1
            raw_score += bp_marks_correct
        else:
            n_wrong += 1
            section["wrong"] += 1
            raw_score += bp_marks_wrong  # negative

    accuracy = n_correct / total if total else 0.0
    # Map raw_score → readiness-equivalent → percentile → rank using the
    # rank module's calibration. raw_score / max_marks gives a [0, 1] proxy
    # for readiness on this paper.
    max_marks = int(plan["maxMarks"])
    paper_readiness = max(0.0, raw_score / max_marks) if max_marks else 0.0
    percentile = readiness_to_percentile(paper_readiness)

    cal = EXAM_CALIBRATION.get(plan["examCode"])
    projected_rank = (
        percentile_to_rank(percentile, cal["totalCandidates"])
        if cal
        else 0
    )
    confidence_label, half_width = confidence_from_attempts(total)
    rank_low = max(1, int(projected_rank * (1 - half_width)))
    rank_high = int(projected_rank * (1 + half_width))

    return {
        "examCode": plan["examCode"],
        "examName": plan["examName"],
        "rawScore": raw_score,
        "maxMarks": max_marks,
        "accuracy": round(accuracy, 4),
        "totalQuestions": total,
        "nCorrect": n_correct,
        "nWrong": n_wrong,
        "nUnanswered": n_unanswered,
        "marksCorrect": bp_marks_correct,
        "marksWrong": bp_marks_wrong,
        "percentile": round(percentile, 2),
        "projectedRank": projected_rank,
        "rankLow": rank_low,
        "rankHigh": rank_high,
        "confidence": confidence_label,
        "sections": [
            {
                "name": s,
                "correct": stats["correct"],
                "wrong": stats["wrong"],
                "unanswered": stats["unanswered"],
                "total": stats["total"],
            }
            for s, stats in section_stats.items()
        ],
    }
