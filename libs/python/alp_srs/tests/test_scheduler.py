from __future__ import annotations

import pytest

from alp_srs import (
    DEFAULT_EASE_FACTOR,
    EASE_FACTOR_FLOOR,
    quality_from_accuracy,
    sm2_step,
)


def test_first_success_is_one_day() -> None:
    out = sm2_step(
        prev_interval_days=0, prev_ease_factor=DEFAULT_EASE_FACTOR, prev_repetitions=0, quality=5
    )
    assert out.interval_days == 1
    assert out.repetitions == 1
    assert out.ease_factor > DEFAULT_EASE_FACTOR  # q=5 nudges EF up +0.1


def test_second_success_is_six_days() -> None:
    out = sm2_step(
        prev_interval_days=1, prev_ease_factor=DEFAULT_EASE_FACTOR, prev_repetitions=1, quality=5
    )
    assert out.interval_days == 6
    assert out.repetitions == 2


def test_third_success_multiplies_by_updated_ef_canonical() -> None:
    # Canonical SM-2: EF updates to 2.6 at q=5, then 6 * 2.6 = 15.6 -> 16.
    out = sm2_step(prev_interval_days=6, prev_ease_factor=2.5, prev_repetitions=2, quality=5)
    assert out.ease_factor == pytest.approx(2.6)
    assert out.interval_days == 16
    assert out.repetitions == 3


def test_lapse_resets_interval_and_streak() -> None:
    out = sm2_step(prev_interval_days=30, prev_ease_factor=2.5, prev_repetitions=5, quality=1)
    assert out.interval_days == 1
    assert out.repetitions == 0
    assert out.ease_factor == pytest.approx(2.3)  # 2.5 - 0.2


def test_ease_factor_floored_at_minimum() -> None:
    out = sm2_step(prev_interval_days=30, prev_ease_factor=1.4, prev_repetitions=5, quality=0)
    assert out.ease_factor == EASE_FACTOR_FLOOR  # 1.4 - 0.2 = 1.2 -> floored to 1.3


def test_quality_below_three_is_fail_path() -> None:
    out = sm2_step(prev_interval_days=10, prev_ease_factor=2.0, prev_repetitions=3, quality=2)
    assert out.interval_days == 1
    assert out.repetitions == 0


def test_quality_clamped_to_valid_range() -> None:
    hi = sm2_step(prev_interval_days=1, prev_ease_factor=2.5, prev_repetitions=0, quality=99)
    lo = sm2_step(prev_interval_days=1, prev_ease_factor=2.5, prev_repetitions=0, quality=-5)
    assert hi.interval_days == 1 and hi.repetitions == 1  # treated as q=5
    assert lo.interval_days == 1 and lo.repetitions == 0  # treated as q=0 (fail)


@pytest.mark.parametrize(
    "accuracy,expected",
    [(-1.0, 0), (0.0, 0), (0.6, 3), (1.0, 5), (999.0, 5)],
)
def test_quality_from_accuracy(accuracy: float, expected: int) -> None:
    assert quality_from_accuracy(accuracy) == expected
