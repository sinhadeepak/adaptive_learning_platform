"""Sprint 30 (P4-S30) — pure-function tests for pacing helpers."""

from __future__ import annotations

from datetime import date

from learning.adaptive.pacing import (
    days_to_exam,
    mocks_per_week_target,
    readiness_target_for_rank,
    study_phase,
    trajectory_status,
    weekly_volume_minutes,
    weeks_to_exam,
)

TODAY = date(2026, 5, 1)


def test_study_phase_bands() -> None:
    assert study_phase(None) == "foundation"   # no target
    assert study_phase(200) == "foundation"
    assert study_phase(140) == "build"
    assert study_phase(36) == "build"
    assert study_phase(35) == "consolidate"
    assert study_phase(8) == "consolidate"
    assert study_phase(7) == "peak"
    assert study_phase(0) == "peak"            # exam today/past


def test_days_to_exam_handles_none() -> None:
    assert days_to_exam(None, TODAY) == 0


def test_days_to_exam_clamps_past_dates_to_zero() -> None:
    assert days_to_exam(date(2026, 4, 1), TODAY) == 0


def test_days_to_exam_returns_positive_for_future() -> None:
    assert days_to_exam(date(2026, 5, 31), TODAY) == 30


def test_weeks_to_exam_is_days_over_seven() -> None:
    assert weeks_to_exam(date(2026, 5, 22), TODAY) == 3.0


def test_mocks_per_week_target_scales_by_band() -> None:
    assert mocks_per_week_target(0) == 0
    assert mocks_per_week_target(0.5) == 4    # final week
    assert mocks_per_week_target(3) == 3      # 1–5w
    assert mocks_per_week_target(7) == 2      # 5–10w
    assert mocks_per_week_target(15) == 1     # 10–20w
    assert mocks_per_week_target(30) == 0     # > 20w


def test_weekly_volume_minutes_scales_too() -> None:
    assert weekly_volume_minutes(0) == 0
    assert weekly_volume_minutes(0.5) == 1800   # 30 hrs
    assert weekly_volume_minutes(15) == 480     # 8 hrs


def test_readiness_target_for_top_rank_is_high() -> None:
    assert readiness_target_for_rank(1000) >= 0.85


def test_readiness_target_for_low_rank_is_lower() -> None:
    assert readiness_target_for_rank(50000) <= 0.55


def test_readiness_target_interpolates_between_bands() -> None:
    # rank 7500 sits between 5000 (0.78) and 10000 (0.70) → expect ~0.74
    val = readiness_target_for_rank(7500)
    assert 0.70 <= val <= 0.78


def test_trajectory_no_target_when_goals_missing() -> None:
    assert trajectory_status(0.6, None, date(2026, 6, 1), TODAY) == "no_target"
    assert trajectory_status(0.6, 5000, None, TODAY) == "no_target"


def test_trajectory_on_track_within_band() -> None:
    # target_rank 10000 → readiness target ~0.70
    out = trajectory_status(0.70, 10000, date(2026, 6, 1), TODAY)
    assert out == "on_track"


def test_trajectory_behind_when_far_below_target() -> None:
    out = trajectory_status(0.40, 10000, date(2026, 6, 1), TODAY)
    assert out == "behind"


def test_trajectory_ahead_when_well_above_target() -> None:
    out = trajectory_status(0.95, 10000, date(2026, 6, 1), TODAY)
    assert out == "ahead"
