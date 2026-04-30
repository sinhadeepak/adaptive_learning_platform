"""Pydantic payload + response contracts for the 4 Subjective family types.

All HYBRID (AI + human escalation). CASE_STUDY and COMPREHENSION_LONG
are composite — children can be any other type.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


# ── Rubric primitives ────────────────────────────────────────────────────────


class RubricCriterion(BaseModel):
    """One criterion in a subjective-evaluation rubric.

    Weights sum to 100 within a rubric — these are *content* weights, not
    marks (per ADR-0018). The AI evaluator returns satisfied: 0 / 0.5 / 1
    per criterion; partial-credit-aggregation lives in the Resolution.
    """

    id: str = Field(min_length=1, max_length=40)
    text: str = Field(min_length=4, max_length=500)
    weight: float = Field(ge=0, le=100)  # percent
    keywords: list[str] = Field(default_factory=list, max_length=20)
    descriptors: list[str] = Field(
        default_factory=list,
        max_length=10,
        description="Optional descriptors per satisfaction level (e.g. 'mentions Kesavananda')",
    )


class Rubric(BaseModel):
    """Versioned rubric. `version` matched against evaluation_records
    so old responses retain their rubric_version reference on re-eval."""

    version: int = Field(ge=1)
    criteria: list[RubricCriterion] = Field(min_length=1, max_length=10)
    applies_to_languages: list[str] = Field(default_factory=lambda: ["en"])

    @model_validator(mode="after")
    def _weights_sum_to_100(self) -> "Rubric":
        ids = [c.id for c in self.criteria]
        if len(ids) != len(set(ids)):
            raise ValueError("criterion ids must be unique")
        total = sum(c.weight for c in self.criteria)
        # Allow small float tolerance.
        if abs(total - 100.0) > 0.01:
            raise ValueError(f"criterion weights must sum to 100; got {total}")
        return self


# ── ESSAY ────────────────────────────────────────────────────────────────────


class EssayPayload(BaseModel):
    stem: str = Field(min_length=8, max_length=4000)
    expected_word_count_range: tuple[int, int]
    model_answer: str = Field(min_length=20, max_length=20_000)
    rubric: Rubric

    @model_validator(mode="after")
    def _word_range_well_ordered(self) -> "EssayPayload":
        lo, hi = self.expected_word_count_range
        if lo < 0 or hi < lo:
            raise ValueError(
                f"expected_word_count_range must be (min, max) with min ≥ 0 and max ≥ min; got {self.expected_word_count_range}"
            )
        return self


class EssayResponse(BaseModel):
    text: str | None = Field(default=None, max_length=20_000)


# ── DESCRIPTIVE_LONG ─────────────────────────────────────────────────────────
# GATE-style. Structural rubric ("definition", "derivation", "example")
# typically with weights per criterion.


class DescriptiveLongPayload(BaseModel):
    stem: str = Field(min_length=8, max_length=4000)
    expected_word_count_range: tuple[int, int]
    model_answer: str = Field(min_length=20, max_length=20_000)
    rubric: Rubric


class DescriptiveLongResponse(BaseModel):
    text: str | None = Field(default=None, max_length=20_000)


# ── CASE_STUDY (composite) ───────────────────────────────────────────────────
# Scenario passage + 2-5 child sub-questions. Each child is any other
# type (often a mix of objective + short-text + essay). Stored as parent
# + linked child question_ids.


class ChildReference(BaseModel):
    """Reference to a child question authored separately."""

    question_id: str
    ordinal: int = Field(ge=1)


class CaseStudyPayload(BaseModel):
    scenario: str = Field(min_length=20, max_length=20_000)
    child_questions: list[ChildReference] = Field(min_length=2, max_length=10)

    @model_validator(mode="after")
    def _ordinals_unique_and_dense(self) -> "CaseStudyPayload":
        ords = [c.ordinal for c in self.child_questions]
        if len(ords) != len(set(ords)):
            raise ValueError("child ordinals must be unique")
        if sorted(ords) != list(range(1, len(ords) + 1)):
            raise ValueError(
                f"child ordinals must be 1..N consecutive; got {sorted(ords)}"
            )
        return self


class CaseStudyResponse(BaseModel):
    """Composite response — children evaluated via their own handlers."""

    children: list["ChildResponse"] = Field(default_factory=list)


class ChildResponse(BaseModel):
    question_id: str
    response_payload: dict[str, object]  # validated by the child's response_schema


# ── COMPREHENSION_LONG (composite) ───────────────────────────────────────────
# Extended passage (1000+ words) + 3-8 sub-questions of mixed types.
# Used in CAT, GATE, UPSC.


class ComprehensionLongPayload(BaseModel):
    passage: str = Field(min_length=200, max_length=50_000)
    child_questions: list[ChildReference] = Field(min_length=3, max_length=10)

    @model_validator(mode="after")
    def _ordinals_unique_and_dense(self) -> "ComprehensionLongPayload":
        ords = [c.ordinal for c in self.child_questions]
        if len(ords) != len(set(ords)):
            raise ValueError("child ordinals must be unique")
        if sorted(ords) != list(range(1, len(ords) + 1)):
            raise ValueError(
                f"child ordinals must be 1..N consecutive; got {sorted(ords)}"
            )
        return self


class ComprehensionLongResponse(BaseModel):
    children: list[ChildResponse] = Field(default_factory=list)


# Forward-ref resolution for composite responses
CaseStudyResponse.model_rebuild()
ComprehensionLongResponse.model_rebuild()
