"""Phase 5 (P5-S39) — handler tests for Matching + Fill-in families."""

from __future__ import annotations

import asyncio

import pytest

from learning.types.fill_in.handlers import (
    ClozePassageHandler,
    FillBlankMultiHandler,
    FillBlankSingleHandler,
    match_blank,
)
from learning.types.matching.handlers import (
    ClassificationHandler,
    MatchTheFollowingHandler,
    SequencingHandler,
    _longest_correct_prefix,
)


def _run(coro):
    return asyncio.run(coro)


# ── MATCH_THE_FOLLOWING ──────────────────────────────────────────────────────


def _match_payload(partial: bool = True) -> dict:
    return {
        "stem": "Match scientists to their discoveries",
        "list_a": [
            {"id": "a1", "text": "Newton"},
            {"id": "a2", "text": "Einstein"},
            {"id": "a3", "text": "Darwin"},
        ],
        "list_b": [
            {"id": "b1", "text": "Gravity"},
            {"id": "b2", "text": "Relativity"},
            {"id": "b3", "text": "Evolution"},
            {"id": "b4", "text": "Quantum"},  # distractor
        ],
        "correct_pairs": [
            {"left_id": "a1", "right_id": "b1"},
            {"left_id": "a2", "right_id": "b2"},
            {"left_id": "a3", "right_id": "b3"},
        ],
        "partial_credit": partial,
    }


def test_match_correct() -> None:
    res = _run(MatchTheFollowingHandler().evaluate(
        _match_payload(),
        {"pairs": [
            {"left_id": "a1", "right_id": "b1"},
            {"left_id": "a2", "right_id": "b2"},
            {"left_id": "a3", "right_id": "b3"},
        ]},
        "en",
    ))
    assert res.status == "CORRECT"
    assert res.matched_count == 3 and res.total_count == 3


def test_match_partial_credit() -> None:
    res = _run(MatchTheFollowingHandler().evaluate(
        _match_payload(partial=True),
        {"pairs": [
            {"left_id": "a1", "right_id": "b1"},
            {"left_id": "a2", "right_id": "b3"},  # wrong
        ]},
        "en",
    ))
    assert res.status == "PARTIAL_CORRECT"
    assert res.matched_count == 1 and res.total_count == 3


def test_match_incorrect_when_partial_off() -> None:
    res = _run(MatchTheFollowingHandler().evaluate(
        _match_payload(partial=False),
        {"pairs": [
            {"left_id": "a1", "right_id": "b1"},
        ]},
        "en",
    ))
    assert res.status == "INCORRECT"


def test_match_unattempted() -> None:
    res = _run(MatchTheFollowingHandler().evaluate(_match_payload(), {"pairs": []}, "en"))
    assert res.status == "UNATTEMPTED"


# ── SEQUENCING ───────────────────────────────────────────────────────────────


def _seq_payload(metric: str = "all_or_nothing") -> dict:
    return {
        "stem": "Order the events chronologically",
        "items": [
            {"id": "e1", "text": "1857 War"},
            {"id": "e2", "text": "1885 INC"},
            {"id": "e3", "text": "1947 Independence"},
        ],
        "correct_order": ["e1", "e2", "e3"],
        "metric": metric,
    }


def test_seq_full_correct() -> None:
    res = _run(SequencingHandler().evaluate(
        _seq_payload(), {"order": ["e1", "e2", "e3"]}, "en"
    ))
    assert res.status == "CORRECT"


def test_seq_all_or_nothing_incorrect() -> None:
    res = _run(SequencingHandler().evaluate(
        _seq_payload(metric="all_or_nothing"),
        {"order": ["e1", "e3", "e2"]},
        "en",
    ))
    assert res.status == "INCORRECT"


def test_seq_longest_correct_prefix() -> None:
    res = _run(SequencingHandler().evaluate(
        _seq_payload(metric="longest_correct_prefix"),
        {"order": ["e1", "e2", "x"]},  # 2-prefix matches
        "en",
    ))
    assert res.status == "PARTIAL_CORRECT"
    assert res.matched_count == 2 and res.total_count == 3


