"""Sprint 27 (P4-S27): spaced-repetition revision queue.

Per ADR-0014. SM-2 + EWA tie-in scheduler keyed on (user_id, topic_id).
Inserted on each topic attempt by process_session; queried daily by the
revision-list endpoint + (later, S30) by the revision.due notification
cron.

Revision ID: 006
Revises: 005
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.revision_queue (
            user_id         UUID NOT NULL,
            topic_id        UUID NOT NULL,
            exam_id         UUID NULL,
            last_attempt_at TIMESTAMPTZ NOT NULL,
            due_at          TIMESTAMPTZ NOT NULL,
            interval_days   INTEGER NOT NULL,
            ease_factor     REAL NOT NULL DEFAULT 2.5,
            attempts        INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (user_id, topic_id)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_revision_due ON {SCHEMA}.revision_queue (user_id, due_at)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.revision_queue")
