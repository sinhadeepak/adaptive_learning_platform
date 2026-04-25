"""Data access for catalog_schema."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class CatalogRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def list_exams(self) -> list[dict[str, Any]]:
        rows = (
            await self.s.execute(
                text(
                    "SELECT id, code, name, subtitle, icon_key "
                    "FROM catalog_schema.exams "
                    "WHERE is_published = TRUE ORDER BY sort_order, name"
                )
            )
        ).mappings().all()
        return [dict(r) for r in rows]

    async def subjects_for_exam(self, exam_id: str) -> list[dict[str, Any]]:
        rows = (
            await self.s.execute(
                text(
                    "SELECT s.id, s.exam_id, s.name, "
                    "  (SELECT COUNT(*) FROM catalog_schema.topics t WHERE t.subject_id = s.id "
                    "   AND t.is_published = TRUE) AS topic_count "
                    "FROM catalog_schema.subjects s "
                    "WHERE s.exam_id = :eid AND s.is_published = TRUE "
                    "ORDER BY s.sort_order, s.name"
                ),
                {"eid": exam_id},
            )
        ).mappings().all()
        return [dict(r) for r in rows]

    async def topics_for_subject(self, subject_id: str) -> list[dict[str, Any]]:
        rows = (
            await self.s.execute(
                text(
                    "SELECT id, subject_id, title, title_hi, question_count, tier "
                    "FROM catalog_schema.topics "
                    "WHERE subject_id = :sid AND is_published = TRUE "
                    "ORDER BY sort_order, title"
                ),
                {"sid": subject_id},
            )
        ).mappings().all()
        return [dict(r) for r in rows]

    async def topic(self, topic_id: str) -> dict[str, Any] | None:
        row = (
            await self.s.execute(
                text(
                    "SELECT id, subject_id, title, title_hi, description, question_count, tier, "
                    "       objectives, prerequisites "
                    "FROM catalog_schema.topics "
                    "WHERE id = :tid AND is_published = TRUE"
                ),
                {"tid": topic_id},
            )
        ).mappings().first()
        return dict(row) if row else None

    async def topics_for_reindex(self) -> list[dict[str, Any]]:
        """Bulk read used by Search service reindex pipeline. Joins through to
        subject + exam so every doc carries the human-readable subtitle.
        Returns ALL published topics — closed beta scale (~50 rows)."""
        rows = (
            await self.s.execute(
                text(
                    """
                    SELECT t.id AS topic_id, t.title, t.title_hi, t.description,
                           t.tier, t.question_count,
                           s.id AS subject_id, s.name AS subject_name,
                           e.id AS exam_id, e.code AS exam_code, e.name AS exam_name
                    FROM catalog_schema.topics t
                    JOIN catalog_schema.subjects s ON s.id = t.subject_id
                    JOIN catalog_schema.exams e ON e.id = s.exam_id
                    WHERE t.is_published = TRUE
                    ORDER BY e.sort_order, s.sort_order, t.sort_order
                    """
                )
            )
        ).mappings().all()
        return [dict(r) for r in rows]
