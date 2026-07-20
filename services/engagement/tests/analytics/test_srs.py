"""Sprint 27 (P4-S27) — pure-function tests for SM-2 + EWA clamp."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from engagement.analytics.srs import (
    DEFAULT_EASE_FACTOR,
    EASE_FACTOR_FLOOR,
    apply_ewa_clamp,
    compute_next_due,
    due_today,
    overdue_days,
)

UTC = timezone.utc


def test_first_attempt_correct_yields_one_day_interval() -> None:
    out = compute_next_due(
        prev_interval_days=0,
        prev_ease_factor=DEFAULT_EASE_FACTOR,
        prev_attempts=0,
        accuracy=1.0,
    )
    assert out.interval_days == 1
    assert out.ease_factor >= DEFAULT_EASE_FACTOR  # quality=5 nudges EF up


def test_second_attempt_correct_yields_six_day_interval() -> None:
    out = compute_next_due(
        prev_interval_days=1,
        prev_ease_factor=DEFAULT_EASE_FACTOR,
        prev_attempts=1,
        accuracy=1.0,
    )
    assert out.interval_days == 6


def test_third_attempt_correct_uses_ef_multiplication() -> None:
    out = compute_next_due(
        prev_interval_days=6,
        prev_ease_factor=2.5,
        prev_attempts=2,
        accuracy=1.0,
    )
    # Canonical SM-2 (shared alp_srs): EF updates to 2.6 at q=5 first, then
    # 6 * 2.6 = 15.6 -> 16. (Previously multiplied by the pre-update 2.5 = 15;
    # unified onto the textbook formula that flashcards already used.)
    assert out.interval_days == 16


def test_failed_attempt_resets_to_one_day() -> None:
    out = compute_next_due(
        prev_interval_days=30,
        prev_ease_factor=2.5,
        prev_attempts=5,
        accuracy=0.2,  # quality=1 (< 3 → fail path)
    )
    assert out.interval_days == 1


def test_failed_attempt_lowers_ease_factor_with_floor() -> None:
    out = compute_next_due(
        prev_interval_days=30,
        prev_ease_factor=1.4,
        prev_attempts=5,
        accuracy=0.0,  # quality=0
    )
    # ef would be 1.2 but floor is 1.3
    assert out.ease_factor == EASE_FACTOR_FLOOR


def test_failed_attempt_floors_already_at_minimum() -> None:
    out = compute_next_due(
        prev_interval_days=10,
        prev_ease_factor=EASE_FACTOR_FLOOR,
        prev_attempts=2,
        accuracy=0.0,
    )
    assert out.ease_factor == EASE_FACTOR_FLOOR


def test_quality_5_increases_ef_above_default() -> None:
    out = compute_next_due(
        prev_interval_days=1,
        prev_ease_factor=DEFAULT_EASE_FACTOR,
        prev_attempts=1,
        accuracy=1.0,
    )
    # SM-2 delta at quality=5 is +0.10
    assert out.ease_factor > DEFAULT_EASE_FACTOR


def test_quality_3_holds_ef_steady_within_tolerance() -> None:
    out = compute_next_due(
        prev_interval_days=1,
        prev_ease_factor=2.5,
        prev_attempts=1,
        accuracy=0.6,  # quality=3
    )
    # SM-2 delta at quality=3 is -0.14 (slight decrease but within band)
    assert abs(out.ease_factor - 2.5) < 0.2


def test_accuracy_below_zero_treated_as_zero() -> None:
    out = compute_next_due(
        prev_interval_days=10,
        prev_ease_factor=2.0,
        prev_attempts=5,
        accuracy=-1.0,
    )
    # Defensive clamping — quality=0 → fail path
    assert out.interval_days == 1


def test_accuracy_above_one_treated_as_one() -> None:
    out = compute_next_due(
        prev_interval_days=1,
        prev_ease_factor=DEFAULT_EASE_FACTOR,
        prev_attempts=0,
        accuracy=999.0,
    )
    assert out.interval_days == 1
    assert out.ease_factor > DEFAULT_EASE_FACTOR


def test_ewa_clamp_no_op_when_strong_mastery() -> None:
    now = datetime(2026, 4, 28, 6, 0, tzinfo=UTC)
    far_future = now + timedelta(days=30)
    out = apply_ewa_clamp(far_future, 0.8, now=now)
    assert out == far_future


def test_ewa_clamp_no_op_when_due_within_seven_days() -> None:
    """Even with weak EWA, intervals already within 7 days don't get clamped."""
    now = datetime(2026, 4, 28, 6, 0, tzinfo=UTC)
    soon = now + timedelta(days=5)
    out = apply_ewa_clamp(soon, 0.2, now=now)
    assert out == soon


def test_ewa_clamp_triggers_on_weak_mastery_and_long_interval() -> None:
    now = datetime(2026, 4, 28, 6, 0, tzinfo=UTC)
    far = now + timedelta(days=30)
    out = apply_ewa_clamp(far, 0.2, now=now)
    assert out == now + timedelta(days=3)


def test_ewa_clamp_handles_none_ewa_as_no_op() -> None:
    now = datetime(2026, 4, 28, 6, 0, tzinfo=UTC)
    far = now + timedelta(days=30)
    out = apply_ewa_clamp(far, None, now=now)  # type: ignore[arg-type]
    assert out == far


def test_due_today_handles_naive_and_aware_datetimes() -> None:
    now = datetime(2026, 4, 28, 6, 0, tzinfo=UTC)
    past = datetime(2026, 4, 27, 6, 0)  # naive
    assert due_today(past, now=now) is True
    future = now + timedelta(hours=1)
    assert due_today(future, now=now) is False


def test_overdue_days_zero_when_not_yet_due() -> None:
    now = datetime(2026, 4, 28, 6, 0, tzinfo=UTC)
    future = now + timedelta(hours=2)
    assert overdue_days(future, now=now) == 0


def test_overdue_days_counts_whole_days() -> None:
    now = datetime(2026, 4, 28, 6, 0, tzinfo=UTC)
    past = now - timedelta(days=3, hours=2)
    assert overdue_days(past, now=now) == 3
