"""Sprint 26 (P4-S26) — read helpers over catalog_schema.topics.prerequisites."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "catalog_schema"


def _coerce_prereqs(value: Any) -> list[str]:
    """JSONB columns can deserialize as list directly (asyncpg → list) or as
    a JSON-encoded string in some test setups. Coerce both."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return []


async def load_graph(
    session: AsyncSession, exam_id: str | None = None
) -> dict[str, list[str]]:
    """Load `{topic_id: [prereq_topic_id, ...]}` for the given exam (or all
    topics when exam_id is None). Returned dict is suitable input to the
    pure-function traversal helpers."""
    if exam_id is None:
        rows = (
            await session.execute(
                text(
                    f"SELECT id, prerequisites FROM {SCHEMA}.topics"
                )
            )
        ).mappings().all()
    else:
        rows = (
            await session.execute(
                text(
                    f"""
                    SELECT t.id, t.prerequisites
                      FROM {SCHEMA}.topics t
                      JOIN {SCHEMA}.subjects s ON s.id = t.subject_id
                     WHERE s.exam_id = :eid
                    """
                ),
                {"eid": exam_id},
            )
        ).mappings().all()
    return {str(r["id"]): _coerce_prereqs(r["prerequisites"]) for r in rows}


async def load_topic_titles(
    session: AsyncSession, topic_ids: list[str]
) -> dict[str, str]:
    """Returns `{topic_id: title}` for the given ids. The gate route uses
    this to surface "Master {Mechanics} first" rather than raw UUIDs."""
    if not topic_ids:
        return {}
    rows = (
        await session.execute(
            text(
                f"""
                SELECT id, title FROM {SCHEMA}.topics
                 WHERE id = ANY(:ids)
                """
            ),
            {"ids": topic_ids},
        )
    ).mappings().all()
    return {str(r["id"]): r["title"] for r in rows}
