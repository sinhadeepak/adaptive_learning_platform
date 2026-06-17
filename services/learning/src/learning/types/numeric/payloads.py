"""Pydantic payload + response contracts for the 4 Numeric family types.

All evaluations are DETERMINISTIC. None support partial credit.
FORMULA_INPUT delegates symbolic equivalence to sympy at evaluation time.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


# ── NUMERIC_INTEGER ──────────────────────────────────────────────────────────


class NumericIntegerPayload(BaseModel):
    """Integer-valued answer (JEE Main integer-type). Exact equality."""

    stem: str = Field(min_length=8, max_length=2000)
    correct: int
    unit: str | None = Field(default=None, max_length=40)  # e.g. "m/s", "N"
    explanation: str | None = Field(default=None, max_length=4000)


class NumericIntegerResponse(BaseModel):
    answer: int | None  # None = unattempted


# ── NUMERIC_DECIMAL ──────────────────────────────────────────────────────────


class NumericDecimalPayload(BaseModel):
    """Real-valued answer with absolute tolerance."""

    stem: str = Field(min_length=8, max_length=2000)
    correct: float
    tolerance: float = Field(gt=0)  # |student - correct| ≤ tolerance
    sig_figs: int | None = Field(default=None, ge=1, le=10)  # display hint
    unit: str | None = Field(default=None, max_length=40)
    explanation: str | None = Field(default=None, max_length=4000)


class NumericDecimalResponse(BaseModel):
    answer: float | None


# ── NUMERIC_RANGE ────────────────────────────────────────────────────────────


class NumericRangePayload(BaseModel):
    """Any value in [low, high] is correct."""

    stem: str = Field(min_length=8, max_length=2000)
    low: float
    high: float
    unit: str | None = Field(default=None, max_length=40)
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _range_well_ordered(self) -> "NumericRangePayload":
        if self.low > self.high:
            raise ValueError(f"low ({self.low}) must be ≤ high ({self.high})")
        return self


class NumericRangeResponse(BaseModel):
    answer: float | None


# ── FORMULA_INPUT ────────────────────────────────────────────────────────────


class FormulaInputPayload(BaseModel):
    """Student types a formula; sympy compares for symbolic equivalence.

    `target_expression` is the canonical answer in MathJax-compatible
    syntax (sympy parses it via `sympy.sympify` with safe-mode).
    `equivalent_forms` is an optional author-provided list of additional
    canonical forms that should also count as correct (sympy generally
    handles common transformations, but author-flagged forms add safety).
    """

    stem: str = Field(min_length=8, max_length=2000)
    target_expression: str = Field(min_length=1, max_length=500)
    equivalent_forms: list[str] = Field(default_factory=list, max_length=20)
    free_symbols: list[str] = Field(
        default_factory=list,
        max_length=10,
    )  # e.g. ["x", "y"] — restricts what student variables are allowed
    explanation: str | None = Field(default=None, max_length=4000)


class FormulaInputResponse(BaseModel):
    expression: str | None = Field(default=None, max_length=500)
