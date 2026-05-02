"""Readiness bands — Phase 6 S56.

Pure-function classifier of readiness vs. exam target. Thresholds in
config-friendly constants so editorial tuning doesn't need code.
"""

from __future__ import annotations

from typing import Literal

# Per-day improvement-rate caps (linear approximation per ADR proposal)
ON_TRACK_DAILY_CAP = 0.005   # ~+5pp/month
BEHIND_DAILY_CAP = 0.010     # ~+10pp/month


def readiness_band(
    *,
    readiness_score: float,
    days_to_exam: int,
    target_score: float = 0.7,
) -> Literal["approaching", "on_track", "behind", "at_risk"]:
    """approaching: at or above target
       on_track: gap closeable at <5pp/month
       behind: gap closeable at <10pp/month
       at_risk: gap requires >10pp/month
    """
    if readiness_score >= target_score:
        return "approaching"
    if days_to_exam <= 0:
        return "at_risk"  # exam day — anything below target is at risk
    gap = target_score - readiness_score
    needed_per_day = gap / days_to_exam
    if needed_per_day < ON_TRACK_DAILY_CAP:
        return "on_track"
    if needed_per_day < BEHIND_DAILY_CAP:
        return "behind"
    return "at_risk"


# Suggested recovery actions per band — drives the Home ribbon CTAs.
BAND_ACTIONS: dict[str, list[str]] = {
    "approaching": [
        "Maintain rhythm: 3 sessions per week",
        "One mock per week to lock pace",
    ],
    "on_track": [
        "Continue daily missions",
        "Address one weak concept this week",
    ],
    "behind": [
        "Increase to 5 sessions/week",
        "Run a focused weakness drill on the lowest-mastery concept",
        "One timed mock to calibrate",
    ],
    "at_risk": [
        "Step up to 6 sessions/week",
        "Two weak-concept drills back-to-back",
        "Daily revision micro-set (5 questions)",
        "Consider an exam-date adjustment if available",
    ],
}
