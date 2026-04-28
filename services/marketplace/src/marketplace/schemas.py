"""Pydantic DTOs for marketplace endpoints.

Field naming is camelCase on the wire (matches the rest of the stack
where the FastAPI by_alias generator turns snake_case Python into
camelCase JSON via Pydantic's `Field(alias=...)` pattern). For brevity
this sprint uses camelCase names directly on Pydantic fields — same
contract, less ceremony.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# Pricing band per ADR-0008. Hardcoded for P3-S1; flag-driven in P3-S6+.
HOURLY_FLOOR_PAISE = 10000  # ₹100
HOURLY_CEILING_PAISE = 500000  # ₹5,000


QualKind = Literal["DEGREE", "CERTIFICATE", "EXAM_RANK", "TEACHING_EXPERIENCE"]


class QualificationIn(BaseModel):
    kind: QualKind
    title: str = Field(min_length=1, max_length=200)
    institution: str | None = Field(default=None, max_length=200)
    yearCompleted: int | None = Field(default=None, ge=1950, le=2100)


class QualificationOut(QualificationIn):
    id: str


class AvailabilityIn(BaseModel):
    dayOfWeek: int = Field(ge=0, le=6)
    startMinute: int = Field(ge=0, lt=1440)
    endMinute: int = Field(gt=0, le=1440)


class AvailabilityOut(AvailabilityIn):
    id: str


class TutorApplyIn(BaseModel):
    displayName: str = Field(min_length=1, max_length=120)
    headline: str = Field(min_length=1, max_length=240)
    bio: str = Field(default="", max_length=4000)
    hourlyRatePaise: int = Field(
        ge=HOURLY_FLOOR_PAISE,
        le=HOURLY_CEILING_PAISE,
        description="Rate in paise per hour. STANDARD-tier band: 10000–500000 (₹100–₹5,000).",
    )
    qualifications: list[QualificationIn] = Field(default_factory=list)
    availability: list[AvailabilityIn] = Field(default_factory=list)
    topicIds: list[str] = Field(default_factory=list)


class TutorPatchIn(BaseModel):
    headline: str | None = Field(default=None, min_length=1, max_length=240)
    bio: str | None = Field(default=None, max_length=4000)
    hourlyRatePaise: int | None = Field(
        default=None, ge=HOURLY_FLOOR_PAISE, le=HOURLY_CEILING_PAISE,
    )
    availability: list[AvailabilityIn] | None = None
    topicIds: list[str] | None = None


class TutorProfileOut(BaseModel):
    userId: str
    displayName: str
    headline: str
    bio: str
    hourlyRatePaise: int
    tier: str
    applicationStatus: str
    kycStatus: str | None
    qualifications: list[QualificationOut]
    availability: list[AvailabilityOut]
    topicIds: list[str]
    appliedAt: str
    approvedAt: str | None


class KycStartOut(BaseModel):
    sessionId: str
    redirectUrl: str | None = None


class KycPollOut(BaseModel):
    sessionId: str
    status: Literal["pending", "verified", "rejected"]
    applicationStatus: str


class TutorListingItem(BaseModel):
    """Lighter shape for the listing endpoint (no qualifications / bio)."""

    userId: str
    displayName: str
    headline: str
    hourlyRatePaise: int
    tier: str
    topicIds: list[str]


class TutorListingOut(BaseModel):
    items: list[TutorListingItem]
    total: int
    page: int
    perPage: int


class AdminRejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class Problem(BaseModel):
    code: str
    message: str


# ===========================================================================
# Sprint 17 — booking + session DTOs
# ===========================================================================


from datetime import datetime  # noqa: E402  (placed here to keep S16 + S17 sections distinct)


class CreateBookingIn(BaseModel):
    tutorUserId: str
    slotStart: datetime
    slotEnd: datetime


class BookingOut(BaseModel):
    id: str
    studentUserId: str
    tutorUserId: str
    slotStart: str
    slotEnd: str
    pricePaise: int
    commissionPaise: int
    status: str
    stripePaymentIntentId: str | None
    dailyRoomUrl: str | None
    createdAt: str


class BookingListOut(BaseModel):
    items: list[BookingOut]


class ConfirmPaymentIn(BaseModel):
    # In live mode the client provides the Stripe-confirmed intent id; in
    # stub mode this is optional and the backend just flips status.
    paymentIntentId: str | None = None
    forceFailure: bool = False  # stub-only — for testing the failure branch


class NoShowIn(BaseModel):
    whom: Literal["student", "tutor"]


class CancelIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class AvailabilitySlotOut(BaseModel):
    slotStart: str
    slotEnd: str


class AvailabilityListOut(BaseModel):
    tutorUserId: str
    date: str
    slots: list[AvailabilitySlotOut]


class AdminQueueItem(BaseModel):
    userId: str
    displayName: str
    headline: str
    hourlyRatePaise: int
    applicationStatus: str
    appliedAt: str
    kycStatus: str | None


class AdminQueueOut(BaseModel):
    items: list[AdminQueueItem]


class AdminActionOut(BaseModel):
    id: str
    adminUserId: str
    tutorUserId: str
    action: str
    reason: str | None
    createdAt: str


class AdminActionListOut(BaseModel):
    items: list[AdminActionOut]
