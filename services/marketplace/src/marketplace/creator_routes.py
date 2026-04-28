"""Creator + course + ratings endpoints — Sprint 18.

Three routers:
  - creator_router  — creator profile + KYC + admin moderation
  - course_router   — course CRUD + publishing FSM + purchase flow
  - rating_router   — tutor session + course ratings (read + write)
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError

from marketplace import (
    course_state,
    creator_state,
    repositories as repo,
    stripe_connect,
    stripe_identity,
)
from marketplace.db import sessionmaker
from marketplace.schemas import (
    AdminQueueItem,
    AdminQueueOut,
    AdminRejectIn,
    CourseCreateIn,
    CourseListingItem,
    CourseListingOut,
    CourseOut,
    CoursePatchIn,
    CreatorApplyIn,
    CreatorPatchIn,
    CreatorProfileOut,
    KycPollOut,
    KycStartOut,
    Problem,
    PurchaseListOut,
    PurchaseOut,
    RateBookingIn,
    RateCourseIn,
    RatingAggregateOut,
    RatingOut,
)
from marketplace.security import Principal, require_admin, require_user

creator_router = APIRouter()
course_router = APIRouter()
rating_router = APIRouter()


def _problem(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status, detail=Problem(code=code, message=message).model_dump()
    )


def _to_iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


# -- creator profile --------------------------------------------------------


def _creator_out(row: dict) -> CreatorProfileOut:
    return CreatorProfileOut(
        userId=str(row["user_id"]),
        displayName=row["display_name"],
        headline=row["headline"],
        bio=row["bio"],
        tier=row["tier"],
        applicationStatus=row["application_status"],
        kycStatus=row.get("kyc_status"),
        appliedAt=row["applied_at"].isoformat(),
        approvedAt=_to_iso(row.get("approved_at")),
    )


@creator_router.post("/marketplace/creators/apply", response_model=CreatorProfileOut, status_code=201)
async def creator_apply(
    body: CreatorApplyIn,
    p: Annotated[Principal, Depends(require_user)],
) -> CreatorProfileOut:
    async with sessionmaker()() as session:
        existing = await repo.get_creator_profile(session, p.user_id)
        if existing is not None:
            raise _problem(
                "already_applied",
                f"You already applied as a creator (status={existing['application_status']}).",
                409,
            )
        try:
            await repo.insert_creator_profile(
                session,
                user_id=p.user_id,
                display_name=body.displayName,
                headline=body.headline,
                bio=body.bio,
            )
        except IntegrityError as e:
            await session.rollback()
            raise _problem("invalid_profile", str(e.orig), 422) from e
        await session.commit()
        prof = await repo.get_creator_profile(session, p.user_id)
        assert prof is not None
        return _creator_out(prof)


@creator_router.get("/marketplace/creators/me", response_model=CreatorProfileOut)
async def creator_me(p: Annotated[Principal, Depends(require_user)]) -> CreatorProfileOut:
    async with sessionmaker()() as session:
        prof = await repo.get_creator_profile(session, p.user_id)
        if prof is None:
            raise _problem("not_a_creator", "You have not applied as a creator.", 404)
        return _creator_out(prof)


@creator_router.patch("/marketplace/creators/me", response_model=CreatorProfileOut)
async def creator_patch(
    body: CreatorPatchIn,
    p: Annotated[Principal, Depends(require_user)],
) -> CreatorProfileOut:
    async with sessionmaker()() as session:
        prof = await repo.get_creator_profile(session, p.user_id)
        if prof is None:
            raise _problem("not_a_creator", "Apply first.", 404)
        await repo.patch_creator_profile(
            session, user_id=p.user_id, headline=body.headline, bio=body.bio
        )
        await session.commit()
        prof = await repo.get_creator_profile(session, p.user_id)
        assert prof is not None
        return _creator_out(prof)


@creator_router.post("/marketplace/creators/me/kyc/start", response_model=KycStartOut)
async def creator_kyc_start(
    p: Annotated[Principal, Depends(require_user)],
) -> KycStartOut:
    async with sessionmaker()() as session:
        prof = await repo.get_creator_profile(session, p.user_id)
        if prof is None:
            raise _problem("not_a_creator", "Apply first.", 404)
        try:
            new_state = creator_state.transition(prof["application_status"], creator_state.START_KYC)
        except creator_state.IllegalTransition as e:
            raise _problem("illegal_transition", str(e), 409) from e
        session_id = stripe_identity.start_verification(p.user_id)
        await repo.set_creator_application_status(
            session,
            user_id=p.user_id,
            status=new_state,
            kyc_status="pending",
            stripe_identity_session_id=session_id,
        )
        await session.commit()
        return KycStartOut(sessionId=session_id, redirectUrl=None)


@creator_router.post("/marketplace/creators/me/kyc/poll", response_model=KycPollOut)
async def creator_kyc_poll(
    p: Annotated[Principal, Depends(require_user)],
    force: str | None = Query(default=None),
) -> KycPollOut:
    async with sessionmaker()() as session:
        prof = await repo.get_creator_profile(session, p.user_id)
        if prof is None:
            raise _problem("not_a_creator", "Apply first.", 404)
        if not prof.get("stripe_identity_session_id"):
            raise _problem("kyc_not_started", "Call /kyc/start first.", 409)
        verification = stripe_identity.poll_verification(
            prof["stripe_identity_session_id"], force=force
        )
        if verification == "verified":
            new_state = creator_state.transition(
                prof["application_status"], creator_state.KYC_VERIFIED_ACTION
            )
            await repo.set_creator_application_status(
                session, user_id=p.user_id, status=new_state, kyc_status="verified"
            )
            await session.commit()
            return KycPollOut(
                sessionId=prof["stripe_identity_session_id"],
                status="verified",
                applicationStatus=new_state,
            )
        if verification == "rejected":
            new_state = creator_state.transition(
                prof["application_status"], creator_state.KYC_REJECTED_ACTION
            )
            await repo.set_creator_application_status(
                session, user_id=p.user_id, status=new_state, kyc_status="rejected"
            )
            await session.commit()
            return KycPollOut(
                sessionId=prof["stripe_identity_session_id"],
                status="rejected",
                applicationStatus=new_state,
            )
        return KycPollOut(
            sessionId=prof["stripe_identity_session_id"],
            status="pending",
            applicationStatus=prof["application_status"],
        )


@creator_router.post("/marketplace/creators/me/activate", response_model=CreatorProfileOut)
async def creator_activate(
    p: Annotated[Principal, Depends(require_user)],
) -> CreatorProfileOut:
    async with sessionmaker()() as session:
        prof = await repo.get_creator_profile(session, p.user_id)
        if prof is None:
            raise _problem("not_a_creator", "Apply first.", 404)
        try:
            new_state = creator_state.transition(prof["application_status"], creator_state.ACTIVATE)
        except creator_state.IllegalTransition as e:
            raise _problem("illegal_transition", str(e), 409) from e
        await repo.set_creator_application_status(
            session, user_id=p.user_id, status=new_state
        )
        await session.commit()
        prof = await repo.get_creator_profile(session, p.user_id)
        assert prof is not None
        return _creator_out(prof)


# -- creator admin moderation -----------------------------------------------


@creator_router.get("/marketplace/admin/creators/queue", response_model=AdminQueueOut)
async def creator_admin_queue(
    _admin: Annotated[Principal, Depends(require_admin)],
    status: str = Query(default="KYC_VERIFIED"),
) -> AdminQueueOut:
    async with sessionmaker()() as session:
        rows = await repo.list_creator_admin_queue(session, status=status)
        return AdminQueueOut(
            items=[
                AdminQueueItem(
                    userId=str(r["user_id"]),
                    displayName=r["display_name"],
                    headline=r["headline"],
                    hourlyRatePaise=0,  # creators don't have hourly_rate; UI hides
                    applicationStatus=r["application_status"],
                    appliedAt=r["applied_at"].isoformat(),
                    kycStatus=r.get("kyc_status"),
                )
                for r in rows
            ]
        )


@creator_router.post("/marketplace/admin/creators/{user_id}/approve", response_model=CreatorProfileOut)
async def creator_admin_approve(
    user_id: str,
    admin: Annotated[Principal, Depends(require_admin)],
) -> CreatorProfileOut:
    async with sessionmaker()() as session:
        prof = await repo.get_creator_profile(session, user_id)
        if prof is None:
            raise _problem("not_found", "No creator with that user_id.", 404)
        try:
            new_state = creator_state.transition(prof["application_status"], creator_state.ADMIN_APPROVE)
        except creator_state.IllegalTransition as e:
            raise _problem("illegal_transition", str(e), 409) from e
        await repo.set_creator_application_status(
            session, user_id=user_id, status=new_state, approved=True
        )
        await repo.insert_admin_action(
            session,
            admin_user_id=admin.user_id,
            tutor_user_id=user_id,  # we reuse the tutor_admin_actions table
            action="CREATOR_APPROVE",
        )
        await session.commit()
        prof = await repo.get_creator_profile(session, user_id)
        assert prof is not None
        return _creator_out(prof)


@creator_router.post("/marketplace/admin/creators/{user_id}/reject", response_model=CreatorProfileOut)
async def creator_admin_reject(
    user_id: str,
    body: AdminRejectIn,
    admin: Annotated[Principal, Depends(require_admin)],
) -> CreatorProfileOut:
    async with sessionmaker()() as session:
        prof = await repo.get_creator_profile(session, user_id)
        if prof is None:
            raise _problem("not_found", "No creator with that user_id.", 404)
        try:
            new_state = creator_state.transition(prof["application_status"], creator_state.ADMIN_REJECT)
        except creator_state.IllegalTransition as e:
            raise _problem("illegal_transition", str(e), 409) from e
        await repo.set_creator_application_status(
            session, user_id=user_id, status=new_state
        )
        await repo.insert_admin_action(
            session,
            admin_user_id=admin.user_id,
            tutor_user_id=user_id,
            action="CREATOR_REJECT",
            reason=body.reason,
        )
        await session.commit()
        prof = await repo.get_creator_profile(session, user_id)
        assert prof is not None
        return _creator_out(prof)


# -- course CRUD + FSM -----------------------------------------------------


def _course_out(row: dict) -> CourseOut:
    topic_ids = row.get("topic_ids") or []
    if isinstance(topic_ids, str):
        topic_ids = json.loads(topic_ids)
    return CourseOut(
        id=str(row["id"]),
        creatorUserId=str(row["creator_user_id"]),
        title=row["title"],
        description=row["description"],
        contentMd=row.get("content_md", ""),
        pricePaise=int(row["price_paise"]),
        tier=row["tier"],
        status=row["status"],
        coverImageUrl=row.get("cover_image_url"),
        examId=str(row["exam_id"]) if row.get("exam_id") else None,
        subjectId=str(row["subject_id"]) if row.get("subject_id") else None,
        topicIds=[str(t) for t in topic_ids],
        createdAt=row["created_at"].isoformat(),
        publishedAt=_to_iso(row.get("published_at")),
        updatedAt=row["updated_at"].isoformat(),
    )


@course_router.post("/marketplace/courses", response_model=CourseOut, status_code=201)
async def create_course(
    body: CourseCreateIn,
    p: Annotated[Principal, Depends(require_user)],
) -> CourseOut:
    async with sessionmaker()() as session:
        creator = await repo.get_creator_profile(session, p.user_id)
        if creator is None or not creator_state.can_publish_courses(creator["application_status"]):
            raise _problem(
                "creator_not_active",
                "You must be an ACTIVE creator to author courses.",
                403,
            )
        if body.tier != "FREE" and not (4900 <= body.pricePaise <= 499900):
            raise _problem(
                "price_band",
                "Non-FREE courses must be priced ₹49–₹4,999 (4900–499900 paise).",
                422,
            )
        if body.tier == "FREE" and body.pricePaise != 0:
            raise _problem(
                "price_band",
                "FREE-tier courses must be priced 0 paise.",
                422,
            )
        course_id = str(uuid.uuid4())
        try:
            await repo.insert_course(
                session,
                course_id=course_id,
                creator_user_id=p.user_id,
                title=body.title,
                description=body.description,
                content_md=body.contentMd,
                price_paise=body.pricePaise,
                tier=body.tier,
                cover_image_url=body.coverImageUrl,
                exam_id=body.examId,
                subject_id=body.subjectId,
                topic_ids=body.topicIds,
            )
        except IntegrityError as e:
            await session.rollback()
            raise _problem("invalid_course", str(e.orig), 422) from e
        await session.commit()
        row = await repo.get_course(session, course_id)
        assert row is not None
        return _course_out(row)


@course_router.patch("/marketplace/courses/{course_id}", response_model=CourseOut)
async def patch_course(
    course_id: str,
    body: CoursePatchIn,
    p: Annotated[Principal, Depends(require_user)],
) -> CourseOut:
    async with sessionmaker()() as session:
        row = await repo.get_course(session, course_id)
        if row is None:
            raise _problem("not_found", "Course not found.", 404)
        if str(row["creator_user_id"]) != p.user_id and p.role != "PLATFORM_ADMIN":
            raise _problem("forbidden", "Only the creator can edit this course.", 403)
        # content_md edits are only allowed in DRAFT (per ADR design note).
        if body.contentMd is not None and not course_state.can_edit_content(row["status"]):
            raise _problem(
                "content_locked",
                f"Course is in state {row['status']}; content cannot be edited. RETIRE first.",
                409,
            )
        try:
            await repo.patch_course(
                session,
                course_id=course_id,
                title=body.title,
                description=body.description,
                content_md=body.contentMd,
                price_paise=body.pricePaise,
                cover_image_url=body.coverImageUrl,
                exam_id=body.examId,
                subject_id=body.subjectId,
                topic_ids=body.topicIds,
            )
        except IntegrityError as e:
            await session.rollback()
            raise _problem("invalid_course", str(e.orig), 422) from e
        await session.commit()
        row = await repo.get_course(session, course_id)
        assert row is not None
        return _course_out(row)


@course_router.post("/marketplace/courses/{course_id}/submit-for-review", response_model=CourseOut)
async def submit_for_review(
    course_id: str,
    p: Annotated[Principal, Depends(require_user)],
) -> CourseOut:
    async with sessionmaker()() as session:
        row = await repo.get_course(session, course_id)
        if row is None:
            raise _problem("not_found", "Course not found.", 404)
        if str(row["creator_user_id"]) != p.user_id:
            raise _problem("forbidden", "Only the creator can submit for review.", 403)
        try:
            new_state = course_state.transition(row["status"], course_state.SUBMIT_FOR_REVIEW)
        except course_state.IllegalTransition as e:
            raise _problem("illegal_transition", str(e), 409) from e
        await repo.set_course_status(session, course_id=course_id, status=new_state)
        await session.commit()
        row = await repo.get_course(session, course_id)
        assert row is not None
        return _course_out(row)


@course_router.post("/marketplace/admin/courses/{course_id}/approve", response_model=CourseOut)
async def admin_approve_course(
    course_id: str,
    admin: Annotated[Principal, Depends(require_admin)],
) -> CourseOut:
    async with sessionmaker()() as session:
        row = await repo.get_course(session, course_id)
        if row is None:
            raise _problem("not_found", "Course not found.", 404)
        try:
            new_state = course_state.transition(row["status"], course_state.ADMIN_APPROVE)
        except course_state.IllegalTransition as e:
            raise _problem("illegal_transition", str(e), 409) from e
        await repo.set_course_status(
            session, course_id=course_id, status=new_state, published=True
        )
        await repo.insert_admin_action(
            session,
            admin_user_id=admin.user_id,
            tutor_user_id=str(row["creator_user_id"]),
            action="COURSE_APPROVE",
        )
        await session.commit()
        row = await repo.get_course(session, course_id)
        assert row is not None
        return _course_out(row)


@course_router.post("/marketplace/admin/courses/{course_id}/reject", response_model=CourseOut)
async def admin_reject_course(
    course_id: str,
    body: AdminRejectIn,
    admin: Annotated[Principal, Depends(require_admin)],
) -> CourseOut:
    async with sessionmaker()() as session:
        row = await repo.get_course(session, course_id)
        if row is None:
            raise _problem("not_found", "Course not found.", 404)
        try:
            new_state = course_state.transition(row["status"], course_state.ADMIN_REJECT)
        except course_state.IllegalTransition as e:
            raise _problem("illegal_transition", str(e), 409) from e
        await repo.set_course_status(session, course_id=course_id, status=new_state)
        await repo.insert_admin_action(
            session,
            admin_user_id=admin.user_id,
            tutor_user_id=str(row["creator_user_id"]),
            action="COURSE_REJECT",
            reason=body.reason,
        )
        await session.commit()
        row = await repo.get_course(session, course_id)
        assert row is not None
        return _course_out(row)


@course_router.post("/marketplace/courses/{course_id}/retire", response_model=CourseOut)
async def retire_course(
    course_id: str,
    p: Annotated[Principal, Depends(require_user)],
) -> CourseOut:
    async with sessionmaker()() as session:
        row = await repo.get_course(session, course_id)
        if row is None:
            raise _problem("not_found", "Course not found.", 404)
        if str(row["creator_user_id"]) != p.user_id and p.role != "PLATFORM_ADMIN":
            raise _problem("forbidden", "Only the creator can retire.", 403)
        try:
            new_state = course_state.transition(row["status"], course_state.RETIRE)
        except course_state.IllegalTransition as e:
            raise _problem("illegal_transition", str(e), 409) from e
        await repo.set_course_status(session, course_id=course_id, status=new_state)
        await session.commit()
        row = await repo.get_course(session, course_id)
        assert row is not None
        return _course_out(row)


# -- course discovery + purchase -------------------------------------------


@course_router.get("/marketplace/courses", response_model=CourseListingOut)
async def list_courses(
    exam_id: str | None = Query(default=None, alias="examId"),
    subject_id: str | None = Query(default=None, alias="subjectId"),
    creator_id: str | None = Query(default=None, alias="creatorId"),
    max_paise: int | None = Query(default=None, ge=0, alias="maxPricePaise"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=50, alias="perPage"),
) -> CourseListingOut:
    async with sessionmaker()() as session:
        items, total = await repo.list_published_courses(
            session,
            exam_id=exam_id,
            subject_id=subject_id,
            creator_id=creator_id,
            max_paise=max_paise,
            page=page,
            per_page=per_page,
        )
        return CourseListingOut(
            items=[
                CourseListingItem(
                    id=str(it["id"]),
                    creatorUserId=str(it["creator_user_id"]),
                    title=it["title"],
                    description=(it["description"] or "")[:280],
                    pricePaise=int(it["price_paise"]),
                    tier=it["tier"],
                    coverImageUrl=it.get("cover_image_url"),
                    ratingAvg=float(it.get("rating_avg") or 0.0),
                    ratingCount=int(it.get("rating_count") or 0),
                )
                for it in items
            ],
            total=total,
            page=page,
            perPage=per_page,
        )


@course_router.get("/marketplace/courses/{course_id}", response_model=CourseOut)
async def get_course_route(
    course_id: str,
    p: Annotated[Principal | None, Depends(require_user)] = None,  # noqa: B008
) -> CourseOut:
    async with sessionmaker()() as session:
        row = await repo.get_course(session, course_id)
        if row is None:
            raise _problem("not_found", "Course not found.", 404)
        if row["status"] != "PUBLISHED":
            # Only the creator + admin can fetch non-PUBLISHED course.
            if not p or (str(row["creator_user_id"]) != p.user_id and p.role != "PLATFORM_ADMIN"):
                raise _problem("not_found", "Course not found.", 404)
        # Truncate content_md unless the caller has purchased it (or is the creator/admin).
        if p is None or (
            str(row["creator_user_id"]) != p.user_id
            and p.role != "PLATFORM_ADMIN"
        ):
            preview = (row.get("content_md") or "")[:500]
            row = {**row, "content_md": preview}
        return _course_out(row)


@course_router.get("/marketplace/creators/me/courses", response_model=list[CourseOut])
async def list_my_courses(
    p: Annotated[Principal, Depends(require_user)],
) -> list[CourseOut]:
    async with sessionmaker()() as session:
        rows = await repo.list_creator_courses(session, p.user_id)
        return [_course_out(r) for r in rows]


@course_router.post("/marketplace/courses/{course_id}/purchase", response_model=PurchaseOut, status_code=201)
async def purchase_course(
    course_id: str,
    p: Annotated[Principal, Depends(require_user)],
) -> PurchaseOut:
    async with sessionmaker()() as session:
        course = await repo.get_course(session, course_id)
        if course is None or not course_state.is_purchasable(course["status"]):
            raise _problem("not_purchasable", "Course not available for purchase.", 404)
        if str(course["creator_user_id"]) == p.user_id:
            raise _problem("self_purchase", "Creators cannot purchase their own course.", 422)
        if await repo.get_paid_purchase(
            session, student_user_id=p.user_id, course_id=course_id
        ):
            raise _problem("already_purchased", "You already own this course.", 409)
        price = int(course["price_paise"])
        # Look up creator commission override
        creator = await repo.get_creator_profile(session, str(course["creator_user_id"]))
        commission_paise, _ = stripe_connect.commission_split(
            price, override_rate=creator.get("commission_rate_override") if creator else None
        )
        purchase_id = str(uuid.uuid4())
        intent_id = stripe_connect.create_payment_intent(purchase_id, price)
        try:
            await repo.insert_purchase(
                session,
                purchase_id=purchase_id,
                student_user_id=p.user_id,
                course_id=course_id,
                price_paise=price,
                commission_paise=commission_paise,
                stripe_payment_intent_id=intent_id,
            )
        except IntegrityError as e:
            await session.rollback()
            raise _problem("invalid_purchase", str(e.orig), 422) from e
        await session.commit()
        row = await repo.get_purchase(session, purchase_id)
        assert row is not None
        return _purchase_out(row)


@course_router.post(
    "/marketplace/courses/{course_id}/purchase/{purchase_id}/confirm-payment",
    response_model=PurchaseOut,
)
async def confirm_course_payment(
    course_id: str,
    purchase_id: str,
    p: Annotated[Principal, Depends(require_user)],
    force_failure: bool = Query(default=False, alias="forceFailure"),
) -> PurchaseOut:
    async with sessionmaker()() as session:
        row = await repo.get_purchase(session, purchase_id)
        if row is None or str(row["course_id"]) != course_id:
            raise _problem("not_found", "Purchase not found.", 404)
        if str(row["student_user_id"]) != p.user_id:
            raise _problem("forbidden", "Only the buyer can confirm.", 403)
        if row["status"] != "PENDING_PAYMENT":
            raise _problem("already_processed", f"Already in state {row['status']}.", 409)
        force = "failed" if force_failure else None
        result = stripe_connect.confirm_payment_intent(
            row["stripe_payment_intent_id"], force=force
        )
        if result == "succeeded":
            await repo.set_purchase_status(
                session, purchase_id=purchase_id, status="PAID", paid=True
            )
        elif result == "failed":
            # No FSM here — just mark refunded as the failure terminal.
            await repo.set_purchase_status(
                session, purchase_id=purchase_id, status="REFUNDED"
            )
        else:
            raise _problem("payment_pending", "Try again.", 202)
        await session.commit()
        row = await repo.get_purchase(session, purchase_id)
        assert row is not None
        return _purchase_out(row)


@course_router.get("/marketplace/purchases/me", response_model=PurchaseListOut)
async def my_purchases(p: Annotated[Principal, Depends(require_user)]) -> PurchaseListOut:
    async with sessionmaker()() as session:
        rows = await repo.list_student_purchases(session, p.user_id)
        return PurchaseListOut(items=[_purchase_out(r) for r in rows])


@course_router.get("/marketplace/purchases/me/{course_id}/access", response_model=CourseOut)
async def access_purchased_course(
    course_id: str,
    p: Annotated[Principal, Depends(require_user)],
) -> CourseOut:
    async with sessionmaker()() as session:
        purchase = await repo.get_paid_purchase(
            session, student_user_id=p.user_id, course_id=course_id
        )
        if purchase is None:
            raise _problem("not_purchased", "You have not purchased this course.", 403)
        course = await repo.get_course(session, course_id)
        if course is None:
            raise _problem("not_found", "Course not found.", 404)
        return _course_out(course)


def _purchase_out(row: dict) -> PurchaseOut:
    return PurchaseOut(
        id=str(row["id"]),
        studentUserId=str(row["student_user_id"]),
        courseId=str(row["course_id"]),
        pricePaise=int(row["price_paise"]),
        commissionPaise=int(row.get("commission_paise") or 0),
        status=row["status"],
        stripePaymentIntentId=row.get("stripe_payment_intent_id"),
        purchasedAt=_to_iso(row.get("purchased_at")),
        createdAt=row["created_at"].isoformat(),
    )


# -- ratings ---------------------------------------------------------------


def _rating_out(row: dict) -> RatingOut:
    return RatingOut(
        id=str(row["id"]),
        stars=int(row["stars"]),
        comment=row.get("comment"),
        createdAt=row["created_at"].isoformat(),
        studentUserId=str(row["student_user_id"]),
    )


@rating_router.post("/marketplace/bookings/{booking_id}/rating", response_model=RatingOut, status_code=201)
async def rate_booking(
    booking_id: str,
    body: RateBookingIn,
    p: Annotated[Principal, Depends(require_user)],
) -> RatingOut:
    async with sessionmaker()() as session:
        booking = await repo.get_booking(session, booking_id)
        if booking is None:
            raise _problem("not_found", "Booking not found.", 404)
        if str(booking["student_user_id"]) != p.user_id:
            raise _problem("forbidden", "Only the student can rate.", 403)
        if booking["status"] != "COMPLETED":
            raise _problem("not_completed", "Only COMPLETED bookings can be rated.", 409)
        rating_id = str(uuid.uuid4())
        try:
            await repo.insert_session_rating(
                session,
                rating_id=rating_id,
                booking_id=booking_id,
                student_user_id=p.user_id,
                tutor_user_id=str(booking["tutor_user_id"]),
                stars=body.stars,
                comment=body.comment,
            )
        except IntegrityError as e:
            await session.rollback()
            raise _problem("already_rated", "You already rated this booking.", 409) from e
        await repo.recompute_tutor_aggregate(session, str(booking["tutor_user_id"]))
        await session.commit()
        return RatingOut(
            id=rating_id,
            stars=body.stars,
            comment=body.comment,
            createdAt=datetime.utcnow().isoformat(),
            studentUserId=p.user_id,
        )


@rating_router.post("/marketplace/courses/{course_id}/rating", response_model=RatingOut, status_code=201)
async def rate_course(
    course_id: str,
    body: RateCourseIn,
    p: Annotated[Principal, Depends(require_user)],
) -> RatingOut:
    async with sessionmaker()() as session:
        purchase = await repo.get_purchase(session, body.purchaseId)
        if purchase is None:
            raise _problem("not_found", "Purchase not found.", 404)
        if str(purchase["student_user_id"]) != p.user_id:
            raise _problem("forbidden", "Not your purchase.", 403)
        if str(purchase["course_id"]) != course_id:
            raise _problem("mismatched", "Purchase is for a different course.", 422)
        if purchase["status"] != "PAID":
            raise _problem("not_paid", "Purchase is not in PAID state.", 409)
        rating_id = str(uuid.uuid4())
        try:
            await repo.insert_course_rating(
                session,
                rating_id=rating_id,
                purchase_id=body.purchaseId,
                course_id=course_id,
                student_user_id=p.user_id,
                stars=body.stars,
                comment=body.comment,
            )
        except IntegrityError as e:
            await session.rollback()
            raise _problem("already_rated", "You already rated this course.", 409) from e
        await repo.recompute_course_aggregate(session, course_id)
        await session.commit()
        return RatingOut(
            id=rating_id,
            stars=body.stars,
            comment=body.comment,
            createdAt=datetime.utcnow().isoformat(),
            studentUserId=p.user_id,
        )


@rating_router.get("/marketplace/tutors/{user_id}/ratings", response_model=RatingAggregateOut)
async def tutor_ratings(user_id: str) -> RatingAggregateOut:
    async with sessionmaker()() as session:
        agg = await repo.aggregate_tutor_ratings(session, user_id)
        return RatingAggregateOut(
            targetId=user_id,
            averageStars=round(agg["avg"], 2),
            count=agg["count"],
            recent=[_rating_out(r) for r in agg["recent"]],
        )


@rating_router.get("/marketplace/courses/{course_id}/ratings", response_model=RatingAggregateOut)
async def course_ratings(course_id: str) -> RatingAggregateOut:
    async with sessionmaker()() as session:
        agg = await repo.aggregate_course_ratings(session, course_id)
        return RatingAggregateOut(
            targetId=course_id,
            averageStars=round(agg["avg"], 2),
            count=agg["count"],
            recent=[_rating_out(r) for r in agg["recent"]],
        )
