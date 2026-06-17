"""Phase 5 (P5-S37) — Type Handler Protocol + 22 question types.

Per ADR-0018 (polymorphic question types + Resolution contract). This
package houses one Type Handler Protocol implementation per question
type, plus the Resolution shape every evaluator returns.

Lock-first principle: payload + response Pydantic contracts land BEFORE
migrations (S37 week 1). Migrations consume these contract shapes for
the JSONB validation discipline.

Adding a 23rd type is one new module + one registry line. No DB
migration, no state-machine change.
"""

from __future__ import annotations

from learning.types.base import (
    EvaluatorMetadata,
    PartDetail,
    QuestionTypeHandler,
    Resolution,
    ResolutionStatus,
    EvaluationMode,
)
from learning.types.registry import (
    all_type_metas,
    filter_by_family,
    get_handler,
    is_supported,
    register_handler,
    TypeMeta,
)

__all__ = [
    "QuestionTypeHandler",
    "Resolution",
    "ResolutionStatus",
    "EvaluationMode",
    "PartDetail",
    "EvaluatorMetadata",
    "TypeMeta",
    "register_handler",
    "get_handler",
    "is_supported",
    "all_type_metas",
    "filter_by_family",
]
