"""Initial schema for Analytics — mastery (EWA per topic) + readiness scores.

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

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.mastery (
            user_id          UUID NOT NULL,
            topic_id         UUID NOT NULL,
            ewa              REAL NOT NULL DEFAULT 0.0,
            n                INTEGER NOT NULL DEFAULT 0,
            last_session_id  UUID,
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, topic_id)
        )
        """
    )
    op.execute(f"CREATE INDEX idx_mastery_user ON {SCHEMA}.mastery (user_id)")

    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.readiness (
            user_id     UUID NOT NULL,
            scope       TEXT NOT NULL,
            score       REAL NOT NULL,
            n_topics    INTEGER NOT NULL DEFAULT 0,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, scope)
        )
        """
    )

    # Idempotency log so the subscriber doesn't double-count if NATS
    # redelivers a quiz.session.completed event.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.processed_sessions (
            session_id    UUID PRIMARY KEY,
            processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.processed_sessions")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.readiness")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.mastery")
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
