"""Booking endpoints — Sprint 17.

Mounted on the same /marketplace prefix as tutor routes via main.py
include_router. Kept in a separate module to keep tutor application
concerns and booking concerns from cross-pollinating.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError

from marketplace import booking_state, daily_room, repositories as repo, stripe_connect, tutor_state
from marketplace.db import sessionmaker
from marketplace.schemas import (
    AdminActionListOut,
    AdminActionOut,
    AdminQueueItem,
    AdminQueueOut,
    AdminRejectIn,
    AvailabilityListOut,
    AvailabilitySlotOut,
    BookingListOut,
    BookingOut,
    CancelIn,
    ConfirmPaymentIn,
    CreateBookingIn,
    NoShowIn,
    Problem,
    TutorProfileOut,
)
from marketplace.security import Principal, require_admin, require_user

booking_router = APIRouter()


def _problem(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(status_code=http_status, detail=Problem(code=code, message=message).model_dump())


def _to_iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _booking_out(row: dict) -> BookingOut:
    return BookingOut(
        id=str(row["id"]),
        studentUserId=str(row["student_user_id"]),
        tutorUserId=str(row["tutor_user_id"]),
        slotStart=row["slot_start"].isoformat(),
        slotEnd=row["slot_end"].isoformat(),
        pricePaise=int(row["price_paise"]),
        commissionPaise=int(row.get("commission_paise") or 0),
        status=row["status"],
        stripePaymentIntentId=row.get("stripe_payment_intent_id"),
        dailyRoomUrl=row.get("daily_room_url"),
        createdAt=row["created_at"].isoformat(),
    )


# -- create + confirm -------------------------------------------------------


@booking_router.post("/marketplace/bookings", response_model=BookingOut, status_code=201)
async def create_booking(
    body: CreateBookingIn,
    p: Annotated[Principal, Depends(require_user)],
) -> BookingOut:
    if body.slotEnd <= body.slotStart:
        raise _problem("invalid_slot", "slotEnd must be after slotStart.", 422)
    duration_min = (body.slotEnd - body.slotStart).total_seconds() / 60
    if duration_min < 30 or duration_min > 240:
        raise _problem("invalid_duration", "Sessions must be 30–240 minutes.", 422)

    async with sessionmaker()() as session:
        tutor = await repo.get_profile(session, body.tutorUserId)
        if tutor is None or not tutor_state.can_book(tutor["application_status"]):
            raise _problem("tutor_not_active", "Tutor not bookable.", 404)
        if str(tutor["user_id"]) == p.user_id:
            raise _problem("self_booking", "You cannot book yourself.", 422)

        # Snapshot price + commission per ADR-0007.
        hours = duration_min / 60.0
        price_paise = int(round(int(tutor["hourly_rate_paise"]) * hours))
        commission_paise, _ = stripe_connect.commission_split(
            price_paise, override_rate=tutor.get("commission_rate_override")
        )

        booking_id = str(uuid.uuid4())
        intent_id = stripe_connect.create_payment_intent(
            booking_id, price_paise, tutor.get("stripe_connect_account_id")
        )
        try:
            await repo.insert_booking(
                session,
                booking_id=booking_id,
                student_user_id=p.user_id,
                tutor_user_id=str(tutor["user_id"]),
                slot_start=body.slotStart,
                slot_end=body.slotEnd,
                price_paise=price_paise,
                commission_paise=commission_paise,
                stripe_payment_intent_id=intent_id,
            )
        except IntegrityError as e:
            await session.rollback()
            raise _problem("invalid_booking", str(e.orig), 422) from e
        await session.commit()

        row = await repo.get_booking(session, booking_id)
        assert row is not None
        return _booking_out(row)


@booking_router.post("/marketplace/bookings/{booking_id}/confirm-payment", response_model=BookingOut)
async def confirm_payment(
    booking_id: str,
    body: ConfirmPaymentIn,
    p: Annotated[Principal, Depends(require_user)],
) -> BookingOut:
    async with sessionmaker()() as session:
        row = await repo.get_booking(session, booking_id)
        if row is None:
            raise _problem("not_found", "Booking not found.", 404)
        if str(row["student_user_id"]) != p.user_id:
            raise _problem("forbidden", "Only the student can confirm payment.", 403)
        if row["status"] != booking_state.PENDING_PAYMENT:
            raise _problem(
                "already_processed",
                f"Booking already in state {row['status']}.",
                409,
            )

        force = "failed" if body.forceFailure else None
        result = stripe_connect.confirm_payment_intent(
            row["stripe_payment_intent_id"], force=force
        )
        if result == "succeeded":
            new_state = booking_state.transition(
                row["status"], booking_state.PAYMENT_SUCCEEDED
            )
            # Provision Daily room
            room_id, room_url = daily_room.create_room(booking_id)
            await repo.set_booking_status(
                session,
                booking_id=booking_id,
                status=new_state,
                confirmed=True,
                daily_room_url=room_url,
            )
            await repo.insert_session(
                session,
                booking_id=booking_id,
                daily_room_id=room_id,
                daily_room_url=room_url,
            )
        elif result == "failed":
            new_state = booking_state.transition(
                row["status"], booking_state.PAYMENT_FAILED
            )
            await repo.set_booking_status(
                session, booking_id=booking_id, status=new_state, cancelled=True
            )
        else:
            raise _problem(
                "payment_pending",
                "Payment intent still pending. Try again.",
                202,
            )
        await session.commit()
        row = await repo.get_booking(session, booking_id)
        assert row is not None
        return _booking_out(row)


# -- start / complete / cancel / no-show -----------------------------------


@booking_router.post("/marketplace/bookings/{booking_id}/start", response_model=BookingOut)
async def start_booking(
    booking_id: str,
    p: Annotated[Principal, Depends(require_user)],
) -> BookingOut:
    async with sessionmaker()() as session:
        row = await repo.get_booking(session, booking_id)
        if row is None:
            raise _problem("not_found", "Booking not found.", 404)
        if str(row["tutor_user_id"]) != p.user_id and p.role != "PLATFORM_ADMIN":
            raise _problem("forbidden", "Only the tutor can start the session.", 403)
        try:
            new_state = booking_state.transition(row["status"], booking_state.START)
        except booking_state.IllegalTransition as e:
            raise _problem("illegal_transition", f"Cannot start from {row['status']}.", 409) from e
        await repo.set_booking_status(
            session, booking_id=booking_id, status=new_state, started=True
        )
        await session.commit()
        row = await repo.get_booking(session, booking_id)
        assert row is not None
        return _booking_out(row)


@booking_router.post("/marketplace/bookings/{booking_id}/complete", response_model=BookingOut)
async def complete_booking(
    booking_id: str,
    p: Annotated[Principal, Depends(require_user)],
) -> BookingOut:
    async with sessionmaker()() as session:
        row = await repo.get_booking(session, booking_id)
        if row is None:
            raise _problem("not_found", "Booking not found.", 404)
        if str(row["tutor_user_id"]) != p.user_id and p.role != "PLATFORM_ADMIN":
            raise _problem("forbidden", "Only the tutor can complete the session.", 403)
        try:
            new_state = booking_state.transition(row["status"], booking_state.COMPLETE)
        except booking_state.IllegalTransition as e:
            raise _problem(
                "illegal_transition",
                f"Cannot complete from {row['status']}.",
                409,
            ) from e
        await repo.set_booking_status(
            session, booking_id=booking_id, status=new_state, completed=True
        )
        await session.commit()
        row = await repo.get_booking(session, booking_id)
        assert row is not None
        return _booking_out(row)


@booking_router.post("/marketplace/bookings/{booking_id}/no-show", response_model=BookingOut)
async def no_show(
    booking_id: str,
    body: NoShowIn,
    p: Annotated[Principal, Depends(require_user)],
) -> BookingOut:
    async with sessionmaker()() as session:
        row = await repo.get_booking(session, booking_id)
        if row is None:
            raise _problem("not_found", "Booking not found.", 404)
        if str(row["tutor_user_id"]) != p.user_id and p.role != "PLATFORM_ADMIN":
            raise _problem("forbidden", "Only the tutor can mark no-show.", 403)
        action = (
            booking_state.NO_SHOW_STUDENT_ACTION
            if body.whom == "student"
            else booking_state.NO_SHOW_TUTOR_ACTION
        )
        try:
            new_state = booking_state.transition(row["status"], action)
        except booking_state.IllegalTransition as e:
            raise _problem(
                "illegal_transition",
                f"Cannot mark no-show from {row['status']}.",
                409,
            ) from e
        await repo.set_booking_status(
            session, booking_id=booking_id, status=new_state, completed=True
        )
        await session.commit()
        row = await repo.get_booking(session, booking_id)
        assert row is not None
        return _booking_out(row)


# Cancellation rule per ADR-0008: student must cancel > 24h before slot.
CANCEL_CUTOFF_HOURS = 24


@booking_router.post("/marketplace/bookings/{booking_id}/cancel", response_model=BookingOut)
async def cancel_booking(
    booking_id: str,
    body: CancelIn,
    p: Annotated[Principal, Depends(require_user)],
) -> BookingOut:
    async with sessionmaker()() as session:
        row = await repo.get_booking(session, booking_id)
        if row is None:
            raise _problem("not_found", "Booking not found.", 404)
        is_student = str(row["student_user_id"]) == p.user_id
        is_tutor = str(row["tutor_user_id"]) == p.user_id
        if not (is_student or is_tutor or p.role == "PLATFORM_ADMIN"):
            raise _problem("forbidden", "Only participants can cancel.", 403)

        if is_student and not is_tutor:
            # 24-hour rule
            now = datetime.now(timezone.utc)
            slot_start = row["slot_start"]
            if slot_start - now < timedelta(hours=CANCEL_CUTOFF_HOURS):
                raise _problem(
                    "cancel_window_closed",
                    f"Student cancellations must be > {CANCEL_CUTOFF_HOURS}h before slot.",
                    409,
                )
            action = booking_state.CANCEL_BY_STUDENT
        else:
            action = booking_state.CANCEL_BY_TUTOR

        try:
            new_state = booking_state.transition(row["status"], action)
        except booking_state.IllegalTransition as e:
            raise _problem(
                "illegal_transition",
                f"Cannot cancel from {row['status']}.",
                409,
            ) from e
        await repo.set_booking_status(
            session, booking_id=booking_id, status=new_state, cancelled=True
        )
        await session.commit()
        row = await repo.get_booking(session, booking_id)
        assert row is not None
        return _booking_out(row)


# -- read endpoints --------------------------------------------------------


@booking_router.get("/marketplace/bookings/me", response_model=BookingListOut)
async def list_my_bookings(
    p: Annotated[Principal, Depends(require_user)],
    role: str = Query(default="student", pattern="^(student|tutor)$"),
) -> BookingListOut:
    async with sessionmaker()() as session:
        rows = (
            await repo.list_bookings_for_student(session, p.user_id)
            if role == "student"
            else await repo.list_bookings_for_tutor(session, p.user_id)
        )
        return BookingListOut(items=[_booking_out(r) for r in rows])


@booking_router.get("/marketplace/bookings/{booking_id}", response_model=BookingOut)
async def get_booking_route(
    booking_id: str,
    p: Annotated[Principal, Depends(require_user)],
) -> BookingOut:
    async with sessionmaker()() as session:
        row = await repo.get_booking(session, booking_id)
        if row is None:
            raise _problem("not_found", "Booking not found.", 404)
        is_participant = (
            str(row["student_user_id"]) == p.user_id
            or str(row["tutor_user_id"]) == p.user_id
        )
        if not (is_participant or p.role == "PLATFORM_ADMIN"):
            raise _problem("forbidden", "Not a participant.", 403)
        return _booking_out(row)


# -- availability ----------------------------------------------------------


@booking_router.get(
    "/marketplace/tutors/{user_id}/availability",
    response_model=AvailabilityListOut,
)
async def tutor_availability(
    user_id: str,
    date: str = Query(..., description="YYYY-MM-DD; UTC"),
) -> AvailabilityListOut:
    """Compute open slots for `user_id` on `date` by intersecting their
    declared weekly availability with bookings in CONFIRMED/IN_PROGRESS state.

    Slot granularity for v1 = whatever the tutor declared. We don't yet
    chunk into 30-minute or 60-minute increments — that's a UI concern;
    the tutor declares "Mon 18:00–21:00" and the student picks a chunk.
    Returns the *available* parts of declared windows after subtracting
    the bookings.
    """
    try:
        target_date = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
    except ValueError as e:
        raise _problem("invalid_date", "date must be YYYY-MM-DD.", 422) from e

    day_of_week = target_date.weekday()  # Mon=0..Sun=6 — matches our schema.
    day_start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    async with sessionmaker()() as session:
        avail_rows = await repo.list_availability(session, user_id)
        windows_minutes = [
            (a["day_of_week"], a["start_minute"], a["end_minute"])
            for a in avail_rows
            if a["day_of_week"] == day_of_week
        ]
        booked = await repo.list_active_bookings_in_window(
            session,
            tutor_user_id=user_id,
            window_start=day_start,
            window_end=day_end,
        )

        slots: list[AvailabilitySlotOut] = []
        for _dow, sm, em in windows_minutes:
            window_start = day_start + timedelta(minutes=sm)
            window_end = day_start + timedelta(minutes=em)
            free_ranges = [(window_start, window_end)]
            for b in booked:
                bs, be = b["slot_start"], b["slot_end"]
                new_ranges = []
                for s, e in free_ranges:
                    if be <= s or bs >= e:
                        new_ranges.append((s, e))
                        continue
                    if bs > s:
                        new_ranges.append((s, bs))
                    if be < e:
                        new_ranges.append((be, e))
                free_ranges = new_ranges
            for s, e in free_ranges:
                if (e - s).total_seconds() >= 30 * 60:
                    slots.append(AvailabilitySlotOut(slotStart=s.isoformat(), slotEnd=e.isoformat()))

    return AvailabilityListOut(tutorUserId=user_id, date=date, slots=slots)


# -- admin moderation queue + audit ----------------------------------------


admin_router = APIRouter()


@admin_router.get("/marketplace/admin/tutors/queue", response_model=AdminQueueOut)
async def admin_tutor_queue(
    _admin: Annotated[Principal, Depends(require_admin)],
    status: str = Query(default="KYC_VERIFIED"),
) -> AdminQueueOut:
    async with sessionmaker()() as session:
        rows = await repo.list_admin_queue(session, status=status)
        return AdminQueueOut(
            items=[
                AdminQueueItem(
                    userId=str(r["user_id"]),
                    displayName=r["display_name"],
                    headline=r["headline"],
                    hourlyRatePaise=int(r["hourly_rate_paise"]),
                    applicationStatus=r["application_status"],
                    appliedAt=r["applied_at"].isoformat(),
                    kycStatus=r.get("kyc_status"),
                )
                for r in rows
            ]
        )


@admin_router.get(
    "/marketplace/admin/tutors/{user_id}/actions",
    response_model=AdminActionListOut,
)
async def admin_tutor_audit(
    user_id: str,
    _admin: Annotated[Principal, Depends(require_admin)],
) -> AdminActionListOut:
    async with sessionmaker()() as session:
        rows = await repo.list_admin_actions(session, user_id)
        return AdminActionListOut(
            items=[
                AdminActionOut(
                    id=str(r["id"]),
                    adminUserId=str(r["admin_user_id"]),
                    tutorUserId=str(r["tutor_user_id"]),
                    action=r["action"],
                    reason=r.get("reason"),
                    createdAt=r["created_at"].isoformat(),
                )
                for r in rows
            ]
        )
