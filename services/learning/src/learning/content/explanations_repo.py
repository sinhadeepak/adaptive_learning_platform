"""Cache repo for the /adaptive/explain endpoint.

Reads through to the question_explanations table before the LLM is
called; persists fresh AI generations after the call. Heuristic
rows are skipped because they're cheap to compute.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

SCHEMA = "content_schema"

# Sentinel for the "no picked answer" path (e.g. an instructor
# previewing the explanation without a student response). Stored in
# picked_idx so the unique-key constraint still holds.
NO_PICK_SENTINEL = -1


async def get_cached_explanation(
    session: AsyncSession,
    *,
    question_id: str,
    picked_idx: int | None,
    language: str,
    prompt_template_version: str,
) -> dict[str, Any] | None:
    """Look up a cached AI-generated explanation. Returns the row as
    a dict in the same shape the explain_question function returns,
    or None on cache miss.

    Best-effort: if the question_id is not a UUID (e.g. a synthetic
    test id) we silently skip the cache."""
    try:
        res = await session.execute(
            text(
                f"""
                SELECT explanation, key_concept, common_pitfall, source,
                       model, prompt_template_id, prompt_template_version
                  FROM {SCHEMA}.question_explanations
                 WHERE question_id = CAST(:qid AS uuid)
                   AND picked_idx  = :pick
                   AND language    = :lang
                   AND prompt_template_version = :ver
                 LIMIT 1
                """
            ),
            {
                "qid": question_id,
                "pick": picked_idx if picked_idx is not None else NO_PICK_SENTINEL,
                "lang": language,
                "ver": prompt_template_version,
            },
        )
        row = res.mappings().first()
    except Exception:  # noqa: BLE001
        log.warning("explanation_cache_lookup_failed", exc_info=True)
        return None

    if row is None:
        return None

    # Bump the hit counter best-effort (don't fail the read if this
    # write trips a constraint or the connection is read-only).
    try:
        await session.execute(
            text(
                f"""
                UPDATE {SCHEMA}.question_explanations
                   SET hit_count = hit_count + 1,
                       last_served_at = now()
                 WHERE question_id = CAST(:qid AS uuid)
                   AND picked_idx  = :pick
                   AND language    = :lang
                   AND prompt_template_version = :ver
                """
            ),
            {
                "qid": question_id,
                "pick": picked_idx if picked_idx is not None else NO_PICK_SENTINEL,
                "lang": language,
                "ver": prompt_template_version,
            },
        )
        await session.commit()
    except Exception:  # noqa: BLE001
        log.warning("explanation_cache_hitbump_failed", exc_info=True)

    return {
        "explanation": row["explanation"],
        "key_concept": row["key_concept"],
        "common_pitfall": row["common_pitfall"],
        "source": row["source"],
        "model": row["model"],
        "prompt_template_id": row["prompt_template_id"],
        "prompt_template_version": row["prompt_template_version"],
        "cache": "hit",
    }


async def upsert_explanation(
    session: AsyncSession,
    *,
    question_id: str,
    picked_idx: int | None,
    language: str,
    payload: dict[str, Any],
) -> None:
    """Persist a freshly-generated AI explanation. Skip heuristic
    rows (no LLM cost to amortise). Upsert on the unique key so a
    racing pair of misses doesn't 23505 — the loser silently
    no-ops."""
    if payload.get("source") != "ai":
        return
    template_id = payload.get("prompt_template_id")
    template_version = payload.get("prompt_template_version")
    if not template_id or not template_version:
        return
    try:
        await session.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.question_explanations
                  (id, question_id, picked_idx, language,
                   explanation, key_concept, common_pitfall,
                   source, model, prompt_template_id, prompt_template_version)
                VALUES
                  (CAST(:id AS uuid),
                   CAST(:qid AS uuid),
                   :pick, :lang,
                   :explanation, :key_concept, :common_pitfall,
                   :source, :model, :tid, :tver)
                ON CONFLICT (question_id, picked_idx, language, prompt_template_version)
                  DO NOTHING
                """
            ),
            {
                "id": str(uuid4()),
                "qid": question_id,
                "pick": picked_idx if picked_idx is not None else NO_PICK_SENTINEL,
                "lang": language,
                "explanation": payload.get("explanation", ""),
                "key_concept": payload.get("key_concept", ""),
                "common_pitfall": payload.get("common_pitfall", ""),
                "source": "ai",
                "model": payload.get("model"),
                "tid": template_id,
                "tver": template_version,
            },
        )
        await session.commit()
    except Exception:  # noqa: BLE001
        log.warning("explanation_cache_upsert_failed", exc_info=True)


async def cache_stats(session: AsyncSession) -> dict[str, Any]:
    """Diagnostic query for an admin endpoint — count rows + total
    hits-served. Useful to reason about the cost saved."""
    try:
        res = await session.execute(
            text(
                f"""
                SELECT COUNT(*)        AS rows,
                       COALESCE(SUM(hit_count), 0) AS total_hits
                  FROM {SCHEMA}.question_explanations
                 WHERE source = 'ai'
                """
            )
        )
        row = res.mappings().first()
    except Exception:  # noqa: BLE001
        return {"rows": 0, "total_hits": 0}
    return {"rows": int(row["rows"]), "total_hits": int(row["total_hits"])}
