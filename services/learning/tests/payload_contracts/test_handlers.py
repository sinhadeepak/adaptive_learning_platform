"""Phase 5 (P5-S38) — Type Handler `evaluate` tests for the 9 v1 deterministic handlers.

Pure-function tests. No DB, no HTTP, no async dependencies on infra
(handlers' evaluate is async but contains no awaits in the
deterministic path). Run via pytest or standalone.
"""

from __future__ import annotations

import asyncio

import pytest

from learning.types.numeric.handlers import (
    FormulaInputHandler,
    NumericDecimalHandler,
    NumericIntegerHandler,
    NumericRangeHandler,
)
from learning.types.objective.handlers import (
    AssertionReasonHandler,
    MCQMultiHandler,
    MCQSingleHandler,
    MultiStatementHandler,
    TrueFalseHandler,
)


def _run(coro):
    """Helper: run async coroutine in a fresh event loop."""
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


# ── MCQ_SINGLE ───────────────────────────────────────────────────────────────


def _mcq_single_payload() -> dict:
    return {
        "stem": "What is 2 + 2?",
        "options": [{"id": "A", "text": "3"}, {"id": "B", "text": "4"}],
        "correct_id": "B",
    }


def test_mcq_single_correct() -> None:
    h = MCQSingleHandler()
    res = _run(h.evaluate(_mcq_single_payload(), {"selected_id": "B"}, "en"))
    assert res.status == "CORRECT"
    assert res.matched_count == 1 and res.total_count == 1
    assert res.evaluation_mode == "DETERMINISTIC"


def test_mcq_single_incorrect() -> None:
    res = _run(MCQSingleHandler().evaluate(_mcq_single_payload(), {"selected_id": "A"}, "en"))
    assert res.status == "INCORRECT" and res.matched_count == 0


def test_mcq_single_unattempted() -> None:
    res = _run(MCQSingleHandler().evaluate(_mcq_single_payload(), {"selected_id": None}, "en"))
    assert res.status == "UNATTEMPTED" and res.matched_count == 0


# ── MCQ_MULTI ────────────────────────────────────────────────────────────────


def _mcq_multi_payload(partial: bool = False) -> dict:
    return {
        "stem": "Pick all primes",
        "options": [
            {"id": "A", "text": "2"},
            {"id": "B", "text": "3"},
            {"id": "C", "text": "4"},
            {"id": "D", "text": "5"},
        ],
        "correct_ids": ["A", "B", "D"],
        "partial_credit": partial,
    }


def test_mcq_multi_full_match() -> None:
    res = _run(
        MCQMultiHandler().evaluate(
            _mcq_multi_payload(False), {"selected_ids": ["A", "B", "D"]}, "en"
        )
    )
    assert res.status == "CORRECT"
    assert res.matched_count == 3 and res.total_count == 3


def test_mcq_multi_jee_adv_any_wrong_is_incorrect() -> None:
    res = _run(
        MCQMultiHandler().evaluate(
            _mcq_multi_payload(False), {"selected_ids": ["A", "B", "C"]}, "en"
        )
    )
    # partial_credit=False → any wrong pick → INCORRECT
    assert res.status == "INCORRECT"


def test_mcq_multi_partial_credit_subset_match() -> None:
    res = _run(
        MCQMultiHandler().evaluate(
            _mcq_multi_payload(True), {"selected_ids": ["A", "B"]}, "en"
        )
    )
    assert res.status == "PARTIAL_CORRECT"
    assert res.matched_count == 2 and res.total_count == 3


def test_mcq_multi_partial_credit_with_wrong_pick() -> None:
    res = _run(
        MCQMultiHandler().evaluate(
            _mcq_multi_payload(True), {"selected_ids": ["A", "C"]}, "en"
        )
    )
    # Has a wrong pick → INCORRECT even in partial mode
    assert res.status == "INCORRECT"


def test_mcq_multi_unattempted() -> None:
    res = _run(
        MCQMultiHandler().evaluate(_mcq_multi_payload(False), {"selected_ids": []}, "en")
    )
    assert res.status == "UNATTEMPTED"


# ── TRUE_FALSE ───────────────────────────────────────────────────────────────


def test_true_false_correct() -> None:
    p = {"statement": "The Earth orbits the Sun", "correct": True}
    res = _run(TrueFalseHandler().evaluate(p, {"answer": True}, "en"))
    assert res.status == "CORRECT"


