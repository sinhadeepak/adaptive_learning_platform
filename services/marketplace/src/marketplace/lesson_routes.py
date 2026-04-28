"""Sprint 19 (P3-S4) — modules + lessons + earnings + moderation + refunds.

Three routers:
  - lesson_router    — module + lesson CRUD + course structure
  - earnings_router  — creator earnings dashboard
  - mod_router       — admin: rating moderation + refunds
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from marketplace import booking_state, repositories as repo, stripe_connect
from marketplace.db import sessionmaker
from marketplace.schemas import (
    CourseStructureOut,
    EarningsOut,
    HideRatingIn,
    LessonCreateIn,
    LessonOut,
    LessonPatchIn,
    ModuleCreateIn,
    ModuleOut,
    ModulePatchIn,
    ModuleWithLessons,
    Problem,
    RefundResultOut,
)
from marketplace.security import Principal, require_admin, require_user

lesson_router = APIRouter()
earnings_router = APIRouter()
mod_router = APIRouter()


def _problem(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status, detail=Problem(code=code, message=message).model_dump()
    )


# -- modules + lessons -----------------------------------------------------


def _module_out(row: dict) -> ModuleOut:
    return ModuleOut(
        id=str(row["id"]),
        courseId=str(row["course_id"]),
        position=int(row["position"]),
        title=row["title"],
        description=row.get("description"),
        createdAt=row["created_at"].isoformat(),
        updatedAt=row["updated_at"].isoformat(),
    )


def _lesson_out(row: dict, *, redact_content: bool = False) -> LessonOut:
    return LessonOut(
        id=str(row["id"]),
        moduleId=str(row["module_id"]),
        position=int(row["position"]),
        title=row["title"],
        contentMd="" if redact_content else row.get("content_md", ""),
        durationSeconds=row.get("duration_seconds"),
        createdAt=row["created_at"].isoformat(),
        updatedAt=row["updated_at"].isoformat(),
    )


async def _require_creator_owns_course(session, course_id: str, user_id: str, role: str):
    course = await repo.get_course(session, course_id)
    if course is None:
        raise _problem("not_found", "Course not found.", 404)
    if str(course["creator_user_id"]) != user_id and role != "PLATFORM_ADMIN":
        raise _problem("forbidden", "Not your course.", 403)
    return course


@lesson_router.post(
    "/marketplace/courses/{course_id}/modules", response_model=ModuleOut, status_code=201
)
async def create_module(
    course_id: str,
    body: ModuleCreateIn,
    p: Annotated[Principal, Depends(require_user)],
) -> ModuleOut:
    async with sessionmaker()() as session:
        await _require_creator_owns_course(session, course_id, p.user_id, p.role)
        module_id = str(uuid.uuid4())
        await repo.insert_module(
            session, module_id=module_id, course_id=course_id,
            title=body.title, description=body.description,
        )
        await session.commit()
        row = await repo.get_module(session, module_id)
        assert row is not None
        return _module_out(row)


@lesson_router.patch(
    "/marketplace/courses/{course_id}/modules/{module_id}", response_model=ModuleOut
)
async def patch_module_route(
    course_id: str, module_id: str,
    body: ModulePatchIn,
    p: Annotated[Principal, Depends(require_user)],
) -> ModuleOut:
    async with sessionmaker()() as session:
        await _require_creator_owns_course(session, course_id, p.user_id, p.role)
        await repo.patch_module(
            session, module_id=module_id,
            title=body.title, description=body.description, position=body.position,
        )
        await session.commit()
        row = await repo.get_module(session, module_id)
        if row is None:
            raise _problem("not_found", "Module not found.", 404)
        return _module_out(row)


@lesson_router.delete("/marketplace/courses/{course_id}/modules/{module_id}", status_code=204)
async def delete_module_route(
    course_id: str, module_id: str,
    p: Annotated[Principal, Depends(require_user)],
) -> None:
    async with sessionmaker()() as session:
        await _require_creator_owns_course(session, course_id, p.user_id, p.role)
        await repo.delete_module(session, module_id)
        await session.commit()


@lesson_router.post(
    "/marketplace/courses/{course_id}/modules/{module_id}/lessons",
    response_model=LessonOut, status_code=201,
)
async def create_lesson(
    course_id: str, module_id: str,
    body: LessonCreateIn,
    p: Annotated[Principal, Depends(require_user)],
) -> LessonOut:
    async with sessionmaker()() as session:
        await _require_creator_owns_course(session, course_id, p.user_id, p.role)
        lesson_id = str(uuid.uuid4())
        await repo.insert_lesson(
            session, lesson_id=lesson_id, module_id=module_id,
            title=body.title, content_md=body.contentMd,
            duration_seconds=body.durationSeconds,
        )
        await session.commit()
        row = await repo.get_lesson(session, lesson_id)
        assert row is not None
        return _lesson_out(row)


@lesson_router.patch(
    "/marketplace/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}",
    response_model=LessonOut,
)
async def patch_lesson_route(
    course_id: str, module_id: str, lesson_id: str,
    body: LessonPatchIn,
    p: Annotated[Principal, Depends(require_user)],
) -> LessonOut:
    async with sessionmaker()() as session:
        await _require_creator_owns_course(session, course_id, p.user_id, p.role)
        await repo.patch_lesson(
            session, lesson_id=lesson_id,
            title=body.title, content_md=body.contentMd,
            duration_seconds=body.durationSeconds, position=body.position,
        )
        await session.commit()
        row = await repo.get_lesson(session, lesson_id)
        if row is None:
            raise _problem("not_found", "Lesson not found.", 404)
        return _lesson_out(row)


@lesson_router.delete(
    "/marketplace/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}",
    status_code=204,
)
async def delete_lesson_route(
    course_id: str, module_id: str, lesson_id: str,
    p: Annotated[Principal, Depends(require_user)],
) -> None:
    async with sessionmaker()() as session:
        await _require_creator_owns_course(session, course_id, p.user_id, p.role)
        await repo.delete_lesson(session, lesson_id)
        await session.commit()


@lesson_router.get(
    "/marketplace/courses/{course_id}/structure", response_model=CourseStructureOut
)
async def course_structure(
    course_id: str,
    p: Annotated[Principal, Depends(require_user)],
) -> CourseStructureOut:
    async with sessionmaker()() as session:
        course = await repo.get_course(session, course_id)
        if course is None:
            raise _problem("not_found", "Course not found.", 404)
        is_creator = str(course["creator_user_id"]) == p.user_id
        is_admin = p.role == "PLATFORM_ADMIN"
        if course["status"] != "PUBLISHED" and not (is_creator or is_admin):
            raise _problem("not_found", "Course not found.", 404)

        # Determine content visibility
        has_purchase = False
        if not (is_creator or is_admin):
            paid = await repo.get_paid_purchase(
                session, student_user_id=p.user_id, course_id=course_id
            )
            has_purchase = paid is not None
        content_visible = is_creator or is_admin or has_purchase

        modules = await repo.list_modules(session, course_id)
        items = []
        for m in modules:
            lessons = await repo.list_lessons(session, str(m["id"]))
            items.append(
                ModuleWithLessons(
                    module=_module_out(m),
                    lessons=[
                        _lesson_out(le, redact_content=not content_visible)
                        for le in lessons
                    ],
                )
            )
        return CourseStructureOut(
            courseId=course_id, items=items, contentVisible=content_visible
        )


# -- earnings dashboard ----------------------------------------------------


@earnings_router.get("/marketplace/creators/me/earnings", response_model=EarningsOut)
async def my_earnings(
    p: Annotated[Principal, Depends(require_user)],
    since: str | None = Query(default=None),
    until: str | None = Query(default=None),
) -> EarningsOut:
    now = datetime.now(timezone.utc)
    if since is None:
        since_dt = now - timedelta(days=90)
    else:
        try:
            since_dt = datetime.fromisoformat(since).replace(tzinfo=timezone.utc)
        except ValueError as e:
            raise _problem("invalid_since", "since must be ISO date.", 422) from e
    if until is None:
        until_dt = now + timedelta(days=1)
    else:
        try:
            until_dt = datetime.fromisoformat(until).replace(tzinfo=timezone.utc)
        except ValueError as e:
            raise _problem("invalid_until", "until must be ISO date.", 422) from e

    async with sessionmaker()() as session:
        agg = await repo.aggregate_earnings(session, p.user_id, since=since_dt, until=until_dt)

    course_net = agg["course_revenue"] - agg["course_commission"]
    session_net = agg["session_revenue"] - agg["session_commission"]
    return EarningsOut(
        userId=p.user_id,
        periodStart=since_dt.isoformat(),
        periodEnd=until_dt.isoformat(),
        courseRevenuePaise=agg["course_revenue"],
        courseCommissionPaise=agg["course_commission"],
        courseNetPaise=course_net,
        courseCount=agg["course_count"],
        sessionRevenuePaise=agg["session_revenue"],
        sessionCommissionPaise=agg["session_commission"],
        sessionNetPaise=session_net,
        sessionCount=agg["session_count"],
        totalNetPaise=course_net + session_net,
    )


# -- rating moderation -----------------------------------------------------


RatingKind = Literal["session", "course"]


@mod_router.post(
    "/marketplace/admin/ratings/{kind}/{rating_id}/hide",
    status_code=204,
)
async def hide_rating_route(
    kind: RatingKind,
    rating_id: str,
    body: HideRatingIn,
    admin: Annotated[Principal, Depends(require_admin)],
) -> None:
    async with sessionmaker()() as session:
        rating = (
            await repo.get_session_rating(session, rating_id)
            if kind == "session"
            else await repo.get_course_rating(session, rating_id)
        )
        if rating is None:
            raise _problem("not_found", "Rating not found.", 404)
        await repo.hide_rating(
            session, kind=kind, rating_id=rating_id,
            admin_user_id=admin.user_id, reason=body.reason,
        )
        # Use the moderated rating's "subject" (tutor or course id) as the
        # tutor_admin_actions.tutor_user_id (the column is generic post-S18).
        subject = (
            str(rating["tutor_user_id"]) if kind == "session"
            else str(rating["course_id"])
        )
        if kind == "session":
            await repo.recompute_tutor_aggregate(session, subject)
        else:
            await repo.recompute_course_aggregate(session, subject)
        await repo.insert_admin_action(
            session,
            admin_user_id=admin.user_id,
            tutor_user_id=subject,
            action="RATING_HIDE",
            reason=body.reason,
        )
        await session.commit()


@mod_router.post(
    "/marketplace/admin/ratings/{kind}/{rating_id}/unhide",
    status_code=204,
)
async def unhide_rating_route(
    kind: RatingKind,
    rating_id: str,
    admin: Annotated[Principal, Depends(require_admin)],
) -> None:
    async with sessionmaker()() as session:
        rating = (
            await repo.get_session_rating(session, rating_id)
            if kind == "session"
            else await repo.get_course_rating(session, rating_id)
        )
        if rating is None:
            raise _problem("not_found", "Rating not found.", 404)
        await repo.unhide_rating(session, kind=kind, rating_id=rating_id)
        subject = (
            str(rating["tutor_user_id"]) if kind == "session"
            else str(rating["course_id"])
        )
        if kind == "session":
            await repo.recompute_tutor_aggregate(session, subject)
        else:
            await repo.recompute_course_aggregate(session, subject)
        await repo.insert_admin_action(
            session,
            admin_user_id=admin.user_id,
            tutor_user_id=subject,
            action="RATING_UNHIDE",
        )
        await session.commit()


# -- refunds ---------------------------------------------------------------


@mod_router.post(
    "/marketplace/admin/bookings/{booking_id}/refund",
    response_model=RefundResultOut,
)
async def refund_booking(
    booking_id: str,
    admin: Annotated[Principal, Depends(require_admin)],
    force_failure: bool = Query(default=False, alias="forceFailure"),
) -> RefundResultOut:
    async with sessionmaker()() as session:
        booking = await repo.get_booking(session, booking_id)
        if booking is None:
            raise _problem("not_found", "Booking not found.", 404)
        try:
            new_state = booking_state.transition(booking["status"], booking_state.ADMIN_REFUND)
        except booking_state.IllegalTransition as e:
            raise _problem(
                "illegal_transition",
                f"Cannot refund from {booking['status']}. Allowed: COMPLETED, CANCELLED_BY_TUTOR, NO_SHOW_TUTOR.",
                409,
            ) from e
        # Stub Stripe refund call
        force = "failed" if force_failure else None
        result = stripe_connect.refund_payment_intent(
            booking.get("stripe_payment_intent_id") or "", force=force
        )
        if result != "succeeded":
            raise _problem(
                "refund_failed", "Stripe refund returned 'failed'. Booking unchanged.", 502
            )
        await repo.set_booking_status(
            session, booking_id=booking_id, status=new_state, cancelled=True
        )
        await repo.insert_admin_action(
            session,
            admin_user_id=admin.user_id,
            tutor_user_id=str(booking["tutor_user_id"]),
            action="BOOKING_REFUND",
        )
        await session.commit()
        return RefundResultOut(
            targetKind="booking",
            targetId=booking_id,
            status=new_state,
            refundedAt=datetime.now(timezone.utc).isoformat(),
        )


@mod_router.post(
    "/marketplace/admin/courses/{course_id}/purchases/{purchase_id}/refund",
    response_model=RefundResultOut,
)
async def refund_course_purchase(
    course_id: str,
    purchase_id: str,
    admin: Annotated[Principal, Depends(require_admin)],
    force_failure: bool = Query(default=False, alias="forceFailure"),
) -> RefundResultOut:
    async with sessionmaker()() as session:
        purchase = await repo.get_purchase(session, purchase_id)
        if purchase is None or str(purchase["course_id"]) != course_id:
            raise _problem("not_found", "Purchase not found.", 404)
        if purchase["status"] != "PAID":
            raise _problem(
                "not_refundable",
                f"Purchase is in {purchase['status']}, must be PAID.",
                409,
            )
        force = "failed" if force_failure else None
        result = stripe_connect.refund_payment_intent(
            purchase.get("stripe_payment_intent_id") or "", force=force
        )
        if result != "succeeded":
            raise _problem(
                "refund_failed",
                "Stripe refund returned 'failed'. Purchase unchanged.",
                502,
            )
        await repo.set_purchase_refunded(session, purchase_id=purchase_id)
        await repo.insert_admin_action(
            session,
            admin_user_id=admin.user_id,
            tutor_user_id=course_id,  # using as generic subject id
            action="COURSE_REFUND",
        )
        await session.commit()
        purchase = await repo.get_purchase(session, purchase_id)
        return RefundResultOut(
            targetKind="course_purchase",
            targetId=purchase_id,
            status="REFUNDED",
            refundedAt=datetime.now(timezone.utc).isoformat(),
        )
