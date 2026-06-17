"""Sprint 29 (P4-S29) — pure-function tests for the error-pattern classifier."""

from __future__ import annotations

from engagement.analytics.error_classifier import (
    TAG_CONCEPTUAL,
    TAG_FORMULA,
    TAG_SIGN_UNIT,
    TAG_SILLY,
    TAG_TIME_PRESSURE,
    TAG_UNATTEMPTED,
    classify_error,
    is_sign_flip,
    is_sign_or_unit_error,
    is_unit_swap,
)


def test_correct_answer_returns_none() -> None:
    out = classify_error(
        is_correct=True, answered=True, time_spent_ms=10000,
        mastery_ewa=0.5,
    )
    assert out is None


def test_unanswered_yields_unattempted() -> None:
    out = classify_error(
        is_correct=False, answered=False, time_spent_ms=None,
        mastery_ewa=0.5,
    )
    assert out == TAG_UNATTEMPTED


def test_fast_wrong_with_decent_mastery_is_time_pressure() -> None:
    out = classify_error(
        is_correct=False, answered=True, time_spent_ms=15_000,
        mastery_ewa=0.7,  # > 0.5 floor
    )
    assert out == TAG_TIME_PRESSURE


def test_high_mastery_wrong_is_silly_mistake() -> None:
    out = classify_error(
        is_correct=False, answered=True, time_spent_ms=120_000,
        mastery_ewa=0.85,
    )
    assert out == TAG_SILLY


def test_low_mastery_wrong_is_conceptual_gap() -> None:
    out = classify_error(
        is_correct=False, answered=True, time_spent_ms=90_000,
        mastery_ewa=0.2,
    )
    assert out == TAG_CONCEPTUAL


def test_medium_mastery_with_sign_flip_is_sign_or_unit() -> None:
    out = classify_error(
        is_correct=False, answered=True, time_spent_ms=60_000,
        mastery_ewa=0.55,
        chosen_choice_text="5", correct_choice_text="-5",
    )
    assert out == TAG_SIGN_UNIT


def test_medium_mastery_with_unit_swap_is_sign_or_unit() -> None:
    out = classify_error(
        is_correct=False, answered=True, time_spent_ms=60_000,
        mastery_ewa=0.5,
        chosen_choice_text="5 m", correct_choice_text="5 cm",
    )
    assert out == TAG_SIGN_UNIT


def test_medium_mastery_no_pattern_is_formula_error() -> None:
    out = classify_error(
        is_correct=False, answered=True, time_spent_ms=60_000,
        mastery_ewa=0.55,
        chosen_choice_text="alpha", correct_choice_text="beta",
    )
    assert out == TAG_FORMULA


def test_fast_wrong_with_low_mastery_is_conceptual_not_time_pressure() -> None:
    """The time-pressure rule requires mastery > 0.5; below that it's a gap."""
    out = classify_error(
        is_correct=False, answered=True, time_spent_ms=10_000,
        mastery_ewa=0.3,
    )
    assert out == TAG_CONCEPTUAL


def test_no_time_data_falls_through_to_mastery_path() -> None:
    out = classify_error(
        is_correct=False, answered=True, time_spent_ms=None,
        mastery_ewa=0.85,
    )
    assert out == TAG_SILLY


def test_sign_flip_detects_negation() -> None:
    assert is_sign_flip("5", "-5") is True
    assert is_sign_flip("-3.14", "3.14") is True
    assert is_sign_flip("+7", "-7") is True


def test_sign_flip_rejects_identical_or_unrelated() -> None:
    assert is_sign_flip("5", "5") is False
    assert is_sign_flip("5", "7") is False
    assert is_sign_flip("alpha", "beta") is False


def test_unit_swap_detects_known_pairs() -> None:
    assert is_unit_swap("5 m", "5 cm") is True
    assert is_unit_swap("100 g", "100 kg") is True


def test_unit_swap_rejects_value_mismatch() -> None:
    assert is_unit_swap("5 m", "10 cm") is False


def test_unit_swap_rejects_unknown_units() -> None:
    assert is_unit_swap("5 fizz", "5 buzz") is False


def test_is_sign_or_unit_error_combines_both() -> None:
    assert is_sign_or_unit_error("5", "-5") is True
    assert is_sign_or_unit_error("5 m", "5 cm") is True
    assert is_sign_or_unit_error("alpha", "beta") is False
