"""Pydantic schemas for PCE responses."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PersonalYieldRow(BaseModel):
    """One entry in the per-user yield ranking."""

    topic_id: str
    rank: int = Field(ge=1)
    base_yield: float
    mastery: float = Field(ge=0.0, le=1.0)
    decay_severity: float = Field(ge=0.0, le=1.0)
    time_pressure: float
    personal_yield: float
    rationale: str = Field(min_length=4)


class PersonalYieldResponse(BaseModel):
    user_id: str
    exam_id: str
    forecast_year: int
    days_to_exam: int | None = None
    items: list[PersonalYieldRow]
    computed_at: datetime


class ScoreProjection(BaseModel):
    """What the student is on track to score on the next exam given
    current mastery × forecast_yield distribution."""

    user_id: str
    exam_id: str
    forecast_year: int
    expected_score: float
    expected_marks_per_topic_top5: list[dict]
    target_score: float | None = None
    gap_to_target: float | None = None


class CounterfactualResponse(BaseModel):
    """Score-projection counterfactual — 'if you master X, your score
    becomes Y'."""

    user_id: str
    exam_id: str
    if_topic_mastered: str
    score_now: float
    score_if_mastered: float
    delta: float


class PortfolioBucket(BaseModel):
    """One yield-bucket (High / Medium / Low) in the portfolio view."""

    bucket: str
    current_mastery_share: float
    optimal_share: float
    delta: float


class PortfolioResponse(BaseModel):
    user_id: str
    exam_id: str
    buckets: list[PortfolioBucket]
    reallocation_hint: str
