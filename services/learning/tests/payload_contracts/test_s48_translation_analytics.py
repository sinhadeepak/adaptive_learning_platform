"""Phase 5 (P5-S48) — Translation analytics aggregator tests.

DB-backed reader tests gate on Postgres + content_schema; this file
covers the pure-function helpers (`_percentile`, `_safe_div`) and the
target constants surfaced in the dashboard response.
"""

from __future__ import annotations

import pytest

from learning.localisation.analytics import (
    ACCEPTANCE_RATE_TARGET,
    LEAD_TIME_P95_HOURS,
    RETRANSLATION_RATE_CEILING,
    _percentile,
    _safe_div,
)


# ── _percentile ──────────────────────────────────────────────────────────────


def test_percentile_empty_returns_none() -> None:
    assert _percentile([], 50) is None


def test_percentile_single_value() -> None:
    assert _percentile([5.0], 50) == 5.0
    assert _percentile([5.0], 95) == 5.0


def test_percentile_simple_p50() -> None:
    # 5 elements: nearest-rank p50 → element at index 2 (k=2)
    p = _percentile([1.0, 2.0, 3.0, 4.0, 5.0], 50)
    assert p == 3.0


def test_percentile_p95_top_value() -> None:
    p = _percentile([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0], 95)
    # k = round(0.95 * 9) = round(8.55) = 9 → 10.0
    assert p == 10.0


def test_percentile_p0_bottom_value() -> None:
    p = _percentile([1.0, 2.0, 3.0], 0)
    assert p == 1.0


def test_percentile_unsorted_input_handled() -> None:
    # Function sorts internally.
    p = _percentile([10.0, 1.0, 5.0], 50)
    assert p == 5.0


# ── _safe_div ────────────────────────────────────────────────────────────────


def test_safe_div_normal() -> None:
    assert _safe_div(7.0, 10.0) == 0.7


def test_safe_div_zero_denominator_returns_none() -> None:
    assert _safe_div(5.0, 0.0) is None


def test_safe_div_rounds_to_4_decimals() -> None:
    assert _safe_div(1.0, 3.0) == 0.3333


# ── target constants ─────────────────────────────────────────────────────────


def test_acceptance_rate_target_is_70pct() -> None:
    assert ACCEPTANCE_RATE_TARGET == 0.70


def test_retranslation_ceiling_is_10pct() -> None:
    assert RETRANSLATION_RATE_CEILING == 0.10


def test_lead_time_p95_target_is_36h() -> None:
    assert LEAD_TIME_P95_HOURS == 36