def test_seq_levenshtein_metric() -> None:
    res = _run(SequencingHandler().evaluate(
        _seq_payload(metric="levenshtein"),
        {"order": ["e1", "wrong", "e3"]},  # positions 0 + 2 match
        "en",
    ))
    assert res.status == "PARTIAL_CORRECT"
    assert res.matched_count == 2


def test_longest_correct_prefix_pure() -> None:
    assert _longest_correct_prefix(["a", "b", "c"], ["a", "b", "x"]) == 2
    assert _longest_correct_prefix(["a", "b"], ["x", "y"]) == 0
    assert _longest_correct_prefix(["a"], ["a"]) == 1


# ── CLASSIFICATION ───────────────────────────────────────────────────────────


def _classification_payload() -> dict:
    return {
        "stem": "Classify the animals",
        "items": [
            {"id": "i1", "text": "Tiger"},
            {"id": "i2", "text": "Eagle"},
            {"id": "i3", "text": "Whale"},
        ],
        "categories": [
            {"id": "c1", "text": "Mammal"},
            {"id": "c2", "text": "Bird"},
        ],
        "correct_assignments": [
            {"item_id": "i1", "category_id": "c1"},
            {"item_id": "i2", "category_id": "c2"},
            {"item_id": "i3", "category_id": "c1"},
        ],
    }


def test_classification_full_correct() -> None:
    res = _run(ClassificationHandler().evaluate(
        _classification_payload(),
        {"assignments": [
            {"item_id": "i1", "category_id": "c1"},
            {"item_id": "i2", "category_id": "c2"},
            {"item_id": "i3", "category_id": "c1"},
        ]},
        "en",
    ))
    assert res.status == "CORRECT"


def test_classification_partial() -> None:
    res = _run(ClassificationHandler().evaluate(
        _classification_payload(),
        {"assignments": [
            {"item_id": "i1", "category_id": "c1"},
            {"item_id": "i2", "category_id": "c1"},  # wrong
            {"item_id": "i3", "category_id": "c1"},
        ]},
        "en",
    ))
    assert res.status == "PARTIAL_CORRECT"
    assert res.matched_count == 2 and res.total_count == 3


# ── FILL_BLANK_SINGLE ────────────────────────────────────────────────────────


def test_fbs_exact_match() -> None:
    p = {
        "stem": "Mitochondria are the ___ of the cell.",
        "accepted": ["powerhouse"],
        "match_mode": "exact",
    }
    res = _run(FillBlankSingleHandler().evaluate(p, {"answer": "powerhouse"}, "en"))
    assert res.status == "CORRECT"


def test_fbs_case_insensitive() -> None:
    p = {
        "stem": "Mitochondria are the ___ of the cell.",
        "accepted": ["powerhouse"],
        "match_mode": "case_insensitive",
    }
    res = _run(FillBlankSingleHandler().evaluate(p, {"answer": "PowerHouse"}, "en"))
    assert res.status == "CORRECT"


def test_fbs_fuzzy_typo_accepted() -> None:
    p = {
        "stem": "Mitochondria are the ___ of the cell.",
        "accepted": ["photosynthesis"],
        "match_mode": "fuzzy_token",
        "fuzzy_threshold": 0.85,
    }
    # photosynthesis → photosintesis (typo) — ratio ~0.92, should pass
    res = _run(FillBlankSingleHandler().evaluate(p, {"answer": "photosintesis"}, "en"))
    assert res.status == "CORRECT"


def test_fbs_unattempted() -> None:
    p = {
        "stem": "Mitochondria are the ___ of the cell.",
        "accepted": ["powerhouse"],
    }
    res = _run(FillBlankSingleHandler().evaluate(p, {"answer": None}, "en"))
    assert res.status == "UNATTEMPTED"
    res2 = _run(FillBlankSingleHandler().evaluate(p, {"answer": "  "}, "en"))
    assert res2.status == "UNATTEMPTED"


