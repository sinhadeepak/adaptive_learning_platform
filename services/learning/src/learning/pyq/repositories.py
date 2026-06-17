"""Sprint 24 (P4-S24) — PYQ read helpers.

The PYQ surface reads from content_schema.questions (source of truth) +
catalog_schema.subjects/topics/exams (for the frequency rollup join).

The two schemas live in the same Postgres database under alp-learning,
so cross-schema joins are safe.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def list_pyqs(
    session: AsyncSession,
    *,
    exam_id: str | None = None,
    subject_id: str | None = None,
    topic_id: str | None = None,
    year: int | None = None,
    paper_session: str | None = None,
    page: int = 1,
    per_page: int = 50,
) -> dict[str, Any]:
    """Paginated PYQ list. exam_id and subject_id resolve via the catalog
    join; topic_id filters directly. Returns {items, total, page, perPage}."""
    where = ["q.pyq_flag = TRUE", "q.status = 'PUBLISHED'"]
    params: dict[str, Any] = {"limit": per_page, "offset": (page - 1) * per_page}
    if topic_id is not None:
        where.append("q.topic_id = :tid")
        params["tid"] = topic_id
    if year is not None:
        where.append("q.exam_year = :y")
        params["y"] = year
    if paper_session is not None:
        where.append("q.paper_session = :ps")
        params["ps"] = paper_session
    join_catalog = exam_id is not None or subject_id is not None
    if join_catalog:
        join_sql = """
        JOIN catalog_schema.topics t ON t.id = q.topic_id
        JOIN catalog_schema.subjects s ON s.id = t.subject_id
        """
        if exam_id is not None:
            where.append("s.exam_id = :eid")
            params["eid"] = exam_id
        if subject_id is not None:
            where.append("s.id = :sid")
            params["sid"] = subject_id
    else:
        join_sql = ""
    where_clause = " AND ".join(where)

    rows = (
        await session.execute(
            text(f"""
                SELECT q.id, q.topic_id, q.stem, q.choices, q.correct_idx,
                       q.difficulty_b, q.exam_year, q.paper_session,
                       q.language, q.created_at
                  FROM content_schema.questions q
                  {join_sql}
                 WHERE {where_clause}
                 ORDER BY q.exam_year DESC NULLS LAST, q.created_at DESC
                 LIMIT :limit OFFSET :offset
            """),
            params,
        )
    ).mappings().all()
    total_row = (
        await session.execute(
            text(f"""
                SELECT COUNT(*) AS n
                  FROM content_schema.questions q
                  {join_sql}
                 WHERE {where_clause}
            """),
            params,
        )
    ).mappings().first()

    items = [
        {
            "id": str(r["id"]),
            "topicId": str(r["topic_id"]),
            "stem": r["stem"],
            "choices": r["choices"] if isinstance(r["choices"], list) else [],
            "correctIdx": int(r["correct_idx"]),
            "difficultyB": float(r["difficulty_b"]),
            "examYear": int(r["exam_year"]) if r["exam_year"] is not None else None,
            "paperSession": r["paper_session"],
            "language": r["language"],
            "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]
    return {
        "items": items,
        "total": int(total_row["n"] if total_row else 0),
        "page": page,
        "perPage": per_page,
    }


def aggregate_chapter_frequency(
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Pure function: given rows of {topic_id, topic_title, exam_year, n},
    roll up into chapter-level year counts.

    Output:
        [
          {"topicId": "...", "topicTitle": "...", "yearCounts": {2024: 3, 2023: 4},
           "total": 7},
          ...
        ]
    Sorted by total desc.
    """
    by_topic: dict[str, dict[str, Any]] = {}
    for r in rows:
        topic_id = str(r["topic_id"])
        if topic_id not in by_topic:
            by_topic[topic_id] = {
                "topicId": topic_id,
                "topicTitle": r.get("topic_title") or r.get("topicTitle") or "",
                "yearCounts": defaultdict(int),
                "total": 0,
            }
        bucket = by_topic[topic_id]
        year = r.get("exam_year") or r.get("examYear")
        n = int(r.get("n") or r.get("count") or 0)
        if year is not None:
            bucket["yearCounts"][int(year)] += n
        bucket["total"] += n
    out: list[dict[str, Any]] = []
    for v in by_topic.values():
        v["yearCounts"] = dict(sorted(v["yearCounts"].items()))
        out.append(v)
    out.sort(key=lambda b: (-b["total"], b["topicTitle"]))
    return out


async def chapter_frequency(
    session: AsyncSession,
    *,
    exam_id: str,
    subject_id: str | None = None,
) -> list[dict[str, Any]]:
    """Chapter-wise PYQ frequency for an exam (optionally scoped to subject).

    Rolls up content_schema.questions (PYQ-flagged) by (topic, year). The
    pure aggregator above does the shaping; this function executes the
    SQL + dispatches to it.
    """
    where = ["q.pyq_flag = TRUE", "q.status = 'PUBLISHED'", "s.exam_id = :eid"]
    params: dict[str, Any] = {"eid": exam_id}
    if subject_id is not None:
        where.append("s.id = :sid")
        params["sid"] = subject_id
    where_clause = " AND ".join(where)
    rows = (
        await session.execute(
            text(f"""
                SELECT t.id        AS topic_id,
                       t.title     AS topic_title,
                       q.exam_year AS exam_year,
                       COUNT(*)    AS n
                  FROM content_schema.questions q
                  JOIN catalog_schema.topics t   ON t.id       = q.topic_id
                  JOIN catalog_schema.subjects s ON s.id       = t.subject_id
                 WHERE {where_clause}
                 GROUP BY t.id, t.title, q.exam_year
            """),
            params,
        )
    ).mappings().all()
    plain = [dict(r) for r in rows]
    return aggregate_chapter_frequency(plain)
