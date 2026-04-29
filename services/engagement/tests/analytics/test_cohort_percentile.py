"""Sprint 31 (P4-S31) — pure-function tests for cohort percentile."""

from __future__ import annotations

from engagement.analytics.cohort_percentile import (
    COLD_START_THRESHOLD,
    bucket_for_readiness,
    confidence_from_cohort_size,
    is_cohort_sufficient,
    percentile_from_distribution,
    total_cohort_size,
)


def test_bucket_snaps_to_grid() -> None:
    assert bucket_for_readiness(0.0) == 0.0
    assert bucket_for_readiness(0.05) == 0.05
    assert bucket_for_readiness(0.83) == 0.80
    assert bucket_for_readiness(0.99) == 0.95


def test_bucket_clamps_one_to_below() -> None:
    """Readiness 1.0 collapses into the top bucket (≤0.95) so the user
    can't fall outside the distribution."""
    assert bucket_for_readiness(1.0) == 0.95


def test_bucket_negative_clamps_to_zero() -> None:
    assert bucket_for_readiness(-0.1) == 0.0


def test_percentile_empty_distribution_returns_zero() -> None:
    assert percentile_from_distribution(0.5, []) == 0.0


def test_percentile_zero_total_returns_zero() -> None:
    dist = [{"readiness_bucket": 0.5, "user_count": 0}]
    assert percentile_from_distribution(0.5, dist) == 0.0


def test_percentile_user_below_cohort() -> None:
    dist = [
        {"readiness_bucket": 0.4, "user_count": 50},
        {"readiness_bucket": 0.6, "user_count": 50},
    ]
    # User at readiness 0.0 → bucket 0.0; everyone else is above
    assert percentile_from_distribution(0.0, dist) == 0.0


def test_percentile_user_above_cohort() -> None:
    dist = [
        {"readiness_bucket": 0.4, "user_count": 50},
        {"readiness_bucket": 0.6, "user_count": 50},
    ]
    # User at readiness 0.95 → bucket 0.95; everyone is below
    assert percentile_from_distribution(0.95, dist) == 100.0


def test_percentile_in_middle_returns_fraction() -> None:
    dist = [
        {"readiness_bucket": 0.4, "user_count": 30},
        {"readiness_bucket": 0.5, "user_count": 70},
    ]
    # User at readiness 0.50 → bucket 0.50; 30 of 100 are below
    assert percentile_from_distribution(0.50, dist) == 30.0


def test_confidence_low_under_threshold() -> None:
    label, half = confidence_from_cohort_size(10)
    assert label == "low" and half == 0.40


def test_confidence_medium_in_middle_band() -> None:
    label, half = confidence_from_cohort_size(100)
    assert label == "medium" and half == 0.20


def test_confidence_high_above_threshold() -> None:
    label, half = confidence_from_cohort_size(500)
    assert label == "high" and half == 0.10


def test_is_cohort_sufficient_uses_total() -> None:
    dist = [
        {"readiness_bucket": 0.4, "user_count": 30},
        {"readiness_bucket": 0.5, "user_count": 25},
    ]
    assert is_cohort_sufficient(dist) is True   # 55 >= 50
    sparse = [{"readiness_bucket": 0.4, "user_count": 5}]
    assert is_cohort_sufficient(sparse) is False


def test_total_cohort_size_sums() -> None:
    dist = [
        {"readiness_bucket": 0.4, "user_count": 30},
        {"readiness_bucket": 0.5, "user_count": 70},
    ]
    assert total_cohort_size(dist) == 100
