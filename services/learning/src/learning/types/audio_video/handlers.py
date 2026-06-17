"""Audio/Video family handlers — LISTENING_COMP + VIDEO_QUESTION.

Per ADR-0026: composite-of-children pattern, mirroring CASE_STUDY +
COMPREHENSION_LONG. The handler does *not* call child handlers directly
— it reports attempted-count + delegates child grading to Quiz
orchestration (children are submitted as their own quiz items). Parent
status is:

  - UNATTEMPTED if no children were attempted
  - PARTIAL_CORRECT if some but not all
  - PENDING_HUMAN_REVIEW if all attempted — children are still graded
    individually downstream; the parent is a roll-up the moderation
    queue surfaces alongside its children.

Audio playback + transcript are *content the student listens to*, not
something they author — there's no transcript scoring at the parent
level. Whisper-class transcription (Phase 5/S43) lives in
`learning.evaluation.transcription` and is invoked by author UIs, not
by the evaluator.

`audio_video_questions_enabled` remains as a per-tenant override at the
orchestrator level (not branched here). Handlers always evaluate.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from learning.types.audio_video.payloads import (
    ListeningCompPayload,
    ListeningCompResponse,
    VideoQuestionPayload,
    VideoQuestionResponse,
)
from learning.types.base import (
    EvaluatorMetadata,
    PartDetail,
    Resolution,
)
from learning.types.base_handler import BaseHandler

GATED_FLAG = "audio_video_questions_enabled"


def _aggregate_av_children(
    *,
    question_id: str,
    type_id: str,
    child_specs: list[Any],
    response: Any,
) -> Resolution:
    """Composite roll-up: count attempted children, derive parent status.

    Identical to the CASE_STUDY composite-shape branch — pulled out as
    its own helper because LISTENING_COMP + VIDEO_QUESTION share the
    exact reduction. Children are graded individually by the Quiz
    orchestrator; the parent Resolution carries the attempt picture so
    moderation can surface incomplete attempts.
    """
    total = len(child_specs)
    attempted = sum(1 for c in response.children if c.response_payload)
    per_part = [
        PartDetail(
            id=str(spec.ordinal),
            matched=any(
                c.question_id == spec.question_id for c in response.children
            ),
            details={
                "child_question_id": spec.question_id,
                "timestamp_seconds": getattr(spec, "timestamp_seconds", None),
            },
        )
        for spec in child_specs
    ]
    if attempted == 0:
        status = "UNATTEMPTED"
    elif attempted < total:
        status = "PARTIAL_CORRECT"
    else:
        # All children attempted — they're graded individually downstream;
        # parent surfaces as PENDING_HUMAN_REVIEW so moderation sees the
        # full attempt as one unit (matches CASE_STUDY/COMPREHENSION_LONG).
        status = "PENDING_HUMAN_REVIEW"
    return Resolution(
        question_id=question_id,
        type_id=type_id,
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


# ── LISTENING_COMP ───────────────────────────────────────────────────────────


class ListeningCompHandler(BaseHandler):
    type_id = "LISTENING_COMP"
    family = "Audio/Video"
    payload_schema = ListeningCompPayload
    response_schema = ListeningCompResponse
    evaluation_mode = "HYBRID"
    supports_partial = True
    media_kinds: list[str] = ["audio"]

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["transcript"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = ListeningCompPayload.model_validate(payload)
        r = ListeningCompResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")
        return _aggregate_av_children(
            question_id=qid,
            type_id=self.type_id,
            child_specs=list(p.child_questions),
            response=r,
        )


# ── VIDEO_QUESTION ───────────────────────────────────────────────────────────


class VideoQuestionHandler(BaseHandler):
    type_id = "VIDEO_QUESTION"
    family = "Audio/Video"
    payload_schema = VideoQuestionPayload
    response_schema = VideoQuestionResponse
    evaluation_mode = "HYBRID"
    supports_partial = True
    media_kinds: list[str] = ["video"]

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["transcript"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = VideoQuestionPayload.model_validate(payload)
        r = VideoQuestionResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")
        return _aggregate_av_children(
            question_id=qid,
            type_id=self.type_id,
            child_specs=list(p.child_questions),
            response=r,
        )
