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
    cultural_flags: list[str] | None = None,
) -> int:
    """Upsert a DRAFT translation. Idempotent on (artifact_id, language).

    Increments `version` on conflict so the table doubles as the
    re-translation audit trail. Returns the new version.

    P5-S57: persists `cultural_flags` (S43 translator output) so the
    cultural-review queue can pull rows where flags are non-empty.
    Setting flags also resets cultural_review_status to PENDING — a
    re-translation invalidates any prior cultural verdict.
    """
    flags_json = json.dumps(cultural_flags or [])
    rows = (
        await session.execute(
            text(f"""
                INSERT INTO {CONTENT_SCHEMA}.content_artifact_translations
                  (artifact_id, language, payload_translation, status,
                   ai_confidence, version, cultural_flags,
                   cultural_review_status, created_at, updated_at)
                VALUES (:aid, :lang, CAST(:payload AS jsonb), 'DRAFT',
                        :conf, 1, CAST(:flags AS jsonb),
                        CASE WHEN jsonb_array_length(CAST(:flags AS jsonb)) > 0
                             THEN 'PENDING' ELSE NULL END,
                        now(), now())
                ON CONFLICT (artifact_id, language) DO UPDATE
                  SET payload_translation     = EXCLUDED.payload_translation,
                      ai_confidence           = EXCLUDED.ai_confidence,
                      status                  = 'DRAFT',
                      cultural_flags          = EXCLUDED.cultural_flags,
                      cultural_review_status  = CASE
                        WHEN jsonb_array_length(EXCLUDED.cultural_flags) > 0
                          THEN 'PENDING'
                        ELSE NULL
                      END,
                      cultural_reviewer_id    = NULL,
                      cultural_reviewed_at    = NULL,
                      cultural_review_notes   = NULL,
                      version                 = {CONTENT_SCHEMA}.content_artifact_translations.version + 1,
                      updated_at              = now()
                RETURNING version
            """),
            {
                "aid": artifact_id,
                "lang": target_lang,
                "payload": json.dumps(payload_translation),
                "conf": ai_confidence,
                "flags": flags_json,
            },
        )
    ).mappings().all()
    return int(rows[0]["version"]) if rows else 1


# ── Cultural review queue primitives (P5-S57) ────────────────────────────────


async def list_cultural_pending(
    session: AsyncSession,
    *,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Pull translations awaiting cultural review. Ordered oldest-first
    so SLA-sensitive items rise to the top."""
    rows = (
        await session.execute(
            text(f"""
                SELECT artifact_id, language, status, cultural_flags,
                       cultural_review_status, ai_confidence, version,
                       created_at, updated_at
                  FROM {CONTENT_SCHEMA}.content_artifact_translations
                 WHERE jsonb_array_length(cultural_flags) > 0
                   AND (cultural_review_status IS NULL
                        OR cultural_review_status = 'PENDING')
                 ORDER BY created_at ASC
                 LIMIT :lim
            """),
            {"lim": limit},
        )
    ).mappings().all()
    return [
        {
            "artifactId": str(r["artifact_id"]),
            "language": r["language"],
            "status": r["status"],
            "culturalFlags": r["cultural_flags"] or [],
            "culturalReviewStatus": r["cultural_review_status"],
            "aiConfidence": float(r["ai_confidence"]) if r["ai_confidence"] is not None else None,
            "version": int(r["version"]),
            "createdAt": r["created_at"].isoformat(),
            "updatedAt": r["updated_at"].isoformat(),
        }
        for r in rows
    ]


async def cultural_review_action(
    session: AsyncSession,
    *,
    artifact_id: str,
    target_lang: str,
    action: str,  # APPROVED | SUBSTITUTION_SUGGESTED | NOT_LOCALISED
    reviewer_id: str,
    notes: str | None = None,
) -> None:
    """Cultural reviewer's verdict. Updates status + reviewer fields."""
    await session.execute(
        text(f"""
            UPDATE {CONTENT_SCHEMA}.content_artifact_translations
               SET cultural_review_status  = :st,
                   cultural_reviewer_id    = :rid,
                   cultural_reviewed_at    = now(),
                   cultural_review_notes   = :notes,
                   updated_at              = now()
             WHERE artifact_id = :aid AND language = :lang
        """),
        {
            "aid": artifact_id,
            "lang": target_lang,
            "st": action,
            "rid": reviewer_id,
            "notes": notes,
        },
    )


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
