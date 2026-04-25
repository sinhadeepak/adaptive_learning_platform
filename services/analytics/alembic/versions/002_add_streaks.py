"""Add streaks table — one row per user, updated on every quiz submit.

Sprint 5 carry-over from Sprint 2/3/4. Tracks consecutive-day engagement
in UTC. Same-day repeat sessions don't increment; gap of 2+ days resets.

Revision ID: 002
Revises: 001
Create Date: 2026-04-25
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.streaks (
            user_id           UUID PRIMARY KEY,
            current_streak    INTEGER NOT NULL DEFAULT 0,
            longest_streak    INTEGER NOT NULL DEFAULT 0,
            last_active_date  DATE NOT NULL,
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT chk_current_nonneg CHECK (current_streak >= 0),
            CONSTRAINT chk_longest_ge_current CHECK (longest_streak >= current_streak)
        )
        """
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.streaks")
