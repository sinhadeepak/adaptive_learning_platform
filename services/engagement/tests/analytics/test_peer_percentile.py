"""Sprint 32 (P4-S32) — pure-function tests for peer-percentile helpers."""

from __future__ import annotations

from engagement.analytics.peer_percentile import (
    DEFAULT_ANONYMITY_THRESHOLD,
    compute_peer_percentile,
    is_anonymity_threshold_met,
    summarise_percentile,
)


def test_compute_returns_none_on_empty_peer_list() -> None:
    assert compute_peer_percentile(0.5, []) is None


def test_compute_handles_user_above_all_peers() -> None:
    pct = compute_peer_percentile(0.9, [0.1, 0.2, 0.3])
    assert pct == 100.0


def test_compute_handles_user_below_all_peers() -> None:
    pct = compute_peer_percentile(0.0, [0.5, 0.6, 0.7])
    assert pct == 0.0


def test_compute_uses_strict_below_count() -> None:
    pct = compute_peer_percentile(0.5, [0.3, 0.5, 0.5, 0.7])
    # Only 0.3 is strictly below — 1/4 = 25
    assert pct == 25.0


def test_anonymity_threshold_default_30() -> None:
    assert is_anonymity_threshold_met(29) is False
    assert is_anonymity_threshold_met(30) is True
    assert is_anonymity_threshold_met(0) is False


def test_summarise_hides_when_cohort_too_small() -> None:
    out = summarise_percentile(0.5, [0.4] * 5)
    assert out["hidden"] is True
    assert out["reason"] == "cohort_too_small"
    assert out["cohortSize"] == 5
    assert out["thresholdRequired"] == DEFAULT_ANONYMITY_THRESHOLD


def test_summarise_renders_percentile_when_cohort_large_enough() -> None:
    peers = [0.3] * 30
    out = summarise_percentile(0.7, peers)
    assert out["hidden"] is False
    assert out["percentile"] == 100.0
    assert out["cohortSize"] == 30
    assert out["userEwa"] == 0.7


def test_summarise_uses_custom_threshold_when_provided() -> None:
    out = summarise_percentile(0.5, [0.4] * 10, threshold=5)
    assert out["hidden"] is False
    assert out["cohortSize"] == 10
