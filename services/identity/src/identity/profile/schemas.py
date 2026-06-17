"""Pydantic models aligned with openapi/phase1.yaml — /profile/* endpoints."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


Locale = Literal["en-IN", "hi-IN", "en-US"]
Language = Literal["en", "hi", "hinglish"]
# F2b — DIAGNOSTIC_DONE sits between EXAM_SELECTED and ONBOARDED when
# the student's tenant has require_onboarding_diagnostic=true.
# Consumer-tier tenants (default) transition EXAM_SELECTED → ONBOARDED
# directly; the diagnostic still runs lazily on first /practice visit.
OnboardingState = Literal[
    "NEW", "EXAM_SELECTED", "DIAGNOSTIC_DONE", "ONBOARDED"
]


class ExamSelection(BaseModel):
    examId: str
    targetDate: date | None = None
    # Phase 7 — per-pool picks: {poolCode: [subjectId]}. None for
    # exams without pools or pre-P7 selections that haven't been
    # asked. Validated server-side against pick_min / pick_max.
    options: dict[str, list[str]] | None = None


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


class InternalProfile(BaseModel):
    """Service-to-service shape — superset of UserIdentity that exposes the
    bits other services need (daily goal, language, notification mute prefs)
    without leaking those to JWT-authenticated client code that goes through
    /profile/me."""

    id: str
    email: str
    firstName: str
    lastName: str
    role: str
    tenantId: str | None = None
    onboardingState: OnboardingState
    language: Language = "en"
    dailyGoalMinutes: int | None = None
    notificationPrefs: dict[str, bool] = {}


class Profile(BaseModel):
    user: UserIdentity
    avatarUrl: str | None = None
    preferences: Preferences
    exams: list[ExamSelection]
    # Per-notification-type mute map. Key = notification type
    # (e.g., "streak.milestone"), value = enabled? Missing keys mean
    # enabled by default so new notification types ship unmuted.
    notificationPrefs: dict[str, bool] = {}


class NotificationPrefsPatch(BaseModel):
    """Merge-update — only types you include get changed; others retained.
    Send {"streak.milestone": false} to mute, {"streak.milestone": true} to
    re-enable. Use POST /profile/notification-prefs."""

    prefs: dict[str, bool]


class ProfileUpdate(BaseModel):
    firstName: str | None = Field(default=None, min_length=1, max_length=60)
    lastName: str | None = Field(default=None, min_length=1, max_length=60)
    phone: str | None = None  # stored at Auth, pass-through placeholder


class AvatarUpdate(BaseModel):
    """Base64 data URL — clients are expected to downscale to ~256x256
    before submit so the row doesn't bloat. Cap of 400KB matches a JPEG
    quality 0.85 at that size. Empty avatarUrl is rejected; use DELETE
    /profile/me/avatar to clear."""

    avatarUrl: str = Field(min_length=20, max_length=400_000)


class ExamPutRequest(BaseModel):
    examId: str


class ExamPatchRequest(BaseModel):
    targetDate: date | None = None
    # Phase 7 — set the per-pool picks. Pass `null` to clear; omit
    # to leave existing picks unchanged. Shape: {poolCode: [subjectId]}.
    options: dict[str, list[str]] | None = None


class PreferencesPatch(BaseModel):
    language: Language | None = None
    dailyGoalMinutes: int | None = Field(default=None, ge=5, le=240)


class GoalsPatch(BaseModel):
    """Sprint 30 (P4-S30) — exam-prep target goals.

    All fields optional; the route accepts any subset and persists the
    partial update.
    """

    targetExamId: str | None = None
    targetExamDate: date | None = None
    targetRank: int | None = Field(default=None, ge=1, le=10_000_000)


class BookmarkCreate(BaseModel):
    questionId: str
    topicId: str | None = None
    topicTitle: str | None = Field(default=None, max_length=200)
    stem: str | None = Field(default=None, max_length=4000)
    note: str | None = Field(default=None, max_length=500)


class Bookmark(BaseModel):
    userId: str
    questionId: str
    topicId: str | None
    topicTitle: str | None
    stem: str | None
    note: str | None
    createdAt: object  # datetime → ISO via Pydantic v2 default serialization


class BookmarkList(BaseModel):
    items: list[Bookmark]


class MockAttemptCreate(BaseModel):
    """Service-to-service: adaptive-engine calls this after /adaptive/mock/score
    so the result becomes durable, queryable history. Sections is the
    summarised section breakdown (name + correct/wrong/unanswered/total) that
    the result page already renders."""

    userId: str
    mockId: str | None = None
    examCode: str
    examName: str | None = None
    rawScore: int
    maxMarks: int
    accuracy: float
    totalQuestions: int
    nCorrect: int
    nWrong: int
    nUnanswered: int
    percentile: float | None = None
    projectedRank: int | None = None
    confidence: str | None = None
    sections: list[dict] = Field(default_factory=list)


class MockAttempt(BaseModel):
    id: str
    mockId: str | None
    examCode: str
    examName: str | None
    rawScore: int
    maxMarks: int
    accuracy: float
    totalQuestions: int
    nCorrect: int
    nWrong: int
    nUnanswered: int
    percentile: float | None
    projectedRank: int | None
    confidence: str | None
    sections: list[dict]
    createdAt: object


class MockAttemptList(BaseModel):
    items: list[MockAttempt]


class AchievementGrant(BaseModel):
    """Service-to-service: analytics / adaptive-engine call this when a
    student crosses a milestone. UNIQUE (user_id, kind) means re-emit is
    safe; first-write wins."""

    userId: str
    kind: str = Field(min_length=1, max_length=64)
    payload: dict = Field(default_factory=dict)


class Achievement(BaseModel):
    id: str
    kind: str
    payload: dict
    awardedAt: object


class AchievementList(BaseModel):
    items: list[Achievement]


FeedbackKind = Literal["WRONG_ANSWER", "AMBIGUOUS", "TYPO", "OTHER"]


class QuestionFeedbackCreate(BaseModel):
    questionId: str
    kind: FeedbackKind
    note: str | None = Field(default=None, max_length=500)


class QuestionFeedback(BaseModel):
    id: str
    questionId: str
    kind: FeedbackKind
    note: str | None
    createdAt: object


class Problem(BaseModel):
    code: str
    message: str
