"""DB writers for content_artifact_translations (P5-S49).

The translation pipeline produces a `TranslationDraft`; the
moderator-queue UI shows that draft and approves/rejects. This module
persists the draft as a DRAFT-status row so reviewers see the pending
queue.

Per ADR-0019. Publish independence per language: a question PUBLISHED
in EN with translation in DRAFT for HI is invisible to HI students
until the reviewer approves.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CONTENT_SCHEMA = "content_schema"


async def upsert_translation_draft(
    session: AsyncSession,
    *,
    artifact_id: str,
    target_lang: str,
    payload_translation: dict[str, Any],
    ai_confidence: float,
) -> int:
    """Upsert a DRAFT translation. Idempotent on (artifact_id, language).

    Increments `version` on conflict so the table doubles as the
    re-translation audit trail. Returns the new version.
    """
    rows = (
        await session.execute(
            text(f"""
                INSERT INTO {CONTENT_SCHEMA}.content_artifact_translations
                  (artifact_id, language, payload_translation, status,
                   ai_confidence, version, created_at, updated_at)
                VALUES (:aid, :lang, :payload::jsonb, 'DRAFT',
                        :conf, 1, now(), now())
                ON CONFLICT (artifact_id, language) DO UPDATE
                  SET payload_translation = EXCLUDED.payload_translation,
                      ai_confidence       = EXCLUDED.ai_confidence,
                      status              = 'DRAFT',
                      version             = {CONTENT_SCHEMA}.content_artifact_translations.version + 1,
                      updated_at          = now()
                RETURNING version
            """),
            {
                "aid": artifact_id,
                "lang": target_lang,
                "payload": json.dumps(payload_translation),
                "conf": ai_confidence,
            },
        )
    ).mappings().all()
    return int(rows[0]["version"]) if rows else 1


async def approve_translation(
    session: AsyncSession,
    *,
    artifact_id: str,
    target_lang: str,
    reviewer_id: str,
) -> None:
    """Move DRAFT -> PUBLISHED after reviewer approval. Surfaced via
    the moderator UI; this function is the storage primitive."""
    await session.execute(
        text(f"""
            UPDATE {CONTENT_SCHEMA}.content_artifact_translations
               SET status      = 'PUBLISHED',
                   reviewer_id = :rid,
                   updated_at  = now()
             WHERE artifact_id = :aid
               AND language    = :lang
        """),
        {
            "aid": artifact_id,
            "lang": target_lang,
            "rid": reviewer_id,
        },
    )


async def reject_translation(
    session: AsyncSession,
    *,
    artifact_id: str,
    target_lang: str,
    reviewer_id: str,
) -> None:
    await session.execute(
        text(f"""
            UPDATE {CONTENT_SCHEMA}.content_artifact_translations
               SET status      = 'REJECTED',
                   reviewer_id = :rid,
                   updated_at  = now()
             WHERE artifact_id = :aid
               AND language    = :lang
        """),
        {
            "aid": artifact_id,
            "lang": target_lang,
            "rid": reviewer_id,
        },
    )
