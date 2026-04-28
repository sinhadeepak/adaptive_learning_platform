"""Tutor application + listing endpoints.

Sprint 16 (P3-S1): everything tutor-supply-side. Booking + Stripe Connect
in P3-S2.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError

from marketplace import repositories as repo
from marketplace import stripe_identity, tutor_state
from marketplace.db import sessionmaker
from marketplace.schemas import (
    AdminRejectIn,
    AvailabilityOut,
    KycPollOut,
    KycStartOut,
    Problem,
    QualificationOut,
    TutorApplyIn,
    TutorListingItem,
    TutorListingOut,
    TutorPatchIn,
    TutorProfileOut,
)
from marketplace.security import Principal, require_admin, require_user

router = APIRouter()


def _problem(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(status_code=http_status, detail=Problem(code=code, message=message).model_dump())


def _to_iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


async def _build_profile_out(session, profile: dict) -> TutorProfileOut:
    user_id = str(profile["user_id"])
    quals = await repo.list_qualifications(session, user_id)
    avail = await repo.list_availability(session, user_id)
    topics = await repo.list_topic_ids(session, user_id)
    return TutorProfileOut(
        userId=user_id,
        displayName=profile["display_name"],
        headline=profile["headline"],
        bio=profile["bio"],
        hourlyRatePaise=int(profile["hourly_rate_paise"]),
        tier=profile["tier"],
        applicationStatus=profile["application_status"],
        kycStatus=profile.get("kyc_status"),
        qualifications=[
            QualificationOut(
                id=str(q["id"]),
                kind=q["kind"],
                title=q["title"],
                institution=q.get("institution"),
                yearCompleted=q.get("year_completed"),
            )
            for q in quals
        ],
        availability=[
            AvailabilityOut(
                id=str(a["id"]),
                dayOfWeek=int(a["day_of_week"]),
                startMinute=int(a["start_minute"]),
                endMinute=int(a["end_minute"]),
            )
            for a in avail
        ],
        topicIds=topics,
        appliedAt=profile["applied_at"].isoformat(),
        approvedAt=_to_iso(profile.get("approved_at")),
    )


# -- tutor self-service -----------------------------------------------------


@router.post("/marketplace/tutors/apply", response_model=TutorProfileOut, status_code=201)
async def apply_as_tutor(
    body: TutorApplyIn,
    p: Annotated[Principal, Depends(require_user)],
) -> TutorProfileOut:
    async with sessionmaker()() as session:
        existing = await repo.get_profile(session, p.user_id)
        if existing is not None:
            raise _problem(
                "already_applied",
                f"You already applied as a tutor (status={existing['application_status']}). "
                "Use PATCH /marketplace/tutors/me to edit.",
                http_status=409,
            )
        try:
            await repo.insert_profile(
                session,
                user_id=p.user_id,
                display_name=body.displayName,
                headline=body.headline,
                bio=body.bio,
                hourly_rate_paise=body.hourlyRatePaise,
            )
        except IntegrityError as e:
            await session.rollback()
            raise _problem("invalid_profile", str(e.orig), http_status=422) from e
        await repo.insert_qualifications(
            session, p.user_id, [q.model_dump() for q in body.qualifications]
        )
        await repo.replace_availability(
            session, p.user_id, [a.model_dump() for a in body.availability]
        )
        await repo.replace_topics(session, p.user_id, body.topicIds)
        await session.commit()

        profile = await repo.get_profile(session, p.user_id)
        assert profile is not None
        return await _build_profile_out(session, profile)


@router.get("/marketplace/tutors/me", response_model=TutorProfileOut)
async def get_my_profile(p: Annotated[Principal, Depends(require_user)]) -> TutorProfileOut:
    async with sessionmaker()() as session:
        profile = await repo.get_profile(session, p.user_id)
        if profile is None:
            raise _problem("not_a_tutor", "You have not applied to be a tutor.", http_status=404)
        return await _build_profile_out(session, profile)


@router.patch("/marketplace/tutors/me", response_model=TutorProfileOut)
async def patch_my_profile(
    body: TutorPatchIn,
    p: Annotated[Principal, Depends(require_user)],
) -> TutorProfileOut:
    async with sessionmaker()() as session:
        profile = await repo.get_profile(session, p.user_id)
        if profile is None:
            raise _problem("not_a_tutor", "Apply first.", http_status=404)
        try:
            await repo.patch_profile(
                session,
                user_id=p.user_id,
                headline=body.headline,
                bio=body.bio,
                hourly_rate_paise=body.hourlyRatePaise,
            )
        except IntegrityError as e:
            await session.rollback()
            raise _problem("invalid_profile", str(e.orig), http_status=422) from e
        if body.availability is not None:
            await repo.replace_availability(
                session, p.user_id, [a.model_dump() for a in body.availability]
            )
        if body.topicIds is not None:
            await repo.replace_topics(session, p.user_id, body.topicIds)
        await session.commit()
        profile = await repo.get_profile(session, p.user_id)
        assert profile is not None
        return await _build_profile_out(session, profile)


@router.post("/marketplace/tutors/me/kyc/start", response_model=KycStartOut)
async def start_kyc(p: Annotated[Principal, Depends(require_user)]) -> KycStartOut:
    async with sessionmaker()() as session:
        profile = await repo.get_profile(session, p.user_id)
        if profile is None:
            raise _problem("not_a_tutor", "Apply first.", http_status=404)
        try:
            new_state = tutor_state.transition(profile["application_status"], tutor_state.START_KYC)
        except tutor_state.IllegalTransition as e:
            raise _problem(
                "illegal_transition",
                f"Cannot start KYC from {profile['application_status']}.",
                http_status=409,
            ) from e
        session_id = stripe_identity.start_verification(p.user_id)
        await repo.set_application_status(
            session,
            user_id=p.user_id,
            status=new_state,
            kyc_status="pending",
            stripe_identity_session_id=session_id,
        )
        await session.commit()
        return KycStartOut(sessionId=session_id, redirectUrl=None)


@router.post("/marketplace/tutors/me/kyc/poll", response_model=KycPollOut)
async def poll_kyc(
    p: Annotated[Principal, Depends(require_user)],
    force: str | None = Query(default=None, description="local-stub override: 'rejected' | 'pending'"),
) -> KycPollOut:
    async with sessionmaker()() as session:
        profile = await repo.get_profile(session, p.user_id)
        if profile is None:
            raise _problem("not_a_tutor", "Apply first.", http_status=404)
        if not profile.get("stripe_identity_session_id"):
            raise _problem("kyc_not_started", "Call /kyc/start first.", http_status=409)
        verification = stripe_identity.poll_verification(
            profile["stripe_identity_session_id"], force=force
        )
        if verification == "verified":
            new_state = tutor_state.transition(
                profile["application_status"], tutor_state.KYC_VERIFIED_ACTION
            )
            await repo.set_application_status(
                session, user_id=p.user_id, status=new_state, kyc_status="verified"
            )
            await session.commit()
            return KycPollOut(sessionId=profile["stripe_identity_session_id"], status="verified", applicationStatus=new_state)
        if verification == "rejected":
            new_state = tutor_state.transition(
                profile["application_status"], tutor_state.KYC_REJECTED_ACTION
            )
            await repo.set_application_status(
                session, user_id=p.user_id, status=new_state, kyc_status="rejected"
            )
            await session.commit()
            return KycPollOut(sessionId=profile["stripe_identity_session_id"], status="rejected", applicationStatus=new_state)
        # pending — no transition
        return KycPollOut(
            sessionId=profile["stripe_identity_session_id"],
            status="pending",
            applicationStatus=profile["application_status"],
        )


@router.post("/marketplace/tutors/me/activate", response_model=TutorProfileOut)
async def activate_self(p: Annotated[Principal, Depends(require_user)]) -> TutorProfileOut:
    async with sessionmaker()() as session:
        profile = await repo.get_profile(session, p.user_id)
        if profile is None:
            raise _problem("not_a_tutor", "Apply first.", http_status=404)
        try:
            new_state = tutor_state.transition(profile["application_status"], tutor_state.ACTIVATE)
        except tutor_state.IllegalTransition as e:
            raise _problem(
                "illegal_transition",
                f"Cannot activate from {profile['application_status']} (need APPROVED).",
                http_status=409,
            ) from e
        await repo.set_application_status(session, user_id=p.user_id, status=new_state)
        await session.commit()
        profile = await repo.get_profile(session, p.user_id)
        assert profile is not None
        return await _build_profile_out(session, profile)


# -- admin ------------------------------------------------------------------


@router.post("/marketplace/admin/tutors/{user_id}/approve", response_model=TutorProfileOut)
async def admin_approve(
    user_id: str,
    admin: Annotated[Principal, Depends(require_admin)],
) -> TutorProfileOut:
    async with sessionmaker()() as session:
        profile = await repo.get_profile(session, user_id)
        if profile is None:
            raise _problem("not_found", "No tutor with that user_id.", http_status=404)
        try:
            new_state = tutor_state.transition(
                profile["application_status"], tutor_state.ADMIN_APPROVE
            )
        except tutor_state.IllegalTransition as e:
            raise _problem(
                "illegal_transition",
                f"Cannot approve from {profile['application_status']} (need KYC_VERIFIED).",
                http_status=409,
            ) from e
        await repo.set_application_status(session, user_id=user_id, status=new_state, approved=True)
        await repo.insert_admin_action(
            session,
            admin_user_id=admin.user_id,
            tutor_user_id=user_id,
            action="APPROVE",
        )
        await session.commit()
        profile = await repo.get_profile(session, user_id)
        assert profile is not None
        return await _build_profile_out(session, profile)


@router.post("/marketplace/admin/tutors/{user_id}/reject", response_model=TutorProfileOut)
async def admin_reject(
    user_id: str,
    body: AdminRejectIn,
    admin: Annotated[Principal, Depends(require_admin)],
) -> TutorProfileOut:
    async with sessionmaker()() as session:
        profile = await repo.get_profile(session, user_id)
        if profile is None:
            raise _problem("not_found", "No tutor with that user_id.", http_status=404)
        try:
            new_state = tutor_state.transition(
                profile["application_status"], tutor_state.ADMIN_REJECT
            )
        except tutor_state.IllegalTransition as e:
            raise _problem(
                "illegal_transition",
                f"Cannot reject from {profile['application_status']}.",
                http_status=409,
            ) from e
        await repo.set_application_status(session, user_id=user_id, status=new_state)
        # Sprint 17: persist the rejection reason to tutor_admin_actions.
        await repo.insert_admin_action(
            session,
            admin_user_id=admin.user_id,
            tutor_user_id=user_id,
            action="REJECT",
            reason=body.reason,
        )
        await session.commit()
        profile = await repo.get_profile(session, user_id)
        assert profile is not None
        return await _build_profile_out(session, profile)


# -- public listing ---------------------------------------------------------


@router.get("/marketplace/tutors", response_model=TutorListingOut)
async def list_tutors(
    topic_id: str | None = Query(default=None, alias="topicId"),
    min_paise: int | None = Query(default=None, ge=0, alias="minHourlyPaise"),
    max_paise: int | None = Query(default=None, ge=0, alias="maxHourlyPaise"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=50, alias="perPage"),
) -> TutorListingOut:
    async with sessionmaker()() as session:
        items, total = await repo.list_active_tutors(
            session,
            topic_id=topic_id,
            min_paise=min_paise,
            max_paise=max_paise,
            page=page,
            per_page=per_page,
        )
        return TutorListingOut(
            items=[
                TutorListingItem(
                    userId=str(it["user_id"]),
                    displayName=it["display_name"],
                    headline=it["headline"],
                    hourlyRatePaise=int(it["hourly_rate_paise"]),
                    tier=it["tier"],
                    topicIds=it["topicIds"],
                )
                for it in items
            ],
            total=total,
            page=page,
            perPage=per_page,
        )


@router.get("/marketplace/tutors/{user_id}", response_model=TutorProfileOut)
async def get_tutor_public(user_id: str) -> TutorProfileOut:
    async with sessionmaker()() as session:
        profile = await repo.get_profile(session, user_id)
        if profile is None or not tutor_state.is_listable(profile["application_status"]):
            raise _problem("not_found", "Tutor not found or not active.", http_status=404)
        return await _build_profile_out(session, profile)
