"""Add achievements table — students unlock badges for milestones (streak
crossings, first session, N questions, etc.). UNIQUE (user_id, kind) so the
analytics + adaptive-engine emitters can be naïvely idempotent — a re-emit
is a no-op rather than dup rows.

Revision ID: 009
Revises: 008
Create Date: 2026-04-27
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.achievements (
            id          UUID NOT NULL DEFAULT gen_random_uuid(),
            user_id     UUID NOT NULL,
            kind        TEXT NOT NULL,
            payload     JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            awarded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (id),
            UNIQUE (user_id, kind)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_achievements_user_recent ON {SCHEMA}.achievements (user_id, awarded_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.achievements")
