"""Add content_language (question/content language, distinct from app language_pref).

Revision ID: 014
Revises: 013
Create Date: 2026-06-18
"""
from __future__ import annotations
from collections.abc import Sequence
from alembic import op

revision: str = "014"
down_revision: str | None = "013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.profiles "
        "ADD COLUMN IF NOT EXISTS content_language TEXT NOT NULL DEFAULT 'en' "
        "CONSTRAINT chk_content_language CHECK (content_language IN ('en','hi','ta','te','bn','mr'))"
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE {SCHEMA}.profiles DROP COLUMN IF EXISTS content_language")
