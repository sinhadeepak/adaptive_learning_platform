"""F3 — Extend exam_blueprints with kind/created_by/visibility/share_slug.

Adds:
  kind text NOT NULL DEFAULT 'OFFICIAL'
    OFFICIAL : platform-seeded blueprints (existing rows)
    CUSTOM   : student-authored ad-hoc tests (F3 — Custom Test Builder)
    CURATED  : staff-authored, public-on-approval (F6 — Library)
    SHARED   : a CUSTOM blueprint that's been shared (slug minted)
    BATTLE   : transient blueprint composed per-match by alp-battle (F7)
    AI_SUGGESTED : composed by the AI-suggest pipeline (F5)
  created_by_user_id uuid NULL  (NULL for OFFICIAL; set for the rest)
  visibility text NOT NULL DEFAULT 'PUBLIC'
    PRIVATE  : owner-only (default for CUSTOM / AI_SUGGESTED)
    UNLISTED : has a share_slug; anyone with the link can take (F4)
    PUBLIC   : appears in the library (OFFICIAL + CURATED-PUBLISHED)
  share_slug text NULL UNIQUE  (F4 — minted at /share)
  status text NOT NULL DEFAULT 'PUBLISHED'
    PUBLISHED / PENDING_REVIEW / REJECTED  (mostly for CURATED workflow)
  published_at timestamptz NULL

Index added on (kind, visibility, created_by_user_id) so the per-user
"my tests" lookup is fast.

Revision ID: 025
Revises: 024
Create Date: 2026-05-12
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "025"
down_revision: str | None = "024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"


def upgrade() -> None:
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.exam_blueprints
        ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'OFFICIAL'
            CHECK (kind IN (
                'OFFICIAL','CUSTOM','CURATED','SHARED','BATTLE','AI_SUGGESTED'
            )),
        ADD COLUMN IF NOT EXISTS created_by_user_id UUID,
        ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PUBLIC'
            CHECK (visibility IN ('PRIVATE','UNLISTED','PUBLIC')),
        ADD COLUMN IF NOT EXISTS share_slug TEXT UNIQUE,
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PUBLISHED'
            CHECK (status IN ('DRAFT','PENDING_REVIEW','PUBLISHED','REJECTED','RETIRED')),
        ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ
        """
    )
    # Backfill: existing rows are OFFICIAL public published.
    op.execute(
        f"""
        UPDATE {SCHEMA}.exam_blueprints
           SET kind = 'OFFICIAL',
               visibility = 'PUBLIC',
               status = 'PUBLISHED',
               published_at = COALESCE(published_at, created_at)
         WHERE kind IS NULL OR kind = ''
        """
    )
    op.execute(
        f"""
        CREATE INDEX IF NOT EXISTS idx_exam_blueprints_owner
        ON {SCHEMA}.exam_blueprints (created_by_user_id, kind, status)
        WHERE created_by_user_id IS NOT NULL
        """
    )
    op.execute(
        f"""
        CREATE INDEX IF NOT EXISTS idx_exam_blueprints_library
        ON {SCHEMA}.exam_blueprints (kind, visibility, status, exam_id)
        WHERE visibility = 'PUBLIC' AND status = 'PUBLISHED'
        """
    )


def downgrade() -> None:
    op.execute(
        f"DROP INDEX IF EXISTS {SCHEMA}.idx_exam_blueprints_library"
    )
    op.execute(
        f"DROP INDEX IF EXISTS {SCHEMA}.idx_exam_blueprints_owner"
    )
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.exam_blueprints
        DROP COLUMN IF EXISTS published_at,
        DROP COLUMN IF EXISTS status,
        DROP COLUMN IF EXISTS share_slug,
        DROP COLUMN IF EXISTS visibility,
        DROP COLUMN IF EXISTS created_by_user_id,
        DROP COLUMN IF EXISTS kind
        """
    )
