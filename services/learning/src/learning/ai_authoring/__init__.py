"""Phase 5 (P5-S40) — AI Authoring module.

Three operations per ADR-0019 §"AI Authoring":
- draft_question(type_id, topic, difficulty, exam, source_material?)
- expand_explanation(payload)
- suggest_distractors(stem, correct_answer)

Three quality checks (S40 — remaining 3 land in S45):
- ambiguity (multiple defensibly-correct options)
- distractor_plausibility (each distractor scored 0-1)
- duplicate_detection (embedding similarity > 0.92)

All output is marked AI_DRAFT (per ADR-0019 §"AI never publishes
content"). The peer-review queue surfaces edit_distance per field so
zero-edit drafts trigger reviewer scrutiny.
"""

from __future__ import annotations

from learning.ai_authoring.draft import (
    AIDraftMarker,
    DraftQuestionRequest,
    draft_question,
    expand_explanation,
    suggest_distractors,
)
from learning.ai_authoring.quality_checks import QualityWarning, run_quality_checks

__all__ = [
    "AIDraftMarker",
    "DraftQuestionRequest",
    "QualityWarning",
    "draft_question",
    "expand_explanation",
    "run_quality_checks",
    "suggest_distractors",
]
