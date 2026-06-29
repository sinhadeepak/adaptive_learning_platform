"""DB-side CRUD for content_schema.concept_resources."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "content_schema"

# Canonical column list returned by every read — kept in one place so the
# SELECT/RETURNING projections stay in sync with _row_to_dict.
_COLS = (
    "id, topic_id, concept_id, question_id, "
    "resource_type, external_id, url, title, description, channel_name, "
    "duration_seconds, thumbnail_url, language, difficulty, "
    "status, position, added_by, added_at, "
    "approved_by, approved_at, review_notes, is_available, "
    "doc_object_key, doc_mime_type, doc_size_bytes, doc_page_count"
)


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
        "doc_object_key": r["doc_object_key"],
        "doc_mime_type": r["doc_mime_type"],
        "doc_size_bytes": (
            int(r["doc_size_bytes"]) if r["doc_size_bytes"] is not None else None
        ),
        "doc_page_count": (
            int(r["doc_page_count"]) if r["doc_page_count"] is not None else None
        ),
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
    doc_object_key: str | None = None,
    doc_mime_type: str | None = None,
    doc_size_bytes: int | None = None,
    doc_page_count: int | None = None,
) -> dict[str, Any]:
    rid = str(uuid4())
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.concept_resources
              (id, topic_id, concept_id, question_id,
               resource_type, external_id, url, title, description, channel_name,
               duration_seconds, thumbnail_url, language, difficulty,
               status, position, added_by,
               doc_object_key, doc_mime_type, doc_size_bytes, doc_page_count)
            VALUES
              (CAST(:id AS uuid),
               CAST(:topic_id AS uuid),
               CAST(:concept_id AS uuid),
               CAST(:question_id AS uuid),
               :resource_type, :external_id, :url, :title, :description, :channel_name,
               :duration_seconds, :thumbnail_url, :language, :difficulty,
               :status, :position, CAST(:added_by AS uuid),
               :doc_object_key, :doc_mime_type, :doc_size_bytes, :doc_page_count)
            RETURNING {_COLS}
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
            "doc_object_key": doc_object_key,
            "doc_mime_type": doc_mime_type,
            "doc_size_bytes": doc_size_bytes,
            "doc_page_count": doc_page_count,
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
            SELECT {_COLS}
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
            SELECT {_COLS}
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
                   t.approved_by, t.approved_at, t.review_notes, t.is_available,
                   t.doc_object_key, t.doc_mime_type, t.doc_size_bytes, t.doc_page_count
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


async def insert_view_event(
    session: AsyncSession,
    *,
    resource_id: UUID,
    user_id: UUID,
    event_type: str,
    position_seconds: int | None,
    session_id: UUID | None,
) -> None:
    """Record a single view event. Append-only — fires per yt-iframe
    state change (started/25pct/50pct/75pct/completed/closed)."""
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.resource_view_events
              (id, resource_id, user_id, event_type,
               position_seconds, session_id)
            VALUES
              (gen_random_uuid(),
               CAST(:rid AS uuid),
               CAST(:uid AS uuid),
               :etype,
               :pos,
               CAST(:sid AS uuid))
            """
        ),
        {
            "rid": str(resource_id),
            "uid": str(user_id),
            "etype": event_type,
            "pos": position_seconds,
            "sid": str(session_id) if session_id else None,
        },
    )


async def list_resources_by_exam(
    session: AsyncSession,
    *,
    exam_id: UUID,
    statuses: list[str],
    language: str | None = None,
) -> list[dict[str, Any]]:
    """Every resource for an exam, joined to its subject + topic.

    Returns flat rows (each a _row_to_dict plus subject_id/subject_name/
    topic_title); the route groups them into the subject→topic tree. Only
    topic-scoped resources appear — content pinned solely to a concept or
    question (no topic_id) isn't part of the topic-organized hub view.
    """
    params: dict[str, Any] = {"eid": str(exam_id)}
    extra = ""
    if statuses:
        placeholders = ", ".join(f":s_{i}" for i in range(len(statuses)))
        extra += f" AND r.status IN ({placeholders})"
        for i, s in enumerate(statuses):
            params[f"s_{i}"] = s
    if language is not None:
        extra += " AND r.language = :lang"
        params["lang"] = language
    res = await session.execute(
        text(
            f"""
            SELECT s.id::text   AS subject_id,
                   s.name       AS subject_name,
                   s.sort_order AS subject_sort,
                   t.title      AS topic_title,
                   t.sort_order AS topic_sort,
                   {", ".join("r." + c.strip() for c in _COLS.split(","))}
              FROM {SCHEMA}.concept_resources r
              JOIN catalog_schema.topics t   ON t.id = r.topic_id
              JOIN catalog_schema.subjects s ON s.id = t.subject_id
             WHERE s.exam_id = CAST(:eid AS uuid)
               AND r.retired_at IS NULL
               AND r.is_available = TRUE
               {extra}
          ORDER BY s.sort_order, s.name, t.sort_order, t.title, r.position
            """
        ),
        params,
    )
    out: list[dict[str, Any]] = []
    for row in res.mappings():
        d = _row_to_dict(row)
        d["subject_id"] = row["subject_id"]
        d["subject_name"] = row["subject_name"]
        d["topic_title"] = row["topic_title"]
        out.append(d)
    return out


