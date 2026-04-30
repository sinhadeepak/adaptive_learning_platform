"""Phase 5 (P5-S42) — AI evaluation pipeline.

Per ADR-0019 §"AI Evaluation". Subjective + SHORT_TEXT types submit
through this pipeline:

    rubric + model_answer + student response  ──>  AI Gateway
                                                    (touchpoint=evaluation)
                                                            │
                                          ┌─────────────────┴──────────────┐
                                          │                                │
                                  conf >= 0.95?                    conf < 0.75?
                                          │                                │
                              auto-finalise CORRECT/...           PENDING_HUMAN_REVIEW
                                          │
                                  0.75 <= conf < 0.95?
                                          │
                                 calibration sample 5% (S43)
                                  → human shadow grade
                                  → otherwise auto-finalise

Confidence thresholds + calibration policy are constants in this module
so tests + dashboard share one definition. Re-evaluation triggers
(rubric or prompt-version updates) preserve old evaluation_records as
immutable history per the schema set up in S37.
"""

from __future__ import annotations

from learning.evaluation.routing import (
    AUTO_FINALISE_THRESHOLD,
    HUMAN_REQUIRED_THRESHOLD,
    EvalDecision,
    decide_routing,
    sample_for_calibration,
)
from learning.evaluation.subjective import (
    CriterionVerdict,
    SubjectiveEvaluationReport,
    aggregate_resolution,
    grade_subjective,
)

__all__ = [
    "AUTO_FINALISE_THRESHOLD",
    "HUMAN_REQUIRED_THRESHOLD",
    "EvalDecision",
    "decide_routing",
    "sample_for_calibration",
    "CriterionVerdict",
    "SubjectiveEvaluationReport",
    "aggregate_resolution",
    "grade_subjective",
]
