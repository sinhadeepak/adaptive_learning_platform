"""Sprint 22 (P4-S22): session_section_stats table.

Per ADR-0013, every submitted quiz session now carries per-item
time_spent_ms + section_id in the NATS payload. The engagement
consumer groups items by section and persists per-section accuracy +
total time. For sessions without a blueprint (no section_id), the
consumer falls back to grouping by topic_id.

Read paths:
  - GET /analytics/student/{user_id}/time-stats  (per-section aggregates)
  - GET /analytics/sessions/{session_id}/breakdown  (single session)

Revision ID: 005
Revises: 004
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.session_section_stats (
            session_id     UUID NOT NULL,
            section_id     TEXT NOT NULL,
            user_id        UUID NOT NULL,
            correct_count  INTEGER NOT NULL,
            served_count   INTEGER NOT NULL,
            total_time_ms  BIGINT NOT NULL,
            computed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (session_id, section_id)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_session_section_user ON {SCHEMA}.session_section_stats (user_id, section_id)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.session_section_stats")
