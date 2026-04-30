"""Subjective family handlers — ESSAY · DESCRIPTIVE_LONG ·
CASE_STUDY · COMPREHENSION_LONG.

All HYBRID. AI grading via `learning.evaluation.subjective.grade_subjective`
when an AIGateway is supplied; without it the evaluator returns
PENDING_HUMAN_REVIEW so the moderation queue takes over.

Composite types (CASE_STUDY, COMPREHENSION_LONG) emit a Resolution
that aggregates per-child status. Children themselves are graded by
their own handler (Quiz orchestration submits children individually
+ submits the parent as a roll-up).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from learning.types.base import (
    EvaluatorMetadata,
    PartDetail,
    Resolution,
)
from learning.types.base_handler import BaseHandler
from learning.types.subjective.payloads import (
    CaseStudyPayload,
    CaseStudyResponse,
    ComprehensionLongPayload,
    ComprehensionLongResponse,
    DescriptiveLongPayload,
    DescriptiveLongResponse,
    EssayPayload,
    EssayResponse,
)


# ── ESSAY ────────────────────────────────────────────────────────────────────


class EssayHandler(BaseHandler):
    type_id = "ESSAY"
    family = "Subjective"
    payload_schema = EssayPayload
    response_schema = EssayResponse
    evaluation_mode = "HYBRID"
    supports_partial = True
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return [
            "stem",
            "model_answer",
            "rubric.criteria[*].text",
            "rubric.criteria[*].descriptors[*]",
        ]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = EssayPayload.model_validate(payload)
        r = EssayResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")
        return await _grade_essay_like(
            type_id=self.type_id,
            question_id=qid,
            stem=p.stem,
            model_answer=p.model_answer,
            rubric_criteria=[c.model_dump() for c in p.rubric.criteria],
            rubric_version=p.rubric.version,
            student_text=r.text,
            response_id=qid,  # Quiz/test caller can override with real response uuid
        )


# ── DESCRIPTIVE_LONG ─────────────────────────────────────────────────────────


class DescriptiveLongHandler(BaseHandler):
    type_id = "DESCRIPTIVE_LONG"
    family = "Subjective"
    payload_schema = DescriptiveLongPayload
    response_schema = DescriptiveLongResponse
    evaluation_mode = "HYBRID"
    supports_partial = True
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return [
            "stem",
            "model_answer",
            "rubric.criteria[*].text",
            "rubric.criteria[*].descriptors[*]",
        ]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = DescriptiveLongPayload.model_validate(payload)
        r = DescriptiveLongResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")
        return await _grade_essay_like(
            type_id=self.type_id,
            question_id=qid,
            stem=p.stem,
            model_answer=p.model_answer,
            rubric_criteria=[c.model_dump() for c in p.rubric.criteria],
            rubric_version=p.rubric.version,
            student_text=r.text,
            response_id=qid,
        )


# ── SHORT_TEXT (Fill-in family but AI_ASSISTED — handler lives here) ─────────
# Placed alongside the subjective handlers because they share the AI
# evaluation pipeline; the registry exposes it under the "Fill-in" family
# per the catalogue.

from learning.types.fill_in.payloads import (  # noqa: E402
    ShortTextPayload,
    ShortTextResponse,
)


class ShortTextHandler(BaseHandler):
    type_id = "SHORT_TEXT"
    family = "Fill-in"
    payload_schema = ShortTextPayload
    response_schema = ShortTextResponse
    evaluation_mode = "AI_ASSISTED"
    supports_partial = False
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return [
            "stem",
            "model_answer",
            "key_concepts[*]",
            "explanation",
        ]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = ShortTextPayload.model_validate(payload)
        r = ShortTextResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")
        # SHORT_TEXT's "rubric" is the key_concepts list — we synthesise
        # a one-criterion-per-concept rubric so the existing aggregator
        # works without a special path. Each concept is a binary check.
        synth_criteria = [
            {"id": f"k{i+1}", "text": kc, "weight": round(100.0 / len(p.key_concepts), 4)}
            for i, kc in enumerate(p.key_concepts)
        ]
        return await _grade_essay_like(
            type_id=self.type_id,
            question_id=qid,
            stem=p.stem,
            model_answer=p.model_answer,
            rubric_criteria=synth_criteria,
            rubric_version=1,  # SHORT_TEXT rubric is implicit in the payload
            student_text=r.text,
            response_id=qid,
        )


# ── Composite parents ────────────────────────────────────────────────────────


class CaseStudyHandler(BaseHandler):
    type_id = "CASE_STUDY"
    family = "Subjective"
    payload_schema = CaseStudyPayload
    response_schema = CaseStudyResponse
    evaluation_mode = "HYBRID"
    supports_partial = True
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["scenario"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        """Composite parent — children evaluated independently by their
        own handlers (Quiz orchestration submits children + parent in
        the same request). The parent Resolution counts how many child
        questions were attempted; status reflects whether the student
        engaged with all children.

        v1 keeps the parent grading lightweight: we trust the child
        Resolutions for content correctness, and surface only
        attempt-completeness here. S46+ may extend this to roll up
        child status into a parent status (CORRECT iff all children
        CORRECT).
        """
        p = CaseStudyPayload.model_validate(payload)
        r = CaseStudyResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")
        total = len(p.child_questions)
        attempted = sum(
            1 for c in r.children if c.response_payload
        )
        per_part = [
            PartDetail(
                id=str(spec.ordinal),
                matched=any(c.question_id == spec.question_id for c in r.children),
                details={"child_question_id": spec.question_id},
            )
            for spec in p.child_questions
        ]
        if attempted == 0:
            status = "UNATTEMPTED"
        elif attempted < total:
            status = "PARTIAL_CORRECT"  # incomplete attempt
        else:
            status = "PENDING_HUMAN_REVIEW"  # children graded separately
        return Resolution(
            question_id=qid,
            type_id=self.type_id,
            status=status,
            matched_count=attempted,
            total_count=total,
            per_part=per_part,
            evaluation_mode="HYBRID",
            evaluator_metadata=EvaluatorMetadata(
                model=None,
                rubric_version=None,
                prompt_version=None,
                evaluated_at=datetime.now(tz=UTC),
                human_review_required=status == "PENDING_HUMAN_REVIEW",
            ),
        )


class ComprehensionLongHandler(BaseHandler):
    type_id = "COMPREHENSION_LONG"
    family = "Subjective"
    payload_schema = ComprehensionLongPayload
    response_schema = ComprehensionLongResponse
    evaluation_mode = "HYBRID"
    supports_partial = True
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["passage"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = ComprehensionLongPayload.model_validate(payload)
        r = ComprehensionLongResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")
        total = len(p.child_questions)
        attempted = sum(1 for c in r.children if c.response_payload)
        per_part = [
            PartDetail(
                id=str(spec.ordinal),
                matched=any(c.question_id == spec.question_id for c in r.children),
                details={"child_question_id": spec.question_id},
            )
            for spec in p.child_questions
        ]
        if attempted == 0:
            status = "UNATTEMPTED"
        elif attempted < total:
            status = "PARTIAL_CORRECT"
        else:
            status = "PENDING_HUMAN_REVIEW"
        return Resolution(
            question_id=qid,
            type_id=self.type_id,
            status=status,
            matched_count=attempted,
            total_count=total,
            per_part=per_part,
            evaluation_mode="HYBRID",
            evaluator_metadata=EvaluatorMetadata(
                model=None,
                rubric_version=None,
                prompt_version=None,
                evaluated_at=datetime.now(tz=UTC),
                human_review_required=status == "PENDING_HUMAN_REVIEW",
            ),
        )


# ── Shared AI-grader entry point ──────────────────────────────────────────────


async def _grade_essay_like(
    *,
    type_id: str,
    question_id: str,
    stem: str,
    model_answer: str,
    rubric_criteria: list[dict[str, Any]],
    rubric_version: int,
    student_text: str | None,
    response_id: str,
) -> Resolution:
    """Resolve via AI Gateway when one is registered on the
    process-wide singleton; fall back to PENDING_HUMAN_REVIEW
    otherwise. Pulled out to a module-level function so handler
    classes stay slim and the wiring is exercised by tests.
    """
    if student_text is None or not student_text.strip():
        return Resolution(
            question_id=question_id,
            type_id=type_id,
            status="UNATTEMPTED",
            matched_count=0,
            total_count=len(rubric_criteria),
            per_part=[],
            evaluation_mode="HYBRID",
            evaluator_metadata=EvaluatorMetadata(
                model=None,
                rubric_version=rubric_version,
                prompt_version=None,
                evaluated_at=datetime.now(tz=UTC),
                human_review_required=False,
            ),
        )

    gateway = _get_singleton_gateway()
    if gateway is None:
        # No Gateway available → route to human.
        return Resolution(
            question_id=question_id,
            type_id=type_id,
            status="PENDING_HUMAN_REVIEW",
            matched_count=0,
            total_count=len(rubric_criteria),
            per_part=[],
            evaluation_mode="HYBRID",
            evaluator_metadata=EvaluatorMetadata(
                model=None,
                rubric_version=rubric_version,
                prompt_version=None,
                evaluated_at=datetime.now(tz=UTC),
                human_review_required=True,
            ),
        )

    # Defer the call to the evaluation module so its routing/aggregation
    # is centralised. Composite types do not call this; they aggregate
    # their child resolutions instead.
    from learning.evaluation.subjective import grade_subjective

    return await grade_subjective(
        gateway,
        question_id=question_id,
        type_id=type_id,  # type: ignore[arg-type]
        response_id=response_id,
        stem=stem,
        model_answer=model_answer,
        student_text=student_text,
        rubric_criteria=rubric_criteria,
        rubric_version=rubric_version,
    )


# Module-level singleton lookup. Set by `learning.main` lifespan when
# the Gateway is constructed; tests inject directly via
# `set_singleton_gateway(gw)`.

_GATEWAY: Any | None = None


def set_singleton_gateway(gw: Any | None) -> None:
    """Register the process-wide AIGateway. None disables AI grading."""
    global _GATEWAY
    _GATEWAY = gw


def _get_singleton_gateway() -> Any | None:
    return _GATEWAY
