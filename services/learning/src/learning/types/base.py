"""Type Handler Protocol + Resolution contract — Phase 5 base shapes.

Per ADR-0018. Every question type registers a handler implementing the
Protocol below; every evaluator returns a Resolution. Resolution
**never carries marks** — marks live in Quiz/Test orchestration.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, Protocol, runtime_checkable

from pydantic import BaseModel, Field

# ── Resolution contract ──────────────────────────────────────────────────────
# Returned by every evaluator. The single point of truth for "did this
# response satisfy the question's correctness criteria?". Marks are
# computed downstream by Quiz/Test orchestration using its scoring
# profile + the Resolution.

ResolutionStatus = Literal[
    "CORRECT",
    "PARTIAL_CORRECT",
    "INCORRECT",
    "UNATTEMPTED",
    "PENDING_HUMAN_REVIEW",
]

EvaluationMode = Literal[
    "DETERMINISTIC",
    "AI_ASSISTED",
    "HUMAN",
    "HYBRID",
]


class PartDetail(BaseModel):
    """Per-component breakdown of a Resolution.

    Used for partial-credit-capable types: per-blank for FILL_BLANK,
    per-marker for DIAGRAM_LABEL, per-criterion for ESSAY, per-pair for
    MATCH_THE_FOLLOWING, etc. Optional for types that don't support
    partial credit.
    """

    id: str
    matched: bool
    ai_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    details: dict[str, Any] | None = None


class EvaluatorMetadata(BaseModel):
    """Provenance for a Resolution. Required for AI/HUMAN evaluators;
    None for pure DETERMINISTIC paths."""

    model: str | None = None  # e.g. "claude-opus-4-7" | "human:grader-uuid"
    rubric_version: int | None = None
    prompt_version: str | None = None  # explicit, no implicit "latest"
    evaluated_at: datetime
    human_review_required: bool = False


class Resolution(BaseModel):
    """The contract every evaluator returns. Never carries marks."""

    question_id: str
    type_id: str
    status: ResolutionStatus
    matched_count: int = Field(ge=0)
    total_count: int = Field(ge=0)
    per_part: list[PartDetail] = Field(default_factory=list)
    evaluation_mode: EvaluationMode
    evaluator_metadata: EvaluatorMetadata | None = None


# ── Type Handler Protocol ────────────────────────────────────────────────────
# One implementation per question type. Captures the full lifecycle
# (authoring + validation + AI assist + evaluation + localisation +
# rendering + review) in a single Protocol so adding a new type is one
# module + one registry line.


class ValidationError(BaseModel):
    """Per-field validation failure surfaced from author_validate."""

    field: str
    message: str


class Draft(BaseModel):
    """AI-generated draft payload. Marked AI_DRAFT in audit log."""

    payload: dict[str, Any]
    ai_origin: dict[str, Any]  # prompt_template_id, version, model, original_payload


class QualityReport(BaseModel):
    """Output of ai_quality_check — list of warnings, never blocks submit."""

    warnings: list["QualityWarning"] = Field(default_factory=list)


class QualityWarning(BaseModel):
    severity: Literal["info", "warning"]
    code: str  # e.g. "ambiguity", "distractor_plausibility", "duplicate"
    message: str
    field: str | None = None


class CheckItem(BaseModel):
    """Reviewer-checklist item per type, surfaced in the moderation queue."""

    id: str
    label: str
    required: bool = True


@runtime_checkable
class QuestionTypeHandler(Protocol):
    """The Protocol every question type implements.

    Compile-time enforcement via @runtime_checkable + the registry
    conformance test. Handlers are singletons; no per-request state.
    """

    type_id: str  # "MCQ_SINGLE", "ESSAY", "MAP_LOCATION", ...
    family: str  # "Objective", "Numeric", "Subjective", ...
    payload_schema: type[BaseModel]
    response_schema: type[BaseModel]
    evaluation_mode: EvaluationMode
    supports_partial: bool
    media_kinds: list[str]  # ["image", "audio", "video"]

    # Authoring
    def author_validate(self, payload: dict[str, Any]) -> list[ValidationError]: ...
    async def ai_generate_draft(
        self, prompt: str, context: dict[str, Any]
    ) -> Draft: ...
    async def ai_quality_check(self, payload: dict[str, Any]) -> QualityReport: ...

    # Localisation
    def translatable_fields(self, payload: dict[str, Any]) -> list[str]: ...
    def merge_translation(
        self,
        payload: dict[str, Any],
        lang: str,
        translation: dict[str, Any],
    ) -> dict[str, Any]: ...

    # Rendering
    def render_payload(
        self,
        payload: dict[str, Any],
        mode: Literal["author", "student", "review"],
        lang: str,
    ) -> dict[str, Any]: ...

    # Evaluation — returns Resolution; never marks
    async def evaluate(
        self,
        payload: dict[str, Any],
        response: dict[str, Any],
        lang: str,
    ) -> Resolution: ...

    # Review
    def review_checklist(self, lang: str) -> list[CheckItem]: ...


PROTOCOL_METHODS = (
    "author_validate",
    "ai_generate_draft",
    "ai_quality_check",
    "translatable_fields",
    "merge_translation",
    "render_payload",
    "evaluate",
    "review_checklist",
)

PROTOCOL_ATTRS = (
    "type_id",
    "family",
    "payload_schema",
    "response_schema",
    "evaluation_mode",
    "supports_partial",
    "media_kinds",
)
