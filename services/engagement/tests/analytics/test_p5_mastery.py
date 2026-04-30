"""Phase 5 (P5-S39) — pure-function tests for the multi-parameter
mastery substrate.

Brier score + fluency math. Repo-level tests (concept_mastery,
bloom_mastery, fluency upserts) gate on Postgres + the autouse
conftest pattern; this file stays pure-function so it runs standalone.
"""

from __future__ import annotations

import pytest

from engagement.analytics.confidence import brier_score
from engagement.analytics.fluency_model import (
    compute_fluency_score,
    update_actual_ms_rolling,
)


# ── Brier score ──────────────────────────────────────────────────────────────


def test_brier_perfect_calibration() -> None:
    """Brier 0.0 when prediction matches outcome perfectly."""
    samples = [(1.0, True), (0.0, False), (1.0, True)]
    assert brier_score(samples) == pytest.approx(0.0)


def test_brier_worst_calibration() -> None:
    """Brier 1.0 when every prediction is opposite of outcome."""
    samples = [(1.0, False), (0.0, True)]
    assert brier_score(samples) == pytest.approx(1.0)


def test_brier_partial_calibration() -> None:
    """Brier 0.25 for an under-confident-but-correct (0.5 → True) sample."""
    samples = [(0.5, True)]  # (0.5 - 1)^2 = 0.25
    assert brier_score(samples) == pytest.approx(0.25)


def test_brier_empty() -> None:
    assert brier_score([]) == 0.0


# ── Fluency score ────────────────────────────────────────────────────────────


def test_fluency_score_par() -> None:
    """expected == actual → score 1.0 (par)."""
    assert compute_fluency_score(30000.0, 30000.0) == pytest.approx(1.0)


def test_fluency_score_faster_than_baseline() -> None:
    """actual < expected → score > 1 (good)."""
    assert compute_fluency_score(60000.0, 30000.0) == pytest.approx(2.0)


def test_fluency_score_slower_than_baseline() -> None:
    """actual > expected → score < 1 (slower)."""
    assert compute_fluency_score(30000.0, 60000.0) == pytest.approx(0.5)


def test_fluency_score_clamps_outliers() -> None:
    """Single outlier capped at 10x to prevent score blow-up."""
    assert compute_fluency_score(60000.0, 100.0) == 10.0
    assert compute_fluency_score(100.0, 60000.0) == pytest.approx(0.1)


def test_fluency_score_defensive_zeros() -> None:
    assert compute_fluency_score(0.0, 30000.0) == 1.0
    assert compute_fluency_score(30000.0, 0.0) == 1.0
    assert compute_fluency_score(-1.0, 30000.0) == 1.0


# ── Rolling avg ──────────────────────────────────────────────────────────────


def test_actual_ms_rolling_cold_start() -> None:
    """First observation IS the rolling avg."""
    assert update_actual_ms_rolling(0.0, 0, 5000) == 5000.0


def test_actual_ms_rolling_smooths() -> None:
    """α=0.4: new = 0.6*old + 0.4*obs."""
    result = update_actual_ms_rolling(prev_avg_ms=10000.0, prev_n=5, observation_ms=20000)
    # 0.6 * 10000 + 0.4 * 20000 = 14000
    assert result == pytest.approx(14000.0)


def test_actual_ms_rolling_stabilises() -> None:
    """Repeated identical observations converge on the observation."""
    val = 0.0
    for _ in range(20):
        val = update_actual_ms_rolling(val, 1, 1000)
    assert val == pytest.approx(1000.0, abs=1.0)
