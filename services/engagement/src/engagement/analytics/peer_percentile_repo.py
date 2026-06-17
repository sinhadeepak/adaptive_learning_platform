"""Sprint 32 (P4-S32) — peer-percentile DB helpers."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "analytics_schema"


async def list_peer_ewas(
    session: AsyncSession,
    *,
    exam_id: str,
    topic_id: str,
    exclude_user_id: str,
) -> list[float]:
    """Return EWAs for every user-with-mastery on the topic (excluding the
    requesting user).

    Phase 5 (P5-S37.5): the previous cross-DB JOIN through
    catalog_schema.topics + .subjects (used to scope by exam_id) is
    removed. Filtering by `topic_id = :tid` already implicitly scopes
    to the exam (each topic belongs to one exam-subject in
    catalog_schema). The exam_id parameter is preserved for API
    compatibility but no longer drives the SQL.

    Returns the raw float list for the pure-function aggregator to
    consume.
    """
    rows = (
        await session.execute(
            text(
                f"""
                SELECT m.ewa
                  FROM {SCHEMA}.mastery m
                 WHERE m.topic_id = :tid
                   AND m.user_id <> :uid
                   AND m.n > 0
                """
            ),
            {"tid": topic_id, "uid": exclude_user_id},
        )
    ).all()
    return [float(r[0]) for r in rows]


async def get_user_topic_ewa(
    session: AsyncSession, *, user_id: str, topic_id: str
) -> float | None:
    row = (
        await session.execute(
            text(
                f"SELECT ewa FROM {SCHEMA}.mastery "
                "WHERE user_id = :uid AND topic_id = :tid"
            ),
            {"uid": user_id, "tid": topic_id},
        )
    ).first()
    return float(row[0]) if row else None
