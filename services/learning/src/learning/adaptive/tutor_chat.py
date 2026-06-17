"""Phase 1D-3 — AI tutor chat persistence.

Two surfaces:
  - list_sessions(user_id, q?, topic_id?) — paginated session list with optional
    keyword search across title/summary/last-message.
  - get_session(session_id) — full transcript.
  - delete_session(session_id) — cascade-removes messages.
  - append_message(session_id, role, content) — durably store a turn.
  - prior_summaries(user_id, limit=3) — top-3 most-recent session summaries
    for context recall when starting a fresh chat.

Storage lives in `content_schema.tutor_chat_sessions` + `tutor_chat_messages`
(migration 037).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class ChatSessionSummary:
    id: str
    user_id: str
    topic_id: str | None
    title: str | None
    summary: str | None
    started_at: str
    last_msg_at: str
    msg_count: int


@dataclass
class ChatMessage:
    idx: int
    role: str
    content_md: str
    created_at: str


async def create_session(
    session: AsyncSession,
    *,
    user_id: str,
    topic_id: str | None,
    title: str | None,
) -> str:
    row = (
        await session.execute(
            text(
                """
                INSERT INTO content_schema.tutor_chat_sessions
                  (user_id, topic_id, title)
                VALUES
                  (CAST(:uid AS uuid),
                   CAST(:tid AS uuid),
                   :title)
                RETURNING id::text
                """
            ),
            {"uid": user_id, "tid": topic_id, "title": title},
        )
    ).first()
    await session.commit()
    return row[0]


async def append_message(
    session: AsyncSession,
    *,
    session_id: str,
    role: str,
    content: str,
) -> int:
    row = (
        await session.execute(
            text(
                """
                INSERT INTO content_schema.tutor_chat_messages
                  (session_id, idx, role, content_md)
                SELECT
                  CAST(:sid AS uuid),
                  COALESCE(MAX(idx), -1) + 1,
                  :role,
                  :content
                FROM content_schema.tutor_chat_messages
                WHERE session_id = CAST(:sid AS uuid)
                RETURNING idx
                """
            ),
            {"sid": session_id, "role": role, "content": content[:32000]},
        )
    ).first()
    await session.execute(
        text(
            """
            UPDATE content_schema.tutor_chat_sessions
               SET last_msg_at = NOW(),
                   msg_count   = msg_count + 1,
                   title       = COALESCE(title,
                                          CASE WHEN :role = 'user'
                                               THEN substring(:preview FROM 1 FOR 60)
                                               ELSE NULL END)
             WHERE id = CAST(:sid AS uuid)
            """
        ),
        {"sid": session_id, "role": role, "preview": content},
    )
    await session.commit()
    return int(row[0]) if row else 0


async def list_sessions(
    session: AsyncSession,
    *,
    user_id: str,
    q: str | None = None,
    topic_id: str | None = None,
    limit: int = 50,
) -> list[ChatSessionSummary]:
    params: dict[str, Any] = {"uid": user_id, "lim": min(limit, 200)}
    where = "user_id = CAST(:uid AS uuid)"
    if topic_id:
        where += " AND topic_id = CAST(:tid AS uuid)"
        params["tid"] = topic_id
    if q:
        # Naive ILIKE — pg_trgm could replace this when scale demands it.
        where += " AND (COALESCE(title,'') ILIKE :q OR COALESCE(summary,'') ILIKE :q)"
        params["q"] = f"%{q}%"
    rows = (
        await session.execute(
            text(
                f"""
                SELECT id::text, user_id::text, topic_id::text,
                       title, summary,
                       started_at::text, last_msg_at::text, msg_count
                  FROM content_schema.tutor_chat_sessions
                 WHERE {where}
                 ORDER BY last_msg_at DESC
                 LIMIT :lim
                """
            ),
            params,
        )
    ).all()
    return [
        ChatSessionSummary(
            id=r[0],
            user_id=r[1],
            topic_id=r[2],
            title=r[3],
            summary=r[4],
            started_at=r[5],
            last_msg_at=r[6],
            msg_count=int(r[7]),
        )
        for r in rows
    ]


async def get_transcript(
    session: AsyncSession, *, session_id: str
) -> tuple[ChatSessionSummary | None, list[ChatMessage]]:
    head = (
        await session.execute(
            text(
                """
                SELECT id::text, user_id::text, topic_id::text,
                       title, summary,
                       started_at::text, last_msg_at::text, msg_count
                  FROM content_schema.tutor_chat_sessions
                 WHERE id = CAST(:sid AS uuid)
                """
            ),
            {"sid": session_id},
        )
    ).first()
    if head is None:
        return None, []
    msgs = (
        await session.execute(
            text(
                """
                SELECT idx, role, content_md, created_at::text
                  FROM content_schema.tutor_chat_messages
                 WHERE session_id = CAST(:sid AS uuid)
                 ORDER BY idx ASC
                """
            ),
            {"sid": session_id},
        )
    ).all()
    summary = ChatSessionSummary(
        id=head[0],
        user_id=head[1],
        topic_id=head[2],
        title=head[3],
        summary=head[4],
        started_at=head[5],
        last_msg_at=head[6],
        msg_count=int(head[7]),
    )
    messages = [
        ChatMessage(idx=int(m[0]), role=m[1], content_md=m[2], created_at=m[3])
        for m in msgs
    ]
    return summary, messages


async def delete_session(session: AsyncSession, *, session_id: str) -> bool:
    res = await session.execute(
        text(
            """
            DELETE FROM content_schema.tutor_chat_sessions
             WHERE id = CAST(:sid AS uuid)
            """
        ),
        {"sid": session_id},
    )
    await session.commit()
    return (res.rowcount or 0) > 0


async def prior_summaries(
    session: AsyncSession, *, user_id: str, limit: int = 3
) -> list[str]:
    rows = (
        await session.execute(
            text(
                """
                SELECT COALESCE(summary, title, '') AS s
                  FROM content_schema.tutor_chat_sessions
                 WHERE user_id = CAST(:uid AS uuid)
                   AND COALESCE(summary, title) IS NOT NULL
                 ORDER BY last_msg_at DESC
                 LIMIT :lim
                """
            ),
            {"uid": user_id, "lim": limit},
        )
    ).all()
    return [r[0] for r in rows if r[0]]
