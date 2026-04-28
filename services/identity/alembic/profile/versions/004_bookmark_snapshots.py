"""Snapshot question text + topic title onto bookmarks so the saved-questions
screen renders without a cross-service fan-out, and a later edit/unpublish to
the source question doesn't strand the saved item.

Revision ID: 004
Revises: 003
Create Date: 2026-04-27
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(f"ALTER TABLE {SCHEMA}.bookmarks ADD COLUMN IF NOT EXISTS topic_title TEXT")
    op.execute(f"ALTER TABLE {SCHEMA}.bookmarks ADD COLUMN IF NOT EXISTS stem TEXT")


def downgrade() -> None:
    op.execute(f"ALTER TABLE {SCHEMA}.bookmarks DROP COLUMN IF EXISTS stem")
    op.execute(f"ALTER TABLE {SCHEMA}.bookmarks DROP COLUMN IF EXISTS topic_title")
