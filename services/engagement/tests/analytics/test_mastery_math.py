"""Pure-math tests for EWA + readiness — no DB."""

from __future__ import annotations

import pytest

from engagement.analytics.mastery import EWA_ALPHA, MasteryRow, readiness_from_mastery, update_ewa


def test_update_ewa_cold_start_seeds_directly() -> None:
    """First observation sets the EWA outright (n_prev == 0)."""
    assert update_ewa(prev_ewa=0.0, prev_n=0, score=0.8) == pytest.approx(0.8)


def test_update_ewa_blends_prior() -> None:
    new = update_ewa(prev_ewa=0.5, prev_n=3, score=1.0)
    expected = EWA_ALPHA * 1.0 + (1 - EWA_ALPHA) * 0.5
    assert new == pytest.approx(expected)


def test_update_ewa_zero_score_pulls_down() -> None:
    new = update_ewa(prev_ewa=0.9, prev_n=5, score=0.0)
    assert 0.5 < new < 0.9


def test_readiness_empty_is_zero() -> None:
    assert readiness_from_mastery([]) == 0.0


def test_readiness_mean_of_topic_ewas() -> None:
    rows = [
        MasteryRow(user_id="u", topic_id="a", ewa=0.6, n=2),
        MasteryRow(user_id="u", topic_id="b", ewa=0.8, n=3),
        MasteryRow(user_id="u", topic_id="c", ewa=0.4, n=1),
    ]
    assert readiness_from_mastery(rows) == pytest.approx((0.6 + 0.8 + 0.4) / 3)
