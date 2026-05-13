"""Interactive family handlers — KBC_LIFELINE · TIMED_REVEAL ·
ADAPTIVE_DIFFICULTY.

Per ADR-0026: each wraps an inner question. The wrapper grading
contract is:

  - **KBC_LIFELINE** — delegate to the inner MCQ_SINGLE handler.
    Lifelines used are recorded in `evaluator_metadata.prompt_version`
    (mark adjustment, if any, is the orchestrator's concern per
    ADR-0018 "Resolution never carries marks").
  - **TIMED_REVEAL** — same delegation; `answered_at_seconds` recorded
    in metadata for a fast-answer bonus the orchestrator can apply.
  - **ADAPTIVE_DIFFICULTY** — verifies the served variant is in the
    pool; delegates to the served variant's handler; records the
    served difficulty in metadata.

If the inner payload is not embedded in the wrapper payload at fetch
time (the orchestrator resolves `inner_question_id` → `inner_payload`
before sending to client), the handler falls back to a deterministic
attempt-check on the response — UNATTEMPTED if no inner response,
otherwise PENDING_HUMAN_REVIEW with a note explaining the orchestrator
did not pre-resolve inner content (operational signal, not a hard
error).

`interactive_questions_enabled` remains as a per-tenant override at
the orchestrator level (not branched here).
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
from learning.types.interactive.payloads import (
    AdaptiveDifficultyPayload,
    AdaptiveDifficultyResponse,
    KBCLifelinePayload,
    KBCLifelineResponse,
    TimedRevealPayload,
    TimedRevealResponse,
)

GATED_FLAG = "interactive_questions_enabled"


async def _delegate_to_inner(
    *,
    question_id: str,
    wrapper_type_id: str,
    inner_type_id: str,
    inner_payload: dict[str, Any] | None,
    inner_response: dict[str, Any] | None,
    lang: str,
    notes: str,
) -> Resolution:
    """Resolve the inner question via its registered handler.

    `inner_payload` may be embedded by the orchestrator at fetch time
    (recommended) or omitted (fallback path → status reflects only
    attempt presence). Returned Resolution wears the wrapper's type_id
    but carries inner-handler metadata in `prompt_version` for trace.
    """
    # Lazy import to avoid a registry-load order trap during bootstrap.
    from learning.types.registry import get_handler, is_supported

    if inner_response is None:
        return Resolution(
            question_id=question_id,
            type_id=wrapper_type_id,
            status="UNATTEMPTED",
            matched_count=0,
            total_count=1,
            per_part=[],
            evaluation_mode="DETERMINISTIC",
            evaluator_metadata=EvaluatorMetadata(
                model=None,
                rubric_version=None,
                prompt_version=notes,
                evaluated_at=datetime.now(tz=UTC),
                human_review_required=False,
            ),
        )

    # If the orchestrator embedded inner_payload, we can grade now.
    if inner_payload is not None and is_supported(inner_type_id):
        inner_handler = get_handler(inner_type_id)
        inner_res = await inner_handler.evaluate(
            inner_payload, {**inner_response, "question_id": question_id}, lang,
        )
        # Wear the wrapper's type_id; keep the inner verdict, append note.
        meta = inner_res.evaluator_metadata or EvaluatorMetadata(
            model=None,
            rubric_version=None,
            prompt_version=None,
            evaluated_at=datetime.now(tz=UTC),
            human_review_required=False,
        )
        combined_notes = (
            f"{meta.prompt_version} | {notes}"
            if meta.prompt_version
            else notes
        )
        return Resolution(
            question_id=question_id,
            type_id=wrapper_type_id,
            status=inner_res.status,
            matched_count=inner_res.matched_count,
            total_count=inner_res.total_count,
            per_part=inner_res.per_part,
            evaluation_mode=inner_res.evaluation_mode,
            evaluator_metadata=EvaluatorMetadata(
                model=meta.model,
                rubric_version=meta.rubric_version,
                prompt_version=combined_notes,
                evaluated_at=datetime.now(tz=UTC),
                human_review_required=meta.human_review_required,
            ),
        )

    # Fallback: orchestrator did not embed inner payload. Mark
    # PENDING_HUMAN_REVIEW with a clear note. The Quiz Go service
    # ordinarily resolves inner_payload before sending the wrapper to
    # the client; reaching this branch is an operational anomaly worth
    # surfacing to the moderator queue.
    return Resolution(
        question_id=question_id,
        type_id=wrapper_type_id,
        status="PENDING_HUMAN_REVIEW",
        matched_count=0,
        total_count=1,
        per_part=[PartDetail(id="inner", matched=False, details={
            "reason": "inner_payload_not_resolved",
        })],
        evaluation_mode="DETERMINISTIC",
        evaluator_metadata=EvaluatorMetadata(
            model=None,
            rubric_version=None,
            prompt_version=f"orchestrator_missing_inner_payload | {notes}",
            evaluated_at=datetime.now(tz=UTC),
            human_review_required=True,
        ),
    )


# ── KBC_LIFELINE ─────────────────────────────────────────────────────────────


class KBCLifelineHandler(BaseHandler):
    type_id = "KBC_LIFELINE"
    family = "Interactive"
    payload_schema = KBCLifelinePayload
    response_schema = KBCLifelineResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = KBCLifelinePayload.model_validate(payload)
        r = KBCLifelineResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")
        # Orchestrator may embed the inner question's payload under
        # `inner_payload` at fetch time. KBC's inner is always
        # MCQ_SINGLE per the payload contract.
        inner_payload = payload.get("inner_payload")
        notes = f"lifelines_used:{','.join(r.lifelines_used) or 'none'}"
        return await _delegate_to_inner(
            question_id=qid,
            wrapper_type_id=self.type_id,
            inner_type_id="MCQ_SINGLE",
            inner_payload=inner_payload,
            inner_response=r.inner_response_payload,
            lang=lang,
            notes=notes,
        )


# ── TIMED_REVEAL ─────────────────────────────────────────────────────────────


class TimedRevealHandler(BaseHandler):
    type_id = "TIMED_REVEAL"
    family = "Interactive"
    payload_schema = TimedRevealPayload
    response_schema = TimedRevealResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["initial_stem", "reveal_schedule[*].additional_info", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = TimedRevealPayload.model_validate(payload)
        r = TimedRevealResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")
        reveals_fired = sum(
            1 for step in p.reveal_schedule if r.answered_at_seconds >= step.at_seconds
        )
        notes = (
            f"answered_at_seconds:{r.answered_at_seconds:.2f}"
            f" | reveals_fired:{reveals_fired}/{len(p.reveal_schedule)}"
            f" | reveals_make_easier:{p.reveals_make_easier}"
        )
        inner_payload = payload.get("inner_payload")
        # Inner type for TIMED_REVEAL is typically MCQ_SINGLE; callers
        # can override via `inner_type_id` in the payload.
        inner_type_id = payload.get("inner_type_id", "MCQ_SINGLE")
        return await _delegate_to_inner(
            question_id=qid,
            wrapper_type_id=self.type_id,
            inner_type_id=inner_type_id,
            inner_payload=inner_payload,
            inner_response=r.inner_response_payload,
            lang=lang,
            notes=notes,
        )


# ── ADAPTIVE_DIFFICULTY ──────────────────────────────────────────────────────


class AdaptiveDifficultyHandler(BaseHandler):
    type_id = "ADAPTIVE_DIFFICULTY"
    family = "Interactive"
    payload_schema = AdaptiveDifficultyPayload
    response_schema = AdaptiveDifficultyResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = AdaptiveDifficultyPayload.model_validate(payload)
        r = AdaptiveDifficultyResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")
        served = next(
            (v for v in p.variants if v.question_id == r.served_question_id),
            None,
        )
        if served is None:
            return Resolution(
                question_id=qid,
                type_id=self.type_id,
                status="INCORRECT",
                matched_count=0,
                total_count=1,
                per_part=[PartDetail(id="variant", matched=False, details={
                    "reason": "served_variant_not_in_pool",
                    "served_question_id": r.served_question_id,
                })],
                evaluation_mode="DETERMINISTIC",
                evaluator_metadata=EvaluatorMetadata(
                    model=None,
                    rubric_version=None,
                    prompt_version="invalid_variant",
                    evaluated_at=datetime.now(tz=UTC),
                    human_review_required=True,
                ),
            )
        notes = f"served_difficulty:{served.difficulty_level}/5"
        inner_payload = payload.get("inner_payload")
        inner_type_id = payload.get("inner_type_id", "MCQ_SINGLE")
        return await _delegate_to_inner(
            question_id=qid,
            wrapper_type_id=self.type_id,
            inner_type_id=inner_type_id,
            inner_payload=inner_payload,
            inner_response=r.inner_response_payload,
            lang=lang,
            notes=notes,
        )
