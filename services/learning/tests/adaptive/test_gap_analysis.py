"""Sprint 33 (P4-S33) — pure-function tests for gap_analysis."""

from __future__ import annotations

from datetime import date

from learning.adaptive.gap_analysis import (
    daily_topics_target,
    gap_to_target,
    priority_for_window,
    recommended_weekly_actions,
    summarise_gap,
)


def test_gap_to_target_positive_when_behind() -> None:
    # AIR 1000 → target readiness 0.90; user at 0.50 → gap +0.40
    g = gap_to_target(0.50, 1000)
    assert g == 0.40


def test_gap_to_target_negative_when_ahead() -> None:
    g = gap_to_target(0.95, 1000)
    assert g < 0


def test_priority_for_window_phases() -> None:
    assert priority_for_window(0) == "peaking"
    assert priority_for_window(0.5) == "peaking"
    assert priority_for_window(2) == "drill"
    assert priority_for_window(11) == "foundation"


def test_daily_topics_target_caps_at_five() -> None:
    # Massive gap; foundation phase
    assert daily_topics_target(1.0, "foundation") == 5
    # No gap; drill phase
    assert daily_topics_target(0.0, "drill") == 1


def test_daily_topics_target_zero_when_no_target() -> None:
    assert daily_topics_target(0.5, "no_target") == 0


def test_recommended_weekly_actions_foundation_phase() -> None:
    actions = recommended_weekly_actions(gap=0.3, weeks_to_exam_value=15)
    assert actions["priority"] == "foundation"
    assert actions["weeklyMockTarget"] == 1
    assert actions["weeklyMinutesTarget"] == 8 * 60
    assert 1 <= actions["dailyTopicsTarget"] <= 5


def test_recommended_weekly_actions_peaking_week() -> None:
    actions = recommended_weekly_actions(gap=0.1, weeks_to_exam_value=0.5)
    assert actions["priority"] == "peaking"
    assert actions["weeklyMockTarget"] == 4
    assert actions["weeklyMinutesTarget"] == 30 * 60


def test_summarise_gap_no_target_when_goal_unset() -> None:
    out = summarise_gap(0.6, None, None, date(2026, 4, 28))
    assert out["trajectoryStatus"] == "no_target"
    assert "Set a target rank" in out["headline"]


def test_summarise_gap_behind_with_target() -> None:
    out = summarise_gap(
        current_readiness=0.50,
        target_rank=1000,
        exam_date=date(2027, 1, 15),
        today=date(2026, 4, 28),
    )
    assert out["trajectoryStatus"] == "behind"
    assert out["readinessGap"] == 0.40
    assert "AIR 1000" in out["headline"]


def test_summarise_gap_ahead_when_above_target() -> None:
    out = summarise_gap(
        current_readiness=0.95,
        target_rank=10000,  # target readiness 0.70 → ahead
        exam_date=date(2026, 11, 15),
        today=date(2026, 4, 28),
    )
    assert out["trajectoryStatus"] == "ahead"
    assert "ahead" in out["headline"]
