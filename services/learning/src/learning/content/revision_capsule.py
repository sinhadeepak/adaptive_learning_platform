"""Phase 3.5 — AI revision capsules.

A capsule is a one-page, exam-ready summary of a topic, distilled by the AI
Gateway (`authoring` touchpoint) from that topic's published questions +
explanations, and cached in `content_schema.revision_capsules` so repeat views
don't re-spend tokens.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.ai_gateway import AIGateway

SCHEMA = "content_schema"

# Cap the material we feed the model — a representative sample keeps the prompt
# bounded and the cost predictable; the capsule is a summary, not a concordance.
_MAX_QUESTIONS = 15


class RevisionCapsule(BaseModel):
    """Structured one-page revision summary (OpenAI strict-mode friendly:
    every field required, lists may be empty)."""

    summary: str = Field(description="2-3 sentences on what the topic is about")
    key_points: list[str] = Field(description="4-8 core concepts")
    formulas: list[str] = Field(description="key formulas/definitions; may be empty")
    common_mistakes: list[str] = Field(description="2-4 pitfalls students make")
    quick_review: list[str] = Field(description="3-5 rapid-fire facts")


async def topic_title(session: AsyncSession, topic_id: str) -> str | None:
    row = (
        await session.execute(
            text("SELECT title FROM catalog_schema.topics WHERE id = CAST(:tid AS uuid)"),
            {"tid": topic_id},
        )
    ).first()
    return str(row[0]) if row else None


async def gather_material(session: AsyncSession, topic_id: str) -> tuple[str, int]:
    """Concatenate a sample of the topic's published questions + explanations
    into the raw material the capsule is distilled from. Returns (text, count)."""
    rows = (
        await session.execute(
            text(
                f"""
                SELECT stem, explanation
                  FROM {SCHEMA}.questions
                 WHERE topic_id = CAST(:tid AS uuid)
                   AND status = 'PUBLISHED'
                 ORDER BY created_at DESC
                 LIMIT :lim
                """
            ),
            {"tid": topic_id, "lim": _MAX_QUESTIONS},
        )
    ).mappings().all()
    blocks = []
    for i, r in enumerate(rows, 1):
        stem = (r["stem"] or "").strip()
        expl = (r["explanation"] or "").strip()
        block = f"Q{i}. {stem}"
        if expl:
            block += f"\n   Explanation: {expl}"
        blocks.append(block)
    return "\n\n".join(blocks), len(rows)


async def get_cached(session: AsyncSession, topic_id: str) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(
                f"""
                SELECT capsule, source_count, generated_at::text, model
                  FROM {SCHEMA}.revision_capsules
                 WHERE topic_id = CAST(:tid AS uuid)
                """
            ),
            {"tid": topic_id},
        )
    ).mappings().first()
    if row is None:
        return None
    return {
        "capsule": row["capsule"],
        "sourceCount": int(row["source_count"]),
        "generatedAt": row["generated_at"],
        "model": row["model"],
        "cached": True,
    }


async def upsert_cache(
    session: AsyncSession,
    *,
    topic_id: str,
    capsule: dict[str, Any],
    source_count: int,
    model: str | None,
) -> None:
    import json

    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.revision_capsules
              (topic_id, capsule, source_count, model, generated_at)
            VALUES (CAST(:tid AS uuid), CAST(:cap AS jsonb), :sc, :model, now())
            ON CONFLICT (topic_id) DO UPDATE
              SET capsule = EXCLUDED.capsule,
                  source_count = EXCLUDED.source_count,
                  model = EXCLUDED.model,
                  generated_at = now()
            """
        ),
        {"tid": topic_id, "cap": json.dumps(capsule), "sc": source_count, "model": model},
    )


async def generate(
    gateway: AIGateway, *, topic: str, material: str, creator_id: str | None = None
) -> RevisionCapsule:
    return await gateway.call(
        touchpoint="authoring",
        prompt_template_id="revision_capsule",
        prompt_template_version="1.0.0",
        prompt_inputs={"topic": topic, "material": material},
        schema=RevisionCapsule,
        creator_id=creator_id,
    )
