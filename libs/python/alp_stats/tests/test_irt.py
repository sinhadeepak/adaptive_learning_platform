"""Regression tests for IRTModel.

Strategy: generate synthetic responses from a known true θ and
calibrated items, then check that the EAP estimator recovers θ to
within a tolerance that matches published IRT-software benchmarks
(mirt's eap function recovers θ to ~ 0.3 logits with 20 items).
"""

from __future__ import annotations

import random

import numpy as np
import pytest

from alp_stats.irt import IRTItem, IRTModel


class TestIRTItem:
    def test_rasch_default(self) -> None:
        it = IRTItem(b=0.0)
        # At θ = b, P(correct) is the inflection point of the logistic.
        # For 1PL Rasch (a=1, c=0): P = 0.5 exactly.
        assert it.p_correct(0.0) == pytest.approx(0.5, abs=1e-10)

    def test_p_correct_monotonic_in_theta(self) -> None:
        it = IRTItem(b=0.0, a=1.5, c=0.2)
        thetas = [-2.0, -1.0, 0.0, 1.0, 2.0]
        ps = [it.p_correct(t) for t in thetas]
        # Strictly increasing.
        assert all(p2 > p1 for p1, p2 in zip(ps, ps[1:]))
        # Bounded by guessing parameter from below and 1 from above.
        assert all(0.2 <= p < 1.0 for p in ps)

    def test_guessing_floor(self) -> None:
        it = IRTItem(b=0.0, a=1.0, c=0.25)
        # At θ = −5, P should be very close to the guessing param.
        p = it.p_correct(-5.0)
        assert 0.25 <= p < 0.27

    def test_high_discrimination_steeper(self) -> None:
        loose = IRTItem(b=0.0, a=0.5)
        tight = IRTItem(b=0.0, a=2.5)
        # At θ = 0.5, the tight item has a steeper slope so its
        # P should be further from 0.5 than the loose item's.
        p_loose = loose.p_correct(0.5)
        p_tight = tight.p_correct(0.5)
        assert (p_tight - 0.5) > (p_loose - 0.5)

    @pytest.mark.parametrize("a", [0.0, -1.0])
    def test_rejects_non_positive_a(self, a: float) -> None:
        with pytest.raises(ValueError):
            IRTItem(b=0.0, a=a)

    @pytest.mark.parametrize("c", [-0.1, 1.0, 1.5])
    def test_rejects_bad_c(self, c: float) -> None:
        with pytest.raises(ValueError):
            IRTItem(b=0.0, c=c)


