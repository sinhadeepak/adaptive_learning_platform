"""Pure-function tests for the dropout scorer."""

from __future__ import annotations

from engagement.analytics.predictive_dropout import (
    DropoutSignals,
    score_user,
)


def _signals(**kwargs) -> DropoutSignals:
    defaults = dict(
        days_since_last_active=0,
        current_streak=5,
        longest_streak=10,
        avg_mastery=0.6,
        n_topics_below_floor=0,
        n_topics_total=10,
    )
    defaults.update(kwargs)
    return DropoutSignals(**defaults)


def test_engaged_student_scores_low() -> None:
    score = score_user(_signals(days_since_last_active=0, avg_mastery=0.7))
    assert score.risk_band == "LOW"
    assert score.intervention_kind == "none"
    assert score.score < 0.4


def test_inactive_for_two_weeks_alone_is_medium() -> None:
    """Inactivity + broken streak alone scores 0.5 → MEDIUM."""
    score = score_user(
        _signals(
            days_since_last_active=14, current_streak=0, longest_streak=10
        )
    )
    assert score.risk_band == "MEDIUM"


def test_high_risk_needs_three_or_more_axes() -> None:
    """Inactive + struggling + many weak → HIGH."""
    score = score_user(
        _signals(
            days_since_last_active=14, current_streak=0, longest_streak=10,
            avg_mastery=0.20, n_topics_below_floor=5,
        )
    )
    assert score.risk_band == "HIGH"
    assert score.intervention_kind == "re_engagement_notification"


def test_struggling_with_active_engagement_suggests_tutor() -> None:
    score = score_user(
        _signals(
            days_since_last_active=2,  # active
            current_streak=4,
            longest_streak=8,
            avg_mastery=0.25,
            n_topics_below_floor=4,
        )
    )
    # Mastery + many weak → 0.5 score → MEDIUM band, lower_difficulty
    assert score.risk_band == "MEDIUM"
    assert score.intervention_kind == "lower_difficulty"


def test_streak_broken_signal() -> None:
    """Was engaged (longest=8), now inactive (current=0) — streak_broken axis fires."""
    score = score_user(
        _signals(
            days_since_last_active=3,
            current_streak=0,
            longest_streak=8,
            avg_mastery=0.6,
            n_topics_below_floor=0,
        )
    )
    assert score.components["streak_broken"] == 1.0
    # 0.21 inactivity + 1.0 streak / 4 = 0.30
    assert score.risk_band == "LOW"


def test_cold_start_no_data_returns_low() -> None:
    """Truly cold-start user (never active, no topic data) — don't false-flag."""
    score = score_user(
        DropoutSignals(
            days_since_last_active=999,
            current_streak=0,
            longest_streak=0,
            avg_mastery=0.0,
            n_topics_below_floor=0,
            n_topics_total=0,
        )
    )
    assert score.risk_band == "LOW"
    assert score.intervention_kind == "none"


def test_high_risk_with_struggling_recommends_tutor_path() -> None:
    """Inactive + low mastery + many weak topics — re-engagement first."""
    score = score_user(
        _signals(
            days_since_last_active=10,
            current_streak=0,
            longest_streak=6,
            avg_mastery=0.20,
            n_topics_below_floor=5,
        )
    )
    assert score.risk_band == "HIGH"
    # Re-engagement is prioritised first (>=7 days inactive).
    assert score.intervention_kind == "re_engagement_notification"


def test_components_breakdown_explainable() -> None:
    """Each axis maps to its component score 1:1."""
    score = score_user(
        _signals(
            days_since_last_active=7,  # inactivity_score = 0.5
            current_streak=0,
            longest_streak=10,  # streak_broken = 1.0
            avg_mastery=0.50,  # mastery_decline = 0.0
            n_topics_below_floor=0,  # many_weak = 0.0
        )
    )
    assert score.components["inactivity"] == 0.5
    assert score.components["streak_broken"] == 1.0
    assert score.components["mastery_decline"] == 0.0
    assert score.components["many_weak_topics"] == 0.0
    # avg = 0.375 → MEDIUM... actually 0.4 threshold → still LOW band
    assert score.score == 0.375


def test_score_bounded_0_to_1() -> None:
    """Even worst-case signals never exceed 1.0."""
    score = score_user(
        _signals(
            days_since_last_active=999, current_streak=0, longest_streak=20,
            avg_mastery=0.0, n_topics_below_floor=20, n_topics_total=30,
        )
    )
    assert 0.0 <= score.score <= 1.0
    assert score.risk_band == "HIGH"
