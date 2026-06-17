"""Fill-in family handlers (3 DETERMINISTIC types).

FILL_BLANK_SINGLE / FILL_BLANK_MULTI / CLOZE_PASSAGE.

SHORT_TEXT (AI_ASSISTED) lands in S42 with the AI Gateway evaluator.

Match modes:
- exact:             byte-exact comparison
- case_insensitive:  lowercased + whitespace-stripped (default)
- fuzzy_token:       Levenshtein-like ratio over normalised tokens;
                     accepts when ratio >= fuzzy_threshold
"""

from __future__ import annotations

from difflib import SequenceMatcher
from typing import Any

from learning.types.base import PartDetail
from learning.types.base_handler import BaseHandler
from learning.types.fill_in.payloads import (
    BlankResponse,
    ClozePassagePayload,
    ClozePassageResponse,
    FillBlankMultiPayload,
    FillBlankMultiResponse,
    FillBlankSinglePayload,
    FillBlankSingleResponse,
)


# ── Pure helpers ─────────────────────────────────────────────────────────────


def _normalise(s: str) -> str:
    return s.strip().lower()


def _matches_exact(student: str, accepted: list[str]) -> bool:
    return any(student == a for a in accepted)


def _matches_case_insensitive(student: str, accepted: list[str]) -> bool:
    s = _normalise(student)
    return any(_normalise(a) == s for a in accepted)


def _ratio(a: str, b: str) -> float:
    """SequenceMatcher ratio in [0, 1]. 1.0 = identical."""
    return SequenceMatcher(None, a, b).ratio()


def _matches_fuzzy(student: str, accepted: list[str], threshold: float) -> bool:
    s = _normalise(student)
    return any(_ratio(s, _normalise(a)) >= threshold for a in accepted)


def match_blank(
    student: str | None,
    accepted: list[str],
    mode: str,
    fuzzy_threshold: float,
) -> bool:
    """Pure-function blank-matcher. Returns False on None/empty student input."""
    if student is None or not student.strip():
        return False
    if mode == "exact":
        return _matches_exact(student, accepted)
    if mode == "fuzzy_token":
        return _matches_fuzzy(student, accepted, fuzzy_threshold)
    # default: case_insensitive
    return _matches_case_insensitive(student, accepted)


# ── FILL_BLANK_SINGLE ────────────────────────────────────────────────────────


class FillBlankSingleHandler(BaseHandler):
    type_id = "FILL_BLANK_SINGLE"
    family = "Fill-in"
    payload_schema = FillBlankSinglePayload
    response_schema = FillBlankSingleResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["stem", "accepted[*]", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = FillBlankSinglePayload.model_validate(payload)
        r = FillBlankSingleResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if r.answer is None or not r.answer.strip():
            return self._resolution(qid, "UNATTEMPTED", 0, 1)
        ok = match_blank(r.answer, p.accepted, p.match_mode, p.fuzzy_threshold)
        return self._resolution(
            qid,
            "CORRECT" if ok else "INCORRECT",
            1 if ok else 0,
            1,
        )


# ── FILL_BLANK_MULTI ─────────────────────────────────────────────────────────


class FillBlankMultiHandler(BaseHandler):
    type_id = "FILL_BLANK_MULTI"
    family = "Fill-in"
    payload_schema = FillBlankMultiPayload
    response_schema = FillBlankMultiResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = True
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["stem", "blanks[*].accepted[*]", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = FillBlankMultiPayload.model_validate(payload)
        r = FillBlankMultiResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if not r.blanks:
            return self._resolution(qid, "UNATTEMPTED", 0, len(p.blanks))

        # Build student answer map by blank id
        student_by_id: dict[str, str | None] = {b.blank_id: b.answer for b in r.blanks}

        per_part: list[PartDetail] = []
        matched_n = 0
        for spec in p.blanks:
            student_ans = student_by_id.get(spec.id)
            ok = match_blank(student_ans, spec.accepted, spec.match_mode, spec.fuzzy_threshold)
            per_part.append(
                PartDetail(
                    id=spec.id,
                    matched=ok,
                    details={"got": student_ans},
                )
            )
            if ok:
                matched_n += 1

        total_n = len(p.blanks)
        if matched_n == total_n:
            return self._resolution(qid, "CORRECT", matched_n, total_n, per_part)
        if not p.partial_credit:
            return self._resolution(qid, "INCORRECT", 0, total_n, per_part)
        if matched_n > 0:
            return self._resolution(qid, "PARTIAL_CORRECT", matched_n, total_n, per_part)
        return self._resolution(qid, "INCORRECT", 0, total_n, per_part)


# ── CLOZE_PASSAGE ────────────────────────────────────────────────────────────


class ClozePassageHandler(BaseHandler):
    type_id = "CLOZE_PASSAGE"
    family = "Fill-in"
    payload_schema = ClozePassagePayload
    response_schema = ClozePassageResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = True
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return [
            "passage",
            "blanks[*].accepted[*]",
            "word_bank[*]",
            "explanation",
        ]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = ClozePassagePayload.model_validate(payload)
        r = ClozePassageResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if not r.blanks:
            return self._resolution(qid, "UNATTEMPTED", 0, len(p.blanks))

        student_by_id: dict[str, str | None] = {b.blank_id: b.answer for b in r.blanks}

        per_part: list[PartDetail] = []
        matched_n = 0
        for spec in p.blanks:
            student_ans = student_by_id.get(spec.id)
            # Word-bank constraint: if a word_bank is present, student
            # answers outside the bank are auto-incorrect (caller can
            # surface a hint; deterministic match enforces the rule).
            if p.word_bank is not None and student_ans is not None:
                if _normalise(student_ans) not in {_normalise(w) for w in p.word_bank}:
                    per_part.append(
                        PartDetail(id=spec.id, matched=False,
                                   details={"got": student_ans, "word_bank_violation": True})
                    )
                    continue
            ok = match_blank(student_ans, spec.accepted, spec.match_mode, spec.fuzzy_threshold)
            per_part.append(
                PartDetail(id=spec.id, matched=ok, details={"got": student_ans})
            )
            if ok:
                matched_n += 1

        total_n = len(p.blanks)
        if matched_n == total_n:
            return self._resolution(qid, "CORRECT", matched_n, total_n, per_part)
        if not p.partial_credit:
            return self._resolution(qid, "INCORRECT", 0, total_n, per_part)
        if matched_n > 0:
            return self._resolution(qid, "PARTIAL_CORRECT", matched_n, total_n, per_part)
        return self._resolution(qid, "INCORRECT", 0, total_n, per_part)
