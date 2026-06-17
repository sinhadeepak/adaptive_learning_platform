"""Phase 5 (P5-S57): cultural_flags JSONB on content_artifact_translations.

Per AIM §4.4 + the audit gap from CE-404. The translator already
surfaces cultural flags on the in-memory TranslationDraft (S43); this
migration persists them on the row so the cultural-review queue can
pull `WHERE jsonb_array_length(cultural_flags) > 0`.

Revision ID: 017
Revises: 016
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "017"
down_revision: str | None = "016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"""
        ALTER TABLE {SCHEMA}.content_artifact_translations
          ADD COLUMN cultural_flags  JSONB NOT NULL DEFAULT '[]'::jsonb,
          ADD COLUMN cultural_review_status TEXT NULL CHECK (
            cultural_review_status IS NULL OR cultural_review_status IN (
              'PENDING', 'APPROVED', 'SUBSTITUTION_SUGGESTED', 'NOT_LOCALISED'
            )
          ),
          ADD COLUMN cultural_reviewer_id UUID NULL,
          ADD COLUMN cultural_reviewed_at TIMESTAMPTZ NULL,
          ADD COLUMN cultural_review_notes TEXT NULL
    """)
    # Cultural-review queue read pattern.
    op.execute(
        f"CREATE INDEX idx_translations_cultural_pending "
        f"ON {SCHEMA}.content_artifact_translations (created_at) "
        f"WHERE cultural_review_status = 'PENDING' OR "
        f"      (jsonb_array_length(cultural_flags) > 0 AND "
        f"       cultural_review_status IS NULL)"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_translations_cultural_pending")
    op.execute(f"""
        ALTER TABLE {SCHEMA}.content_artifact_translations
          DROP COLUMN IF EXISTS cultural_flags,
          DROP COLUMN IF EXISTS cultural_review_status,
          DROP COLUMN IF EXISTS cultural_reviewer_id,
          DROP COLUMN IF EXISTS cultural_reviewed_at,
          DROP COLUMN IF EXISTS cultural_review_notes
    """)
