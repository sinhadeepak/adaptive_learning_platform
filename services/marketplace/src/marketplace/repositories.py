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


# ===========================================================================
# Sprint 18 — creators, courses, purchases, ratings
# ===========================================================================


# -- creator profiles -------------------------------------------------------


async def get_creator_profile(session: AsyncSession, user_id: str) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(f"""
                SELECT user_id, display_name, headline, bio, tier,
                       application_status, kyc_status,
                       stripe_identity_session_id, stripe_connect_account_id,
                       commission_rate_override,
                       applied_at, approved_at, created_at, updated_at
                  FROM {SCHEMA}.creator_profiles
                 WHERE user_id = :uid
            """),
            {"uid": user_id},
        )
    ).mappings().first()
    return dict(row) if row else None


async def insert_creator_profile(
    session: AsyncSession,
    *,
    user_id: str,
    display_name: str,
    headline: str,
    bio: str,
) -> None:
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.creator_profiles
              (user_id, display_name, headline, bio)
            VALUES (:uid, :dn, :hl, :bio)
        """),
        {"uid": user_id, "dn": display_name, "hl": headline, "bio": bio},
    )


async def patch_creator_profile(
    session: AsyncSession,
    *,
    user_id: str,
    headline: str | None = None,
    bio: str | None = None,
) -> None:
    sets = ["updated_at = now()"]
    params: dict[str, Any] = {"uid": user_id}
    if headline is not None:
        sets.append("headline = :hl")
        params["hl"] = headline
    if bio is not None:
        sets.append("bio = :bio")
        params["bio"] = bio
    if len(sets) == 1:
        return
    await session.execute(
        text(f"UPDATE {SCHEMA}.creator_profiles SET {', '.join(sets)} WHERE user_id = :uid"),
        params,
    )


async def set_creator_application_status(
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
        text(f"UPDATE {SCHEMA}.creator_profiles SET {', '.join(fields)} WHERE user_id = :uid"),
        params,
    )


async def list_creator_admin_queue(
    session: AsyncSession, status: str = "KYC_VERIFIED"
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(f"""
                SELECT user_id, display_name, headline, application_status,
                       applied_at, kyc_status
                  FROM {SCHEMA}.creator_profiles
                 WHERE application_status = :st
                 ORDER BY applied_at ASC
            """),
            {"st": status},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


# -- courses ----------------------------------------------------------------


async def insert_course(
    session: AsyncSession,
    *,
    course_id: str,
    creator_user_id: str,
    title: str,
    description: str,
    content_md: str,
    price_paise: int,
    tier: str,
    cover_image_url: str | None,
    exam_id: str | None,
    subject_id: str | None,
    topic_ids: list[str],
) -> None:
    import json
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.courses
              (id, creator_user_id, title, description, content_md,
               price_paise, tier, cover_image_url, exam_id, subject_id, topic_ids)
            VALUES (:id, :cid, :t, :d, :md, :p, :tier, :ci, :ex, :sb, CAST(:tids AS jsonb))
        """),
        {
            "id": course_id,
            "cid": creator_user_id,
            "t": title,
            "d": description,
            "md": content_md,
            "p": price_paise,
            "tier": tier,
            "ci": cover_image_url,
            "ex": exam_id,
            "sb": subject_id,
            "tids": json.dumps(topic_ids),
        },
    )


async def get_course(session: AsyncSession, course_id: str) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(f"""
                SELECT id, creator_user_id, title, description, content_md,
                       price_paise, tier, status, cover_image_url,
                       exam_id, subject_id, topic_ids,
                       created_at, published_at, updated_at
                  FROM {SCHEMA}.courses
                 WHERE id = :id
            """),
            {"id": course_id},
        )
    ).mappings().first()
    return dict(row) if row else None


async def patch_course(
    session: AsyncSession,
    *,
    course_id: str,
    title: str | None = None,
    description: str | None = None,
    content_md: str | None = None,
    price_paise: int | None = None,
    cover_image_url: str | None = None,
    exam_id: str | None = None,
    subject_id: str | None = None,
    topic_ids: list[str] | None = None,
) -> None:
    import json
    sets = ["updated_at = now()"]
    params: dict[str, Any] = {"id": course_id}
    if title is not None:
        sets.append("title = :t"); params["t"] = title
    if description is not None:
        sets.append("description = :d"); params["d"] = description
    if content_md is not None:
        sets.append("content_md = :md"); params["md"] = content_md
    if price_paise is not None:
        sets.append("price_paise = :p"); params["p"] = price_paise
    if cover_image_url is not None:
        sets.append("cover_image_url = :ci"); params["ci"] = cover_image_url
    if exam_id is not None:
        sets.append("exam_id = :ex"); params["ex"] = exam_id
    if subject_id is not None:
        sets.append("subject_id = :sb"); params["sb"] = subject_id
    if topic_ids is not None:
        sets.append("topic_ids = CAST(:tids AS jsonb)"); params["tids"] = json.dumps(topic_ids)
    if len(sets) == 1:
        return
    await session.execute(
        text(f"UPDATE {SCHEMA}.courses SET {', '.join(sets)} WHERE id = :id"),
        params,
    )


