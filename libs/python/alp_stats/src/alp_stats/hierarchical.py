"""Empirical-Bayes hierarchical model for sparse-data smoothing.

Used by the EIS forecaster (per-topic counts with small N) and any
cohort-level estimate where some groups have few observations.

The intuition — and the reason this primitive exists — is **borrowing
strength**. A topic that's appeared 0 / 1 / 0 in three years has a
naive frequency-rate of 33%, but with high uncertainty. A
hierarchical estimator pulls that 33% toward the *grand mean* across
all topics (e.g., 20%), shrinking the estimate in proportion to its
unreliability.

Concretely the model:

    y_i  ~  Binomial(n_i, p_i)
    p_i  ~  Beta(α, β)      (the shared prior, fit from data)

Empirical-Bayes fits α, β via method-of-moments on the observed
group means and variances. Each group's posterior mean is then

    p̂_i = (α + y_i) / (α + β + n_i)

which is a weighted average of the global prior mean and the
group's own observed rate, with the weight automatically determined
by how informative n_i is.

Reference: Efron & Morris (1975) — "Stein's Estimation Rule and Its
Competitors — An Empirical Bayes Approach."
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class HierarchicalEstimate:
    """Per-group shrunk estimate produced by HierarchicalBayes.fit."""

    group_id: str
    n: int
    successes: int
    raw_rate: float                # observed s/n (or 0.5 if n=0)
    shrunk_rate: float             # empirical-Bayes posterior mean
    shrinkage_weight: float        # 1.0 = fully prior, 0.0 = fully data
    posterior_alpha: float
    posterior_beta: float


class HierarchicalBayes:
    """Empirical-Bayes shrinkage estimator for grouped Bernoulli data.

    Usage:
        data = [
            ("Mechanics", 8, 10),    # 8 hits in 10 trials
            ("Optics",    0,  1),    # 0/1 — very uncertain
            ("Modern",   12, 20),    # 12/20 — moderate signal
        ]
        result = HierarchicalBayes.fit(data)
        # result is a dict {group_id: HierarchicalEstimate}

    The model is **fit globally then queried per group** — different
    from the per-arm BetaBinomial primitive which has no shared prior.

    Use this whenever you have N groups, each with potentially few
    observations, and you want each group's rate estimate to "borrow"
    information from the others.
    """

    @staticmethod
    def fit(
        observations: list[tuple[str, int, int]],
    ) -> dict[str, HierarchicalEstimate]:
        """Fit α, β via method-of-moments, then compute per-group
        shrunk estimates.

        `observations` is a list of (group_id, successes, n) tuples.
        Empty groups (n=0) are kept and assigned the global prior
        mean as their estimate.
        """
        if not observations:
            raise ValueError("Need at least one observation")
        for gid, s, n in observations:
            if n < 0 or s < 0 or s > n:
                raise ValueError(
                    f"Invalid observation for {gid!r}: s={s}, n={n}"
                )

        # Empirical-Bayes hyperparameter fit.
        #
        # Two ingredients:
        # 1. Prior mean μ — we use the *pooled* success rate
        #    Σs/Σn, which weights groups by their sample size. This is
        #    more robust than the unweighted mean(s/n) when group sizes
        #    differ wildly (e.g., a tiny group with raw rate 0 doesn't
        #    drag the mean down by 25%).
        # 2. Prior strength k = α + β — derived from the between-group
        #    overdispersion via the marginal Beta-Binomial method of
        #    moments. When the data is under-dispersed (no real
        #    between-group variance signal), fall back to a strong
        #    prior so shrinkage is meaningful.
        ss = np.array([s for _, s, _ in observations], dtype=float)
        ns = np.array([n for _, _, n in observations], dtype=float)
        live = ns > 0
        if not live.any():
            alpha = beta = 1.0
        else:
            total_s = float(ss[live].sum())
            total_n = float(ns[live].sum())
            mu = total_s / total_n
            # Weighted between-group variance of observed rates.
            live_rates = ss[live] / ns[live]
            weights = ns[live] / total_n
            var = float((weights * (live_rates - mu) ** 2).sum())
            # Subtract the within-group sampling variance to get the
            # excess (between-group) variance. The Beta-Binomial
            # marginal variance is:
            #     Var(p_obs) = μ(1-μ)/n + μ(1-μ)/(α+β+1)
            # so excess = total - sampling.
            mean_n = float(ns[live].mean())
            sampling_var = mu * (1 - mu) / mean_n
            excess = var - sampling_var
            if excess > 1e-9:
                # Solve for k = α + β:
                #   excess = μ(1-μ) / (k + 1)  →  k = μ(1-μ)/excess - 1
                k = mu * (1 - mu) / excess - 1
                if k <= 0 or not np.isfinite(k):
                    k = mean_n
            else:
                # No detectable between-group variance → groups are
                # exchangeable. Use a moderately strong prior so the
                # tiny groups get meaningful shrinkage toward μ.
                k = max(mean_n, 5.0)
            # Floor k so we never end up with a near-flat prior.
            k = max(k, 5.0)
            alpha = mu * k
            beta = (1 - mu) * k
            # Jeffreys floor on each component.
            alpha = max(alpha, 0.5)
            beta = max(beta, 0.5)

        # Compute per-group shrunk estimates.
        out: dict[str, HierarchicalEstimate] = {}
        for gid, s, n in observations:
            raw = (s / n) if n > 0 else (alpha / (alpha + beta))
            post_a = alpha + s
            post_b = beta + (n - s)
            shrunk = post_a / (post_a + post_b)
            # Shrinkage weight w = (α + β) / (α + β + n).
            # 1.0 means fully shrunk to prior; 0.0 means fully data-driven.
            w = (alpha + beta) / (alpha + beta + n) if n > 0 else 1.0
            out[gid] = HierarchicalEstimate(
                group_id=gid,
                n=n,
                successes=s,
                raw_rate=raw,
                shrunk_rate=shrunk,
                shrinkage_weight=float(w),
                posterior_alpha=post_a,
                posterior_beta=post_b,
            )
        return out
