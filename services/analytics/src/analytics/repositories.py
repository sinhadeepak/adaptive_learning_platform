# ruff: noqa: S608 - schema name is a hardcoded constant, not user input
"""Persistence for Analytics — mastery + readiness."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

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


@dataclass(frozen=True)
class StreakRow:
    user_id: str
    current_streak: int
    longest_streak: int
    last_active_date: date


async def get_streak(session: AsyncSession, user_id: str) -> StreakRow | None:
    res = await session.execute(
        text(
            f"SELECT user_id, current_streak, longest_streak, last_active_date "
            f"FROM {SCHEMA}.streaks WHERE user_id = :uid"
        ),
        {"uid": user_id},
    )
    row = res.first()
    if row is None:
        return None
    return StreakRow(
        user_id=str(row[0]),
        current_streak=int(row[1]),
        longest_streak=int(row[2]),
        last_active_date=row[3],
    )


async def upsert_daily_activity(
    session: AsyncSession,
    *,
    user_id: str,
    activity_date: date,
    sessions_inc: int = 1,
    questions_inc: int = 0,
    minutes_inc: int = 0,
) -> None:
    """Increment the per-day activity counters for a user. Idempotency comes
    from the caller (process_session is gated by processed_sessions); each
    session counts once toward the day it was submitted."""
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.daily_activity
              (user_id, activity_date, sessions_count, questions_answered, study_minutes, updated_at)
            VALUES (:uid, :dt, :sinc, :qinc, :minc, NOW())
            ON CONFLICT (user_id, activity_date) DO UPDATE
              SET sessions_count = {SCHEMA}.daily_activity.sessions_count + EXCLUDED.sessions_count,
                  questions_answered = {SCHEMA}.daily_activity.questions_answered + EXCLUDED.questions_answered,
                  study_minutes = {SCHEMA}.daily_activity.study_minutes + EXCLUDED.study_minutes,
                  updated_at = NOW()
            """
        ),
        {
            "uid": user_id,
            "dt": activity_date,
            "sinc": sessions_inc,
            "qinc": questions_inc,
            "minc": minutes_inc,
        },
    )


async def list_daily_activity(
    session: AsyncSession,
    user_id: str,
    days: int = 30,
) -> list[dict]:
    """Returns rows for the user across the last `days` days (newest first).
    Days with no activity are simply absent — callers fill zeros."""
    res = await session.execute(
        text(
            f"""
            SELECT activity_date, sessions_count, questions_answered, study_minutes
              FROM {SCHEMA}.daily_activity
             WHERE user_id = :uid
               AND activity_date >= (CURRENT_DATE - CAST(:days AS INTEGER))
          ORDER BY activity_date DESC
            """
        ),
        {"uid": user_id, "days": days},
    )
    return [
        {
            "date": r["activity_date"],
            "sessions": r["sessions_count"],
            "questions": r["questions_answered"],
            "minutes": r["study_minutes"],
        }
        for r in res.mappings()
    ]


async def upsert_streak(
    session: AsyncSession,
    *,
    user_id: str,
    current_streak: int,
    longest_streak: int,
    last_active_date: date,
) -> None:
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.streaks
              (user_id, current_streak, longest_streak, last_active_date, updated_at)
            VALUES (:uid, :cur, :lng, :dt, NOW())
            ON CONFLICT (user_id) DO UPDATE
              SET current_streak = EXCLUDED.current_streak,
                  longest_streak = EXCLUDED.longest_streak,
                  last_active_date = EXCLUDED.last_active_date,
                  updated_at = NOW()
            """
        ),
        {
            "uid": user_id,
            "cur": current_streak,
            "lng": longest_streak,
            "dt": last_active_date,
        },
    )
