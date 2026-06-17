"""Pydantic models for /content/* endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class QuestionCreate(BaseModel):
    topicId: str
    stem: str = Field(min_length=8, max_length=2000)
    choices: list[str] = Field(min_length=2, max_length=8)
    correctIdx: int = Field(ge=0)
    difficultyB: float = Field(default=0.0, ge=-4.0, le=4.0)
    # IRT calibration — defaults match Quiz's 2PL fallback. Authors with
    # calibration data set these explicitly; the Adaptive Engine validates
    # the same ranges (a > 0, 0 ≤ c < 1).
    discriminationA: float = Field(default=1.0, gt=0, le=4.0)
    guessingC: float = Field(default=0.0, ge=0.0, lt=1.0)
    language: Literal["en", "hi"] = "en"
    # Optional teaching note shown alongside the correct answer in QuizResult.
    # When omitted, the UI falls back to /adaptive/explain to generate one on demand.
    explanation: str | None = Field(default=None, max_length=4000)
    # Sprint 24 (P4-S24) — PYQ metadata. Optional. paperSession format per
    # ADR-0012: <EXAM>-<SESSION>-<YEAR>-<SUB-SESSION>-<SHIFT> (e.g.
    # JEE-MAIN-2024-JAN-S1).
    examYear: int | None = Field(default=None, ge=1990, le=2100)
    paperSession: str | None = Field(default=None, max_length=120)
    pyqFlag: bool = False
    # Phase 5 (P5-S58) — polymorphic discriminator + per-type payload
    # written through the multi-type author. When omitted the row
    # behaves identically to the legacy MCQ_SINGLE creation path.
    questionType: str = "MCQ_SINGLE"
    payload: dict | None = None
    aiOrigin: dict | None = None


class QuestionDetail(BaseModel):
    id: str
    topicId: str
    stem: str
    choices: list[str]
    correctIdx: int
    difficultyB: float
    discriminationA: float
    guessingC: float
    language: str
    status: str
    explanation: str | None = None
    createdBy: str
    createdAt: datetime
    submittedAt: datetime | None = None
    reviewedBy: str | None = None
    reviewedAt: datetime | None = None
    reviewNotes: str | None = None
    # Sprint 24 (P4-S24)
    examYear: int | None = None
    paperSession: str | None = None
    pyqFlag: bool = False
    # Phase 5 (P5-S37) — polymorphic question type discriminator.
    questionType: str = "MCQ_SINGLE"


class QuestionList(BaseModel):
    items: list[QuestionDetail]
    # Phase 5 (P5-S58) — total match count regardless of pagination,
    # so the client can render "page X of Y" without extra calls.
    # Defaulted for backward-compatibility with pre-S58 callers.
    total: int = 0


class ReviewDecision(BaseModel):
    approve: bool
    notes: str | None = Field(default=None, max_length=500)


class Problem(BaseModel):
    code: str
    message: str
