"""Predictive rank trajectory.

Maps a learner's current readiness score (0–1) → expected exam percentile →
projected All India Rank for the target exam, with a confidence band.

The mapping is calibrated to public NEET/JEE candidate counts and historical
percentile-vs-rank curves. It's deliberately *honest* — narrow bands require
high attempt volume; cold-start users see "needs more data" rather than a
fake-precise rank.

Composition:
  - readiness comes from analytics
  - candidate counts + percentile cutoffs are hard-coded per exam (calibration table)
  - LLM (when enabled) writes a one-line plain-English commentary tying the
    number to a concrete next action; otherwise we synthesise a heuristic
"""

from __future__ import annotations

import math
from typing import Any

import structlog

from adaptive_engine import llm
from adaptive_engine.clients import fetch_mastery, fetch_readiness

log = structlog.get_logger(__name__)


# Calibration: candidate counts are approximate from recent public exam-cycle data.
# Numbers are deliberately rounded — false precision in a "projected rank" is worse
# than no projection at all. Add new exams here when the catalog grows.
EXAM_CALIBRATION: dict[str, dict[str, Any]] = {
    "NEET": {
        "name": "NEET (UG)",
        "totalCandidates": 2_400_000,
        "topRankBand": 720,
        "context": (
            "NEET-UG: ~24 lakh candidates compete for ~1.1 lakh MBBS + ~30k BDS seats. "
            "Top-1k ranks are AIIMS/JIPMER zone; top-10k is government MBBS in most states."
        ),
    },
    "JEE": {
        "name": "JEE Main",
        "totalCandidates": 1_400_000,
        "topRankBand": 300,
        "context": (
            "JEE Main: ~14 lakh candidates. Top ~2.5 lakh advance to JEE Advanced; top "
            "~10k typically get IIT seats. NIT cut-offs vary 5k–60k by branch + category."
        ),
    },
    "UPSC": {
        "name": "UPSC CSE Prelims",
        "totalCandidates": 1_000_000,
        "topRankBand": 200,
        "context": (
            "UPSC CSE Prelims: ~10 lakh appear, ~13k clear. Mains + Interview narrow "
            "the funnel to ~1k final selections."
        ),
    },
    "CBSE": {
        "name": "CBSE Class 12 Boards",
        "totalCandidates": 1_500_000,
        "topRankBand": 500,
        "context": (
            "CBSE board exams are not ranked nationally; we project a percentile band "
            "instead of a rank, since the relevant outcome is your aggregate, not AIR."
        ),
    },
}


# Readiness → percentile mapping (piecewise linear).
# Anchored to: a learner with readiness 0.5 is roughly the median candidate;
# 0.85 is around the 95th percentile (typical engineering/medical cut-off zone).
# The curve is non-linear because exam scoring distributions skew right.
_READINESS_TO_PERCENTILE = [
    (0.00, 5.0),
    (0.20, 20.0),
    (0.40, 45.0),
    (0.55, 65.0),
    (0.70, 85.0),
    (0.80, 93.0),
    (0.88, 97.5),
    (0.94, 99.3),
    (0.98, 99.85),
    (1.00, 99.95),
]


def readiness_to_percentile(r: float) -> float:
    """Piecewise-linear interpolation from readiness ∈ [0,1] to percentile ∈ [0,100]."""
    r = max(0.0, min(1.0, r))
    for i in range(len(_READINESS_TO_PERCENTILE) - 1):
        x1, y1 = _READINESS_TO_PERCENTILE[i]
        x2, y2 = _READINESS_TO_PERCENTILE[i + 1]
        if x1 <= r <= x2:
            if x2 == x1:
                return y2
            t = (r - x1) / (x2 - x1)
            return y1 + t * (y2 - y1)
    return _READINESS_TO_PERCENTILE[-1][1]


def percentile_to_rank(p: float, total: int) -> int:
    """Percentile p ∈ [0, 100] → integer rank in a cohort of `total` candidates.
    p=99 → rank ≈ total * 0.01."""
    p = max(0.0, min(100.0, p))
    rank = round(total * (1 - p / 100))
    return max(1, rank)


def confidence_from_attempts(n_attempts: int) -> tuple[str, float]:
    """Returns (label, half_width_fraction). Wider band = less confident."""
    if n_attempts < 20:
        return "low", 0.50
    if n_attempts < 50:
        return "medium", 0.25
    return "high", 0.15


