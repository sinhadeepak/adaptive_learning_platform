"""3-Parameter Logistic IRT model + EAP ability estimator + MFI item selection.

Pure-stdlib implementation (no numpy/scipy) so the service starts fast and
deploys small. The integration grid is fixed at 81 points over θ ∈ [-4, 4]
which is plenty for the Sprint 2 closed-beta cohort; the SPIKE-01 follow-up
benchmarks this against scipy and decides whether to bring numpy in.

3PL: P(correct | θ) = c + (1 - c) / (1 + exp(-D · a · (θ - b)))
where D = 1.7 is the standard scaling constant that makes the logistic
approximate the normal ogive.

EAP (Expected A Posteriori) estimator: posterior mean of θ given the
likelihood of observed responses under a prior. Robust to short tests
(< 10 items) and avoids the divergence issues of MLE when all responses
are correct or all incorrect.

MFI (Maximum Fisher Information) selection: pick the next item whose Fisher
info I(θ̂) is highest at the current ability estimate. With a simple
exposure cap to discourage always-serving the same handful of items.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

D = 1.7
GRID_MIN = -4.0
GRID_MAX = 4.0
GRID_SIZE = 81  # 0.1 spacing — fine enough for EAP, fast enough for hot path


@dataclass(frozen=True)
class Item:
    """An IRT-calibrated item.

    a — discrimination (slope). Typical range 0.5..2.5; larger = sharper.
    b — difficulty (location). Same scale as θ.
    c — guessing parameter (lower asymptote). Typical 0..0.3.
    """

    a: float
    b: float
    c: float

    def __post_init__(self) -> None:
        if self.a <= 0:
            raise ValueError("a (discrimination) must be > 0")
        if not 0.0 <= self.c < 1.0:
            raise ValueError("c (guessing) must be in [0, 1)")


@dataclass(frozen=True)
class Response:
    """An item + the student's binary verdict (correct=True)."""

    item: Item
    is_correct: bool


def prob_correct(theta: float, item: Item) -> float:
    """3PL probability that a student of ability θ answers `item` correctly."""
    z = D * item.a * (theta - item.b)
    # Numerically-stable logistic
    if z >= 0:
        e = math.exp(-z)
        p_logistic = 1.0 / (1.0 + e)
    else:
        e = math.exp(z)
        p_logistic = e / (1.0 + e)
    return item.c + (1.0 - item.c) * p_logistic


def fisher_information(theta: float, item: Item) -> float:
    """Fisher information I(θ) for one 3PL item.

    I(θ) = (D·a)² · (P - c)² · (1 - P) / (P · (1 - c)²)

    Peaks near θ = b for high-`a` items; lower asymptote `c` damps info on
    very-easy items because correct responses become uninformative.
    """
    p = prob_correct(theta, item)
    if p <= 0.0 or p >= 1.0:
        return 0.0
    one_minus_c = 1.0 - item.c
    if one_minus_c <= 0:
        return 0.0
    num = (D * item.a) ** 2 * (p - item.c) ** 2 * (1.0 - p)
    den = p * one_minus_c**2
    return num / den


def _theta_grid() -> list[float]:
    step = (GRID_MAX - GRID_MIN) / (GRID_SIZE - 1)
    return [GRID_MIN + i * step for i in range(GRID_SIZE)]


def _normal_pdf(x: float, mean: float, sd: float) -> float:
    z = (x - mean) / sd
    return math.exp(-0.5 * z * z) / (sd * math.sqrt(2.0 * math.pi))


def eap_estimate(
    responses: list[Response],
    prior_mean: float = 0.0,
    prior_sd: float = 1.0,
) -> tuple[float, float]:
    """Return (θ̂, posterior_se) via EAP over a fixed θ grid.

    With no responses, returns the prior mean and prior SD. Numerical safety:
    if every grid point yields zero likelihood (impossible under a sane prior),
    falls back to the prior.
    """
    grid = _theta_grid()
    step = grid[1] - grid[0]

    # Posterior is proportional to prior * likelihood, evaluated on the grid.
    posterior: list[float] = []
    log_likes: list[float] = []
    for theta in grid:
        ll = 0.0
        for r in responses:
            p = prob_correct(theta, r.item)
            # Clamp to avoid log(0)
            p = min(max(p, 1e-9), 1.0 - 1e-9)
            ll += math.log(p) if r.is_correct else math.log(1.0 - p)
        log_likes.append(ll)
    # Subtract max for numerical stability before exponentiating.
    max_ll = max(log_likes) if log_likes else 0.0
    for i, theta in enumerate(grid):
        prior = _normal_pdf(theta, prior_mean, prior_sd)
        posterior.append(prior * math.exp(log_likes[i] - max_ll))

    norm = sum(posterior) * step
    if norm <= 0:
        return prior_mean, prior_sd

    # E[θ] and Var[θ] via trapezoidal integration on the grid.
    mean = sum(theta * posterior[i] for i, theta in enumerate(grid)) * step / norm
    var = sum((theta - mean) ** 2 * posterior[i] for i, theta in enumerate(grid)) * step / norm
    se = math.sqrt(max(var, 0.0))
    return mean, se


@dataclass(frozen=True)
class CandidateItem:
    """Item plus an opaque id (so callers can route the choice back)."""

    id: str
    item: Item


def select_mfi(
    theta: float,
    candidates: list[CandidateItem],
    exclude: set[str] | None = None,
    exposure_count: dict[str, int] | None = None,
    exposure_cap: int = 5,
) -> CandidateItem | None:
    """Pick the candidate with the highest Fisher info at θ.

    Items in `exclude` (already served this session) are skipped. Items whose
    exposure count is at or above `exposure_cap` are deprioritized: if any
    under-cap candidate exists, only those are considered. This is a simple
    Sympson-Hetter-like control suitable for closed-beta scale; full
    randomesque + exposure-control table is a SPIKE-01 follow-up.
    """
    if not candidates:
        return None
    excl = exclude or set()
    counts = exposure_count or {}
    pool = [c for c in candidates if c.id not in excl]
    if not pool:
        return None
    under_cap = [c for c in pool if counts.get(c.id, 0) < exposure_cap]
    chosen_pool = under_cap if under_cap else pool

    best: CandidateItem | None = None
    best_info = -1.0
    for c in chosen_pool:
        info = fisher_information(theta, c.item)
        if info > best_info:
            best_info = info
            best = c
    return best
