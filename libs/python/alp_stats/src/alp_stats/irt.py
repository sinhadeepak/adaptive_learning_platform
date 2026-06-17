"""Item Response Theory — 1PL (Rasch), 2PL, 3PL.

The platform's primary "ability" primitive. Given an item bank with
calibrated parameters and a student's responses, estimate the
student's latent ability θ on the logit scale, and predict the
probability of correctness for a candidate item.

Used by:
- ADP — pick items in the flow corridor [θ - 0.3, θ + 0.5]
- EIS — calibrate past-paper item difficulty
- IGS — feed θ into the time-efficiency component of the IGS score

We use the EAP (Expected A Posteriori) estimator over a discrete grid
of θ values. Standard practice in psychometric software; matches mirt
defaults. Closed-form gradient-free, runs in microseconds per item.

Reference: Baker & Kim (2017) — "The Basics of Item Response Theory."
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np


@dataclass(frozen=True)
class IRTItem:
    """One calibrated item — the b, a, c trio of 3-Parameter Logistic.

    - **b**: difficulty (logit-scale; positive = harder than average)
    - **a**: discrimination (>0; higher = item separates ability levels more sharply)
    - **c**: guessing parameter (0..1; 4-option MCQ ≈ 0.25)

    For 1PL Rasch, set a=1.0, c=0.0. For 2PL, set c=0.0. For 3PL,
    use all three. The model handles all three modes uniformly.
    """

    b: float
    a: float = 1.0
    c: float = 0.0

    def __post_init__(self) -> None:
        if self.a <= 0:
            raise ValueError(f"discrimination a must be > 0; got {self.a}")
        if not 0 <= self.c < 1:
            raise ValueError(f"guessing c must be in [0, 1); got {self.c}")

    def p_correct(self, theta: float) -> float:
        """P(correct | θ) per the 3-PL formula:

            P = c + (1 − c) × σ(a × (θ − b))

        where σ is the standard logistic. Reduces to Rasch / 2PL when
        a, c are at their defaults.
        """
        z = self.a * (theta - self.b)
        # Stable logistic — avoid overflow on extreme z.
        if z >= 0:
            sig = 1.0 / (1.0 + np.exp(-z))
        else:
            ez = np.exp(z)
            sig = ez / (1.0 + ez)
        return float(self.c + (1.0 - self.c) * sig)


class IRTModel:
    """A bank of calibrated items + an EAP ability estimator.

    Construction takes the list of `IRTItem`s the model knows about.
    Add more later via :meth:`add_item`. The model is *not* a fitter
    — it takes pre-calibrated parameters as input. Fitting items
    happens in a separate offline job (Phase B2's `recalibrate`
    nightly cron).

    The EAP grid spans θ ∈ [−4, 4] in 0.05 steps by default (161
    nodes) — finer than mirt's 41-node default for accuracy, still
    fast enough for online use (< 1 ms per estimate on commodity
    hardware).
    """

    def __init__(
        self,
        items: dict[str, IRTItem] | None = None,
        *,
        grid_lo: float = -4.0,
        grid_hi: float = 4.0,
        grid_step: float = 0.05,
        prior_mean: float = 0.0,
        prior_sd: float = 1.0,
    ) -> None:
        self._items: dict[str, IRTItem] = dict(items or {})
        self._grid = np.arange(grid_lo, grid_hi + grid_step / 2, grid_step)
        # Standard-normal prior over θ — the de facto default in
        # psychometrics. Callers can override (e.g., from screening
        # readiness_seed: prior_mean = seed-derived θ).
        self._prior_mean = prior_mean
        self._prior_sd = prior_sd

    # ── public API ───────────────────────────────────────────────────

    @property
    def items(self) -> dict[str, IRTItem]:
        """Read-only view of the calibrated item bank."""
        return dict(self._items)

    def add_item(self, item_id: str, item: IRTItem) -> None:
        """Register a calibrated item. Replaces any prior entry."""
        self._items[item_id] = item

    def p_correct(self, item_id: str, theta: float) -> float:
        """P(correct on this item | θ)."""
        return self._items[item_id].p_correct(theta)

    def estimate_theta(
        self,
        responses: Iterable[tuple[str, int]],
        *,
        prior_mean: float | None = None,
        prior_sd: float | None = None,
    ) -> tuple[float, float]:
        """EAP estimator. Returns (θ̂, SE).

        `responses` is an iterable of (item_id, correct ∈ {0, 1}).
        Items not in the bank raise KeyError to make calibration
        gaps loud rather than silent.

        Pass `prior_mean` / `prior_sd` to override the constructor's
        prior on a per-call basis (e.g., to inject a screening prior).
        """
        mu = self._prior_mean if prior_mean is None else prior_mean
        sigma = self._prior_sd if prior_sd is None else prior_sd
        if sigma <= 0:
            raise ValueError("prior_sd must be > 0")

        # Prior over θ: a discretised normal.
        log_post = -0.5 * ((self._grid - mu) / sigma) ** 2

        # Likelihood — add log P(obs | θ) for each response.
        for item_id, correct in responses:
            if item_id not in self._items:
                raise KeyError(f"Unknown item: {item_id!r}")
            if correct not in (0, 1):
                raise ValueError(f"correct must be 0 or 1; got {correct}")
            item = self._items[item_id]
            # Vectorised over the θ grid.
            z = item.a * (self._grid - item.b)
            sig = 1.0 / (1.0 + np.exp(-z))
            p = item.c + (1.0 - item.c) * sig
            # Numerical safety — never let p be exactly 0 or 1.
            p = np.clip(p, 1e-10, 1.0 - 1e-10)
            log_post += correct * np.log(p) + (1 - correct) * np.log(1 - p)

        # Normalise then compute posterior mean + SE.
        # Subtract max for stability before exp.
        log_post -= log_post.max()
        post = np.exp(log_post)
        post /= post.sum()
        theta_hat = float((self._grid * post).sum())
        var = float(((self._grid - theta_hat) ** 2 * post).sum())
        se = float(np.sqrt(var))
        return theta_hat, se

    def flow_corridor(
        self,
        theta: float,
        *,
        lower_offset: float = -0.3,
        upper_offset: float = 0.5,
    ) -> tuple[float, float]:
        """Csikszentmihalyi flow corridor: items with b in this band
        produce optimal stretch.

        Defaults match the Bjork "desirable difficulty" literature —
        slightly above the student's current θ.
        """
        return (theta + lower_offset, theta + upper_offset)

    def items_in_corridor(
        self,
        theta: float,
        *,
        lower_offset: float = -0.3,
        upper_offset: float = 0.5,
    ) -> dict[str, IRTItem]:
        """Items whose b parameter lies inside the flow corridor."""
        lo, hi = self.flow_corridor(
            theta, lower_offset=lower_offset, upper_offset=upper_offset
        )
        return {
            iid: item
            for iid, item in self._items.items()
            if lo <= item.b <= hi
        }

    def __len__(self) -> int:
        return len(self._items)

    def __repr__(self) -> str:
        return f"IRTModel(n_items={len(self._items)})"
