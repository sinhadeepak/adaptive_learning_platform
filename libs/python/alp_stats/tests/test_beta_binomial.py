"""Regression tests for BetaBinomialPosterior.

Strategy: compare every public property to scipy.stats.beta —
which is the textbook reference. If we ever diverge by more than
4 decimal places, the build breaks. This guards against silently
shipping a buggy stats primitive.
"""

from __future__ import annotations

import math

import pytest
from scipy import stats

from alp_stats import BetaBinomialPosterior


class TestConstruction:
    def test_uniform_factory(self) -> None:
        p = BetaBinomialPosterior.uniform()
        assert p.alpha == 1.0 and p.beta == 1.0

    def test_jeffreys_factory(self) -> None:
        p = BetaBinomialPosterior.jeffreys()
        assert p.alpha == 0.5 and p.beta == 0.5

    @pytest.mark.parametrize("a,b", [(0, 1), (-1, 1), (1, 0), (1, -2)])
    def test_rejects_non_positive(self, a: float, b: float) -> None:
        with pytest.raises(ValueError):
            BetaBinomialPosterior(alpha=a, beta=b)

    def test_immutable(self) -> None:
        # @dataclass(frozen=True) means setattr should blow up.
        p = BetaBinomialPosterior(alpha=2.0, beta=3.0)
        with pytest.raises(Exception):
            p.alpha = 5.0  # type: ignore[misc]


class TestUpdate:
    def test_conjugate_update(self) -> None:
        p = BetaBinomialPosterior(alpha=2.0, beta=2.0)
        q = p.update(successes=3, failures=1)
        assert q.alpha == 5.0
        assert q.beta == 3.0

    def test_update_returns_new_instance(self) -> None:
        p = BetaBinomialPosterior(alpha=2.0, beta=2.0)
        q = p.update(successes=1, failures=0)
        # original is untouched
        assert p.alpha == 2.0 and p.beta == 2.0
        assert q is not p

    def test_zero_observations_is_identity(self) -> None:
        p = BetaBinomialPosterior(alpha=3.0, beta=5.0)
        q = p.update(successes=0, failures=0)
        assert q.alpha == p.alpha and q.beta == p.beta

    @pytest.mark.parametrize("succ,fail", [(-1, 0), (0, -1), (-3, -2)])
    def test_rejects_negative_observations(self, succ: int, fail: int) -> None:
        p = BetaBinomialPosterior.uniform()
        with pytest.raises(ValueError):
            p.update(successes=succ, failures=fail)


class TestMomentsMatchScipy:
    """Mean / variance / mode must match scipy.stats.beta to 4+ decimals."""

    @pytest.mark.parametrize("a,b", [
        (1.0, 1.0),
        (2.0, 3.0),
        (10.0, 5.0),
        (0.5, 0.5),  # Jeffreys
        (100.0, 200.0),  # tight, well-observed
    ])
    def test_mean(self, a: float, b: float) -> None:
        p = BetaBinomialPosterior(alpha=a, beta=b)
        # scipy returns numpy scalar; cast to float for the comparison.
        expected = float(stats.beta.mean(a, b))
        assert p.mean == pytest.approx(expected, abs=1e-10)

    @pytest.mark.parametrize("a,b", [
        (2.0, 3.0),
        (10.0, 5.0),
        (100.0, 200.0),
    ])
    def test_variance(self, a: float, b: float) -> None:
        p = BetaBinomialPosterior(alpha=a, beta=b)
        expected = float(stats.beta.var(a, b))
        assert p.variance == pytest.approx(expected, abs=1e-10)

    @pytest.mark.parametrize("a,b,expected_mode", [
        (2.0, 3.0, (2.0 - 1) / (2.0 + 3.0 - 2)),    # 1/3
        (10.0, 5.0, (10.0 - 1) / (10.0 + 5.0 - 2)), # 9/13
    ])
    def test_mode_when_unimodal(self, a: float, b: float, expected_mode: float) -> None:
        p = BetaBinomialPosterior(alpha=a, beta=b)
        assert p.mode == pytest.approx(expected_mode, abs=1e-10)

    def test_mode_undefined_when_u_shaped(self) -> None:
        # alpha=beta=0.5 → U-shaped, mode is undefined (formally infinite
        # at both endpoints). We return None.
        p = BetaBinomialPosterior(alpha=0.5, beta=0.5)
        assert p.mode is None

    def test_mode_uniform_picks_half(self) -> None:
        # alpha=beta=1 → every point is equally likely; convention is 0.5.
        p = BetaBinomialPosterior.uniform()
        assert p.mode == 0.5


