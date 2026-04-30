"""Phase 5 (P5-S41) — transfer-ability metric pure-function tests.

DB-backed reader/writer tests live in repo-test files that gate on
Postgres + conftest fixtures. This file covers the pure aggregator
that computes mean(multi-tag) - mean(single-tag).
"""

from __future__ import annotations

from engagement.analytics.transfer import compute_transfer_score


def test_transfer_score_negative_when_multi_tag_harder() -> None:
    score, meta = compute_transfer_score(
        single_tag_outcomes=[True, True, True, True, False],   # 80% accuracy
        multi_tag_outcomes=[True, False, False, True, False],  # 40% accuracy
    )
    assert score is not None
    # Use approx-equality (mean(multi) - mean(single) = 0.4 - 0.8 = -0.4).
    assert abs(score - (-0.4)) < 1e-9
    assert meta["accuracy_single_tag"] == 0.8
    assert meta["accuracy_multi_tag"] == 0.4


def test_transfer_score_positive_when_multi_tag_easier() -> None:
    score, _ = compute_transfer_score(
        single_tag_outcomes=[True, False, False, True, False],
        multi_tag_outcomes=[True, True, True, True, True],
    )
    assert score is not None
    assert score > 0


def test_transfer_score_none_when_buckets_too_thin() -> None:
    score, meta = compute_transfer_score(
        single_tag_outcomes=[True, False],         # n=2 below default 3
        multi_tag_outcomes=[True, True, True],
    )
    assert score is None
    assert meta["n_single_tag"] == 2
    assert meta["n_multi_tag"] == 3


def test_transfer_score_none_when_multi_bucket_empty() -> None:
    score, meta = compute_transfer_score(
        single_tag_outcomes=[True, True, True],
        multi_tag_outcomes=[],
    )
    assert score is None
    assert meta["n_multi_tag"] == 0


def test_transfer_score_metadata_has_baseline_accuracy_even_when_score_null() -> None:
    """A user who has only attempted single-tag items can still see their
    accuracy on those items even if the transfer score is unpublishable."""
    _, meta = compute_transfer_score(
        single_tag_outcomes=[True, True, True, False, False],  # 60%
        multi_tag_outcomes=[True],
        min_n_per_bucket=3,
    )
    assert meta["accuracy_single_tag"] == 0.6
    assert meta["accuracy_multi_tag"] == 1.0


def test_transfer_score_threshold_overridable() -> None:
    score, _ = compute_transfer_score(
        single_tag_outcomes=[True, False],
        multi_tag_outcomes=[True, True],
        min_n_per_bucket=2,
    )
    assert score is not None


def test_transfer_score_zero_when_buckets_match() -> None:
    score, _ = compute_transfer_score(
        single_tag_outcomes=[True, False, True, False],   # 50%
        multi_tag_outcomes=[True, True, False, False],    # 50%
    )
    assert score == 0.0