async def set_course_status(
    session: AsyncSession,
    *,
    course_id: str,
    status: str,
    published: bool = False,
) -> None:
    fields = ["status = :st", "updated_at = now()"]
    params: dict[str, Any] = {"id": course_id, "st": status}
    if published:
        fields.append("published_at = now()")
    await session.execute(
        text(f"UPDATE {SCHEMA}.courses SET {', '.join(fields)} WHERE id = :id"),
        params,
    )


async def list_creator_courses(
    session: AsyncSession, creator_user_id: str
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(f"""
                SELECT id, creator_user_id, title, description, content_md,
                       price_paise, tier, status, cover_image_url,
                       exam_id, subject_id, topic_ids,
                       created_at, published_at, updated_at
                  FROM {SCHEMA}.courses
                 WHERE creator_user_id = :uid
                 ORDER BY updated_at DESC
            """),
            {"uid": creator_user_id},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


async def list_published_courses(
    session: AsyncSession,
    *,
    exam_id: str | None = None,
    subject_id: str | None = None,
    creator_id: str | None = None,
    max_paise: int | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[dict[str, Any]], int]:
    where = ["status = 'PUBLISHED'"]
    params: dict[str, Any] = {"limit": per_page, "offset": (page - 1) * per_page}
    if exam_id is not None:
        where.append("exam_id = :ex"); params["ex"] = exam_id
    if subject_id is not None:
        where.append("subject_id = :sb"); params["sb"] = subject_id
    if creator_id is not None:
        where.append("creator_user_id = :cr"); params["cr"] = creator_id
    if max_paise is not None:
        where.append("price_paise <= :mp"); params["mp"] = max_paise
    where_clause = " AND ".join(where)
    items = (
        await session.execute(
            text(f"""
                SELECT id, creator_user_id, title, description, price_paise,
                       tier, cover_image_url
                  FROM {SCHEMA}.courses
                 WHERE {where_clause}
                 ORDER BY published_at DESC
                 LIMIT :limit OFFSET :offset
            """),
            params,
        )
    ).mappings().all()
    total = (
        await session.execute(
            text(f"SELECT COUNT(*) FROM {SCHEMA}.courses WHERE {where_clause}"),
            params,
        )
    ).scalar_one()
    return [dict(r) for r in items], int(total or 0)


async def list_course_admin_queue(
    session: AsyncSession,
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(f"""
                SELECT id, creator_user_id, title, price_paise, tier,
                       updated_at, created_at
                  FROM {SCHEMA}.courses
                 WHERE status = 'PENDING_REVIEW'
                 ORDER BY updated_at ASC
            """),
        )
    ).mappings().all()
    return [dict(r) for r in rows]


# -- course purchases -------------------------------------------------------


async def get_paid_purchase(
    session: AsyncSession, *, student_user_id: str, course_id: str
) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(f"""
                SELECT id, student_user_id, course_id, price_paise, commission_paise,
                       status, stripe_payment_intent_id, purchased_at, created_at
                  FROM {SCHEMA}.course_purchases
                 WHERE student_user_id = :sid AND course_id = :cid
                   AND status = 'PAID'
                 LIMIT 1
            """),
            {"sid": student_user_id, "cid": course_id},
        )
    ).mappings().first()
    return dict(row) if row else None


async def get_purchase(session: AsyncSession, purchase_id: str) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(f"""
                SELECT id, student_user_id, course_id, price_paise, commission_paise,
                       status, stripe_payment_intent_id, purchased_at, created_at
                  FROM {SCHEMA}.course_purchases
                 WHERE id = :id
            """),
            {"id": purchase_id},
        )
    ).mappings().first()
    return dict(row) if row else None


