"""Persistence for content_schema.user_notes — per-exam student notebook."""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

MAX_NOTES_PER_EXAM = 100


def _row_to_note(row: Any) -> dict:
    return {
        "id": str(row["id"]),
        "exam_id": str(row["exam_id"]),
        "title": row["title"],
        "body": row["body"] if isinstance(row["body"], dict) else json.loads(row["body"]),
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
    }


async def count_for_exam(s: AsyncSession, *, user_id: str, exam_id: str) -> int:
    res = await s.execute(
        text("SELECT COUNT(*) FROM content_schema.user_notes "
             "WHERE user_id = CAST(:u AS uuid) AND exam_id = CAST(:e AS uuid)"),
        {"u": user_id, "e": exam_id})
    return int(res.scalar_one())


async def list_for_exam(s: AsyncSession, *, user_id: str, exam_id: str) -> list[dict]:
    res = await s.execute(
        text("SELECT id, title, updated_at FROM content_schema.user_notes "
             "WHERE user_id = CAST(:u AS uuid) AND exam_id = CAST(:e AS uuid) "
             "ORDER BY updated_at DESC"),
        {"u": user_id, "e": exam_id})
    return [
        {"id": str(r["id"]), "title": r["title"], "updated_at": r["updated_at"].isoformat()}
        for r in res.mappings().all()
    ]


async def create(s: AsyncSession, *, user_id: str, tenant_id: str, exam_id: str, title: str) -> dict:
    res = await s.execute(
        text("INSERT INTO content_schema.user_notes (user_id, tenant_id, exam_id, title) "
             "VALUES (CAST(:u AS uuid), CAST(:t AS uuid), CAST(:e AS uuid), :title) "
             "RETURNING id, exam_id, title, body, created_at, updated_at"),
        {"u": user_id, "t": tenant_id, "e": exam_id, "title": title})
    await s.commit()
    return _row_to_note(res.mappings().one())


async def get_owned(s: AsyncSession, *, note_id: str, user_id: str) -> dict | None:
    res = await s.execute(
        text("SELECT id, exam_id, title, body, created_at, updated_at "
             "FROM content_schema.user_notes "
             "WHERE id = CAST(:n AS uuid) AND user_id = CAST(:u AS uuid)"),
        {"n": note_id, "u": user_id})
    row = res.mappings().first()
    return _row_to_note(row) if row else None


async def update_owned(
    s: AsyncSession, *, note_id: str, user_id: str,
    title: str | None, body: dict | None,
) -> dict | None:
    res = await s.execute(
        text("""
            UPDATE content_schema.user_notes
               SET title = COALESCE(:title, title),
                   body  = COALESCE(CAST(:body AS jsonb), body),
                   updated_at = now()
             WHERE id = CAST(:n AS uuid) AND user_id = CAST(:u AS uuid)
         RETURNING id, exam_id, title, body, created_at, updated_at
        """),
        {"n": note_id, "u": user_id, "title": title,
         "body": json.dumps(body) if body is not None else None})
    await s.commit()
    row = res.mappings().first()
    return _row_to_note(row) if row else None


async def delete_owned(s: AsyncSession, *, note_id: str, user_id: str) -> bool:
    res = await s.execute(
        text("DELETE FROM content_schema.user_notes "
             "WHERE id = CAST(:n AS uuid) AND user_id = CAST(:u AS uuid)"),
        {"n": note_id, "u": user_id})
    await s.commit()
    return (res.rowcount or 0) > 0
