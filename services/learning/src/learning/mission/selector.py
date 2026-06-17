"""Pure-function mission selector.

Resolution order (per ADR-0024):
  1. plan_session_today exists → wrap as mission (skipped here; route layer)
  2. Highest-priority decay (mastery > 0.4 + days > 14) → refresh_decay
  3. Highest-priority weak concept (mastery < 0.4) → weak_concept_drill
  4. Bloom inversion (REMEMBER ≥ 0.7, APPLY < 0.4) → bloom_lift
  5. SRS queue ≥ 5 same-topic due-today → revision_set
  6. Last mock > 14 days ago → mock_segment
  7. Else: weak_concept_drill on the lowest-mastery concept

Anti-repeat: if last_mission.kind + concept matches the picked one,
demote to next-priority candidate (avoid back-to-back same).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal


@dataclass(frozen=True)
class MasteryRow:
    concept_id: str
    ewa: float
    n: int
    last_seen_at: datetime | None


@dataclass(frozen=True)
class DecaySignal:
    concept_id: str
    days_since_seen: int
    ewa: float


@dataclass(frozen=True)
class RevisionItem:
    concept_id: str
    topic_id: str | None
    due_at: datetime


@dataclass(frozen=True)
class MockAttempt:
    completed_at: datetime
    score_pct: float


@dataclass(frozen=True)
class Mission:
    kind: Literal[
        "refresh_decay",
        "weak_concept_drill",
        "bloom_lift",
        "revision_set",
        "mock_segment",
    ]
    concept_id: str | None
    topic_id: str | None
    expected_minutes: int
    expected_questions: int
    why_picked: str
    primary_cta: dict[str, Any]


def _heuristic_why(kind: str, **kwargs: Any) -> str:
    templates = {
        "refresh_decay":
            "This topic dropped from {before:.2f} to {after:.2f} after {days} days without practice.",
        "weak_concept_drill":
            "You missed {wrong}/{total} on your last attempt; mastery is at {ewa:.0%}.",
        "bloom_lift":
            "You can recall it (REMEMBER {recall:.0%}); today's mission stretches you to apply it.",
        "revision_set":
            "{count} questions are due today by spaced repetition.",
        "mock_segment":
            "Mock-pace is your weakest signal — last mock was {days} days ago.",
    }
    try:
        return templates[kind].format(**kwargs)
    except (KeyError, IndexError):
        return "Today's focus picked from your recent practice signals."


def select_mission(
    *,
    time_budget_minutes: int = 25,
    concept_mastery: dict[str, MasteryRow],
    bloom_mastery: dict[tuple[str, str], MasteryRow] | None = None,
    decay_signals: list[DecaySignal] | None = None,
    revision_queue: list[RevisionItem] | None = None,
    mock_history: list[MockAttempt] | None = None,
    last_mission_kind: str | None = None,
    last_mission_concept_id: str | None = None,
    today: datetime | None = None,
) -> Mission:
    today = today or datetime.now(timezone.utc)
    bloom_mastery = bloom_mastery or {}
    decay_signals = decay_signals or []
    revision_queue = revision_queue or []
    mock_history = mock_history or []

    candidates: list[Mission] = []

    # 1. Decay: any concept with mastery > 0.4 unseen for > 14 days
    decays = sorted(
        (d for d in decay_signals if d.days_since_seen > 14 and d.ewa > 0.4),
        key=lambda d: d.days_since_seen,
        reverse=True,
    )
    if decays:
        d = decays[0]
        candidates.append(
            Mission(
                kind="refresh_decay",
                concept_id=d.concept_id,
                topic_id=None,
                expected_minutes=time_budget_minutes,
                expected_questions=max(8, time_budget_minutes // 2),
                why_picked=_heuristic_why(
                    "refresh_decay",
                    before=d.ewa, after=max(0.0, d.ewa - 0.1), days=d.days_since_seen,
                ),
                primary_cta={"action": "start_quiz", "concept_id": d.concept_id, "intent": "match"},
            )
        )

    # 2. Weak concepts (mastery < 0.4 with at least 2 attempts)
    weak = sorted(
        (m for m in concept_mastery.values() if m.ewa < 0.4 and m.n >= 2),
        key=lambda m: m.ewa,
    )
    if weak:
        w = weak[0]
        candidates.append(
            Mission(
                kind="weak_concept_drill",
                concept_id=w.concept_id,
                topic_id=None,
                expected_minutes=max(20, time_budget_minutes),
                expected_questions=max(10, time_budget_minutes // 2),
                why_picked=_heuristic_why(
                    "weak_concept_drill", wrong=int((1 - w.ewa) * 10), total=10, ewa=w.ewa,
                ),
                primary_cta={"action": "start_quiz", "concept_id": w.concept_id, "intent": "build_confidence"},
            )
        )

    # 3. Bloom lift — REMEMBER strong, APPLY weak
    for (concept_id, level), bm in bloom_mastery.items():
        if level == "BLOOM_REMEMBER" and bm.ewa >= 0.7:
            apply_key = (concept_id, "BLOOM_APPLY")
            apply_row = bloom_mastery.get(apply_key)
            if apply_row is None or apply_row.ewa < 0.4:
                candidates.append(
                    Mission(
                        kind="bloom_lift",
                        concept_id=concept_id,
                        topic_id=None,
                        expected_minutes=time_budget_minutes,
                        expected_questions=10,
                        why_picked=_heuristic_why(
                            "bloom_lift", recall=bm.ewa,
                        ),
                        primary_cta={"action": "start_quiz", "concept_id": concept_id, "intent": "push", "bloom": "APPLY"},
                    )
                )
                break

    # 4. Revision queue — 5+ due-today same topic
    if revision_queue:
        by_topic: dict[str, list[RevisionItem]] = {}
        for r in revision_queue:
            if r.topic_id and r.due_at <= today:
                by_topic.setdefault(r.topic_id, []).append(r)
        for tid, items in by_topic.items():
            if len(items) >= 5:
                candidates.append(
                    Mission(
                        kind="revision_set",
                        concept_id=None,
                        topic_id=tid,
                        expected_minutes=10,
                        expected_questions=5,
                        why_picked=_heuristic_why("revision_set", count=len(items)),
                        primary_cta={"action": "start_revision", "topic_id": tid},
                    )
                )
                break

    # 5. Mock segment if last mock > 14 days ago
    if mock_history:
        last_mock_age = (today - max(m.completed_at for m in mock_history)).days
    else:
        last_mock_age = 999
    if last_mock_age > 14:
        candidates.append(
            Mission(
                kind="mock_segment",
                concept_id=None,
                topic_id=None,
                expected_minutes=30,
                expected_questions=15,
                why_picked=_heuristic_why("mock_segment", days=last_mock_age),
                primary_cta={"action": "start_mock_segment"},
            )
        )

    # 7. Fallback — lowest-mastery concept
    if not candidates and concept_mastery:
        m = min(concept_mastery.values(), key=lambda x: x.ewa)
        candidates.append(
            Mission(
                kind="weak_concept_drill",
                concept_id=m.concept_id,
                topic_id=None,
                expected_minutes=time_budget_minutes,
                expected_questions=10,
                why_picked="Picked the concept with the most signal to gain on this week.",
                primary_cta={"action": "start_quiz", "concept_id": m.concept_id, "intent": "match"},
            )
        )

    if not candidates:
        # Cold-start mission for new users — generic practice
        return Mission(
            kind="weak_concept_drill",
            concept_id=None,
            topic_id=None,
            expected_minutes=time_budget_minutes,
            expected_questions=10,
            why_picked="Welcome — start a short practice round to seed your profile.",
            primary_cta={"action": "browse_catalog"},
        )

    # Anti-repeat: skip if same kind + concept as last_mission
    for c in candidates:
        if last_mission_kind == c.kind and last_mission_concept_id == c.concept_id:
            continue
        return c
    return candidates[0]
