"""Phase 5 (P5-S37): content_artifact_translations + primary-language backfill.

Per ADR-0019 + ADR-0020 (deferred). Stores per-language translated
payloads with publish-independence per language. Existing artifacts
backfill to a primary-language PUBLISHED row pointing at their own
payload.

Revision ID: 013
Revises: 012
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "013"
down_revision: str | None = "012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.content_artifact_translations (
            artifact_id          UUID NOT NULL REFERENCES {SCHEMA}.questions(id) ON DELETE CASCADE,
            language             TEXT NOT NULL,
            payload_translation  JSONB NOT NULL,
            status               TEXT NOT NULL CHECK (status IN ('DRAFT','IN_REVIEW','PUBLISHED','REJECTED')),
            translator_id        UUID NULL,
            reviewer_id          UUID NULL,
            ai_confidence        REAL NULL CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
            version              INTEGER NOT NULL DEFAULT 1,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (artifact_id, language)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_translations_status_lang "
        f"ON {SCHEMA}.content_artifact_translations (language, status)"
    )

    # Backfill: existing artifacts get a primary-language PUBLISHED row.
    # payload_translation is empty JSONB — the canonical payload still
    # lives on questions.{stem,choices,...}; the translation record
    # establishes a row per (artifact, primary_language) so per-language
    # filtering works uniformly without a special-case for primary lang.
    op.execute(f"""
        INSERT INTO {SCHEMA}.content_artifact_translations
            (artifact_id, language, payload_translation, status, version)
        SELECT id, language, '{{}}'::jsonb, 'PUBLISHED', 1
        FROM {SCHEMA}.questions
        ON CONFLICT (artifact_id, language) DO NOTHING
    """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.content_artifact_translations")
