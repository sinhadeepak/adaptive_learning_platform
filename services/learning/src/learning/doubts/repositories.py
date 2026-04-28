# ruff: noqa: S608 - schema name is a hardcoded constant
"""Persistence for doubts_schema."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "doubts_schema"


def _doubt_row_to_dict(r: Any, answer_count: int = 0) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "user_id": str(r["user_id"]),
        "question_text": r["question_text"],
        "photo_data_url": r.get("photo_data_url"),
        "topic_id": str(r["topic_id"]) if r.get("topic_id") else None,
        "topic_title": r.get("topic_title"),
        "status": r["status"],
        "created_at": r["created_at"],
        "last_activity_at": r["last_activity_at"],
        "answer_count": answer_count,
    }


def _answer_row_to_dict(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "doubt_id": str(r["doubt_id"]),
        "author_id": str(r["author_id"]) if r.get("author_id") else None,
        "author_role": r["author_role"],
        "content": r["content"],
        "source": r["source"],
        "created_at": r["created_at"],
        "accepted": bool(r["accepted"]),
    }


async def create_doubt(
    session: AsyncSession,
    *,
    user_id: str,
    question_text: str,
    photo_data_url: str | None,
    topic_id: str | None,
    topic_title: str | None,
) -> dict[str, Any]:
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.doubts
              (id, user_id, question_text, photo_data_url, topic_id, topic_title, status)
            VALUES (:id, :uid, :qt, :pd, :tid, :tt, 'OPEN')
            RETURNING id, user_id, question_text, photo_data_url, topic_id, topic_title,
                      status, created_at, last_activity_at
            """
        ),
        {
            "id": str(uuid4()),
            "uid": user_id,
            "qt": question_text,
            "pd": photo_data_url,
            "tid": topic_id,
            "tt": topic_title,
        },
    )
    return _doubt_row_to_dict(res.mappings().first())


async def list_doubts_for_user(session: AsyncSession, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    res = await session.execute(
        text(
            f"""
            SELECT d.id, d.user_id, d.question_text, d.photo_data_url, d.topic_id,
                   d.topic_title, d.status, d.created_at, d.last_activity_at,
                   (SELECT count(*) FROM {SCHEMA}.doubt_answers a
                    WHERE a.doubt_id = d.id) AS answer_count
              FROM {SCHEMA}.doubts d
             WHERE d.user_id = :uid
          ORDER BY d.last_activity_at DESC
             LIMIT :lim
            """
        ),
        {"uid": user_id, "lim": limit},
    )
    return [_doubt_row_to_dict(row, int(row["answer_count"])) for row in res.mappings()]


async def get_doubt(session: AsyncSession, doubt_id: str) -> dict[str, Any] | None:
    res = await session.execute(
        text(
            f"""
            SELECT id, user_id, question_text, photo_data_url, topic_id, topic_title,
                   status, created_at, last_activity_at
              FROM {SCHEMA}.doubts
             WHERE id = :id
            """
        ),
        {"id": doubt_id},
    )
    row = res.mappings().first()
    if row is None:
        return None
    cnt = await session.execute(
        text(f"SELECT count(*) AS n FROM {SCHEMA}.doubt_answers WHERE doubt_id = :id"),
        {"id": doubt_id},
    )
    answer_count = int(cnt.mappings().first()["n"])
    return _doubt_row_to_dict(row, answer_count)


async def list_answers(session: AsyncSession, doubt_id: str) -> list[dict[str, Any]]:
    res = await session.execute(
        text(
            f"""
            SELECT id, doubt_id, author_id, author_role, content, source,
                   created_at, accepted
              FROM {SCHEMA}.doubt_answers
             WHERE doubt_id = :id
          ORDER BY created_at ASC
            """
        ),
        {"id": doubt_id},
    )
    return [_answer_row_to_dict(r) for r in res.mappings()]


async def insert_answer(
    session: AsyncSession,
    *,
    doubt_id: str,
    author_id: str | None,
    author_role: str,
    content: str,
    source: str,
) -> dict[str, Any]:
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.doubt_answers
              (id, doubt_id, author_id, author_role, content, source)
            VALUES (:id, :did, :aid, :role, :content, :src)
            RETURNING id, doubt_id, author_id, author_role, content, source,
                      created_at, accepted
            """
        ),
        {
            "id": str(uuid4()),
            "did": doubt_id,
            "aid": author_id,
            "role": author_role,
            "content": content,
            "src": source,
        },
    )
    # Bump last_activity + flip status to ANSWERED.
    await session.execute(
        text(
            f"""
            UPDATE {SCHEMA}.doubts
               SET last_activity_at = now(),
                   status = CASE WHEN status = 'OPEN' THEN 'ANSWERED' ELSE status END
             WHERE id = :id
            """
        ),
        {"id": doubt_id},
    )
    return _answer_row_to_dict(res.mappings().first())


async def accept_answer(session: AsyncSession, doubt_id: str, answer_id: str) -> bool:
    res = await session.execute(
        text(
            f"""
            UPDATE {SCHEMA}.doubt_answers
               SET accepted = TRUE
             WHERE id = :aid AND doubt_id = :did
            """
        ),
        {"aid": answer_id, "did": doubt_id},
    )
    if res.rowcount == 0:
        return False
    await session.execute(
        text(
            f"UPDATE {SCHEMA}.doubts SET status = 'RESOLVED', last_activity_at = now() WHERE id = :id"
        ),
        {"id": doubt_id},
    )
    return True