class TestCredibleInterval:
    """Credible interval must match scipy.stats.beta.ppf exactly —
    we delegate to scipy under the hood, so this is mostly a contract
    test against future refactors."""

    @pytest.mark.parametrize("a,b,level", [
        (2.0, 3.0, 0.95),
        (10.0, 5.0, 0.90),
        (100.0, 200.0, 0.99),
        (0.5, 0.5, 0.80),
    ])
    def test_matches_scipy_ppf(self, a: float, b: float, level: float) -> None:
        p = BetaBinomialPosterior(alpha=a, beta=b)
        lo, hi = p.credible_interval(level=level)
        tail = (1 - level) / 2
        assert lo == pytest.approx(float(stats.beta.ppf(tail, a, b)), abs=1e-10)
        assert hi == pytest.approx(float(stats.beta.ppf(1 - tail, a, b)), abs=1e-10)
        # Sanity: lo < mean < hi for any non-degenerate posterior.
        assert lo < p.mean < hi

    @pytest.mark.parametrize("level", [0.0, 1.0, -0.1, 1.1])
    def test_rejects_invalid_level(self, level: float) -> None:
        p = BetaBinomialPosterior.uniform()
        with pytest.raises(ValueError):
            p.credible_interval(level=level)


class TestSampling:
    def test_seed_makes_deterministic(self) -> None:
        p = BetaBinomialPosterior(alpha=5.0, beta=5.0)
        a = p.sample(rng_seed=42)
        b = p.sample(rng_seed=42)
        assert a == b

    def test_sample_within_unit_interval(self) -> None:
        p = BetaBinomialPosterior(alpha=2.0, beta=3.0)
        for seed in range(20):
            v = p.sample(rng_seed=seed)
            assert 0 <= v <= 1

    def test_sample_mean_approximates_posterior_mean(self) -> None:
        # Law of large numbers — 10k samples should approximate the mean
        # to within 2%. Uses scipy directly to avoid 10k method calls.
        p = BetaBinomialPosterior(alpha=4.0, beta=6.0)
        samples = stats.beta.rvs(p.alpha, p.beta, size=10000, random_state=0)
        assert samples.mean() == pytest.approx(p.mean, abs=0.02)


class TestEndToEndScenarios:
    """The Beta-Binomial is the mastery primitive — so we test the
    canonical mastery use-case end-to-end."""

    def test_mastery_climbs_with_correct_answers(self) -> None:
        # Cold-start student. Jeffreys prior means "we expect about 50%
        # accuracy with high uncertainty."
        p = BetaBinomialPosterior.jeffreys()
        # 9 correct, 1 wrong out of 10
        p = p.update(successes=9, failures=1)
        # Posterior mean should be ≈ 9.5 / 11 ≈ 0.864
        assert p.mean == pytest.approx(9.5 / 11.0, abs=1e-10)
        # 95% CI should exclude 0.5 (we're confident this student is good)
        lo, hi = p.credible_interval(level=0.95)
        assert lo > 0.5

    def test_mastery_shrinks_to_prior_on_no_data(self) -> None:
        # Strong prior of "5 correct, 5 wrong" — represents domain belief
        # that the average student gets 50% before we see any data.
        p = BetaBinomialPosterior(alpha=5.0, beta=5.0)
        # Posterior is exactly the prior since we haven't observed yet.
        assert p.mean == 0.5

    def test_high_n_tightens_credible_interval(self) -> None:
        # 10 observations vs 1000 observations from the same true rate.
        small = BetaBinomialPosterior.jeffreys().update(successes=7, failures=3)
        large = BetaBinomialPosterior.jeffreys().update(successes=700, failures=300)
        small_lo, small_hi = small.credible_interval()
        large_lo, large_hi = large.credible_interval()
        # CI width must shrink with more data.
        assert (large_hi - large_lo) < (small_hi - small_lo)
        # And the means should agree within tolerance — both estimate ~0.7.
        assert small.mean == pytest.approx(0.7, abs=0.05)
        assert large.mean == pytest.approx(0.7, abs=0.01)


class TestRepr:
    def test_repr_includes_key_state(self) -> None:
        p = BetaBinomialPosterior(alpha=2.5, beta=7.5)
        r = repr(p)
        assert "2.500" in r and "7.500" in r and "0.250" in r
