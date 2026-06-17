"""Sprint 33 (P4-S33) — pure-function gap analysis.

Turns `(current_readiness, target_rank, weeks_to_exam)` into a concrete
week-by-week action recommendation. Composes the S30 pacing helpers
(`mocks_per_week_target`, `weekly_volume_minutes`, `readiness_target_for_rank`,
`trajectory_status`) into a single UI-ready dict.

Pure: no DB / HTTP coupling.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from learning.adaptive.pacing import (
    mocks_per_week_target,
    readiness_target_for_rank,
    trajectory_status,
    weekly_volume_minutes,
    weeks_to_exam,
)

Priority = Literal["foundation", "drill", "peaking", "no_target"]


def gap_to_target(current_readiness: float, target_rank: int) -> float:
    """Readiness gap. Positive = student is behind, negative = ahead."""
    return readiness_target_for_rank(target_rank) - float(current_readiness)


def priority_for_window(weeks_to_exam_value: float) -> Priority:
    """Phase of the prep cycle:
        > 10 weeks → foundation (concept-build)
        1-10 weeks → drill (timed practice)
        < 1 week  → peaking (revision + light mocks)
    """
    if weeks_to_exam_value <= 0:
        return "peaking"
    if weeks_to_exam_value < 1:
        return "peaking"
    if weeks_to_exam_value > 10:
        return "foundation"
    return "drill"


def daily_topics_target(gap: float, priority: Priority) -> int:
    """How many extra weak-topic drills/day to add. Capped at 5 to keep the
    plan tractable. Foundation phase drills more; peaking drills less."""
    if priority == "no_target":
        return 0
    base = max(1, round(gap * 10))   # 0.1 gap → 1 drill, 0.5 gap → 5
    if priority == "foundation":
        return min(5, base + 1)
    if priority == "peaking":
        return max(1, base - 1)
    return min(5, base)


def recommended_weekly_actions(
    gap: float, weeks_to_exam_value: float
) -> dict[str, Any]:
    priority = priority_for_window(weeks_to_exam_value)
    return {
        "priority": priority,
        "weeklyMockTarget": mocks_per_week_target(weeks_to_exam_value),
        "weeklyMinutesTarget": weekly_volume_minutes(weeks_to_exam_value),
        "dailyTopicsTarget": daily_topics_target(gap, priority),
    }


def _headline(status: str, gap: float, target_rank: int | None) -> str:
    if status == "no_target":
        return "Set a target rank to see your gap analysis."
    if target_rank is None:
        return "Set a target rank to see your gap analysis."
    if status == "ahead":
        return f"You are ahead of your AIR {target_rank} target — keep the cadence."
    if status == "on_track":
        return f"You are on track for AIR {target_rank}."
    return (
        f"You are behind your AIR {target_rank} target by ~{gap:.2f} readiness. "
        "Tighten the weekly plan."
    )


def summarise_gap(
    current_readiness: float,
    target_rank: int | None,
    exam_date: date | None,
    today: date,
) -> dict[str, Any]:
    """UI-ready bundle combining trajectory + actions + headline."""
    status = trajectory_status(current_readiness, target_rank, exam_date, today)
    weeks = weeks_to_exam(exam_date, today)
    gap = (
        gap_to_target(current_readiness, target_rank) if target_rank is not None else 0.0
    )
    actions = recommended_weekly_actions(gap, weeks)
    return {
        "trajectoryStatus": status,
        "currentReadiness": round(float(current_readiness), 4),
        "targetRank": target_rank,
        "weeksToExam": round(weeks, 2),
        "readinessGap": round(gap, 4),
        "actions": actions,
        "headline": _headline(status, gap, target_rank),
    }