class TestModelEstimation:
    """The heart of the test suite: can EAP recover known true θ?"""

    @staticmethod
    def _build_bank(n: int, rng: random.Random) -> dict[str, IRTItem]:
        """Item bank with a wide range of difficulties around 0."""
        return {
            f"q{i}": IRTItem(
                b=rng.uniform(-2.0, 2.0),
                a=rng.uniform(0.8, 1.6),
                c=0.0,
            )
            for i in range(n)
        }

    @staticmethod
    def _simulate_responses(
        bank: dict[str, IRTItem],
        true_theta: float,
        rng: random.Random,
    ) -> list[tuple[str, int]]:
        out = []
        for iid, item in bank.items():
            p = item.p_correct(true_theta)
            correct = 1 if rng.random() < p else 0
            out.append((iid, correct))
        return out

    @pytest.mark.parametrize("true_theta", [-1.5, -0.5, 0.0, 0.5, 1.5])
    def test_recovers_true_theta_with_30_items(self, true_theta: float) -> None:
        # 30 items is a reasonable working point — mirt's eap recovers
        # to ~ 0.3 logits at this length. We allow 0.5 for the wider
        # range of difficulties.
        rng = random.Random(13)
        bank = self._build_bank(30, rng)
        model = IRTModel(bank)
        responses = self._simulate_responses(bank, true_theta, rng)
        theta_hat, se = model.estimate_theta(responses)
        assert abs(theta_hat - true_theta) < 0.5, (
            f"θ̂={theta_hat:.3f} vs true {true_theta}, SE={se:.3f}"
        )
        # SE should be sensible (smaller for moderate ability, larger
        # at extremes).
        assert 0.05 < se < 1.5

    def test_se_shrinks_with_more_items(self) -> None:
        rng = random.Random(7)
        true_theta = 0.3
        bank_small = self._build_bank(5, rng)
        bank_large = self._build_bank(100, rng)
        m_small = IRTModel(bank_small)
        m_large = IRTModel(bank_large)
        r_small = self._simulate_responses(bank_small, true_theta, rng)
        r_large = self._simulate_responses(bank_large, true_theta, rng)
        _, se_small = m_small.estimate_theta(r_small)
        _, se_large = m_large.estimate_theta(r_large)
        assert se_large < se_small

    def test_prior_pulls_estimate_when_no_data(self) -> None:
        bank = self._build_bank(5, random.Random(0))
        model = IRTModel(bank)
        # No responses — posterior should equal the prior mean.
        theta_hat, _ = model.estimate_theta(responses=[])
        assert theta_hat == pytest.approx(0.0, abs=1e-6)

        # With a custom prior, the no-data estimate moves to it.
        theta_hat2, _ = model.estimate_theta(
            responses=[], prior_mean=1.5, prior_sd=0.5
        )
        assert theta_hat2 == pytest.approx(1.5, abs=1e-6)

    def test_screening_prior_speeds_convergence(self) -> None:
        """A useful prior — e.g., from the F2a screening
        readiness_seed — should pull the estimate toward truth faster
        than the default."""
        rng = random.Random(101)
        true_theta = 1.0
        bank = self._build_bank(5, rng)
        model = IRTModel(bank)
        responses = self._simulate_responses(bank, true_theta, rng)

        # Default prior (mean=0, sd=1)
        theta_default, _ = model.estimate_theta(responses)
        # Informed prior (mean=0.8, sd=0.3) — close to truth
        theta_informed, _ = model.estimate_theta(
            responses, prior_mean=0.8, prior_sd=0.3
        )
        # Informed prior is closer to truth.
        assert abs(theta_informed - true_theta) < abs(theta_default - true_theta)


class TestFlowCorridor:
    def test_default_corridor(self) -> None:
        m = IRTModel({})
        lo, hi = m.flow_corridor(0.5)
        assert lo == pytest.approx(0.2, abs=1e-10)
        assert hi == pytest.approx(1.0, abs=1e-10)

    def test_items_in_corridor(self) -> None:
        bank = {
            "easy": IRTItem(b=-2.0),
            "near_low": IRTItem(b=-0.2),
            "near_high": IRTItem(b=0.3),
            "hard": IRTItem(b=2.5),
        }
        m = IRTModel(bank)
        in_corridor = m.items_in_corridor(0.0)
        assert "near_low" in in_corridor
        assert "near_high" in in_corridor
        assert "easy" not in in_corridor
        assert "hard" not in in_corridor


class TestModelLifecycle:
    def test_add_item(self) -> None:
        m = IRTModel({})
        assert len(m) == 0
        m.add_item("x", IRTItem(b=0.0))
        assert len(m) == 1
        # Replacement.
        m.add_item("x", IRTItem(b=1.0))
        assert m.items["x"].b == 1.0

    def test_unknown_item_raises(self) -> None:
        m = IRTModel({"a": IRTItem(b=0.0)})
        with pytest.raises(KeyError):
            m.estimate_theta(responses=[("zzz", 1)])

    @pytest.mark.parametrize("bad", [-1, 2])
    def test_invalid_correct_rejected(self, bad: int) -> None:
        m = IRTModel({"a": IRTItem(b=0.0)})
        with pytest.raises(ValueError):
            m.estimate_theta(responses=[("a", bad)])

    def test_repr_includes_n_items(self) -> None:
        m = IRTModel({"a": IRTItem(b=0.0), "b": IRTItem(b=1.0)})
        assert "2" in repr(m)
