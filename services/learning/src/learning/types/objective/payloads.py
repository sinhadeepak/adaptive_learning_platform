"""Pydantic payload + response contracts for the 5 Objective family types.

All evaluations are DETERMINISTIC. Partial credit is type-specific
(MCQ_MULTI configurable; MULTI_STATEMENT yes; others no).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


# ── MCQ_SINGLE ───────────────────────────────────────────────────────────────


class MCQOption(BaseModel):
    id: str = Field(min_length=1, max_length=8)  # "A", "B", "C", "D"
    text: str = Field(min_length=1, max_length=2000)


class MCQSinglePayload(BaseModel):
    """Author-supplied payload for a single-correct MCQ."""

    stem: str = Field(min_length=8, max_length=2000)
    options: list[MCQOption] = Field(min_length=2, max_length=8)
    correct_id: str = Field(min_length=1, max_length=8)
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _correct_id_must_be_in_options(self) -> "MCQSinglePayload":
        ids = {o.id for o in self.options}
        if self.correct_id not in ids:
            raise ValueError(
                f"correct_id={self.correct_id!r} not in options {sorted(ids)}"
            )
        if len(ids) != len(self.options):
            raise ValueError("option ids must be unique")
        return self


class MCQSingleResponse(BaseModel):
    selected_id: str | None  # None = unattempted


# ── MCQ_MULTI ────────────────────────────────────────────────────────────────


class MCQMultiPayload(BaseModel):
    """Multi-correct MCQ (e.g. JEE Advanced)."""

    stem: str = Field(min_length=8, max_length=2000)
    options: list[MCQOption] = Field(min_length=2, max_length=8)
    correct_ids: list[str] = Field(min_length=1)
    # JEE Adv default: any wrong option = INCORRECT.
    # CBSE / practice mode: configurable to allow PARTIAL_CORRECT.
    partial_credit: bool = False
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _correct_ids_subset_of_options(self) -> "MCQMultiPayload":
        ids = {o.id for o in self.options}
        if len(ids) != len(self.options):
            raise ValueError("option ids must be unique")
        unknown = set(self.correct_ids) - ids
        if unknown:
            raise ValueError(
                f"correct_ids contain unknown ids: {sorted(unknown)}"
            )
        if len(self.correct_ids) != len(set(self.correct_ids)):
            raise ValueError("correct_ids must be unique")
        return self


class MCQMultiResponse(BaseModel):
    selected_ids: list[str] = Field(default_factory=list)


# ── TRUE_FALSE ───────────────────────────────────────────────────────────────


class TrueFalsePayload(BaseModel):
    statement: str = Field(min_length=8, max_length=2000)
    correct: bool
    explanation: str | None = Field(default=None, max_length=4000)


class TrueFalseResponse(BaseModel):
    answer: bool | None  # None = unattempted


# ── ASSERTION_REASON ─────────────────────────────────────────────────────────
# Five canonical options (A–E) auto-derived from the three boolean flags.
# A = both true and R explains A
# B = both true but R does not explain A
# C = A true, R false
# D = A false, R true
# E = both false


class AssertionReasonPayload(BaseModel):
    assertion: str = Field(min_length=8, max_length=2000)
    reason: str = Field(min_length=8, max_length=2000)
    assertion_true: bool
    reason_true: bool
    reason_explains_assertion: bool
    explanation: str | None = Field(default=None, max_length=4000)

    def canonical_correct(self) -> Literal["A", "B", "C", "D", "E"]:
        a, r, e = self.assertion_true, self.reason_true, self.reason_explains_assertion
        if a and r and e:
            return "A"
        if a and r and not e:
            return "B"
        if a and not r:
            return "C"
        if not a and r:
            return "D"
        return "E"

    @model_validator(mode="after")
    def _explains_only_when_both_true(self) -> "AssertionReasonPayload":
        if self.reason_explains_assertion and not (
            self.assertion_true and self.reason_true
        ):
            raise ValueError(
                "reason_explains_assertion=true requires both assertion_true and reason_true"
            )
        return self


class AssertionReasonResponse(BaseModel):
    selected: Literal["A", "B", "C", "D", "E"] | None


# ── MULTI_STATEMENT ──────────────────────────────────────────────────────────
# Exam-style "of the following statements, which are correct?" with N
# statements and a fixed set of options describing combinations.


class StatementItem(BaseModel):
    id: str = Field(min_length=1, max_length=4)  # "1", "2", "3", "4"
    text: str = Field(min_length=4, max_length=1000)
    is_correct: bool


class MultiStatementOption(BaseModel):
    """e.g. {"id": "A", "text": "Only 1 and 3", "selects": ["1", "3"]}"""

    id: str = Field(min_length=1, max_length=8)
    text: str = Field(min_length=1, max_length=500)
    selects: list[str] = Field(min_length=0)  # empty allowed for "None of the above"


class MultiStatementPayload(BaseModel):
    stem: str = Field(min_length=8, max_length=2000)
    statements: list[StatementItem] = Field(min_length=2, max_length=8)
    options: list[MultiStatementOption] = Field(min_length=2, max_length=8)
    correct_option_id: str
    partial_credit: bool = False  # for tests that allow "matched 2 of 3"
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _consistency(self) -> "MultiStatementPayload":
        stmt_ids = {s.id for s in self.statements}
        if len(stmt_ids) != len(self.statements):
            raise ValueError("statement ids must be unique")

        opt_ids = {o.id for o in self.options}
        if len(opt_ids) != len(self.options):
            raise ValueError("option ids must be unique")
        if self.correct_option_id not in opt_ids:
            raise ValueError(
                f"correct_option_id={self.correct_option_id!r} not in options {sorted(opt_ids)}"
            )

        # Each option's `selects` must reference real statement ids.
        for opt in self.options:
            unknown = set(opt.selects) - stmt_ids
            if unknown:
                raise ValueError(
                    f"option {opt.id!r} selects unknown statement ids: {sorted(unknown)}"
                )

        # The correct option's `selects` must equal the set of statements
        # marked is_correct=True.
        correct_opt = next(o for o in self.options if o.id == self.correct_option_id)
        truly_correct = {s.id for s in self.statements if s.is_correct}
        if set(correct_opt.selects) != truly_correct:
            raise ValueError(
                f"correct option {self.correct_option_id!r} selects "
                f"{sorted(correct_opt.selects)} but truly-correct statements are "
                f"{sorted(truly_correct)}"
            )
        return self


class MultiStatementResponse(BaseModel):
    selected_option_id: str | None
