"""Tests for HierarchicalBayes empirical-Bayes shrinkage."""

from __future__ import annotations

import pytest

from alp_stats.hierarchical import HierarchicalBayes


class TestBasicFit:
    def test_returns_estimate_per_group(self) -> None:
        data = [("a", 8, 10), ("b", 2, 10), ("c", 5, 10)]
        out = HierarchicalBayes.fit(data)
        assert set(out.keys()) == {"a", "b", "c"}

    def test_empty_input_raises(self) -> None:
        with pytest.raises(ValueError):
            HierarchicalBayes.fit([])

    @pytest.mark.parametrize("bad", [(-1, 5), (5, -1), (10, 3), (-2, -1)])
    def test_invalid_observation(self, bad) -> None:
        s, n = bad
        with pytest.raises(ValueError):
            HierarchicalBayes.fit([("g", s, n)])


class TestShrinkage:
    """The defining behaviour: low-n groups should shrink to the
    global mean; high-n groups should stick close to their raw rate."""

    def test_low_n_shrinks_toward_global_mean(self) -> None:
        # Three "high-rate" groups with lots of data, one tiny group
        # whose raw rate is extreme. The tiny group's shrunk rate
        # should be pulled back toward the global mean (~0.8).
        data = [
            ("big_a", 80, 100),
            ("big_b", 80, 100),
            ("big_c", 80, 100),
            ("tiny",   0,   1),
        ]
        out = HierarchicalBayes.fit(data)
        # Raw rate of tiny is 0, shrunk should be > 0.5 (pulled toward
        # ~0.8 global mean).
        assert out["tiny"].raw_rate == 0.0
        assert out["tiny"].shrunk_rate > 0.5
        # Shrinkage weight for tiny should be close to 1 (heavy shrinkage)
        assert out["tiny"].shrinkage_weight > 0.7

    def test_high_n_stays_close_to_raw(self) -> None:
        data = [
            ("a", 50, 100),
            ("b", 50, 100),
            ("c", 90, 1000),  # very informative group, far from 0.5
        ]
        out = HierarchicalBayes.fit(data)
        # Raw rate is 0.09; the heavy-data group should not be pulled
        # too far toward the global mean.
        assert out["c"].raw_rate == 0.09
        # Allow some shrinkage but the data dominates.
        assert abs(out["c"].shrunk_rate - 0.09) < 0.10
        # Shrinkage weight should be small.
        assert out["c"].shrinkage_weight < 0.3

    def test_shrinkage_weight_in_unit_interval(self) -> None:
        data = [("a", 5, 10), ("b", 0, 0), ("c", 100, 200)]
        out = HierarchicalBayes.fit(data)
        for est in out.values():
            assert 0.0 <= est.shrinkage_weight <= 1.0

    def test_empty_group_uses_prior(self) -> None:
        data = [("a", 5, 10), ("b", 5, 10), ("empty", 0, 0)]
        out = HierarchicalBayes.fit(data)
        # The empty group's raw_rate is the prior mean (not 0/0).
        assert 0.0 < out["empty"].raw_rate < 1.0
        assert out["empty"].shrinkage_weight == 1.0


class TestKnownScenario:
    """A hand-traceable scenario — verifies the math by example."""

    def test_grand_mean_recovery(self) -> None:
        # All groups have the same observed rate 0.6 — the empirical-
        # Bayes fit's mean should also be ~ 0.6 and the shrunk rates
        # should all equal 0.6 (since data = prior already).
        data = [
            ("a", 6, 10),
            ("b", 12, 20),
            ("c", 30, 50),
            ("d", 60, 100),
        ]
        out = HierarchicalBayes.fit(data)
        for est in out.values():
            assert est.shrunk_rate == pytest.approx(0.6, abs=0.05)

    def test_extreme_outlier_pulled_to_mean(self) -> None:
        # Most groups around 0.5; one outlier at 1.0 (1/1).
        data = [
            ("a", 50, 100),
            ("b", 50, 100),
            ("c", 50, 100),
            ("outlier", 1, 1),
        ]
        out = HierarchicalBayes.fit(data)
        # Outlier's raw rate is 1.0; shrunk should be far from 1.0.
        assert out["outlier"].raw_rate == 1.0
        assert out["outlier"].shrunk_rate < 0.95
        # And it should be closer to 0.5 (the cohort) than to 1.0
        assert abs(out["outlier"].shrunk_rate - 0.5) < abs(
            out["outlier"].shrunk_rate - 1.0
        )


class TestForecasterUseCase:
    """End-to-end scenario for EIS yield forecasting."""

    def test_per_topic_forecast_smoothing(self) -> None:
        # 10 years of JEE Main topic counts. Each "trial" is one year;
        # "success" is "topic appeared at least once."
        topic_data = [
            ("Mechanics",       10, 10),  # appears every year
            ("Optics",           8, 10),
            ("Modern Physics",   3, 10),  # newer / rarer
            ("Newly Added",      0,  1),  # only 1 year of data
        ]
        out = HierarchicalBayes.fit(topic_data)
        # The new topic with no observations should shrink to roughly
        # the average rate (~ 0.7 here).
        assert 0.3 < out["Newly Added"].shrunk_rate < 0.95
        # Mechanics stays high.
        assert out["Mechanics"].shrunk_rate > 0.85
        # Modern Physics moves slightly up from 0.3 toward the mean.
        assert out["Modern Physics"].shrunk_rate > 0.3
