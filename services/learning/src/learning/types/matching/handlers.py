"""Matching family handlers (3 types) — all DETERMINISTIC."""

from __future__ import annotations

from typing import Any

from learning.types.base import PartDetail
from learning.types.base_handler import BaseHandler
from learning.types.matching.payloads import (
    CategoryAssignment,
    ClassificationPayload,
    ClassificationResponse,
    MatchPair,
    MatchTheFollowingPayload,
    MatchTheFollowingResponse,
    SequencingPayload,
    SequencingResponse,
)


# ── MATCH_THE_FOLLOWING ──────────────────────────────────────────────────────


class MatchTheFollowingHandler(BaseHandler):
    type_id = "MATCH_THE_FOLLOWING"
    family = "Matching"
    payload_schema = MatchTheFollowingPayload
    response_schema = MatchTheFollowingResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = True
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return [
            "stem",
            "list_a[*].text",
            "list_b[*].text",
            "explanation",
        ]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = MatchTheFollowingPayload.model_validate(payload)
        r = MatchTheFollowingResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if not r.pairs:
            return self._resolution(qid, "UNATTEMPTED", 0, len(p.correct_pairs))

        correct_set: set[tuple[str, str]] = {
            (cp.left_id, cp.right_id) for cp in p.correct_pairs
        }
        student_set: set[tuple[str, str]] = {
            (sp.left_id, sp.right_id) for sp in r.pairs
        }
        per_part = [
            PartDetail(
                id=f"{cp.left_id}->{cp.right_id}",
                matched=(cp.left_id, cp.right_id) in student_set,
            )
            for cp in p.correct_pairs
        ]
        matched_n = len(correct_set & student_set)
        total_n = len(correct_set)
        if matched_n == total_n and student_set == correct_set:
            return self._resolution(qid, "CORRECT", matched_n, total_n, per_part)
        if not p.partial_credit:
            return self._resolution(qid, "INCORRECT", 0, total_n, per_part)
        if matched_n > 0:
            return self._resolution(qid, "PARTIAL_CORRECT", matched_n, total_n, per_part)
        return self._resolution(qid, "INCORRECT", 0, total_n, per_part)


# ── SEQUENCING ───────────────────────────────────────────────────────────────


def _longest_correct_prefix(correct: list[str], student: list[str]) -> int:
    """How many positions match starting from index 0."""
    n = 0
    for c, s in zip(correct, student):
        if c != s:
            break
        n += 1
    return n


class SequencingHandler(BaseHandler):
    type_id = "SEQUENCING"
    family = "Matching"
    payload_schema = SequencingPayload
    response_schema = SequencingResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = True
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["stem", "items[*].text", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = SequencingPayload.model_validate(payload)
        r = SequencingResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if not r.order:
            return self._resolution(qid, "UNATTEMPTED", 0, len(p.correct_order))

        per_part = [
            PartDetail(
                id=f"pos_{i}",
                matched=(
                    i < len(r.order)
                    and i < len(p.correct_order)
                    and r.order[i] == p.correct_order[i]
                ),
                details={"expected": p.correct_order[i] if i < len(p.correct_order) else None},
            )
            for i in range(len(p.correct_order))
        ]
        total_n = len(p.correct_order)
        if r.order == p.correct_order:
            return self._resolution(qid, "CORRECT", total_n, total_n, per_part)

        if p.metric == "all_or_nothing":
            return self._resolution(qid, "INCORRECT", 0, total_n, per_part)

        if p.metric == "longest_correct_prefix":
            matched_n = _longest_correct_prefix(p.correct_order, r.order)
            if matched_n > 0:
                return self._resolution(qid, "PARTIAL_CORRECT", matched_n, total_n, per_part)
            return self._resolution(qid, "INCORRECT", 0, total_n, per_part)

        # levenshtein-on-positions: count positions that match
        matched_n = sum(
            1 for c, s in zip(p.correct_order, r.order) if c == s
        )
        if matched_n > 0:
            return self._resolution(qid, "PARTIAL_CORRECT", matched_n, total_n, per_part)
        return self._resolution(qid, "INCORRECT", 0, total_n, per_part)


# ── CLASSIFICATION ───────────────────────────────────────────────────────────


class ClassificationHandler(BaseHandler):
    type_id = "CLASSIFICATION"
    family = "Matching"
    payload_schema = ClassificationPayload
    response_schema = ClassificationResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = True
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return [
            "stem",
            "items[*].text",
            "categories[*].text",
            "explanation",
        ]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = ClassificationPayload.model_validate(payload)
        r = ClassificationResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if not r.assignments:
            return self._resolution(qid, "UNATTEMPTED", 0, len(p.correct_assignments))

        # Build expected map item_id → category_id
        correct_map = {a.item_id: a.category_id for a in p.correct_assignments}
        student_map = {a.item_id: a.category_id for a in r.assignments}

        per_part = [
            PartDetail(
                id=item_id,
                matched=student_map.get(item_id) == correct_cat,
                details={"expected_category": correct_cat,
                         "got_category": student_map.get(item_id)},
            )
            for item_id, correct_cat in correct_map.items()
        ]
        matched_n = sum(1 for pp in per_part if pp.matched)
        total_n = len(correct_map)
        if matched_n == total_n:
            return self._resolution(qid, "CORRECT", matched_n, total_n, per_part)
        if matched_n > 0:
            return self._resolution(qid, "PARTIAL_CORRECT", matched_n, total_n, per_part)
        return self._resolution(qid, "INCORRECT", 0, total_n, per_part)
