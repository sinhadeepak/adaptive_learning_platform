"""Initial schema for Notification — notifications + processed_events.

Revision ID: 001
Revises:
Create Date: 2026-04-25
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "notification_schema"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.notifications (
            id           UUID PRIMARY KEY,
            user_id      UUID NOT NULL,
            type         TEXT NOT NULL,         -- 'quiz.completed', 'streak.milestone', ...
            channel      TEXT NOT NULL,         -- 'email' | 'sms' | 'push'
            payload      JSONB NOT NULL,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_notifications_user_created "
        f"ON {SCHEMA}.notifications (user_id, created_at DESC)"
    )

    # Idempotency log — same shape as analytics.processed_sessions but keyed
    # by event_id (currently the quiz session_id; future events use their own
    # natural key). Sprint 4 generalises to (subject, event_id) when more
    # event types land.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.processed_events (
            event_id      UUID PRIMARY KEY,
            processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.processed_events")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.notifications")
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
