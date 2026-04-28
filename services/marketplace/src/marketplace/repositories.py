"""DB access for marketplace.tutor_*.

SQLAlchemy text() queries; no ORM models (matches engagement / learning).
Each function takes an AsyncSession and operates within the caller's
transaction.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "marketplace_schema"


# -- profiles ---------------------------------------------------------------


async def get_profile(session: AsyncSession, user_id: str) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(f"""
                SELECT user_id, display_name, headline, bio, hourly_rate_paise,
                       commission_rate_override, tier, application_status, kyc_status,
                       stripe_identity_session_id, stripe_connect_account_id,
                       applied_at, approved_at, created_at, updated_at
                  FROM {SCHEMA}.tutor_profiles
                 WHERE user_id = :uid
            """),
            {"uid": user_id},
        )
    ).mappings().first()
    return dict(row) if row else None


async def insert_profile(
    session: AsyncSession,
    *,
    user_id: str,
    display_name: str,
    headline: str,
    bio: str,
    hourly_rate_paise: int,
) -> None:
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.tutor_profiles
              (user_id, display_name, headline, bio, hourly_rate_paise)
            VALUES (:uid, :dn, :hl, :bio, :rate)
        """),
        {"uid": user_id, "dn": display_name, "hl": headline, "bio": bio, "rate": hourly_rate_paise},
    )


async def patch_profile(
    session: AsyncSession,
    *,
    user_id: str,
    headline: str | None = None,
    bio: str | None = None,
    hourly_rate_paise: int | None = None,
) -> None:
    sets = ["updated_at = now()"]
    params: dict[str, Any] = {"uid": user_id}
    if headline is not None:
        sets.append("headline = :hl")
        params["hl"] = headline
    if bio is not None:
        sets.append("bio = :bio")
        params["bio"] = bio
    if hourly_rate_paise is not None:
        sets.append("hourly_rate_paise = :rate")
        params["rate"] = hourly_rate_paise
    if len(sets) == 1:
        return
    await session.execute(
        text(f"UPDATE {SCHEMA}.tutor_profiles SET {', '.join(sets)} WHERE user_id = :uid"),
        params,
    )


async def set_application_status(
    session: AsyncSession,
    *,
    user_id: str,
    status: str,
    kyc_status: str | None = None,
    stripe_identity_session_id: str | None = None,
    approved: bool = False,
) -> None:
    fields = ["application_status = :st", "updated_at = now()"]
    params: dict[str, Any] = {"uid": user_id, "st": status}
    if kyc_status is not None:
        fields.append("kyc_status = :ks")
        params["ks"] = kyc_status
    if stripe_identity_session_id is not None:
        fields.append("stripe_identity_session_id = :sid")
        params["sid"] = stripe_identity_session_id
    if approved:
        fields.append("approved_at = now()")
    await session.execute(
        text(f"UPDATE {SCHEMA}.tutor_profiles SET {', '.join(fields)} WHERE user_id = :uid"),
        params,
    )


# -- qualifications ---------------------------------------------------------


