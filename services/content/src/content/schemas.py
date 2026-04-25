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
    language: Literal["en", "hi"] = "en"


class QuestionDetail(BaseModel):
    id: str
    topicId: str
    stem: str
    choices: list[str]
    correctIdx: int
    difficultyB: float
    language: str
    status: str
    createdBy: str
    createdAt: datetime
    submittedAt: datetime | None = None
    reviewedBy: str | None = None
    reviewedAt: datetime | None = None
    reviewNotes: str | None = None


class QuestionList(BaseModel):
    items: list[QuestionDetail]


class ReviewDecision(BaseModel):
    approve: bool
    notes: str | None = Field(default=None, max_length=500)


class Problem(BaseModel):
    code: str
    message: str
