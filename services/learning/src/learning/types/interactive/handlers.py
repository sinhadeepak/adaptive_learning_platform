"""Interactive family handlers — GATED stubs.

KBC_LIFELINE / TIMED_REVEAL / ADAPTIVE_DIFFICULTY are authoring-
supported but submission stays gated until
`interactive_questions_enabled` flips.

These types compose around an inner question (KBC + TIMED_REVEAL) or
a pool of variants (ADAPTIVE_DIFFICULTY). The wrappers themselves
are deterministic-evaluable; the gate exists because authoring UX +
student renderer flows aren't shipped yet, not because the evaluation
is hard.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from learning.types.base import (
    EvaluatorMetadata,
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


def _gated_resolution(question_id: str, type_id: str) -> Resolution:
    return Resolution(
        question_id=question_id,
        type_id=type_id,
        status="PENDING_HUMAN_REVIEW",
        matched_count=0,
        total_count=1,
        per_part=[],
        evaluation_mode="DETERMINISTIC",
        evaluator_metadata=EvaluatorMetadata(
            model=None,
            rubric_version=None,
            prompt_version=f"feature_disabled:{GATED_FLAG}",
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
        KBCLifelinePayload.model_validate(payload)
        qid = response.get("question_id", "<unknown>")
        return _gated_resolution(qid, self.type_id)


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
        TimedRevealPayload.model_validate(payload)
        qid = response.get("question_id", "<unknown>")
        return _gated_resolution(qid, self.type_id)


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
        AdaptiveDifficultyPayload.model_validate(payload)
        qid = response.get("question_id", "<unknown>")
        return _gated_resolution(qid, self.type_id)
