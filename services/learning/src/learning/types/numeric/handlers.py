"""Numeric family handlers (4 types) — all DETERMINISTIC.

NUMERIC_INTEGER / NUMERIC_DECIMAL / NUMERIC_RANGE: trivial.
FORMULA_INPUT: sympy symbolic equivalence.
"""

from __future__ import annotations

from typing import Any

from learning.types.base_handler import BaseHandler
from learning.types.numeric.payloads import (
    FormulaInputPayload,
    FormulaInputResponse,
    NumericDecimalPayload,
    NumericDecimalResponse,
    NumericIntegerPayload,
    NumericIntegerResponse,
    NumericRangePayload,
    NumericRangeResponse,
)


# ── NUMERIC_INTEGER ──────────────────────────────────────────────────────────


class NumericIntegerHandler(BaseHandler):
    type_id = "NUMERIC_INTEGER"
    family = "Numeric"
    payload_schema = NumericIntegerPayload
    response_schema = NumericIntegerResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["stem", "unit", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = NumericIntegerPayload.model_validate(payload)
        r = NumericIntegerResponse.model_validate(response)
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


# ── NUMERIC_DECIMAL ──────────────────────────────────────────────────────────


class NumericDecimalHandler(BaseHandler):
    type_id = "NUMERIC_DECIMAL"
    family = "Numeric"
    payload_schema = NumericDecimalPayload
    response_schema = NumericDecimalResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["stem", "unit", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = NumericDecimalPayload.model_validate(payload)
        r = NumericDecimalResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if r.answer is None:
            return self._resolution(qid, "UNATTEMPTED", 0, 1)
        is_correct = abs(r.answer - p.correct) <= p.tolerance
        return self._resolution(
            qid,
            "CORRECT" if is_correct else "INCORRECT",
            1 if is_correct else 0,
            1,
        )


# ── NUMERIC_RANGE ────────────────────────────────────────────────────────────


class NumericRangeHandler(BaseHandler):
    type_id = "NUMERIC_RANGE"
    family = "Numeric"
    payload_schema = NumericRangePayload
    response_schema = NumericRangeResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["stem", "unit", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = NumericRangePayload.model_validate(payload)
        r = NumericRangeResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if r.answer is None:
            return self._resolution(qid, "UNATTEMPTED", 0, 1)
        is_correct = p.low <= r.answer <= p.high
        return self._resolution(
            qid,
            "CORRECT" if is_correct else "INCORRECT",
            1 if is_correct else 0,
            1,
        )


# ── FORMULA_INPUT ────────────────────────────────────────────────────────────


def _symbolic_equal(student_expr: str, target_expr: str) -> bool:
    """sympy-driven symbolic equivalence. Handles common transformations
    (factoring, expansion, trig identities) automatically.

    Returns False (rather than raising) if either expression fails to
    parse — defensive against malformed student input.
    """
    try:
        import sympy
        from sympy.parsing.sympy_parser import parse_expr
    except ImportError:
        # sympy not installed in this environment — fail closed.
        return False

    try:
        s_expr = parse_expr(student_expr)
        t_expr = parse_expr(target_expr)
    except Exception:
        return False

    try:
        diff = sympy.simplify(s_expr - t_expr)
        return diff == 0
    except Exception:
        return False


class FormulaInputHandler(BaseHandler):
    type_id = "FORMULA_INPUT"
    family = "Numeric"
    payload_schema = FormulaInputPayload
    response_schema = FormulaInputResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = []

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        # target_expression and equivalent_forms are NOT translated
        # (math syntax is universal per ADR-0018).
        return ["stem", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str
    ) -> Any:
        p = FormulaInputPayload.model_validate(payload)
        r = FormulaInputResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if r.expression is None or not r.expression.strip():
            return self._resolution(qid, "UNATTEMPTED", 0, 1)

        # Try the target expression first, then equivalent_forms.
        if _symbolic_equal(r.expression, p.target_expression):
            return self._resolution(qid, "CORRECT", 1, 1)
        for variant in p.equivalent_forms:
            if _symbolic_equal(r.expression, variant):
                return self._resolution(qid, "CORRECT", 1, 1)
        return self._resolution(qid, "INCORRECT", 0, 1)
