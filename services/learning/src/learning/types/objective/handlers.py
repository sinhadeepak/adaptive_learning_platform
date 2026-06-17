"""Objective family handlers (5 types) — all DETERMINISTIC.

Per ADR-0018 §"22 v1 types". Pure-function evaluate() per type.
"""

from __future__ import annotations

from typing import Any

from learning.types.base import PartDetail
from learning.types.base_handler import BaseHandler
from learning.types.objective.payloads import (
    AssertionReasonPayload,
    AssertionReasonResponse,
    MCQMultiPayload,
    MCQMultiResponse,
    MCQSinglePayload,
    MCQSingleResponse,
    MultiStatementPayload,
    MultiStatementResponse,
    TrueFalsePayload,
    TrueFalseResponse,
)


# ── MCQ_SINGLE ───────────────────────────────────────────────────────────────


class MCQSingleHandler(BaseHandler):
    type_id = "MCQ_SINGLE"
    family = "Objective"
    payload_schema = MCQSinglePayload
    response_schema = MCQSingleResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["stem", "options[*].text", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = MCQSinglePayload.model_validate(payload)
        r = MCQSingleResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if r.selected_id is None:
            return self._resolution(qid, "UNATTEMPTED", 0, 1)

        is_correct = r.selected_id == p.correct_id
        return self._resolution(
            qid,
            "CORRECT" if is_correct else "INCORRECT",
            1 if is_correct else 0,
            1,
        )


# ── MCQ_MULTI ────────────────────────────────────────────────────────────────


class MCQMultiHandler(BaseHandler):
    type_id = "MCQ_MULTI"
    family = "Objective"
    payload_schema = MCQMultiPayload
    response_schema = MCQMultiResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = True  # configurable via payload.partial_credit
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["stem", "options[*].text", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = MCQMultiPayload.model_validate(payload)
        r = MCQMultiResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if not r.selected_ids:
            return self._resolution(qid, "UNATTEMPTED", 0, len(p.correct_ids))

        correct = set(p.correct_ids)
        chosen = set(r.selected_ids)
        # Per-option detail
        per_part = [
            PartDetail(
                id=oid,
                matched=(oid in correct) == (oid in chosen),
                details={"selected": oid in chosen, "correct": oid in correct},
            )
            for oid in {o.id for o in p.options}
        ]
        matched_correct = correct & chosen
        wrong_picks = chosen - correct

        if not p.partial_credit:
            # JEE Adv: any wrong pick → INCORRECT; missing correct → INCORRECT
            if chosen == correct:
                return self._resolution(
                    qid, "CORRECT", len(correct), len(correct), per_part
                )
            return self._resolution(qid, "INCORRECT", 0, len(correct), per_part)

        # Partial-credit mode: matched count out of total correct
        if chosen == correct:
            return self._resolution(
                qid, "CORRECT", len(correct), len(correct), per_part
            )
        if matched_correct and not wrong_picks:
            return self._resolution(
                qid,
                "PARTIAL_CORRECT",
                len(matched_correct),
                len(correct),
                per_part,
            )
        return self._resolution(qid, "INCORRECT", 0, len(correct), per_part)


# ── TRUE_FALSE ───────────────────────────────────────────────────────────────


class TrueFalseHandler(BaseHandler):
    type_id = "TRUE_FALSE"
    family = "Objective"
    payload_schema = TrueFalsePayload
    response_schema = TrueFalseResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["statement", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = TrueFalsePayload.model_validate(payload)
        r = TrueFalseResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if r.answer is None:
            return self._resolution(qid, "UNATTEMPTED", 0, 1)
        is_correct = r.answer == p.correct
        return self._resolution(
            qid,
            "CORRECT" if is_correct else "INCORRECT",
            1 if is_correct else 0,
            1,
        )


# ── ASSERTION_REASON ─────────────────────────────────────────────────────────


class AssertionReasonHandler(BaseHandler):
    type_id = "ASSERTION_REASON"
    family = "Objective"
    payload_schema = AssertionReasonPayload
    response_schema = AssertionReasonResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["assertion", "reason", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = AssertionReasonPayload.model_validate(payload)
        r = AssertionReasonResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if r.selected is None:
            return self._resolution(qid, "UNATTEMPTED", 0, 1)
        is_correct = r.selected == p.canonical_correct()
        return self._resolution(
            qid,
            "CORRECT" if is_correct else "INCORRECT",
            1 if is_correct else 0,
            1,
        )


# ── MULTI_STATEMENT ──────────────────────────────────────────────────────────


class MultiStatementHandler(BaseHandler):
    type_id = "MULTI_STATEMENT"
    family = "Objective"
    payload_schema = MultiStatementPayload
    response_schema = MultiStatementResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = True
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return [
            "stem",
            "statements[*].text",
            "options[*].text",
            "explanation",
        ]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = MultiStatementPayload.model_validate(payload)
        r = MultiStatementResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if r.selected_option_id is None:
            return self._resolution(qid, "UNATTEMPTED", 0, 1)

        if r.selected_option_id == p.correct_option_id:
            return self._resolution(qid, "CORRECT", 1, 1)

        # Partial: did the chosen option select the right *subset* of
        # statements? Useful when partial_credit=True.
        if p.partial_credit:
            chosen_opt = next(
                (o for o in p.options if o.id == r.selected_option_id), None
            )
            if chosen_opt is None:
                return self._resolution(qid, "INCORRECT", 0, 1)
            truly_correct_set = {s.id for s in p.statements if s.is_correct}
            chosen_set = set(chosen_opt.selects)
            matched = len(truly_correct_set & chosen_set)
            total = len(truly_correct_set) or 1
            wrong_picks = len(chosen_set - truly_correct_set)
            if matched > 0 and wrong_picks == 0:
                return self._resolution(qid, "PARTIAL_CORRECT", matched, total)

        return self._resolution(qid, "INCORRECT", 0, 1)
