"""concept_resources — add a 'document' resource type (Study Materials hub).

The Study Materials hub surfaces every PUBLISHED content item for an exam
organized subject → topic. Alongside the existing YouTube / URL / note
types, moderators *and* students can now upload PDF/document files. Rather
than a parallel table, we extend concept_resources — migration 021 was
deliberately designed for this ("models resource_type so we can extend
later … without a schema change"). Documents reuse the entire
DRAFT → IN_REVIEW → PUBLISHED lifecycle, scope FKs, view-event telemetry,
and list/get/review handlers unchanged.

Columns added:
  doc_object_key  — S3/MinIO key (study-materials/<tenant>/<scope>/<uuid>.pdf).
                    The stored `url` is set to this key for documents; the
                    viewer always re-signs a fresh GET via /uploads/sign
                    (presigned URLs have a 5-min TTL and aren't persistable).
  doc_mime_type   — e.g. 'application/pdf' (from storage.ALLOWED_MIME).
  doc_size_bytes  — captured from /uploads/finalize head_object.
  doc_page_count  — optional; null until/unless extracted.

Revision ID: 046
Revises: 045
Create Date: 2026-06-29
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "046"
down_revision: str | None = "045"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"
TABLE = f"{SCHEMA}.concept_resources"


def upgrade() -> None:
    op.execute(
        f"""
        ALTER TABLE {TABLE}
            ADD COLUMN doc_object_key TEXT NULL,
            ADD COLUMN doc_mime_type  TEXT NULL,
            ADD COLUMN doc_size_bytes BIGINT NULL,
            ADD COLUMN doc_page_count INT NULL
        """
    )
    # Extend the resource_type CHECK to admit 'document'.
    op.execute(f"ALTER TABLE {TABLE} DROP CONSTRAINT chk_resource_type")
    op.execute(
        f"""
        ALTER TABLE {TABLE} ADD CONSTRAINT chk_resource_type
            CHECK (resource_type IN
                ('youtube_video','youtube_playlist','url','note','document'))
        """
    )
    # Integrity: a document row must carry an object key to be servable.
    op.execute(
        f"""
        ALTER TABLE {TABLE} ADD CONSTRAINT chk_document_has_key
            CHECK (resource_type <> 'document' OR doc_object_key IS NOT NULL)
        """
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE {TABLE} DROP CONSTRAINT IF EXISTS chk_document_has_key")
    op.execute(f"ALTER TABLE {TABLE} DROP CONSTRAINT IF EXISTS chk_resource_type")
    op.execute(
        f"""
        ALTER TABLE {TABLE} ADD CONSTRAINT chk_resource_type
            CHECK (resource_type IN
                ('youtube_video','youtube_playlist','url','note'))
        """
    )
    op.execute(
        f"""
        ALTER TABLE {TABLE}
            DROP COLUMN IF EXISTS doc_page_count,
            DROP COLUMN IF EXISTS doc_size_bytes,
            DROP COLUMN IF EXISTS doc_mime_type,
            DROP COLUMN IF EXISTS doc_object_key
        """
    )
