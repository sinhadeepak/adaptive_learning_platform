"""Pydantic payload + response contracts for the 4 Fill-in family types.

FILL_BLANK_SINGLE / FILL_BLANK_MULTI / CLOZE_PASSAGE are DETERMINISTIC.
SHORT_TEXT is AI_ASSISTED — handler invokes AI Gateway with key concepts.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

MatchMode = Literal["exact", "case_insensitive", "fuzzy_token"]


# ── FILL_BLANK_SINGLE ────────────────────────────────────────────────────────


class FillBlankSinglePayload(BaseModel):
    """Stem with a single `___` placeholder. Author lists accepted answers."""

    stem: str = Field(min_length=8, max_length=2000)
    accepted: list[str] = Field(min_length=1)  # all variants accepted as correct
    match_mode: MatchMode = "case_insensitive"
    fuzzy_threshold: float = Field(default=0.85, ge=0.0, le=1.0)  # only used if fuzzy_token
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _stem_has_blank_marker(self) -> "FillBlankSinglePayload":
        if "___" not in self.stem and "{{1}}" not in self.stem:
            raise ValueError(
                "stem must contain a blank marker: '___' or '{{1}}'"
            )
        return self


class FillBlankSingleResponse(BaseModel):
    answer: str | None


# ── FILL_BLANK_MULTI ─────────────────────────────────────────────────────────


class BlankSpec(BaseModel):
    """Per-blank spec; placeholder `{{n}}` in stem is matched by `id="n"`."""

    id: str = Field(min_length=1, max_length=4)  # "1", "2", ...
    accepted: list[str] = Field(min_length=1)
    match_mode: MatchMode = "case_insensitive"
    fuzzy_threshold: float = Field(default=0.85, ge=0.0, le=1.0)


class FillBlankMultiPayload(BaseModel):
    """Stem with N `{{n}}` placeholders. One BlankSpec per blank."""

    stem: str = Field(min_length=8, max_length=2000)
    blanks: list[BlankSpec] = Field(min_length=2, max_length=10)
    partial_credit: bool = True
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _ids_unique_and_in_stem(self) -> "FillBlankMultiPayload":
        ids = [b.id for b in self.blanks]
        if len(ids) != len(set(ids)):
            raise ValueError("blank ids must be unique")
        for bid in ids:
            placeholder = "{{" + bid + "}}"
            if placeholder not in self.stem:
                raise ValueError(
                    f"stem missing placeholder {placeholder!r} for blank id {bid!r}"
                )
        return self


class BlankResponse(BaseModel):
    blank_id: str
    answer: str | None


class FillBlankMultiResponse(BaseModel):
    blanks: list[BlankResponse] = Field(default_factory=list)


# ── CLOZE_PASSAGE ────────────────────────────────────────────────────────────


class ClozeBlank(BaseModel):
    id: str = Field(min_length=1, max_length=4)
    accepted: list[str] = Field(min_length=1)
    match_mode: MatchMode = "case_insensitive"
    fuzzy_threshold: float = Field(default=0.85, ge=0.0, le=1.0)


class ClozePassagePayload(BaseModel):
    """Long passage with multiple blanks. Optional word_bank constrains
    the student's choices to a closed set."""

    passage: str = Field(min_length=20, max_length=10_000)
    blanks: list[ClozeBlank] = Field(min_length=1, max_length=20)
    word_bank: list[str] | None = Field(default=None, max_length=40)  # closed list (CAT verbal style)
    partial_credit: bool = True
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _blanks_referenced_in_passage(self) -> "ClozePassagePayload":
        ids = [b.id for b in self.blanks]
        if len(ids) != len(set(ids)):
            raise ValueError("cloze blank ids must be unique")
        for bid in ids:
            placeholder = "{{" + bid + "}}"
            if placeholder not in self.passage:
                raise ValueError(
                    f"passage missing placeholder {placeholder!r} for blank id {bid!r}"
                )
        if self.word_bank is not None and len(set(self.word_bank)) != len(self.word_bank):
            raise ValueError("word_bank must not repeat words")
        return self


class ClozePassageResponse(BaseModel):
    blanks: list[BlankResponse] = Field(default_factory=list)


# ── SHORT_TEXT ───────────────────────────────────────────────────────────────
# AI_ASSISTED. The evaluator passes (student response, key concepts,
# model answer) to the AI Gateway and returns a Resolution with
# confidence. Confidence < 0.75 → PENDING_HUMAN_REVIEW.


class ShortTextPayload(BaseModel):
    stem: str = Field(min_length=8, max_length=2000)
    model_answer: str = Field(min_length=4, max_length=4000)
    key_concepts: list[str] = Field(
        min_length=1,
        max_length=10,
        description="Concept tokens the AI evaluator checks for in the response",
    )
    expected_word_count_range: tuple[int, int] | None = None  # (min, max)
    explanation: str | None = Field(default=None, max_length=4000)


class ShortTextResponse(BaseModel):
    text: str | None = Field(default=None, max_length=2000)