async def watch_summary_for_user(
    session: AsyncSession,
    *,
    user_id: UUID,
    exam_id: UUID,
) -> dict[str, Any]:
    """Aggregate this user's resource_view_events for an exam's content.

    Per-resource: furthest position reached (= resume point) + a watched
    flag + percent (from duration, else from the highest milestone event).
    Per-topic: minutes watched = SUM over resources of MAX(position)/60
    (monotonic, no double-count on re-watch), plus watched/completed counts.
    """
    res = await session.execute(
        text(
            """
            WITH ev AS (
                SELECT v.resource_id,
                       MAX(v.position_seconds) AS max_pos,
                       bool_or(v.event_type = 'completed') AS completed,
                       MAX(CASE v.event_type
                             WHEN 'completed' THEN 100
                             WHEN '75pct' THEN 75
                             WHEN '50pct' THEN 50
                             WHEN '25pct' THEN 25
                             WHEN 'started' THEN 1
                             ELSE 0 END) AS milestone_pct
                  FROM content_schema.resource_view_events v
                 WHERE v.user_id = CAST(:uid AS uuid)
                 GROUP BY v.resource_id
            )
            SELECT r.id::text       AS resource_id,
                   r.topic_id::text AS topic_id,
                   r.resource_type  AS resource_type,
                   r.duration_seconds AS duration_seconds,
                   ev.max_pos       AS max_pos,
                   ev.completed     AS completed,
                   ev.milestone_pct AS milestone_pct
              FROM ev
              JOIN content_schema.concept_resources r ON r.id = ev.resource_id
              JOIN catalog_schema.topics t   ON t.id = r.topic_id
              JOIN catalog_schema.subjects s ON s.id = t.subject_id
             WHERE s.exam_id = CAST(:eid AS uuid)
            """
        ),
        {"uid": str(user_id), "eid": str(exam_id)},
    )
    per_resource: dict[str, Any] = {}
    per_topic: dict[str, dict[str, Any]] = {}
    for row in res.mappings():
        rid = row["resource_id"]
        topic_id = row["topic_id"]
        max_pos = int(row["max_pos"] or 0)
        dur = int(row["duration_seconds"]) if row["duration_seconds"] else None
        completed = bool(row["completed"])
        if completed:
            percent = 100
        elif dur and dur > 0:
            percent = min(100, round(100 * max_pos / dur))
        else:
            percent = int(row["milestone_pct"] or 0)
        per_resource[rid] = {
            "furthestPositionSeconds": max_pos,
            "resumePositionSeconds": max_pos,
            "furthestPercent": percent,
            "watched": completed,
        }
        if topic_id is not None:
            agg = per_topic.setdefault(
                topic_id,
                {
                    "minutesWatched": 0,
                    "resourcesWatched": 0,
                    "resourcesCompleted": 0,
                    "documentsCompleted": 0,
                    "_seconds": 0,
                },
            )
            agg["resourcesWatched"] += 1
            if completed:
                agg["resourcesCompleted"] += 1
                if row["resource_type"] == "document":
                    agg["documentsCompleted"] += 1
            # Documents have no playback position; don't fabricate minutes.
            if row["resource_type"] != "document":
                agg["_seconds"] += max_pos
    for agg in per_topic.values():
        agg["minutesWatched"] = round(agg.pop("_seconds") / 60)
    return {"perResource": per_resource, "perTopic": per_topic}


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
