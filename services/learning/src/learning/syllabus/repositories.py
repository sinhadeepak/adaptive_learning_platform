"""Sprint 28 (P4-S28) — syllabus tree read helpers.
Sprint 34 (P4-S34) — adds topic_references read helper.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.syllabus.url_safety import is_safe_reference_url

SCHEMA = "catalog_schema"


async def list_topic_references(
    session: AsyncSession, topic_id: str
) -> list[dict[str, Any]]:
    """Return topic references in display order. URLs are filtered through
    `is_safe_reference_url` so a malformed/unsafe entry never reaches the
    student UI even if it slipped through authoring."""
    rows = (
        await session.execute(
            text(
                f"""
                SELECT id, kind, title, url, position
                  FROM {SCHEMA}.topic_references
                 WHERE topic_id = :tid
                 ORDER BY position ASC, created_at ASC
                """
            ),
            {"tid": topic_id},
        )
    ).mappings().all()
    return [
        {
            "id": str(r["id"]),
            "kind": r["kind"],
            "title": r["title"],
            "url": r["url"],
            "position": int(r["position"]),
        }
        for r in rows
        if is_safe_reference_url(r["url"])
    ]


async def load_syllabus_tree(
    session: AsyncSession, exam_id: str
) -> dict[str, Any]:
    """Return {examId, subjects: [{subjectId, name, chapters: [...]}]} for
    the given exam. Chapters with no mapped topics still surface (the
    "missing chapter" signal); topics with chapter_id IS NULL are excluded
    from the tree (they show up in the legacy topic-list path)."""
    subjects = (
        await session.execute(
            text(
                f"""
                SELECT id, name, sort_order
                  FROM {SCHEMA}.subjects
                 WHERE exam_id = :eid
                 ORDER BY sort_order, name
                """
            ),
            {"eid": exam_id},
        )
    ).mappings().all()
    chapters = (
        await session.execute(
            text(
                f"""
                SELECT id, subject_id, name, position
                  FROM {SCHEMA}.syllabus_chapters
                 WHERE exam_id = :eid
                 ORDER BY subject_id, position
                """
            ),
            {"eid": exam_id},
        )
    ).mappings().all()
    topics = (
        await session.execute(
            text(
                f"""
                SELECT t.id, t.title, t.subject_id, t.chapter_id,
                       t.question_count
                  FROM {SCHEMA}.topics t
                  JOIN {SCHEMA}.subjects s ON s.id = t.subject_id
                 WHERE s.exam_id = :eid AND t.chapter_id IS NOT NULL
                 ORDER BY t.sort_order, t.title
                """
            ),
            {"eid": exam_id},
        )
    ).mappings().all()

    by_chapter: dict[str, list[dict[str, Any]]] = {}
    for t in topics:
        by_chapter.setdefault(str(t["chapter_id"]), []).append(
            {
                "topicId": str(t["id"]),
                "title": t["title"],
                "questionCount": int(t["question_count"]),
            }
        )

    by_subject: dict[str, list[dict[str, Any]]] = {}
    for c in chapters:
        by_subject.setdefault(str(c["subject_id"]), []).append(
            {
                "chapterId": str(c["id"]),
                "name": c["name"],
                "position": int(c["position"]),
                "topics": by_chapter.get(str(c["id"]), []),
            }
        )

    subjects_out: list[dict[str, Any]] = []
    for s in subjects:
        subjects_out.append(
            {
                "subjectId": str(s["id"]),
                "name": s["name"],
                "chapters": by_subject.get(str(s["id"]), []),
            }
        )

    return {"examId": exam_id, "subjects": subjects_out}
