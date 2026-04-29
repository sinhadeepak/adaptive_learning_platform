"""Sprint 27 (P4-S27) — DB helpers for analytics_schema.revision_queue."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "analytics_schema"


@dataclass(frozen=True)
class RevisionRow:
    user_id: str
    topic_id: str
    exam_id: str | None
    last_attempt_at: datetime
    due_at: datetime
    interval_days: int
    ease_factor: float
    attempts: int


async def get_state(
    session: AsyncSession, user_id: str, topic_id: str
) -> RevisionRow | None:
    row = (
        await session.execute(
            text(
                f"""
                SELECT user_id, topic_id, exam_id, last_attempt_at,
                       due_at, interval_days, ease_factor, attempts
                  FROM {SCHEMA}.revision_queue
                 WHERE user_id = :uid AND topic_id = :tid
                """
            ),
            {"uid": user_id, "tid": topic_id},
        )
    ).mappings().first()
    if row is None:
        return None
    return RevisionRow(
        user_id=str(row["user_id"]),
        topic_id=str(row["topic_id"]),
        exam_id=str(row["exam_id"]) if row["exam_id"] else None,
        last_attempt_at=row["last_attempt_at"],
        due_at=row["due_at"],
        interval_days=int(row["interval_days"]),
        ease_factor=float(row["ease_factor"]),
        attempts=int(row["attempts"]),
    )


async def upsert(
    session: AsyncSession,
    *,
    user_id: str,
    topic_id: str,
    last_attempt_at: datetime,
    due_at: datetime,
    interval_days: int,
    ease_factor: float,
    attempts: int,
    exam_id: str | None = None,
) -> None:
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.revision_queue
              (user_id, topic_id, exam_id, last_attempt_at, due_at,
               interval_days, ease_factor, attempts)
            VALUES
              (:uid, :tid, :eid, :last, :due, :iv, :ef, :n)
            ON CONFLICT (user_id, topic_id) DO UPDATE
              SET exam_id         = COALESCE(EXCLUDED.exam_id, {SCHEMA}.revision_queue.exam_id),
                  last_attempt_at = EXCLUDED.last_attempt_at,
                  due_at          = EXCLUDED.due_at,
                  interval_days   = EXCLUDED.interval_days,
                  ease_factor     = EXCLUDED.ease_factor,
                  attempts        = EXCLUDED.attempts
            """
        ),
        {
            "uid": user_id,
            "tid": topic_id,
            "eid": exam_id,
            "last": last_attempt_at,
            "due": due_at,
            "iv": interval_days,
            "ef": ease_factor,
            "n": attempts,
        },
    )


async def list_due(
    session: AsyncSession,
    user_id: str,
    *,
    now: datetime,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Items where due_at <= now, ordered by due_at ASC (most overdue first).
    Topic title is left-joined; missing titles fall back to empty string."""
    rows = (
        await session.execute(
            text(
                f"""
                SELECT q.topic_id, q.last_attempt_at, q.due_at,
                       q.interval_days, q.ease_factor, q.attempts,
                       t.title AS topic_title
                  FROM {SCHEMA}.revision_queue q
             LEFT JOIN catalog_schema.topics t ON t.id = q.topic_id
                 WHERE q.user_id = :uid
                   AND q.due_at <= :now
                 ORDER BY q.due_at ASC, q.last_attempt_at ASC
                 LIMIT :limit
                """
            ),
            {"uid": user_id, "now": now, "limit": limit},
        )
    ).mappings().all()
    return [
        {
            "topicId": str(r["topic_id"]),
            "topicTitle": r["topic_title"] or "",
            "lastAttemptAt": r["last_attempt_at"],
            "dueAt": r["due_at"],
            "intervalDays": int(r["interval_days"]),
            "easeFactor": float(r["ease_factor"]),
            "attempts": int(r["attempts"]),
        }
        for r in rows
    ]
