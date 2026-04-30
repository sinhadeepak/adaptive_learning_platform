"""Sprint 32 (P4-S32) — pure-function peer-percentile helpers.

Per-(user, topic, exam) percentile rank vs the platform cohort, with an
anonymity threshold (NFR-P4-06) that hides the result when the cohort is
small.

Pure: no DB / HTTP coupling.
"""

from __future__ import annotations

from typing import Any

DEFAULT_ANONYMITY_THRESHOLD = 30


def compute_peer_percentile(
    user_ewa: float, peer_ewas: list[float]
) -> float | None:
    """Strict-below percentile: fraction of peers with EWA < user_ewa.

    Returns 0.0 when user is at or below every peer (or peers is empty
    via the surrogate); None when the peer list is genuinely empty so
    callers can decide to hide rather than render "0%".
    """
    if not peer_ewas:
        return None
    below = sum(1 for e in peer_ewas if float(e) < float(user_ewa))
    return round(100.0 * below / len(peer_ewas), 2)


def is_anonymity_threshold_met(
    peer_count: int, *, threshold: int = DEFAULT_ANONYMITY_THRESHOLD
) -> bool:
    """Hide the percentile when the cohort is small (NFR-P4-06)."""
    return peer_count >= threshold


def summarise_percentile(
    user_ewa: float,
    peer_ewas: list[float],
    *,
    threshold: int = DEFAULT_ANONYMITY_THRESHOLD,
) -> dict[str, Any]:
    """Return either a hidden marker (with reason) or the visible
    percentile + cohortSize. Driver for the route + UI.
    """
    cohort = len(peer_ewas)
    if not is_anonymity_threshold_met(cohort, threshold=threshold):
        return {
            "hidden": True,
            "reason": "cohort_too_small",
            "cohortSize": cohort,
            "thresholdRequired": threshold,
        }
    pct = compute_peer_percentile(user_ewa, peer_ewas)
    return {
        "hidden": False,
        "percentile": pct,
        "cohortSize": cohort,
        "userEwa": round(float(user_ewa), 4),
    }
