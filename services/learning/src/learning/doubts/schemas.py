"""Pydantic models for /doubts/* endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class DoubtCreate(BaseModel):
    questionText: str = Field(min_length=4, max_length=4000)
    photoDataUrl: str | None = Field(default=None, max_length=8_000_000)
    topicId: str | None = None
    topicTitle: str | None = Field(default=None, max_length=200)
    # Optional initial AI answer — when posted from the AI tutor or photo
    # doubt screen, the client already has the model's reply and bundles
    # it with creation so the doubt lands in ANSWERED state in one round-trip.
    initialAiAnswer: str | None = Field(default=None, max_length=20_000)


class AnswerCreate(BaseModel):
    content: str = Field(min_length=1, max_length=20_000)
    source: Literal["expert", "ai", "peer"] = "peer"


class DoubtAnswer(BaseModel):
    id: str
    doubtId: str
    authorId: str | None
    authorRole: str
    content: str
    source: str
    createdAt: datetime
    accepted: bool


class Doubt(BaseModel):
    id: str
    userId: str
    questionText: str
    photoDataUrl: str | None
    topicId: str | None
    topicTitle: str | None
    status: str
    createdAt: datetime
    lastActivityAt: datetime
    answerCount: int = 0


class DoubtDetail(Doubt):
    answers: list[DoubtAnswer] = Field(default_factory=list)


class DoubtList(BaseModel):
    items: list[Doubt]


class Problem(BaseModel):
    code: str
    message: str
