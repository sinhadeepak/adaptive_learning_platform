"""DB-side CRUD for content_schema.concept_resources."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "content_schema"


def _row_to_dict(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "topic_id": str(r["topic_id"]) if r["topic_id"] else None,
        "concept_id": str(r["concept_id"]) if r["concept_id"] else None,
        "question_id": str(r["question_id"]) if r["question_id"] else None,
        "resource_type": r["resource_type"],
        "external_id": r["external_id"],
        "url": r["url"],
        "title": r["title"],
        "description": r["description"],
        "channel_name": r["channel_name"],
        "duration_seconds": (
            int(r["duration_seconds"]) if r["duration_seconds"] is not None else None
        ),
        "thumbnail_url": r["thumbnail_url"],
        "language": r["language"],
        "difficulty": r["difficulty"],
        "status": r["status"],
        "position": int(r["position"]),
        "added_by": str(r["added_by"]),
        "added_at": r["added_at"],
        "approved_by": str(r["approved_by"]) if r["approved_by"] else None,
        "approved_at": r["approved_at"],
        "review_notes": r["review_notes"],
        "is_available": bool(r["is_available"]),
    }


async def insert_resource(
    session: AsyncSession,
    *,
    topic_id: UUID | None,
    concept_id: UUID | None,
    question_id: UUID | None,
    resource_type: str,
    external_id: str | None,
    url: str,
    title: str,
    description: str | None,
    channel_name: str | None,
    duration_seconds: int | None,
    thumbnail_url: str | None,
    language: str,
    difficulty: str | None,
    position: int,
    added_by: UUID,
    initial_status: str,
) -> dict[str, Any]:
    rid = str(uuid4())
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.concept_resources
              (id, topic_id, concept_id, question_id,
               resource_type, external_id, url, title, description, channel_name,
               duration_seconds, thumbnail_url, language, difficulty,
               status, position, added_by)
            VALUES
              (CAST(:id AS uuid),
               CAST(:topic_id AS uuid),
               CAST(:concept_id AS uuid),
               CAST(:question_id AS uuid),
               :resource_type, :external_id, :url, :title, :description, :channel_name,
               :duration_seconds, :thumbnail_url, :language, :difficulty,
               :status, :position, CAST(:added_by AS uuid))
            RETURNING id, topic_id, concept_id, question_id,
                      resource_type, external_id, url, title, description, channel_name,
                      duration_seconds, thumbnail_url, language, difficulty,
                      status, position, added_by, added_at,
                      approved_by, approved_at, review_notes, is_available
            """
        ),
        {
            "id": rid,
            "topic_id": str(topic_id) if topic_id else None,
            "concept_id": str(concept_id) if concept_id else None,
            "question_id": str(question_id) if question_id else None,
            "resource_type": resource_type,
            "external_id": external_id,
            "url": url,
            "title": title,
            "description": description,
            "channel_name": channel_name,
            "duration_seconds": duration_seconds,
            "thumbnail_url": thumbnail_url,
            "language": language,
            "difficulty": difficulty,
            "status": initial_status,
            "position": position,
            "added_by": str(added_by),
        },
    )
    return _row_to_dict(res.mappings().first())


