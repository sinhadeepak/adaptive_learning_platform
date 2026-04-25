# ruff: noqa: S608 - schema name is a hardcoded constant, not user input
"""Persistence for Analytics — mastery + readiness."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from analytics.mastery import MasteryRow

SCHEMA = "analytics_schema"


async def is_session_processed(session: AsyncSession, session_id: str) -> bool:
    res = await session.execute(
        text(f"SELECT 1 FROM {SCHEMA}.processed_sessions WHERE session_id = :sid"),
        {"sid": session_id},
    )
    return res.first() is not None


async def mark_session_processed(session: AsyncSession, session_id: str) -> None:
    await session.execute(
        text(
            f"INSERT INTO {SCHEMA}.processed_sessions (session_id) VALUES (:sid) "
            "ON CONFLICT (session_id) DO NOTHING"
        ),
        {"sid": session_id},
    )


async def get_mastery(session: AsyncSession, user_id: str, topic_id: str) -> MasteryRow | None:
    res = await session.execute(
        text(
            f"SELECT user_id, topic_id, ewa, n FROM {SCHEMA}.mastery "
            "WHERE user_id = :uid AND topic_id = :tid"
        ),
        {"uid": user_id, "tid": topic_id},
    )
    row = res.first()
    if row is None:
        return None
    return MasteryRow(user_id=str(row[0]), topic_id=str(row[1]), ewa=float(row[2]), n=int(row[3]))


async def list_user_mastery(session: AsyncSession, user_id: str) -> list[MasteryRow]:
    res = await session.execute(
        text(
            f"SELECT user_id, topic_id, ewa, n FROM {SCHEMA}.mastery WHERE user_id = :uid "
            "ORDER BY topic_id"
        ),
        {"uid": user_id},
    )
    return [
        MasteryRow(user_id=str(r[0]), topic_id=str(r[1]), ewa=float(r[2]), n=int(r[3])) for r in res
    ]


async def upsert_mastery(
    session: AsyncSession,
    user_id: str,
    topic_id: str,
    new_ewa: float,
    new_n: int,
    last_session_id: str,
) -> None:
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.mastery (user_id, topic_id, ewa, n, last_session_id, updated_at)
            VALUES (:uid, :tid, :ewa, :n, :sid, NOW())
            ON CONFLICT (user_id, topic_id) DO UPDATE
              SET ewa = EXCLUDED.ewa,
                  n = EXCLUDED.n,
                  last_session_id = EXCLUDED.last_session_id,
                  updated_at = NOW()
            """
        ),
        {"uid": user_id, "tid": topic_id, "ewa": new_ewa, "n": new_n, "sid": last_session_id},
    )


async def upsert_readiness(
    session: AsyncSession,
    user_id: str,
    scope: str,
    score: float,
    n_topics: int,
) -> None:
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.readiness (user_id, scope, score, n_topics, updated_at)
            VALUES (:uid, :scope, :score, :n, NOW())
            ON CONFLICT (user_id, scope) DO UPDATE
              SET score = EXCLUDED.score, n_topics = EXCLUDED.n_topics, updated_at = NOW()
            """
        ),
        {"uid": user_id, "scope": scope, "score": score, "n": n_topics},
    )


async def get_readiness(session: AsyncSession, user_id: str, scope: str = "GLOBAL") -> dict | None:
    res = await session.execute(
        text(
            f"SELECT user_id, scope, score, n_topics, updated_at "
            f"FROM {SCHEMA}.readiness WHERE user_id = :uid AND scope = :scope"
        ),
        {"uid": user_id, "scope": scope},
    )
    row = res.first()
    if row is None:
        return None
    return {
        "user_id": str(row[0]),
        "scope": str(row[1]),
        "score": float(row[2]),
        "n_topics": int(row[3]),
        "updated_at": row[4].isoformat(),
    }
