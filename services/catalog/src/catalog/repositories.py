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
                    "SELECT id, subject_id, title, question_count, tier "
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
                    "SELECT id, subject_id, title, description, question_count, tier, "
                    "       objectives, prerequisites "
                    "FROM catalog_schema.topics "
                    "WHERE id = :tid AND is_published = TRUE"
                ),
                {"tid": topic_id},
            )
        ).mappings().first()
        return dict(row) if row else None