async def insert_purchase(
    session: AsyncSession,
    *,
    purchase_id: str,
    student_user_id: str,
    course_id: str,
    price_paise: int,
    commission_paise: int,
    stripe_payment_intent_id: str,
) -> None:
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.course_purchases
              (id, student_user_id, course_id, price_paise, commission_paise,
               stripe_payment_intent_id)
            VALUES (:id, :sid, :cid, :p, :c, :pi)
        """),
        {
            "id": purchase_id,
            "sid": student_user_id,
            "cid": course_id,
            "p": price_paise,
            "c": commission_paise,
            "pi": stripe_payment_intent_id,
        },
    )


async def set_purchase_status(
    session: AsyncSession,
    *,
    purchase_id: str,
    status: str,
    paid: bool = False,
) -> None:
    fields = ["status = :st", "updated_at = now()"]
    params: dict[str, Any] = {"id": purchase_id, "st": status}
    if paid:
        fields.append("purchased_at = now()")
    await session.execute(
        text(f"UPDATE {SCHEMA}.course_purchases SET {', '.join(fields)} WHERE id = :id"),
        params,
    )


async def list_student_purchases(
    session: AsyncSession, student_user_id: str
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(f"""
                SELECT id, student_user_id, course_id, price_paise, commission_paise,
                       status, stripe_payment_intent_id, purchased_at, created_at
                  FROM {SCHEMA}.course_purchases
                 WHERE student_user_id = :sid
                 ORDER BY created_at DESC
            """),
            {"sid": student_user_id},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


# -- ratings ----------------------------------------------------------------


async def insert_session_rating(
    session: AsyncSession,
    *,
    rating_id: str,
    booking_id: str,
    student_user_id: str,
    tutor_user_id: str,
    stars: int,
    comment: str | None = None,
) -> None:
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.tutor_session_ratings
              (id, booking_id, student_user_id, tutor_user_id, stars, comment)
            VALUES (:id, :bid, :sid, :tid, :s, :c)
        """),
        {
            "id": rating_id, "bid": booking_id, "sid": student_user_id,
            "tid": tutor_user_id, "s": stars, "c": comment,
        },
    )


async def insert_course_rating(
    session: AsyncSession,
    *,
    rating_id: str,
    purchase_id: str,
    course_id: str,
    student_user_id: str,
    stars: int,
    comment: str | None = None,
) -> None:
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.course_ratings
              (id, purchase_id, course_id, student_user_id, stars, comment)
            VALUES (:id, :pid, :cid, :sid, :s, :c)
        """),
        {
            "id": rating_id, "pid": purchase_id, "cid": course_id,
            "sid": student_user_id, "s": stars, "c": comment,
        },
    )


async def aggregate_tutor_ratings(
    session: AsyncSession, tutor_user_id: str, *, recent_n: int = 5
) -> dict[str, Any]:
    agg = (
        await session.execute(
            text(f"""
                SELECT COALESCE(AVG(stars), 0)::float AS avg, COUNT(*) AS cnt
                  FROM {SCHEMA}.tutor_session_ratings
                 WHERE tutor_user_id = :tid
            """),
            {"tid": tutor_user_id},
        )
    ).mappings().first()
    recent = (
        await session.execute(
            text(f"""
                SELECT id, stars, comment, created_at, student_user_id
                  FROM {SCHEMA}.tutor_session_ratings
                 WHERE tutor_user_id = :tid
                 ORDER BY created_at DESC
                 LIMIT :n
            """),
            {"tid": tutor_user_id, "n": recent_n},
        )
    ).mappings().all()
    return {"avg": float(agg["avg"]) if agg else 0.0, "count": int(agg["cnt"]) if agg else 0, "recent": [dict(r) for r in recent]}


async def aggregate_course_ratings(
    session: AsyncSession, course_id: str, *, recent_n: int = 5
) -> dict[str, Any]:
    agg = (
        await session.execute(
            text(f"""
                SELECT COALESCE(AVG(stars), 0)::float AS avg, COUNT(*) AS cnt
                  FROM {SCHEMA}.course_ratings
                 WHERE course_id = :cid
            """),
            {"cid": course_id},
        )
    ).mappings().first()
    recent = (
        await session.execute(
            text(f"""
                SELECT id, stars, comment, created_at, student_user_id
                  FROM {SCHEMA}.course_ratings
                 WHERE course_id = :cid
                 ORDER BY created_at DESC
                 LIMIT :n
            """),
            {"cid": course_id, "n": recent_n},
        )
    ).mappings().all()
    return {"avg": float(agg["avg"]) if agg else 0.0, "count": int(agg["cnt"]) if agg else 0, "recent": [dict(r) for r in recent]}
