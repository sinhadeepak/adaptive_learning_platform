"""AI vs human calibration — sampling + Cohen's kappa.

Per ADR-0019 §"Calibration pipeline".

Sampling:
    sample_for_calibration_pipeline(response_id) -> bool
    deterministic 5% via SHA256 % 20 == 0; mirrors the same bucket as
    the evaluation routing band sample, but applied platform-wide
    to all HYBRID responses regardless of confidence band.

Cohen's kappa:
    cohens_kappa(samples) -> float in [-1, 1]
    Pure-function compute; kappa < 0.7 triggers auto-pause of the
    affected criterion (caller's decision; this module surfaces the
    metric only).

Both pieces are pure-stdlib and unit-tested.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

# Same bucket size as evaluation.routing for consistency. Changing
# requires an ADR amendment.
CALIBRATION_BUCKET = 20

# Per ADR-0019 § "Calibration pipeline" — auto-pause criterion when
# rolling kappa drops below this floor.
KAPPA_AUTO_PAUSE_FLOOR = 0.7


@dataclass(frozen=True)
class KappaSample:
    """One AI vs human pair."""

    ai_score: float    # 0.0 / 0.5 / 1.0 typical
    human_score: float


def sample_for_calibration_pipeline(response_id: str) -> bool:
    """Pure: deterministic 5% sampler.

    Reuses the same bucketing as `learning.evaluation.routing.sample_for_calibration`
    but exposed here so the localisation/calibration writer can
    sample independently of the routing decision (e.g. capture *all*
    AUTO_FINALISE rows without going through routing).
    """
    h = hashlib.sha256(response_id.encode("utf-8")).hexdigest()
    return int(h[:8], 16) % CALIBRATION_BUCKET == 0


def cohens_kappa(samples: list[KappaSample]) -> float | None:
    """Pure: weighted-Cohen's kappa for ordinal AI vs human scores.

    Coerces continuous scores onto a {0, 1, 2} ordinal grid (treating
    0.0/0.5/1.0 as the canonical 3 levels); computes:

        kappa = 1 - (sum(w[i,j] * O[i,j]) / sum(w[i,j] * E[i,j]))

    where O is the observed agreement matrix, E the expected (chance)
    matrix, and w is the quadratic weight 1 - ((i-j)/(K-1))^2.

    Returns None when n < 2 (kappa undefined for trivial samples) or
    when the marginals collapse to a single category (all-zero
    expected).
    """
    if len(samples) < 2:
        return None

    K = 3  # 3 ordinal categories
    grid: list[list[int]] = [[0] * K for _ in range(K)]
    for s in samples:
        ai_idx = _to_ordinal(s.ai_score)
        h_idx = _to_ordinal(s.human_score)
        grid[ai_idx][h_idx] += 1

    n = len(samples)
    row_totals = [sum(grid[i]) for i in range(K)]
    col_totals = [sum(grid[i][j] for i in range(K)) for j in range(K)]

    # Quadratic weights.
    w = [
        [1.0 - ((i - j) / (K - 1)) ** 2 for j in range(K)]
        for i in range(K)
    ]

    sum_w_observed = 0.0
    sum_w_expected = 0.0
    for i in range(K):
        for j in range(K):
            o = grid[i][j]
            e = (row_totals[i] * col_totals[j]) / n if n > 0 else 0
            sum_w_observed += w[i][j] * o
            sum_w_expected += w[i][j] * e

    if sum_w_expected == 0:
        return None

    # Standard Cohen's kappa: 1 - (1 - p_o) / (1 - p_e). For weighted
    # variant we use the disagreement form: 1 - (Σw_d * O / Σw_d * E)
    # where w_d = 1 - w; equivalent rearrangement.
    disagreement_o = 0.0
    disagreement_e = 0.0
    for i in range(K):
        for j in range(K):
            wd = 1.0 - w[i][j]  # disagreement weight
            o = grid[i][j]
            e = (row_totals[i] * col_totals[j]) / n if n > 0 else 0
            disagreement_o += wd * o
            disagreement_e += wd * e

    if disagreement_e == 0:
        # Perfect-agreement on the chance matrix → kappa undefined; return 1.0
        # (no disagreement observed and none expected).
        return 1.0 if disagreement_o == 0 else None

    kappa = 1.0 - (disagreement_o / disagreement_e)
    return round(kappa, 4)


def _to_ordinal(score: float) -> int:
    if score < 0.25:
        return 0
    if score < 0.75:
        return 1
    return 2