async def list_resources(
    session: AsyncSession,
    *,
    topic_id: UUID | None = None,
    concept_id: UUID | None = None,
    question_id: UUID | None = None,
    statuses: list[str] | None = None,
    language: str | None = None,
    added_by: UUID | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    where: list[str] = []
    params: dict[str, Any] = {"lim": limit, "off": offset}
    if topic_id is not None:
        where.append("topic_id = CAST(:tid AS uuid)")
        params["tid"] = str(topic_id)
    if concept_id is not None:
        where.append("concept_id = CAST(:cid AS uuid)")
        params["cid"] = str(concept_id)
    if question_id is not None:
        where.append("question_id = CAST(:qid AS uuid)")
        params["qid"] = str(question_id)
    if statuses:
        placeholders = ", ".join(f":s_{i}" for i in range(len(statuses)))
        where.append(f"status IN ({placeholders})")
        for i, s in enumerate(statuses):
            params[f"s_{i}"] = s
    if language is not None:
        where.append("language = :lang")
        params["lang"] = language
    if added_by is not None:
        where.append("added_by = CAST(:uid AS uuid)")
        params["uid"] = str(added_by)
    where.append("retired_at IS NULL")
    where.append("is_available = TRUE")
    where_clause = "WHERE " + " AND ".join(where) if where else ""

    count_res = await session.execute(
        text(f"SELECT COUNT(*) FROM {SCHEMA}.concept_resources {where_clause}"),
        {k: v for k, v in params.items() if k not in ("lim", "off")},
    )
    total = int(count_res.scalar() or 0)

    res = await session.execute(
        text(
            f"""
            SELECT id, topic_id, concept_id, question_id,
                   resource_type, external_id, url, title, description, channel_name,
                   duration_seconds, thumbnail_url, language, difficulty,
                   status, position, added_by, added_at,
                   approved_by, approved_at, review_notes, is_available
              FROM {SCHEMA}.concept_resources {where_clause}
          ORDER BY position ASC, added_at DESC
             LIMIT :lim OFFSET :off
            """
        ),
        params,
    )
    rows = [_row_to_dict(r) for r in res.mappings()]
    return rows, total


async def get_resource(
    session: AsyncSession, resource_id: UUID
) -> dict[str, Any] | None:
    res = await session.execute(
        text(
            f"""
            SELECT id, topic_id, concept_id, question_id,
                   resource_type, external_id, url, title, description, channel_name,
                   duration_seconds, thumbnail_url, language, difficulty,
                   status, position, added_by, added_at,
                   approved_by, approved_at, review_notes, is_available
              FROM {SCHEMA}.concept_resources
             WHERE id = CAST(:id AS uuid)
            """
        ),
        {"id": str(resource_id)},
    )
    row = res.mappings().first()
    return _row_to_dict(row) if row else None


async def update_status(
    session: AsyncSession,
    *,
    resource_id: UUID,
    status: str,
    approved_by: UUID | None = None,
    notes: str | None = None,
) -> dict[str, Any] | None:
    # asyncpg requires every NULL parameter to have an explicit type
    # cast — otherwise the CASE/COALESCE expression can't infer it.
    res = await session.execute(
        text(
            f"""
            WITH inputs AS (
                SELECT CAST(:approved_by AS uuid) AS new_approved_by,
                       CAST(:notes AS text)       AS new_notes
            )
            UPDATE {SCHEMA}.concept_resources t
               SET status      = :status,
                   approved_by = COALESCE(inputs.new_approved_by, t.approved_by),
                   approved_at = CASE WHEN inputs.new_approved_by IS NOT NULL
                                      THEN now() ELSE t.approved_at END,
                   review_notes = COALESCE(inputs.new_notes, t.review_notes)
              FROM inputs
             WHERE t.id = CAST(:id AS uuid)
         RETURNING t.id, t.topic_id, t.concept_id, t.question_id,
                   t.resource_type, t.external_id, t.url, t.title, t.description, t.channel_name,
                   t.duration_seconds, t.thumbnail_url, t.language, t.difficulty,
                   t.status, t.position, t.added_by, t.added_at,
                   t.approved_by, t.approved_at, t.review_notes, t.is_available
            """
        ),
        {
            "id": str(resource_id),
            "status": status,
            "approved_by": str(approved_by) if approved_by else None,
            "notes": notes,
        },
    )
    row = res.mappings().first()
    return _row_to_dict(row) if row else None


async def soft_delete(session: AsyncSession, resource_id: UUID) -> bool:
    res = await session.execute(
        text(
            f"""
            UPDATE {SCHEMA}.concept_resources
               SET retired_at = now(), status = 'REMOVED'
             WHERE id = CAST(:id AS uuid) AND retired_at IS NULL
            """
        ),
        {"id": str(resource_id)},
    )
    return res.rowcount > 0
