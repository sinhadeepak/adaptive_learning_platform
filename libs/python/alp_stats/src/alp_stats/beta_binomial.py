"""Beta-Binomial conjugate posterior.

Used everywhere we want mastery, calibration, or success-rate as a
*distribution* instead of a point estimate. The Beta prior is the
conjugate of the Bernoulli likelihood, so updates are closed-form:

    Beta(α, β) | k successes, n−k failures   →   Beta(α + k, β + n − k)

This is the simplest non-trivial Bayesian primitive in the platform
and the right default whenever a service is about to compute
`success / total` without quantifying its uncertainty.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from scipy import stats


@dataclass(frozen=True)
class BetaBinomialPosterior:
    """Posterior distribution over a Bernoulli success rate.

    Construction takes the *prior* hyperparameters; use
    :meth:`update` to incorporate observations. Both inputs are
    non-negative; alpha=beta=1 is the uniform / Jeffreys-equivalent
    default (one prior success, one prior failure).

    The class is intentionally immutable — update() returns a new
    instance — so callers can safely pass posteriors between
    workflow steps without worrying about shared mutable state.
    """

    alpha: float
    beta: float

    def __post_init__(self) -> None:
        if self.alpha <= 0 or self.beta <= 0:
            raise ValueError(
                f"alpha and beta must be > 0; got alpha={self.alpha}, beta={self.beta}"
            )

    # ── public API ───────────────────────────────────────────────────

    @classmethod
    def uniform(cls) -> "BetaBinomialPosterior":
        """A no-information prior: Beta(1, 1) — the uniform distribution."""
        return cls(alpha=1.0, beta=1.0)

    @classmethod
    def jeffreys(cls) -> "BetaBinomialPosterior":
        """Jeffreys' prior — Beta(0.5, 0.5). Slightly more honest
        under zero observations than uniform."""
        return cls(alpha=0.5, beta=0.5)

    def update(self, *, successes: int, failures: int) -> "BetaBinomialPosterior":
        """Apply n observed (successes, failures) → posterior."""
        if successes < 0 or failures < 0:
            raise ValueError("successes and failures must be non-negative")
        return BetaBinomialPosterior(
            alpha=self.alpha + successes,
            beta=self.beta + failures,
        )

    @property
    def mean(self) -> float:
        """Posterior mean — the point estimate of the success rate."""
        return self.alpha / (self.alpha + self.beta)

    @property
    def variance(self) -> float:
        """Posterior variance."""
        a, b = self.alpha, self.beta
        return (a * b) / ((a + b) ** 2 * (a + b + 1))

    @property
    def mode(self) -> float | None:
        """Posterior mode. None when the distribution is U-shaped
        (alpha, beta < 1) — undefined in that regime."""
        a, b = self.alpha, self.beta
        if a > 1 and b > 1:
            return (a - 1) / (a + b - 2)
        # When alpha=beta=1, every value is equally likely; pick 0.5
        # as the conventional "no preference" mode.
        if math.isclose(a, 1.0) and math.isclose(b, 1.0):
            return 0.5
        return None

    def credible_interval(self, level: float = 0.95) -> tuple[float, float]:
        """Equal-tailed credible interval at the requested confidence level.

        Uses scipy.stats.beta.ppf for the inverse CDF — the same
        implementation that mirt and the Python stats community
        trust. We delegate rather than re-implement so the
        validation harness can compare us to scipy directly.
        """
        if not 0 < level < 1:
            raise ValueError("level must be in (0, 1)")
        lo = (1 - level) / 2
        hi = 1 - lo
        return (
            float(stats.beta.ppf(lo, self.alpha, self.beta)),
            float(stats.beta.ppf(hi, self.alpha, self.beta)),
        )

    def sample(self, *, rng_seed: int | None = None) -> float:
        """Draw one sample from the posterior. Caller passes a seed
        for determinism in tests. Not for high-volume sampling —
        if you need batch draws, use the scipy distribution directly."""
        rng = stats.beta.rvs
        if rng_seed is not None:
            return float(rng(self.alpha, self.beta, random_state=rng_seed))
        return float(rng(self.alpha, self.beta))

    def __repr__(self) -> str:
        return f"BetaBinomialPosterior(α={self.alpha:.3f}, β={self.beta:.3f}, mean={self.mean:.3f})"
