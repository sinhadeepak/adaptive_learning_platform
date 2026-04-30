"""Confidence-based evaluation routing.

Pure-function decisions. No DB, no Gateway. Tests cover each branch.

Per ADR-0019 §"HYBRID confidence thresholds":

    confidence >= 0.95     auto-finalise (sample 0%)
    0.75 <= conf < 0.95    auto-finalise + 5% calibration sample
    confidence <  0.75     PENDING_HUMAN_REVIEW
    AI error / schema fail PENDING_HUMAN_REVIEW (caller maps to None confidence)

Calibration sampling is deterministic via hash(response_id) % 20 == 0
so the 5% slice is reproducible across re-runs (audits + replays).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Literal

# Locked constants. Changing them requires an ADR amendment per ADR-0019.
AUTO_FINALISE_THRESHOLD = 0.95
HUMAN_REQUIRED_THRESHOLD = 0.75

# 5% deterministic sampling — hash bucket size 20.
CALIBRATION_BUCKET = 20

EvalAction = Literal["AUTO_FINALISE", "AUTO_FINALISE_WITH_SAMPLING", "HUMAN_REQUIRED"]


@dataclass(frozen=True)
class EvalDecision:
    """The routing decision the AI evaluator hands to the caller."""

    action: EvalAction
    sampled_for_calibration: bool
    rationale: str


def decide_routing(
    *,
    confidence: float | None,
    response_id: str,
) -> EvalDecision:
    """Map AI confidence to an evaluation action.

    `confidence is None` reflects an AI failure (provider error, schema
    parse fail) — caller routes to human as a safe default.

    `response_id` controls calibration sampling for the mid-confidence
    band. Same id always → same decision so re-runs are deterministic.
    """
    if confidence is None:
        return EvalDecision(
            action="HUMAN_REQUIRED",
            sampled_for_calibration=False,
            rationale="ai_unavailable_or_schema_failure",
        )
    if confidence < HUMAN_REQUIRED_THRESHOLD:
        return EvalDecision(
            action="HUMAN_REQUIRED",
            sampled_for_calibration=False,
            rationale=f"confidence_below_{HUMAN_REQUIRED_THRESHOLD}",
        )
    if confidence >= AUTO_FINALISE_THRESHOLD:
        return EvalDecision(
            action="AUTO_FINALISE",
            sampled_for_calibration=False,
            rationale=f"confidence_at_or_above_{AUTO_FINALISE_THRESHOLD}",
        )
    # 0.75 ≤ conf < 0.95 — calibration band.
    sampled = sample_for_calibration(response_id)
    return EvalDecision(
        action="AUTO_FINALISE_WITH_SAMPLING" if sampled else "AUTO_FINALISE",
        sampled_for_calibration=sampled,
        rationale="calibration_band_sample" if sampled else "calibration_band_no_sample",
    )


def sample_for_calibration(response_id: str) -> bool:
    """Deterministic 5% sampler. Pure function of response_id.

    SHA256(response_id) → integer mod CALIBRATION_BUCKET → True iff 0.
    Stable across re-runs (the same response_id is always sampled or
    always not), which is what the calibration audit trail requires.
    """
    h = hashlib.sha256(response_id.encode("utf-8")).hexdigest()
    bucket = int(h[:8], 16) % CALIBRATION_BUCKET
    return bucket == 0
