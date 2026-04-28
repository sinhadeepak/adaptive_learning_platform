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
