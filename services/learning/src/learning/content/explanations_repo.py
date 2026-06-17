"""Cache repo for the /adaptive/explain endpoint.

v2.0.0 — the cache is now per-question (not per-(question, pick))
because the canonical teaching note is identical regardless of
which wrong distractor a given student picked. The legacy
picked_idx column is always written as the CANONICAL_PICK_IDX
sentinel (-1) so the unique key on
(question_id, picked_idx, language, prompt_template_version)
collapses to one row per (question, language, version).

Reads through to the question_explanations table before the LLM is
called; persists fresh AI generations after. Heuristic rows are
skipped (cheap to compute, no need to amortise).
"""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

SCHEMA = "content_schema"

# Canonical-explanation sentinel. The picked_idx column is kept for
# schema continuity but the v2 cache key always uses this value, so
# every student who hits the same question reads the same row.
CANONICAL_PICK_IDX = -1
NO_PICK_SENTINEL = CANONICAL_PICK_IDX  # backward-compat alias


async def get_cached_explanation(
    session: AsyncSession,
    *,
    question_id: str,
    picked_idx: int | None,  # accepted for API compat; ignored — see CANONICAL_PICK_IDX
    language: str,
    prompt_template_version: str,
) -> dict[str, Any] | None:
    """Look up the canonical teaching note for a question. Returns the
    row as a dict in the same shape `explain_question` returns, or
    None on miss. Best-effort.
    """
    _ = picked_idx  # parameter retained for callsite continuity
    try:
        res = await session.execute(
            text(
                f"""
                SELECT explanation, key_concept, common_pitfall, source,
                       model, prompt_template_id, prompt_template_version,
                       payload
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
                "pick": CANONICAL_PICK_IDX,
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

    # Bump the hit counter best-effort.
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
                "pick": CANONICAL_PICK_IDX,
                "lang": language,
                "ver": prompt_template_version,
            },
        )
        await session.commit()
    except Exception:  # noqa: BLE001
        log.warning("explanation_cache_hitbump_failed", exc_info=True)

    out: dict[str, Any] = {
        "explanation": row["explanation"],
        "key_concept": row["key_concept"],
        "common_pitfall": row["common_pitfall"],
        "source": row["source"],
        "model": row["model"],
        "prompt_template_id": row["prompt_template_id"],
        "prompt_template_version": row["prompt_template_version"],
        "cache": "hit",
    }
    # Hydrate the rich payload (v2.0.0+ rows). Older rows that pre-date
    # the payload column simply omit these keys; the UI falls back to
    # the legacy fields.
    payload = row.get("payload")
    if isinstance(payload, dict):
        for k, v in payload.items():
            out.setdefault(k, v)
    return out


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
    _ = picked_idx  # not part of the v2 cache key
    # The full payload (rich v2 fields) is stored as JSONB so the UI
    # can render headline / why_correct / per-option / pitfall /
    # worked_example / next_steps without parsing the legacy TEXT
    # columns. Strip transient fields (cache, source flags) before
    # serialising — those are reconstituted on read.
    rich_keys = (
        "headline",
        "key_concept",
        "why_correct",
        "options",
        "common_pitfall",
        "worked_example",
        "next_steps",
    )
    rich_payload = {k: payload[k] for k in rich_keys if k in payload}
    try:
        await session.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.question_explanations
                  (id, question_id, picked_idx, language,
                   explanation, key_concept, common_pitfall,
                   source, model, prompt_template_id, prompt_template_version,
                   payload)
                VALUES
                  (CAST(:id AS uuid),
                   CAST(:qid AS uuid),
                   :pick, :lang,
                   :explanation, :key_concept, :common_pitfall,
                   :source, :model, :tid, :tver,
                   CAST(:rich AS jsonb))
                ON CONFLICT (question_id, picked_idx, language, prompt_template_version)
                  DO NOTHING
                """
            ),
            {
                "id": str(uuid4()),
                "qid": question_id,
                "pick": CANONICAL_PICK_IDX,
                "lang": language,
                "explanation": payload.get("explanation", ""),
                "key_concept": payload.get("key_concept", ""),
                "common_pitfall": payload.get("common_pitfall", ""),
                "source": "ai",
                "model": payload.get("model"),
                "tid": template_id,
                "tver": template_version,
                "rich": json.dumps(rich_payload) if rich_payload else None,
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
