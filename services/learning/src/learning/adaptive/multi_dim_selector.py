"""Phase 5 (P5-S41) — Multi-dimensional candidate selector.

Pick the next item that targets the most-uncertain (concept × Bloom)
cell in the user's multi-parameter profile. Falls back to topic-level
exposure rotation when concept-level signal is too sparse (n < 5).

Pure-stdlib. Tests cover each branch in isolation. Wiring (DB read of
user_concept_mastery + user_bloom_mastery, candidate-question fetch,
exposure counter from S39) lives in the routes layer.

Per ADR-0017 §"Multi-dim selection". Complements (does not replace)
the per-topic IRT MFI in `learning.adaptive.irt`. The IRT path runs
when the user has ≥5 attempts in the topic (topic-θ has signal); the
multi-dim path runs from cold-start through ~100 concept-level
attempts.
"""

from __future__ import annotations

from dataclasses import dataclass

# Below this concept-attempt count, treat per-concept EWA as too noisy
# to drive selection. Plan §"Multi-dim selection v2" calls this out.
SPARSE_N_THRESHOLD = 5


@dataclass(frozen=True)
class MasteryRow:
    ewa: float
    n: int


@dataclass(frozen=True)
class CandidateQuestion:
    """A question available for selection. concept_ids is the set of
    primary + prerequisite concept tags from question_concepts; bloom
    is the question's cognitive_demand.bloom from S37 schema."""

    question_id: str
    concept_ids: list[str]
    bloom: str
    difficulty: str = "MEDIUM"


@dataclass(frozen=True)
class Selection:
    """Result of select_next_multi_dim — the chosen question + the
    reason (which concept/bloom cell it targets) so the surface can
    render an explanation."""

    question_id: str
    targets_concept_id: str
    targets_bloom: str
    reason: str


def _cell_uncertainty(
    concept_mastery: dict[str, MasteryRow],
    bloom_mastery: dict[tuple[str, str], MasteryRow],
    concept_id: str,
    bloom: str,
) -> float:
    """Score how uncertain we are about the user's mastery at this
    (concept, bloom) cell. Higher → more uncertain → better selection
    target.

    Heuristic:
    - Concept-grain attempt count `n` < SPARSE_N_THRESHOLD → uncertainty
      = 1.0 (we have no signal; high info from any attempt).
    - Otherwise, uncertainty peaks at ewa=0.5 (entropy-style).
    - Bloom cell missing entirely → bonus +0.3 (we haven't tested this
      cognitive depth yet, so any item gives more info).

    Pure: easy to reason about + unit-test, no probability theory
    overhead. Fine for v1; ADR-0017 follow-up may swap in IRT-Fisher
    once per-concept calibration lands.
    """
    cm = concept_mastery.get(concept_id)
    if cm is None or cm.n < SPARSE_N_THRESHOLD:
        base = 1.0
    else:
        # 1 - |2x - 1|: 0 at extremes, 1 at 0.5 (tent function).
        base = 1.0 - abs(2.0 * cm.ewa - 1.0)

    bm = bloom_mastery.get((concept_id, bloom))
    if bm is None or bm.n == 0:
        base += 0.3

    return base


def select_next_multi_dim(
    *,
    concept_mastery: dict[str, MasteryRow],
    bloom_mastery: dict[tuple[str, str], MasteryRow],
    candidates: list[CandidateQuestion],
    exposure: dict[str, int] | None = None,
    exposure_cap: int = 5,
    exclude: set[str] | None = None,
) -> Selection | None:
    """Pick the candidate that maximises uncertainty across the most-
    uncertain (concept × bloom) cell its tags + bloom-level cover.

    Tie-breaking: lower exposure first, then question_id lexicographic
    so the function is deterministic.

    Returns None when no eligible candidate remains (all
    excluded / all over the exposure cap when no under-cap exists).
    """
    if not candidates:
        return None

    excl = exclude or set()
    counts = exposure or {}

    pool = [c for c in candidates if c.question_id not in excl]
    if not pool:
        return None

    under_cap = [c for c in pool if counts.get(c.question_id, 0) < exposure_cap]
    chosen_pool = under_cap if under_cap else pool

    best: CandidateQuestion | None = None
    best_score = -1.0
    best_target_concept = ""
    best_reason = ""
    best_exposure = -1

    for c in chosen_pool:
        # A question's score = max over its concept tags' (concept, bloom)
        # cell uncertainty. The concept tag that yields the best cell
        # is what we record as the "target" for the explanation surface.
        cell_score = -1.0
        cell_target_concept = c.concept_ids[0] if c.concept_ids else ""
        cell_reason = ""
        for cid in c.concept_ids:
            score = _cell_uncertainty(concept_mastery, bloom_mastery, cid, c.bloom)
            if score > cell_score:
                cell_score = score
                cell_target_concept = cid
                cm = concept_mastery.get(cid)
                if cm is None or cm.n < SPARSE_N_THRESHOLD:
                    cell_reason = f"sparse signal on concept {cid} (n={cm.n if cm else 0})"
                else:
                    cell_reason = (
                        f"concept {cid} ewa={cm.ewa:.2f} bloom={c.bloom} "
                        f"= high uncertainty cell"
                    )

        # Compare; tie-break by exposure (less-exposed wins) then
        # question_id (lexicographic) for determinism.
        exp = counts.get(c.question_id, 0)
        if best is None or _better(
            cell_score, best_score, exp, best_exposure, c.question_id, best.question_id,
        ):
            best = c
            best_score = cell_score
            best_target_concept = cell_target_concept
            best_reason = cell_reason
            best_exposure = exp

    if best is None:
        return None
    return Selection(
        question_id=best.question_id,
        targets_concept_id=best_target_concept,
        targets_bloom=best.bloom,
        reason=best_reason,
    )


def _better(
    score: float,
    best_score: float,
    exp: int,
    best_exp: int,
    qid: str,
    best_qid: str,
) -> bool:
    if score > best_score:
        return True
    if score < best_score:
        return False
    if exp < best_exp:
        return True
    if exp > best_exp:
        return False
    return qid < best_qid
