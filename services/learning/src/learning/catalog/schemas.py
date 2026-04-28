"""Pydantic models for /catalog/* — matches openapi/phase1.yaml."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class Exam(BaseModel):
    id: str
    code: str
    name: str
    subtitle: str | None = None
    iconKey: str | None = None


class Subject(BaseModel):
    id: str
    examId: str
    name: str
    topicCount: int = 0


class Topic(BaseModel):
    id: str
    subjectId: str
    title: str
    titleHi: str | None = None
    questionCount: int = 0
    tier: Literal["FREE", "PREMIUM"] = "FREE"
    mastery: float | None = None


class TopicDetail(Topic):
    description: str | None = None
    objectives: list[str] = []
    prerequisites: list[dict[str, str]] = []


class Problem(BaseModel):
    code: str
    message: str


class EducatorAssignment(BaseModel):
    id: str
    educatorId: str
    examId: str
    subjectId: str | None = None
    createdAt: str
    createdBy: str | None = None


class CreateAssignmentRequest(BaseModel):
    examId: str
    subjectId: str | None = None
