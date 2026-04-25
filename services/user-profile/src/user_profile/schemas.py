"""Pydantic models aligned with openapi/phase1.yaml — /profile/* endpoints."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


Locale = Literal["en-IN", "hi-IN", "en-US"]
Language = Literal["en", "hi", "hinglish"]
OnboardingState = Literal["NEW", "EXAM_SELECTED", "ONBOARDED"]


class ExamSelection(BaseModel):
    examId: str
    targetDate: date | None = None


class Preferences(BaseModel):
    language: Language = "en"
    dailyGoalMinutes: int | None = None


class UserIdentity(BaseModel):
    id: str
    email: str
    firstName: str
    lastName: str
    role: str
    tenantId: str | None = None
    onboardingState: OnboardingState


class Profile(BaseModel):
    user: UserIdentity
    avatarUrl: str | None = None
    preferences: Preferences
    exams: list[ExamSelection]


class ProfileUpdate(BaseModel):
    firstName: str | None = Field(default=None, min_length=1, max_length=60)
    lastName: str | None = Field(default=None, min_length=1, max_length=60)
    phone: str | None = None  # stored at Auth, pass-through placeholder


class ExamPutRequest(BaseModel):
    examId: str


class ExamPatchRequest(BaseModel):
    targetDate: date | None = None


class PreferencesPatch(BaseModel):
    language: Language | None = None
    dailyGoalMinutes: int | None = Field(default=None, ge=5, le=240)


class Problem(BaseModel):
    code: str
    message: str
