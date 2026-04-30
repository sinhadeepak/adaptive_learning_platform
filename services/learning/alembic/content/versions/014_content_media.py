"""Phase 5 (P5-S37): content_media — image / audio / video references.

Per ADR-0018. Backed by S3 with content-hash verification; auto-WebP
at 3 resolutions for images. Used by Visual + Audio/Video families.

Revision ID: 014
Revises: 013
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "014"
down_revision: str | None = "013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.content_media (
            id                UUID PRIMARY KEY,
            artifact_id       UUID NOT NULL REFERENCES {SCHEMA}.questions(id) ON DELETE CASCADE,
            kind              TEXT NOT NULL CHECK (kind IN ('image','audio','video')),
            s3_url            TEXT NOT NULL,
            content_hash      TEXT NOT NULL,
            dimensions        JSONB NULL,
            duration_seconds  REAL NULL,
            mime_type         TEXT NOT NULL,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        f"CREATE INDEX idx_content_media_artifact "
        f"ON {SCHEMA}.content_media (artifact_id, kind)"
    )
    op.execute(
        f"CREATE INDEX idx_content_media_hash "
        f"ON {SCHEMA}.content_media (content_hash)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.content_media")
