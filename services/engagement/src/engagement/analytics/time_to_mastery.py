"""Phase 1C — time-to-mastery estimate per (user, topic).

Heuristic v1: from current EWA, estimate hours of focused practice
needed to reach a target. Velocity decays as EWA approaches 1.0
(diminishing returns near mastery), so the function is non-linear.

If `daily_activity` shows a recent practice rate, project forward in
days at that pace; otherwise return raw hours only.

A confidence-1.0 implementation would calibrate velocity from peer
cohort data (users who actually reached the target on this topic),
but v1 gets meaningful numbers without a cohort-fit step.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Per-question EWA delta tuning. With current_ewa=0 a single attempt
# moves EWA by ~0.05; near 0.7 it's ~0.015. Calibrated against the
# alpha=0.4 EWA decay used in mastery rollups.
_BASE_DELTA = 0.05
_MIN_DELTA = 0.005
_MINS_PER_QUESTION = 2.5

DEFAULT_TARGET_EWA = 0.7


@dataclass
class TimeToMastery:
    user_id: str
    topic_id: str
    current_ewa: float
    target_ewa: float
    questions_needed: int          # 0 if already at/above target
    hours_to_target: float
    days_at_current_pace: float | None  # null if no recent activity
    daily_questions_30d: float
    confidence: str                # "low" | "medium" | "high" — v1: "low"
    notes: list[str]


def _per_question_delta(current_ewa: float) -> float:
    """Diminishing-returns velocity. Linear interp between
    _BASE_DELTA at ewa=0 and _MIN_DELTA at ewa=1."""
    e = max(0.0, min(1.0, current_ewa))
    return _BASE_DELTA - (_BASE_DELTA - _MIN_DELTA) * e


async def estimate(
    session: AsyncSession,
    *,
    user_id: str,
    topic_id: str,
    target_ewa: float = DEFAULT_TARGET_EWA,
) -> TimeToMastery | None:
    """Returns None if the (user, topic) combo has zero data."""
    notes: list[str] = []

    row = (
        await session.execute(
            text(
                """
                SELECT ewa, n, updated_at
                  FROM analytics_schema.mastery
                 WHERE user_id = CAST(:uid AS uuid)
                   AND topic_id = CAST(:tid AS uuid)
                """
            ),
            {"uid": user_id, "tid": topic_id},
        )
    ).first()
    if row is None:
        # Cold-start — no attempts on this topic yet. Estimate from a
        # synthetic ewa=0 starting point.
        current_ewa = 0.0
        notes.append("No attempts yet on this topic — estimate is from cold-start.")
    else:
        current_ewa = float(row[0])

    if current_ewa >= target_ewa:
        return TimeToMastery(
            user_id=user_id,
            topic_id=topic_id,
            current_ewa=round(current_ewa, 4),
            target_ewa=target_ewa,
            questions_needed=0,
            hours_to_target=0.0,
            days_at_current_pace=0.0,
            daily_questions_30d=0.0,
            confidence="high",
            notes=["Already at or above target."],
        )

    # Iterate forward in steps until we reach target. Cap at 200
    # questions (anything more is "would take months").
    ewa = current_ewa
    questions = 0
    while ewa < target_ewa and questions < 200:
        ewa += _per_question_delta(ewa)
        questions += 1
    if questions >= 200:
        notes.append("Estimate capped at 200 questions — gap is too wide for a near-term forecast.")

    hours = round(questions * _MINS_PER_QUESTION / 60.0, 2)

    # Recent practice rate from daily_activity (last 30 days).
    rate_row = (
        await session.execute(
            text(
                """
                SELECT COALESCE(AVG(questions_answered)::real, 0)
                  FROM analytics_schema.daily_activity
                 WHERE user_id = CAST(:uid AS uuid)
                   AND activity_date >= NOW()::date - INTERVAL '30 days'
                """
            ),
            {"uid": user_id},
        )
    ).first()
    avg_qpd = float(rate_row[0]) if rate_row else 0.0

    days_at_pace: float | None = None
    if avg_qpd > 0:
        days_at_pace = round(questions / avg_qpd, 1)
    else:
        notes.append("No practice activity in the last 30 days — can't project a date.")

    confidence = "low"
    if row and row[1] is not None and int(row[1]) >= 5:
        confidence = "medium"
    if avg_qpd > 0 and confidence == "medium":
        confidence = "high"

    return TimeToMastery(
        user_id=user_id,
        topic_id=topic_id,
        current_ewa=round(current_ewa, 4),
        target_ewa=target_ewa,
        questions_needed=questions,
        hours_to_target=hours,
        days_at_current_pace=days_at_pace,
        daily_questions_30d=round(avg_qpd, 1),
        confidence=confidence,
        notes=notes,
    )
