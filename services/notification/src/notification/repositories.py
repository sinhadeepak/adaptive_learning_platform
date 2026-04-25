# ruff: noqa: S608 - schema name is a hardcoded constant
"""Persistence for Notification — notifications + processed_events."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "notification_schema"


@dataclass(frozen=True)
class NotificationRow:
    id: str
    user_id: str
    type: str
    channel: str
    payload: dict[str, Any]
    created_at: datetime


async def is_event_processed(session: AsyncSession, event_id: str) -> bool:
    res = await session.execute(
        text(f"SELECT 1 FROM {SCHEMA}.processed_events WHERE event_id = :eid"),
        {"eid": event_id},
    )
    return res.first() is not None


async def mark_event_processed(session: AsyncSession, event_id: str) -> None:
    await session.execute(
        text(
            f"INSERT INTO {SCHEMA}.processed_events (event_id) VALUES (:eid) "
            "ON CONFLICT (event_id) DO NOTHING"
        ),
        {"eid": event_id},
    )


async def append_notification(
    session: AsyncSession,
    *,
    notification_id: str,
    user_id: str,
    type_: str,
    channel: str,
    payload: dict[str, Any],
) -> None:
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.notifications (id, user_id, type, channel, payload)
            VALUES (:id, :uid, :type, :ch, CAST(:payload AS JSONB))
            """
        ),
        {
            "id": notification_id,
            "uid": user_id,
            "type": type_,
            "ch": channel,
            "payload": json.dumps(payload),
        },
    )


async def list_for_user(
    session: AsyncSession, user_id: str, limit: int = 50
) -> list[NotificationRow]:
    res = await session.execute(
        text(
            f"""
            SELECT id, user_id, type, channel, payload, created_at
              FROM {SCHEMA}.notifications
             WHERE user_id = :uid
          ORDER BY created_at DESC
             LIMIT :lim
            """
        ),
        {"uid": user_id, "lim": limit},
    )
    rows = []
    for r in res:
        # payload comes back as dict (asyncpg jsonb) or str depending on driver version
        p = r[4] if isinstance(r[4], dict) else json.loads(r[4])
        rows.append(
            NotificationRow(
                id=str(r[0]),
                user_id=str(r[1]),
                type=str(r[2]),
                channel=str(r[3]),
                payload=p,
                created_at=r[5],
            )
        )
    return rows
