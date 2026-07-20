"""Sprint 30 (P4-S30) — pure-function pacing helpers for the closed-loop
study plan.

The study-plan recompute uses these to scale mocks-per-week, identify
trajectory status, and tighten weak-topic cadence as the exam approaches.
Pure functions only: no DB / HTTP coupling.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

TrajectoryStatus = Literal["on_track", "behind", "ahead", "no_target"]

# Sprint P3-S3.3 — study-plan tapering phases. The daily action mix shifts from
# broad concept-building far out to PYQ + mistake-replay + mocks near the exam.
StudyPhase = Literal["foundation", "build", "consolidate", "peak"]


def study_phase(days_to_exam_value: int | None) -> StudyPhase:
    """Classify the countdown phase driving the study-plan action mix.

    `None` (no exam target set) → ``foundation`` (no time pressure). A concrete
    count of 0 means the exam is today/past → ``peak``.

      > 140 days (>~20 weeks) → foundation  (build fundamentals broadly)
      36–140 days             → build        (practice + targeted revision)
      8–35 days               → consolidate  (PYQ drills + mistake replay + mocks)
      <= 7 days               → peak         (mocks + mistake replay, no new topics)
    """
    if days_to_exam_value is None:
        return "foundation"
    if days_to_exam_value <= 7:
        return "peak"
    if days_to_exam_value <= 35:
        return "consolidate"
    if days_to_exam_value <= 140:
        return "build"
    return "foundation"


def days_to_exam(exam_date: date | None, today: date) -> int:
    """Days until the exam. 0 when exam_date is today or in the past;
    `None` when no goal is set returns 0 (no pacing pressure)."""
    if exam_date is None:
        return 0
    return max(0, (exam_date - today).days)


def weeks_to_exam(exam_date: date | None, today: date) -> float:
    return days_to_exam(exam_date, today) / 7.0


def mocks_per_week_target(weeks_to_exam_value: float) -> int:
    """S-curve scaling: more mocks as the exam approaches.

    Bands:
      > 20 weeks   → 0 / week (foundation phase; one-shot mocks discouraged)
      10–20 weeks  → 1 / week
      5–10 weeks   → 2 / week
      1–5 weeks    → 3 / week
      < 1 week     → 4 / week (peaking)
    """
    if weeks_to_exam_value <= 0:
        return 0
    if weeks_to_exam_value < 1:
        return 4
    if weeks_to_exam_value < 5:
        return 3
    if weeks_to_exam_value < 10:
        return 2
    if weeks_to_exam_value < 20:
        return 1
    return 0


# Coarse readiness targets per rank percentile bucket. These mirror the
# rank.py lookup table (S31 calibrates against cohort data).
_RANK_READINESS_TARGETS: list[tuple[int, float]] = [
    (1000, 0.90),    # AIR ~1000 → readiness 0.90
    (5000, 0.78),
    (10000, 0.70),
    (25000, 0.60),
    (50000, 0.50),
    (100000, 0.40),
]


def readiness_target_for_rank(target_rank: int) -> float:
    """Linear interpolation across the rank → readiness band."""
    if target_rank <= _RANK_READINESS_TARGETS[0][0]:
        return _RANK_READINESS_TARGETS[0][1]
    if target_rank >= _RANK_READINESS_TARGETS[-1][0]:
        return _RANK_READINESS_TARGETS[-1][1]
    for i in range(len(_RANK_READINESS_TARGETS) - 1):
        r1, t1 = _RANK_READINESS_TARGETS[i]
        r2, t2 = _RANK_READINESS_TARGETS[i + 1]
        if r1 <= target_rank <= r2:
            ratio = (target_rank - r1) / (r2 - r1)
            return t1 + ratio * (t2 - t1)
    return _RANK_READINESS_TARGETS[-1][1]


def trajectory_status(
    current_readiness: float,
    target_rank: int | None,
    exam_date: date | None,
    today: date,
    *,
    on_track_band: float = 0.05,
) -> TrajectoryStatus:
    """Classify whether the user is on/ahead/behind their target trajectory.

    Returns `no_target` when goals aren't set. Otherwise compares
    `current_readiness` against the per-rank readiness target with a
    symmetric band: within +/- on_track_band → on_track.
    """
    if target_rank is None or exam_date is None:
        return "no_target"
    target = readiness_target_for_rank(target_rank)
    if current_readiness >= target + on_track_band:
        return "ahead"
    if current_readiness <= target - on_track_band:
        return "behind"
    return "on_track"


def weekly_volume_minutes(weeks_to_exam_value: float) -> int:
    """Coarse weekly study-minutes target. Same S-curve shape as
    mocks_per_week_target but in minutes/week."""
    if weeks_to_exam_value <= 0:
        return 0
    if weeks_to_exam_value < 1:
        return 30 * 60   # 30 hrs in the final week
    if weeks_to_exam_value < 5:
        return 20 * 60   # 20 hrs
    if weeks_to_exam_value < 10:
        return 12 * 60   # 12 hrs
    if weeks_to_exam_value < 20:
        return 8 * 60
    return 5 * 60
