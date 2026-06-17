"""Thompson sampling over Bernoulli-reward arms.

Used by ADP (question selection in the flow corridor) and by the
AI-suggestion variant chooser. Thompson sampling provides automatic
explore / exploit balance without hand-tuned epsilon:

    For each arm:
        sample one draw from its Beta posterior
    Pick the arm with the highest sample.

A high-posterior-mean arm (well-observed, known to be good) usually
wins. A low-n arm with broad uncertainty occasionally wins and gets
explored. The protocol converges to picking the truly best arm
**without ever needing a separate "exploration" budget**.

Reference: Russo et al. (2018) — "A Tutorial on Thompson Sampling."
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Hashable

from scipy import stats

from alp_stats.beta_binomial import BetaBinomialPosterior


@dataclass
class Arm:
    """One option being sampled — a question, a recommendation variant,
    a difficulty level. The arm id is opaque to the sampler; callers
    use whatever string / int / uuid makes sense.
    """

    id: Hashable
    posterior: BetaBinomialPosterior = field(
        default_factory=BetaBinomialPosterior.jeffreys
    )


class ThompsonSampler:
    """Stateful sampler over a fixed set of arms.

    The sampler tracks each arm's Beta posterior and exposes two
    operations:

    - :meth:`pick` — draw one sample from each arm's posterior and
      return the id of the arm with the highest draw.
    - :meth:`update` — register an observed reward (1 = success,
      0 = failure) for the previously-picked arm.

    Construction takes a list of arm ids and optional initial
    posteriors. Adding arms mid-run is supported via :meth:`add_arm`
    so a newly-published question can join the candidate set without
    rebuilding the sampler.

    Determinism: pass `rng_seed` to construct a reproducible sampler.
    Tests use this; production leaves it unset to consume system
    entropy.
    """

    def __init__(
        self,
        arm_ids: list[Hashable] | None = None,
        *,
        priors: dict[Hashable, BetaBinomialPosterior] | None = None,
        rng_seed: int | None = None,
    ) -> None:
        if arm_ids is None and priors is None:
            raise ValueError("Provide arm_ids or priors")
        self._arms: dict[Hashable, Arm] = {}
        for aid in arm_ids or []:
            prior = (priors or {}).get(aid)
            self._arms[aid] = Arm(
                id=aid,
                posterior=prior or BetaBinomialPosterior.jeffreys(),
            )
        if priors:
            for aid, prior in priors.items():
                self._arms.setdefault(
                    aid, Arm(id=aid, posterior=prior)
                )
        # scipy uses numpy's default RNG when random_state is set.
        # We keep an integer that we mutate by ±1 between calls so
        # consecutive picks aren't identical even with a constant seed.
        self._rng_seed = rng_seed
        self._draw_count = 0

    # ── public API ───────────────────────────────────────────────────

    @property
    def arms(self) -> dict[Hashable, Arm]:
        """Read-only view of the arms (do not mutate)."""
        return dict(self._arms)

    def add_arm(
        self,
        arm_id: Hashable,
        *,
        prior: BetaBinomialPosterior | None = None,
    ) -> None:
        """Register a new arm. Idempotent — re-adding an existing arm
        is a no-op (preserves accumulated posterior)."""
        if arm_id in self._arms:
            return
        self._arms[arm_id] = Arm(
            id=arm_id,
            posterior=prior or BetaBinomialPosterior.jeffreys(),
        )

    def pick(self, *, eligible: set[Hashable] | None = None) -> Hashable:
        """Sample one draw from each (eligible) arm; return the
        winner's id.

        `eligible` restricts the candidate set without re-creating the
        sampler — useful when the ADP flow corridor narrows the
        eligible questions at request time.
        """
        if not self._arms:
            raise RuntimeError("No arms to pick from")
        candidates = (
            self._arms.values()
            if eligible is None
            else [self._arms[a] for a in eligible if a in self._arms]
        )
        if not candidates:
            raise RuntimeError("No eligible arms")
        # Use a fresh seed per pick (when reproducibility is requested)
        # so two consecutive picks against the same posteriors don't
        # return the same arm.
        base = self._rng_seed
        seed = None if base is None else base + self._draw_count
        self._draw_count += 1
        best_id: Hashable | None = None
        best_draw = -1.0
        for arm in candidates:
            draw = float(
                stats.beta.rvs(
                    arm.posterior.alpha,
                    arm.posterior.beta,
                    random_state=seed,
                )
            )
            if draw > best_draw:
                best_draw = draw
                best_id = arm.id
            if seed is not None:
                seed += 1
        assert best_id is not None
        return best_id

    def update(self, arm_id: Hashable, *, reward: int) -> None:
        """Record an observation for the named arm. `reward` is
        1 (success / correct) or 0 (failure / wrong)."""
        if arm_id not in self._arms:
            raise KeyError(f"Unknown arm: {arm_id!r}")
        if reward not in (0, 1):
            raise ValueError("reward must be 0 or 1")
        arm = self._arms[arm_id]
        self._arms[arm_id] = Arm(
            id=arm.id,
            posterior=arm.posterior.update(
                successes=reward, failures=1 - reward
            ),
        )

    def mean(self, arm_id: Hashable) -> float:
        """Current posterior mean for an arm — useful for monitoring."""
        return self._arms[arm_id].posterior.mean

    def __len__(self) -> int:
        return len(self._arms)

    def __repr__(self) -> str:
        return f"ThompsonSampler(n_arms={len(self._arms)})"
