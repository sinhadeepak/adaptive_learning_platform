"""Sprint 29 (P4-S29) — pure-function error-pattern classifier.

Per ADR-0016. Six-axis heuristic v1; LLM v2 reserved behind a flag.

Decision rules (priority order, first match wins):
  unattempted        → not answered
  (correct answers)  → not classified
  time_pressure      → fast (<30s) AND mastery > 0.5
  silly_mistake      → mastery > 0.7 (knew it, slipped)
  conceptual_gap     → mastery < 0.4 (doesn't know it)
  sign_or_unit_error → chosen text differs from correct only in sign/unit
  formula_error      → catch-all for the medium-mastery middle band

Pure functions only: no DB or HTTP coupling.
"""

from __future__ import annotations

from dataclasses import dataclass

# Tag constants
TAG_SILLY = "silly_mistake"
TAG_CONCEPTUAL = "conceptual_gap"
TAG_TIME_PRESSURE = "time_pressure"
TAG_FORMULA = "formula_error"
TAG_SIGN_UNIT = "sign_or_unit_error"
TAG_UNATTEMPTED = "unattempted"

ALL_TAGS = (
    TAG_SILLY, TAG_CONCEPTUAL, TAG_TIME_PRESSURE,
    TAG_FORMULA, TAG_SIGN_UNIT, TAG_UNATTEMPTED,
)

# Thresholds
TIME_PRESSURE_MS = 30_000  # < 30s
HIGH_MASTERY = 0.7
LOW_MASTERY = 0.4
TIME_PRESSURE_MASTERY_FLOOR = 0.5

# Common unit pairs the heuristic understands. Conservative — false negatives
# are acceptable; false positives hurt more.
_UNIT_PAIRS: set[tuple[str, str]] = {
    ("m", "cm"), ("m", "mm"), ("m", "km"),
    ("kg", "g"), ("g", "mg"),
    ("s", "ms"),
    ("kj", "j"), ("kj/mol", "j/mol"),
    ("mol", "mmol"),
    ("hz", "khz"),
    ("v", "mv"), ("a", "ma"),
}


@dataclass(frozen=True)
class ErrorInputs:
    is_correct: bool
    answered: bool
    time_spent_ms: int | None
    mastery_ewa: float
    chosen_choice_text: str
    correct_choice_text: str


def _norm(s: str) -> str:
    return (s or "").strip().lower()


def _strip_sign(s: str) -> str:
    return s.lstrip("+-")


def _split_value_unit(s: str) -> tuple[str, str]:
    """Coarse split of "5 m" → ("5", "m"). Returns ("", s) when no leading
    numeric magnitude is present."""
    s = s.strip()
    i = 0
    while i < len(s) and (s[i].isdigit() or s[i] in ".+-"):
        i += 1
    return s[:i].strip(), s[i:].strip()


def is_sign_flip(chosen: str, correct: str) -> bool:
    """True when `chosen` and `correct` are the same magnitude with a sign
    flip (e.g. "5" vs "-5")."""
    c = _norm(chosen)
    k = _norm(correct)
    if c == k:
        return False
    return _strip_sign(c) == _strip_sign(k) and (c.startswith("-") != k.startswith("-"))


def is_unit_swap(chosen: str, correct: str) -> bool:
    """True when chosen/correct share the same value but units differ from
    a known pair (e.g. "5 m" vs "5 cm")."""
    cv, cu = _split_value_unit(_norm(chosen))
    kv, ku = _split_value_unit(_norm(correct))
    if not cu or not ku or cu == ku:
        return False
    if cv != kv:
        return False
    pair = tuple(sorted([cu, ku]))
    return pair in {tuple(sorted(p)) for p in _UNIT_PAIRS}


def is_sign_or_unit_error(chosen: str, correct: str) -> bool:
    return is_sign_flip(chosen, correct) or is_unit_swap(chosen, correct)


def classify_error(
    *,
    is_correct: bool,
    answered: bool,
    time_spent_ms: int | None,
    mastery_ewa: float,
    chosen_choice_text: str = "",
    correct_choice_text: str = "",
) -> str | None:
    """Return one of the six tag strings, or None when the answer was correct
    (correct answers are not classified — only wrong/unattempted ones get a
    tag).
    """
    if not answered:
        return TAG_UNATTEMPTED
    if is_correct:
        return None
    # Time pressure first — a fast wrong answer with reasonable mastery is
    # almost always rushing, not gap.
    if (
        time_spent_ms is not None
        and time_spent_ms < TIME_PRESSURE_MS
        and mastery_ewa > TIME_PRESSURE_MASTERY_FLOOR
    ):
        return TAG_TIME_PRESSURE
    if mastery_ewa > HIGH_MASTERY:
        return TAG_SILLY
    if mastery_ewa < LOW_MASTERY:
        return TAG_CONCEPTUAL
    if is_sign_or_unit_error(chosen_choice_text, correct_choice_text):
        return TAG_SIGN_UNIT
    return TAG_FORMULA