def test_match_blank_pure() -> None:
    assert match_blank("hello", ["hello", "hi"], "case_insensitive", 0.85)
    assert match_blank("HELLO", ["hello"], "case_insensitive", 0.85)
    assert not match_blank(None, ["hello"], "case_insensitive", 0.85)
    assert not match_blank("xxx", ["hello"], "case_insensitive", 0.85)


# ── FILL_BLANK_MULTI ─────────────────────────────────────────────────────────


def _fbm_payload(partial: bool = True) -> dict:
    return {
        "stem": "The capital of {{1}} is {{2}}.",
        "blanks": [
            {"id": "1", "accepted": ["India"]},
            {"id": "2", "accepted": ["New Delhi", "Delhi"]},
        ],
        "partial_credit": partial,
    }


def test_fbm_full_correct() -> None:
    res = _run(FillBlankMultiHandler().evaluate(
        _fbm_payload(),
        {"blanks": [
            {"blank_id": "1", "answer": "India"},
            {"blank_id": "2", "answer": "Delhi"},
        ]},
        "en",
    ))
    assert res.status == "CORRECT"


def test_fbm_partial() -> None:
    res = _run(FillBlankMultiHandler().evaluate(
        _fbm_payload(partial=True),
        {"blanks": [
            {"blank_id": "1", "answer": "India"},
            {"blank_id": "2", "answer": "Mumbai"},  # wrong
        ]},
        "en",
    ))
    assert res.status == "PARTIAL_CORRECT"


def test_fbm_no_partial_when_disabled() -> None:
    res = _run(FillBlankMultiHandler().evaluate(
        _fbm_payload(partial=False),
        {"blanks": [
            {"blank_id": "1", "answer": "India"},
            {"blank_id": "2", "answer": "Mumbai"},
        ]},
        "en",
    ))
    assert res.status == "INCORRECT"


# ── CLOZE_PASSAGE ────────────────────────────────────────────────────────────


def test_cloze_word_bank_constraint() -> None:
    p = {
        "passage": "The {{1}} sat on the {{2}}.",
        "blanks": [
            {"id": "1", "accepted": ["cat", "dog"]},
            {"id": "2", "accepted": ["mat", "rug"]},
        ],
        "word_bank": ["cat", "dog", "mat", "rug"],
    }
    # Within bank
    res = _run(ClozePassageHandler().evaluate(
        p,
        {"blanks": [
            {"blank_id": "1", "answer": "cat"},
            {"blank_id": "2", "answer": "mat"},
        ]},
        "en",
    ))
    assert res.status == "CORRECT"
    # Outside bank — even if normally accepted
    p2 = {
        "passage": "The {{1}} sat on the {{2}}.",
        "blanks": [
            {"id": "1", "accepted": ["cat", "dog", "fox"]},
            {"id": "2", "accepted": ["mat"]},
        ],
        "word_bank": ["cat", "dog", "mat"],  # fox not in bank
    }
    res2 = _run(ClozePassageHandler().evaluate(
        p2,
        {"blanks": [
            {"blank_id": "1", "answer": "fox"},  # accepted but not in bank
            {"blank_id": "2", "answer": "mat"},
        ]},
        "en",
    ))
    # Word-bank violation on blank 1 → partial credit (only blank 2 matches)
    assert res2.status == "PARTIAL_CORRECT"
    assert res2.matched_count == 1


def test_cloze_unattempted() -> None:
    p = {
        "passage": "The {{1}} sat on the {{2}}.",
        "blanks": [
            {"id": "1", "accepted": ["cat"]},
            {"id": "2", "accepted": ["mat"]},
        ],
    }
    res = _run(ClozePassageHandler().evaluate(p, {"blanks": []}, "en"))
    assert res.status == "UNATTEMPTED"


# Mastery pure-function tests live in services/engagement/tests/
# (test_p5_mastery.py) since they import from the engagement package.
