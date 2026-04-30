"""Audio/Video family handlers — GATED stubs.

Both types are authoring-supported (schema + payload validation +
translatable_fields) but submission returns an UNATTEMPTED Resolution
with `human_review_required=True` and a feature-flag note in
evaluator_metadata until `audio_video_questions_enabled` flips.

Whisper transcription pipeline (ENG-OAQ-9: self-host vs API decision)
lands when the gate flips. Until then the handlers exist so authors
can draft + the catalogue UI lists the type but the student renderer
sees the disabled-state.
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
    Resolution,
)
from learning.types.base_handler import BaseHandler

GATED_FLAG = "audio_video_questions_enabled"


def _gated_resolution(question_id: str, type_id: str, total: int = 1) -> Resolution:
    """Return a PENDING_HUMAN_REVIEW Resolution carrying a flag-note in
    evaluator_metadata.prompt_version. Quiz orchestration sees the
    HYBRID + human_review_required=True and routes the response into
    the human grader queue (where it sits until the gate flips and a
    re-evaluation is triggered)."""
    return Resolution(
        question_id=question_id,
        type_id=type_id,
        status="PENDING_HUMAN_REVIEW",
        matched_count=0,
        total_count=total,
        per_part=[],
        evaluation_mode="HYBRID",
        evaluator_metadata=EvaluatorMetadata(
            model=None,
            rubric_version=None,
            prompt_version=f"feature_disabled:{GATED_FLAG}",
            evaluated_at=datetime.now(tz=UTC),
            human_review_required=True,
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
        qid = response.get("question_id", "<unknown>")
        return _gated_resolution(qid, self.type_id, total=len(p.child_questions))


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
        qid = response.get("question_id", "<unknown>")
        return _gated_resolution(qid, self.type_id, total=len(p.child_questions))