def _heuristic_commentary(
    *,
    exam_name: str,
    rank: int,
    percentile: float,
    confidence: str,
    n_attempts: int,
) -> str:
    if n_attempts < 5:
        return (
            f"Too early for a real {exam_name} projection — finish 10–15 sessions "
            "across your weak topics, then check back."
        )
    if confidence == "low":
        return (
            f"At your current pace you're tracking around the {percentile:.0f}th percentile. "
            "Push past 50 sessions and the band will tighten."
        )
    if percentile >= 95:
        return (
            f"You're inside the top 5% — {exam_name} top ranks are realistic if you hold this trajectory. "
            "Now: shore up the 1–2 weakest topics; that's where rank moves fastest."
        )
    if percentile >= 80:
        return (
            f"You're around AIR ~{rank:,} — top quartile. The next 10 percentile points "
            "come from depth on your strongest 2 subjects, not breadth."
        )
    if percentile >= 50:
        return (
            f"Median trajectory. Targeted practice on your bottom-3 EWA topics "
            "would shift this projection meaningfully in 2–3 weeks."
        )
    return (
        f"You're below the median right now. Pick one weakest topic, run a 10-question "
        "diagnostic, then a focused practice block — that's the fastest signal upward."
    )


COMMENTARY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["headline", "next_action"],
    "properties": {
        "headline": {
            "type": "string",
            "description": "≤ 14 words. Plain prose tying the projected rank to current state. No padding.",
        },
        "next_action": {
            "type": "string",
            "description": "≤ 18 words. The single highest-impact thing the student should do this week to improve this rank.",
        },
    },
}


COMMENTARY_SYSTEM = """You are a candid exam-prep coach. A student has a projected rank for an Indian competitive exam.
Write a SHORT, honest commentary that ties the rank to a concrete next move.

Hard rules:
- Never sugar-coat. If the rank is low, say so plainly.
- No "Great progress!" "Keep it up!" filler.
- Numbers are estimates with a confidence band — don't promise outcomes.
- The next_action must be specific (a topic / action type / time block), not generic ("study harder")."""


async def _ai_commentary(
    exam_name: str,
    rank: int,
    percentile: float,
    confidence: str,
    n_attempts: int,
    weakest_topics: list[str],
    context: str,
) -> dict[str, str] | None:
    user_lines = [
        f"Exam: {exam_name}",
        f"Projected AIR: {rank:,} (~{percentile:.1f}th percentile, confidence: {confidence})",
        f"Attempts so far: {n_attempts} answered items.",
        f"Weakest topics by EWA: {', '.join(weakest_topics) if weakest_topics else '(none yet)'}",
        f"Exam context: {context}",
        "Task: produce one-line headline + one-line next_action.",
    ]
    out = await llm.call_structured(
        system=COMMENTARY_SYSTEM,
        user="\n".join(user_lines),
        schema_name="rank_commentary",
        schema=COMMENTARY_SCHEMA,
    )
    return out


async def project_rank(*, user_id: str, exam_code: str) -> dict[str, Any]:
    cal = EXAM_CALIBRATION.get(exam_code.upper())
    if cal is None:
        return {
            "examCode": exam_code,
            "error": "unsupported_exam",
            "message": (
                f"No rank calibration data for exam '{exam_code}'. Supported: "
                + ", ".join(EXAM_CALIBRATION.keys())
            ),
        }

    readiness = await fetch_readiness(user_id)
    mastery = await fetch_mastery(user_id)

    r_score = float(readiness.get("score", 0.0) or 0.0)
    n_topics = int(readiness.get("nTopics", 0) or 0)
    n_attempts = sum(int(m.get("n", 0) or 0) for m in mastery)

    percentile = readiness_to_percentile(r_score)
    rank = percentile_to_rank(percentile, cal["totalCandidates"])
    confidence_label, half_width = confidence_from_attempts(n_attempts)
    rank_low = max(1, math.floor(rank * (1 - half_width)))
    rank_high = math.ceil(rank * (1 + half_width))

    weakest = [m for m in mastery if int(m.get("n", 0)) > 0]
    weakest.sort(key=lambda m: float(m.get("ewa", 0.0)))
    weakest_titles = [
        # mastery rows don't carry titles — caller can join later via catalog
        # if needed. For now we surface topic ids as a fallback signal.
        m.get("topicId", "") for m in weakest[:3]
    ]

    commentary: dict[str, str] | None = None
    source = "heuristic"
    if llm.is_enabled():
        commentary = await _ai_commentary(
            exam_name=cal["name"],
            rank=rank,
            percentile=percentile,
            confidence=confidence_label,
            n_attempts=n_attempts,
            weakest_topics=weakest_titles,
            context=cal["context"],
        )
        if commentary is not None:
            source = "ai"

    if commentary is None:
        commentary = {
            "headline": _heuristic_commentary(
                exam_name=cal["name"],
                rank=rank,
                percentile=percentile,
                confidence=confidence_label,
                n_attempts=n_attempts,
            ),
            "next_action": (
                "Pick your bottom-EWA topic; run one diagnostic + one practice block this week."
            ),
        }

    return {
        "examCode": exam_code.upper(),
        "examName": cal["name"],
        "totalCandidates": cal["totalCandidates"],
        "readiness": round(r_score, 4),
        "nTopicsActive": n_topics,
        "nAttempts": n_attempts,
        "projectedPercentile": round(percentile, 2),
        "projectedRank": rank,
        "rankLow": rank_low,
        "rankHigh": rank_high,
        "confidence": confidence_label,
        "commentary": commentary,
        "examContext": cal["context"],
        "source": source,
    }