async def list_qualifications(
    session: AsyncSession, user_id: str
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(f"""
                SELECT id, kind, title, institution, year_completed
                  FROM {SCHEMA}.tutor_qualifications
                 WHERE tutor_user_id = :uid
                 ORDER BY created_at
            """),
            {"uid": user_id},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


async def insert_qualifications(
    session: AsyncSession, user_id: str, items: list[dict[str, Any]]
) -> None:
    for q in items:
        await session.execute(
            text(f"""
                INSERT INTO {SCHEMA}.tutor_qualifications
                  (id, tutor_user_id, kind, title, institution, year_completed)
                VALUES (:id, :uid, :kind, :title, :inst, :yr)
            """),
            {
                "id": str(uuid.uuid4()),
                "uid": user_id,
                "kind": q["kind"],
                "title": q["title"],
                "inst": q.get("institution"),
                "yr": q.get("yearCompleted"),
            },
        )


# -- availability -----------------------------------------------------------


async def list_availability(
    session: AsyncSession, user_id: str
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(f"""
                SELECT id, day_of_week, start_minute, end_minute
                  FROM {SCHEMA}.tutor_availability
                 WHERE tutor_user_id = :uid
                 ORDER BY day_of_week, start_minute
            """),
            {"uid": user_id},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


async def replace_availability(
    session: AsyncSession, user_id: str, items: list[dict[str, Any]]
) -> None:
    await session.execute(
        text(f"DELETE FROM {SCHEMA}.tutor_availability WHERE tutor_user_id = :uid"),
        {"uid": user_id},
    )
    for a in items:
        await session.execute(
            text(f"""
                INSERT INTO {SCHEMA}.tutor_availability
                  (id, tutor_user_id, day_of_week, start_minute, end_minute)
                VALUES (:id, :uid, :dow, :sm, :em)
            """),
            {
                "id": str(uuid.uuid4()),
                "uid": user_id,
                "dow": a["dayOfWeek"],
                "sm": a["startMinute"],
                "em": a["endMinute"],
            },
        )


# -- topics ------------------------------------------------------------------


async def list_topic_ids(session: AsyncSession, user_id: str) -> list[str]:
    rows = (
        await session.execute(
            text(f"SELECT topic_id FROM {SCHEMA}.tutor_topics WHERE tutor_user_id = :uid"),
            {"uid": user_id},
        )
    ).all()
    return [str(r[0]) for r in rows]


async def replace_topics(
    session: AsyncSession, user_id: str, topic_ids: list[str]
) -> None:
    await session.execute(
        text(f"DELETE FROM {SCHEMA}.tutor_topics WHERE tutor_user_id = :uid"),
        {"uid": user_id},
    )
    for tid in topic_ids:
        await session.execute(
            text(f"""
                INSERT INTO {SCHEMA}.tutor_topics (tutor_user_id, topic_id)
                VALUES (:uid, :tid)
                ON CONFLICT DO NOTHING
            """),
            {"uid": user_id, "tid": tid},
        )


# -- listing -----------------------------------------------------------------


async def list_active_tutors(
    session: AsyncSession,
    *,
    topic_id: str | None = None,
    min_paise: int | None = None,
    max_paise: int | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[dict[str, Any]], int]:
    """Returns (items, total). Only ACTIVE tutors. JOINs tutor_topics
    when topic_id is given."""
    where = ["tp.application_status = 'ACTIVE'"]
    params: dict[str, Any] = {"limit": per_page, "offset": (page - 1) * per_page}
    base_from = f"{SCHEMA}.tutor_profiles tp"
    if topic_id is not None:
        base_from += f" JOIN {SCHEMA}.tutor_topics tt ON tt.tutor_user_id = tp.user_id"
        where.append("tt.topic_id = :topic")
        params["topic"] = topic_id
    if min_paise is not None:
        where.append("tp.hourly_rate_paise >= :min_paise")
        params["min_paise"] = min_paise
    if max_paise is not None:
        where.append("tp.hourly_rate_paise <= :max_paise")
        params["max_paise"] = max_paise
    where_clause = " AND ".join(where)

    items = (
        await session.execute(
            text(f"""
                SELECT DISTINCT tp.user_id, tp.display_name, tp.headline,
                       tp.hourly_rate_paise, tp.tier
                  FROM {base_from}
                 WHERE {where_clause}
                 ORDER BY tp.hourly_rate_paise ASC, tp.user_id
                 LIMIT :limit OFFSET :offset
            """),
            params,
        )
    ).mappings().all()

    total = (
        await session.execute(
            text(f"""
                SELECT COUNT(DISTINCT tp.user_id)
                  FROM {base_from}
                 WHERE {where_clause}
            """),
            params,
        )
    ).scalar_one()

    item_dicts = []
    for r in items:
        topics = await list_topic_ids(session, str(r["user_id"]))
        d = dict(r)
        d["topicIds"] = topics
        item_dicts.append(d)
    return item_dicts, int(total or 0)


# ===========================================================================
# Sprint 17 — bookings, sessions, admin actions
# ===========================================================================


# -- bookings ---------------------------------------------------------------


async def insert_booking(
    session: AsyncSession,
    *,
    booking_id: str,
    student_user_id: str,
    tutor_user_id: str,
    slot_start,
    slot_end,
    price_paise: int,
    commission_paise: int,
    stripe_payment_intent_id: str | None = None,
) -> None:
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.bookings
              (id, student_user_id, tutor_user_id, slot_start, slot_end,
               price_paise, commission_paise, stripe_payment_intent_id)
            VALUES (:id, :sid, :tid, :start, :end_, :price, :comm, :pi)
        """),
        {
            "id": booking_id,
            "sid": student_user_id,
            "tid": tutor_user_id,
            "start": slot_start,
            "end_": slot_end,
            "price": price_paise,
            "comm": commission_paise,
            "pi": stripe_payment_intent_id,
        },
    )


async def get_booking(session: AsyncSession, booking_id: str) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(f"""
                SELECT id, student_user_id, tutor_user_id, slot_start, slot_end,
                       price_paise, commission_paise, status,
                       stripe_payment_intent_id, daily_room_url,
                       created_at, updated_at, confirmed_at, started_at,
                       completed_at, cancelled_at
                  FROM {SCHEMA}.bookings
                 WHERE id = :id
            """),
            {"id": booking_id},
        )
    ).mappings().first()
    return dict(row) if row else None


async def list_bookings_for_student(
    session: AsyncSession, student_user_id: str
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(f"""
                SELECT id, student_user_id, tutor_user_id, slot_start, slot_end,
                       price_paise, status, daily_room_url, created_at
                  FROM {SCHEMA}.bookings
                 WHERE student_user_id = :sid
                 ORDER BY slot_start DESC
            """),
            {"sid": student_user_id},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


async def list_bookings_for_tutor(
    session: AsyncSession, tutor_user_id: str
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(f"""
                SELECT id, student_user_id, tutor_user_id, slot_start, slot_end,
                       price_paise, status, daily_room_url, created_at
                  FROM {SCHEMA}.bookings
                 WHERE tutor_user_id = :tid
                 ORDER BY slot_start DESC
            """),
            {"tid": tutor_user_id},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


async def list_active_bookings_in_window(
    session: AsyncSession,
    *,
    tutor_user_id: str,
    window_start,
    window_end,
) -> list[dict[str, Any]]:
    """Active = CONFIRMED | IN_PROGRESS. Used by the availability endpoint
    to subtract booked slots from the tutor's declared availability."""
    rows = (
        await session.execute(
            text(f"""
                SELECT slot_start, slot_end
                  FROM {SCHEMA}.bookings
                 WHERE tutor_user_id = :tid
                   AND status IN ('CONFIRMED', 'IN_PROGRESS')
                   AND slot_start < :wend
                   AND slot_end > :wstart
                 ORDER BY slot_start
            """),
            {"tid": tutor_user_id, "wstart": window_start, "wend": window_end},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


async def set_booking_status(
    session: AsyncSession,
    *,
    booking_id: str,
    status: str,
    confirmed: bool = False,
    started: bool = False,
    completed: bool = False,
    cancelled: bool = False,
    daily_room_url: str | None = None,
) -> None:
    sets = ["status = :st", "updated_at = now()"]
    params: dict[str, Any] = {"id": booking_id, "st": status}
    if confirmed:
        sets.append("confirmed_at = now()")
    if started:
        sets.append("started_at = now()")
    if completed:
        sets.append("completed_at = now()")
    if cancelled:
        sets.append("cancelled_at = now()")
    if daily_room_url is not None:
        sets.append("daily_room_url = :url")
        params["url"] = daily_room_url
    await session.execute(
        text(f"UPDATE {SCHEMA}.bookings SET {', '.join(sets)} WHERE id = :id"),
        params,
    )


# -- tutor_sessions ---------------------------------------------------------


async def insert_session(
    session: AsyncSession,
    *,
    booking_id: str,
    daily_room_id: str,
    daily_room_url: str,
) -> None:
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.tutor_sessions
              (id, daily_room_id, daily_room_url)
            VALUES (:id, :rid, :url)
        """),
        {"id": booking_id, "rid": daily_room_id, "url": daily_room_url},
    )


async def get_session(session: AsyncSession, booking_id: str) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(f"""
                SELECT id, daily_room_id, daily_room_url,
                       joined_by_student_at, joined_by_tutor_at, created_at
                  FROM {SCHEMA}.tutor_sessions
                 WHERE id = :id
            """),
            {"id": booking_id},
        )
    ).mappings().first()
    return dict(row) if row else None


# -- admin actions ----------------------------------------------------------


async def insert_admin_action(
    session: AsyncSession,
    *,
    admin_user_id: str,
    tutor_user_id: str,
    action: str,
    reason: str | None = None,
) -> None:
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.tutor_admin_actions
              (id, admin_user_id, tutor_user_id, action, reason)
            VALUES (:id, :aid, :tid, :act, :rsn)
        """),
        {
            "id": str(uuid.uuid4()),
            "aid": admin_user_id,
            "tid": tutor_user_id,
            "act": action,
            "rsn": reason,
        },
    )


async def list_admin_actions(
    session: AsyncSession, tutor_user_id: str
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(f"""
                SELECT id, admin_user_id, tutor_user_id, action, reason, created_at
                  FROM {SCHEMA}.tutor_admin_actions
                 WHERE tutor_user_id = :tid
                 ORDER BY created_at DESC
            """),
            {"tid": tutor_user_id},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


async def list_admin_queue(
    session: AsyncSession, status: str = "KYC_VERIFIED"
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(f"""
                SELECT user_id, display_name, headline, hourly_rate_paise,
                       application_status, applied_at, kyc_status
                  FROM {SCHEMA}.tutor_profiles
                 WHERE application_status = :st
                 ORDER BY applied_at ASC
            """),
            {"st": status},
        )
    ).mappings().all()
    return [dict(r) for r in rows]
