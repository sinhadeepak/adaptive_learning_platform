"""Add per-day activity table for accurate study-time telemetry.

Each row is one calendar UTC day per user, accumulating sessions, questions
answered, and study minutes. Updated by process_session() so live + backfill
paths increment in the same place.

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

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.daily_activity (
            user_id            UUID NOT NULL,
            activity_date      DATE NOT NULL,
            sessions_count     INTEGER NOT NULL DEFAULT 0,
            questions_answered INTEGER NOT NULL DEFAULT 0,
            study_minutes      INTEGER NOT NULL DEFAULT 0,
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, activity_date)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_daily_activity_user_recent ON {SCHEMA}.daily_activity (user_id, activity_date DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.daily_activity")