def test_true_false_incorrect() -> None:
    p = {"statement": "The Earth orbits the Sun", "correct": True}
    res = _run(TrueFalseHandler().evaluate(p, {"answer": False}, "en"))
    assert res.status == "INCORRECT"


def test_true_false_unattempted() -> None:
    p = {"statement": "The Earth orbits the Sun", "correct": True}
    res = _run(TrueFalseHandler().evaluate(p, {"answer": None}, "en"))
    assert res.status == "UNATTEMPTED"


# ── ASSERTION_REASON ─────────────────────────────────────────────────────────


def _ar_payload(a_true: bool, r_true: bool, explains: bool) -> dict:
    return {
        "assertion": "Water freezes at 0 degrees C",
        "reason": "0 C is the freezing point at standard pressure",
        "assertion_true": a_true,
        "reason_true": r_true,
        "reason_explains_assertion": explains,
    }


def test_ar_canonical_a_correct() -> None:
    # Both true + R explains → A
    res = _run(AssertionReasonHandler().evaluate(_ar_payload(True, True, True), {"selected": "A"}, "en"))
    assert res.status == "CORRECT"


def test_ar_canonical_b_correct() -> None:
    # Both true, R doesn't explain → B
    res = _run(AssertionReasonHandler().evaluate(_ar_payload(True, True, False), {"selected": "B"}, "en"))
    assert res.status == "CORRECT"


def test_ar_canonical_e_correct() -> None:
    # Both false → E
    res = _run(AssertionReasonHandler().evaluate(_ar_payload(False, False, False), {"selected": "E"}, "en"))
    assert res.status == "CORRECT"


def test_ar_wrong_pick_incorrect() -> None:
    res = _run(AssertionReasonHandler().evaluate(_ar_payload(True, True, True), {"selected": "B"}, "en"))
    assert res.status == "INCORRECT"


# ── MULTI_STATEMENT ──────────────────────────────────────────────────────────


def _ms_payload(partial: bool = False) -> dict:
    return {
        "stem": "Which statements are correct about Indian polity?",
        "statements": [
            {"id": "1", "text": "President is head of state", "is_correct": True},
            {"id": "2", "text": "PM is head of judiciary", "is_correct": False},
            {"id": "3", "text": "RS has 245 members", "is_correct": True},
        ],
        "options": [
            {"id": "A", "text": "Only 1", "selects": ["1"]},
            {"id": "B", "text": "1 and 3", "selects": ["1", "3"]},
            {"id": "C", "text": "All", "selects": ["1", "2", "3"]},
        ],
        "correct_option_id": "B",
        "partial_credit": partial,
    }


def test_multi_statement_correct() -> None:
    res = _run(MultiStatementHandler().evaluate(_ms_payload(), {"selected_option_id": "B"}, "en"))
    assert res.status == "CORRECT"


def test_multi_statement_incorrect() -> None:
    res = _run(MultiStatementHandler().evaluate(_ms_payload(), {"selected_option_id": "A"}, "en"))
    assert res.status == "INCORRECT"


def test_multi_statement_partial_credit_subset_match() -> None:
    # Option A selects [1] which is a subset of truly-correct {1, 3} with no wrong picks
    res = _run(
        MultiStatementHandler().evaluate(_ms_payload(partial=True), {"selected_option_id": "A"}, "en")
    )
    assert res.status == "PARTIAL_CORRECT"
    assert res.matched_count == 1 and res.total_count == 2


def test_multi_statement_partial_credit_with_wrong_pick() -> None:
    # Option C selects [1, 2, 3] — 2 is wrong
    res = _run(
        MultiStatementHandler().evaluate(_ms_payload(partial=True), {"selected_option_id": "C"}, "en")
    )
    assert res.status == "INCORRECT"


# ── NUMERIC_INTEGER ──────────────────────────────────────────────────────────


def test_numeric_integer_correct() -> None:
    res = _run(NumericIntegerHandler().evaluate({"stem": "5 + 5 = ?", "correct": 10}, {"answer": 10}, "en"))
    assert res.status == "CORRECT"


def test_numeric_integer_incorrect() -> None:
    res = _run(NumericIntegerHandler().evaluate({"stem": "5 + 5 = ?", "correct": 10}, {"answer": 11}, "en"))
    assert res.status == "INCORRECT"


