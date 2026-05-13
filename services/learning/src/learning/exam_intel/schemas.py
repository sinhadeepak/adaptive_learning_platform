"""Pydantic schemas shared across exam_intel sub-modules.

These mirror the alembic 001 schema; keeping a single source of truth
here keeps every code path consistent.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ── Ingestion inputs ────────────────────────────────────────────────


class PastPaperQuestionIn(BaseModel):
    """A single question in an uploaded past paper. The platform
    accepts either a structured JSON upload (this schema) or a PDF
    which the ingest pipeline parses into this shape."""

    item_idx: int = Field(ge=1, le=200)
    stem: str = Field(min_length=4)
    choices: list[str] | None = None
    correct_answer: str | None = None
    question_type: str = "MCQ_SINGLE"
    marks_correct: int = 4
    marks_negative: float = 1.0


class PastPaperIn(BaseModel):
    """Uploaded paper metadata + questions."""

    exam_id: str
    year: int = Field(ge=2000, le=2099)
    session: str = ""
    paper_url: str | None = None
    duration_minutes: int | None = None
    questions: list[PastPaperQuestionIn] = Field(min_length=1)


# ── LLM tagging output ──────────────────────────────────────────────


class PastPaperTag(BaseModel):
    """Output schema for the `past_paper_tag` prompt. Bound to
    `prompts/authoring/past_paper_tag_v1.0.0.yaml`'s output_schema."""

    topic_ids: list[str] = Field(min_length=1, max_length=3)
    concept_ids: list[str] = Field(default_factory=list, max_length=5)
    bloom_level: int = Field(ge=1, le=6)
    difficulty_estimate: float = Field(ge=-3.0, le=3.0)
    question_type: str
    rationale: str = Field(min_length=10, max_length=400)
    confidence: float = Field(ge=0.0, le=1.0)


# ── Forecast outputs (what students see) ────────────────────────────


class TopicYieldRow(BaseModel):
    """One row in the topic-yield response. The student sees this
    as a "Mechanics: 78% probability, expected 16 marks (±4)" tile."""

    topic_id: str
    forecast_year: int
    p_appears: float = Field(ge=0.0, le=1.0)
    p_appears_ci_low: float
    p_appears_ci_high: float
    expected_questions: float
    expected_marks: float
    confidence: float = Field(ge=0.0, le=1.0)
    trend: Literal["rising", "stable", "falling", "volatile"]
    last_computed_at: datetime


class TopicYieldResponse(BaseModel):
    exam_id: str
    forecast_year: int
    items: list[TopicYieldRow]


# ── Internal: appearance rollup row ─────────────────────────────────


class TopicAppearance(BaseModel):
    exam_id: str
    topic_id: str
    year: int
    n_questions: int
    total_marks: int
    avg_difficulty: float | None = None


# ── Status enum ─────────────────────────────────────────────────────


PaperStatus = Literal[
    "DRAFT", "TAGGED", "REVIEWED", "PUBLISHED", "ARCHIVED"
]
