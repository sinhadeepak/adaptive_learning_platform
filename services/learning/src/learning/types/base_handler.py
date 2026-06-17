"""BaseHandler — Protocol-conforming defaults for every type.

Subclasses override the methods they care about. v1 deterministic
handlers only override `evaluate` (and optionally `translatable_fields`).
AI assist (`ai_generate_draft`, `ai_quality_check`) raises NotImplementedError
until S40 wires the AI Gateway.

Subclasses must set `type_id`, `family`, `payload_schema`, `response_schema`,
`evaluation_mode`, `supports_partial`, `media_kinds` as class-level attrs.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from learning.types.base import (
    CheckItem,
    Draft,
    EvaluatorMetadata,
    QualityReport,
    Resolution,
    ValidationError,
)


class BaseHandler:
    """No-op defaults. Subclass + override `evaluate` (and optionally
    `translatable_fields` / `review_checklist`)."""

    # Subclasses MUST override these:
    type_id: str = ""
    family: str = ""
    payload_schema: type = type
    response_schema: type = type
    evaluation_mode: str = "DETERMINISTIC"
    supports_partial: bool = False
    media_kinds: list[str] = []

    # ── Authoring (defaults: validate via Pydantic; AI raises until S40) ─

    def author_validate(self, payload: dict[str, Any]) -> list[ValidationError]:
        """Validate payload via the type's Pydantic schema. Returns list
        of ValidationErrors (empty = valid)."""
        try:
            self.payload_schema.model_validate(payload)
            return []
        except Exception as e:
            return [ValidationError(field="<root>", message=str(e))]

    async def ai_generate_draft(self, prompt: str, context: dict[str, Any]) -> Draft:
        raise NotImplementedError(
            f"{self.type_id}.ai_generate_draft wires up in P5-S40 (AI authoring)"
        )

    async def ai_quality_check(self, payload: dict[str, Any]) -> QualityReport:
        # No-op v1 — quality checks land in P5-S40 + P5-S45.
        return QualityReport(warnings=[])

    # ── Localisation (defaults: no translatable fields) ──────────────────

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return []

    def merge_translation(
        self,
        payload: dict[str, Any],
        lang: str,
        translation: dict[str, Any],
    ) -> dict[str, Any]:
        merged = dict(payload)
        merged.update(translation)
        return merged

    # ── Rendering (default: identity) ────────────────────────────────────

    def render_payload(
        self,
        payload: dict[str, Any],
        mode: Literal["author", "student", "review"],
        lang: str,
    ) -> dict[str, Any]:
        return payload

    # ── Evaluation (subclasses override) ─────────────────────────────────

    async def evaluate(
        self,
        payload: dict[str, Any],
        response: dict[str, Any],
        lang: str,
    ) -> Resolution:
        raise NotImplementedError(
            f"{self.type_id}.evaluate must be implemented by subclass"
        )

    # ── Review ───────────────────────────────────────────────────────────

    def review_checklist(self, lang: str) -> list[CheckItem]:
        return []

    # ── Helpers for subclasses ───────────────────────────────────────────

    def _det_metadata(self) -> EvaluatorMetadata:
        """EvaluatorMetadata for DETERMINISTIC evaluations."""
        return EvaluatorMetadata(
            model=None,
            rubric_version=None,
            prompt_version=None,
            evaluated_at=datetime.now(tz=UTC),
            human_review_required=False,
        )

    def _resolution(
        self,
        question_id: str,
        status: str,
        matched: int,
        total: int,
        per_part: list = None,
    ) -> Resolution:
        return Resolution(
            question_id=question_id,
            type_id=self.type_id,
            status=status,
            matched_count=matched,
            total_count=total,
            per_part=per_part or [],
            evaluation_mode="DETERMINISTIC",
            evaluator_metadata=self._det_metadata(),
        )
