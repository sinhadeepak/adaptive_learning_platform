"""Add bookmarks table — students save questions from quiz results
to revisit later. Composite primary key on (user_id, question_id) so
re-bookmarking is a no-op rather than a duplicate.

Revision ID: 003
Revises: 002
Create Date: 2026-04-27
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.bookmarks (
            user_id     UUID NOT NULL,
            question_id UUID NOT NULL,
            topic_id    UUID,
            note        TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, question_id)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_bookmarks_user_recent ON {SCHEMA}.bookmarks (user_id, created_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.bookmarks")
