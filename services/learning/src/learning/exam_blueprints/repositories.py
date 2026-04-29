"""Read helpers for catalog_schema.exam_blueprints (Sprint 23, P4-S23).

Admin write paths (insert/update/delete) ship in Sprint 25.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "catalog_schema"


def _row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "examId": str(row["exam_id"]),
        "name": row["name"],
        "totalQuestions": int(row["total_questions"]),
        "totalMinutes": int(row["total_minutes"]),
        "marksCorrect": int(row["marks_correct"]),
        "marksNegative": float(row["marks_negative"]),
        "sections": row["sections"],  # JSONB returns native dict/list
        "interSectionNavigation": bool(row["inter_section_navigation"]),
        "perSectionTimeLocked": bool(row["per_section_time_locked"]),
        "createdAt": row["created_at"].isoformat()
        if row.get("created_at") is not None
        else None,
        "updatedAt": row["updated_at"].isoformat()
        if row.get("updated_at") is not None
        else None,
    }


async def list_for_exam(
    session: AsyncSession, exam_id: str
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(f"""
                SELECT id, exam_id, name, total_questions, total_minutes,
                       marks_correct, marks_negative, sections,
                       inter_section_navigation, per_section_time_locked,
                       created_at, updated_at
                  FROM {SCHEMA}.exam_blueprints
                 WHERE exam_id = :eid
                 ORDER BY name
            """),
            {"eid": exam_id},
        )
    ).mappings().all()
    return [_row_to_dict(r) for r in rows]


async def get_by_id(
    session: AsyncSession, blueprint_id: str
) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(f"""
                SELECT id, exam_id, name, total_questions, total_minutes,
                       marks_correct, marks_negative, sections,
                       inter_section_navigation, per_section_time_locked,
                       created_at, updated_at
                  FROM {SCHEMA}.exam_blueprints
                 WHERE id = :bid
            """),
            {"bid": blueprint_id},
        )
    ).mappings().first()
    return _row_to_dict(row) if row else None