def test_numeric_integer_unattempted() -> None:
    res = _run(NumericIntegerHandler().evaluate({"stem": "5 + 5 = ?", "correct": 10}, {"answer": None}, "en"))
    assert res.status == "UNATTEMPTED"


# ── NUMERIC_DECIMAL ──────────────────────────────────────────────────────────


def test_numeric_decimal_within_tolerance() -> None:
    p = {"stem": "pi to 2 decimal places", "correct": 3.14, "tolerance": 0.05}
    res = _run(NumericDecimalHandler().evaluate(p, {"answer": 3.13}, "en"))
    assert res.status == "CORRECT"


def test_numeric_decimal_outside_tolerance() -> None:
    p = {"stem": "pi to 2 decimal places", "correct": 3.14, "tolerance": 0.01}
    res = _run(NumericDecimalHandler().evaluate(p, {"answer": 3.16}, "en"))
    assert res.status == "INCORRECT"


def test_numeric_decimal_at_boundary() -> None:
    p = {"stem": "pi to 2 decimal places", "correct": 3.14, "tolerance": 0.05}
    # Exact 3.15 = 3.14 + 0.01 well within 0.05 tolerance.
    res = _run(NumericDecimalHandler().evaluate(p, {"answer": 3.15}, "en"))
    assert res.status == "CORRECT"


# ── NUMERIC_RANGE ────────────────────────────────────────────────────────────


def test_numeric_range_in_range() -> None:
    p = {"stem": "estimate range", "low": 10.0, "high": 20.0}
    res = _run(NumericRangeHandler().evaluate(p, {"answer": 15.0}, "en"))
    assert res.status == "CORRECT"


def test_numeric_range_at_boundary() -> None:
    p = {"stem": "estimate range", "low": 10.0, "high": 20.0}
    res = _run(NumericRangeHandler().evaluate(p, {"answer": 10.0}, "en"))
    assert res.status == "CORRECT"
    res2 = _run(NumericRangeHandler().evaluate(p, {"answer": 20.0}, "en"))
    assert res2.status == "CORRECT"


def test_numeric_range_outside() -> None:
    p = {"stem": "estimate range", "low": 10.0, "high": 20.0}
    res = _run(NumericRangeHandler().evaluate(p, {"answer": 9.99}, "en"))
    assert res.status == "INCORRECT"


# ── FORMULA_INPUT ────────────────────────────────────────────────────────────


def test_formula_input_exact_match() -> None:
    p = {"stem": "Factorise x^2 + 2x + 1", "target_expression": "(x + 1)**2"}
    res = _run(FormulaInputHandler().evaluate(p, {"expression": "(x + 1)**2"}, "en"))
    assert res.status == "CORRECT"


def test_formula_input_symbolic_equivalence() -> None:
    p = {"stem": "Expand the binomial", "target_expression": "x**2 + 2*x + 1"}
    res = _run(FormulaInputHandler().evaluate(p, {"expression": "(x + 1)**2"}, "en"))
    assert res.status == "CORRECT"


def test_formula_input_equivalent_forms() -> None:
    p = {
        "stem": "Find the roots",
        "target_expression": "x**2 - 5*x + 6",
        "equivalent_forms": ["(x - 2)*(x - 3)"],
    }
    res = _run(FormulaInputHandler().evaluate(p, {"expression": "(x - 2)*(x - 3)"}, "en"))
    assert res.status == "CORRECT"


def test_formula_input_wrong_answer() -> None:
    p = {"stem": "Solve for x", "target_expression": "x**2 + 2*x + 1"}
    res = _run(FormulaInputHandler().evaluate(p, {"expression": "x + 1"}, "en"))
    assert res.status == "INCORRECT"


def test_formula_input_unparseable_input() -> None:
    p = {"stem": "What is the equation?", "target_expression": "x**2 + 1"}
    # Garbage input shouldn't crash; should return INCORRECT.
    res = _run(FormulaInputHandler().evaluate(p, {"expression": "@@@@"}, "en"))
    assert res.status == "INCORRECT"


def test_formula_input_unattempted() -> None:
    p = {"stem": "What is the equation?", "target_expression": "x**2 + 1"}
    res = _run(FormulaInputHandler().evaluate(p, {"expression": None}, "en"))
    assert res.status == "UNATTEMPTED"
    res2 = _run(FormulaInputHandler().evaluate(p, {"expression": "   "}, "en"))
    assert res2.status == "UNATTEMPTED"
