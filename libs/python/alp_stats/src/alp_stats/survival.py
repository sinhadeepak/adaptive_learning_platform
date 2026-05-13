"""Kaplan-Meier survival estimator.

Used by the topic-decay model and dropout-risk forecasts. Given a
sample of (duration, observed-event) pairs — censored OK — produces
the survival function S(t) = P(still alive at time t) and its 95%
Greenwood confidence band.

Concretely for the platform:
- "Event" = student forgot a concept (mastery dropped below threshold)
- "Duration" = days since the concept was last attempted
- "Censored" = student is still above threshold (event hasn't happened yet)

The estimator answers "P(this student still remembers concept X
after N days)" — the core input to the decay-severity component of
PCE's personal_yield formula.

Reference: Klein & Moeschberger (2003) — "Survival Analysis:
Techniques for Censored and Truncated Data."
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class SurvivalCurve:
    """A KM survival curve. Times in ascending order; survival[i]
    is S(times[i])."""

    times: np.ndarray
    survival: np.ndarray
    ci_low: np.ndarray
    ci_high: np.ndarray

    def at(self, t: float) -> float:
        """S(t) for any t — step function, returns the survival at
        the most recent event time ≤ t. Before the first event,
        survival is 1."""
        if t < float(self.times[0]):
            return 1.0
        # Right-aligned step function: pick the last time ≤ t.
        idx = int(np.searchsorted(self.times, t, side="right") - 1)
        idx = max(0, min(idx, len(self.times) - 1))
        return float(self.survival[idx])

    def median(self) -> float | None:
        """Median survival time — the first t at which S(t) ≤ 0.5.
        Returns None if survival never drops to 0.5 in the observed
        window (which happens with heavy censoring)."""
        mask = self.survival <= 0.5
        if not mask.any():
            return None
        return float(self.times[mask][0])


class KaplanMeier:
    """Kaplan-Meier estimator. Stateless — one fit per call.

    Usage:
        durations = [5, 10, 12, 14, 30]
        events    = [1, 1, 0,  1, 0]  # 0 = censored, 1 = event observed
        curve = KaplanMeier.fit(durations, events)
        s_at_20 = curve.at(20.0)
    """

    @staticmethod
    def fit(durations: list[float], events: list[int]) -> SurvivalCurve:
        """Compute the KM estimator from a sample.

        `durations[i]` is the time at which the i-th subject was
        last observed. `events[i]` is 1 if the event happened at
        that time, 0 if the subject was still event-free
        (right-censored).
        """
        if len(durations) != len(events):
            raise ValueError("durations and events must have the same length")
        if not durations:
            raise ValueError("Need at least one observation")
        for e in events:
            if e not in (0, 1):
                raise ValueError(f"events must be 0 or 1; got {e}")

        arr_dur = np.asarray(durations, dtype=float)
        arr_evt = np.asarray(events, dtype=int)

        # Sort by duration.
        order = np.argsort(arr_dur, kind="stable")
        arr_dur = arr_dur[order]
        arr_evt = arr_evt[order]

        # Unique event times (we still iterate over censoring times to
        # decrement at_risk, but only event times produce drops in S).
        unique_times = np.unique(arr_dur)
        n_at_risk = len(arr_dur)
        survival_steps: list[tuple[float, float, float]] = []
        # Greenwood: keep cumulative variance term.
        var_sum = 0.0
        S = 1.0

        for t in unique_times:
            # Number who experienced an event at exactly t.
            at_t = arr_dur == t
            d = int(arr_evt[at_t].sum())          # events at t
            n = int(n_at_risk)                    # at risk just before t
            c = int(at_t.sum() - d)               # censored at t
            if d > 0 and n > 0:
                S *= 1 - d / n
                # Greenwood variance increment:
                var_sum += d / (n * (n - d)) if n > d else 0.0
            survival_steps.append((float(t), float(S), float(var_sum)))
            # Subjects observed at time t leave the at-risk pool
            # immediately after.
            n_at_risk -= d + c

        times = np.array([t for t, _, _ in survival_steps])
        survival = np.array([s for _, s, _ in survival_steps])
        vsum = np.array([v for _, _, v in survival_steps])

        # 95% Greenwood log-log CI — preferred over naive ±1.96·SE
        # because it stays inside [0, 1] automatically.
        z = 1.959963984540054
        # Avoid log(0); clamp survival before transforming.
        s_clamped = np.clip(survival, 1e-12, 1 - 1e-12)
        log_s = np.log(s_clamped)
        se_log = np.sqrt(vsum) / np.abs(log_s)
        ci_low = s_clamped ** np.exp(z * se_log)
        ci_high = s_clamped ** np.exp(-z * se_log)
        # Clip back to [0, 1] for safety.
        ci_low = np.clip(ci_low, 0.0, 1.0)
        ci_high = np.clip(ci_high, 0.0, 1.0)

        return SurvivalCurve(
            times=times,
            survival=survival,
            ci_low=ci_low,
            ci_high=ci_high,
        )
