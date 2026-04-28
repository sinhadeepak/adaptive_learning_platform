"""Add notification_prefs JSONB to profiles. Stores per-type mute state
shaped like {"streak.milestone": false, "goal.reached": true, ...} where a
key explicitly set to false means muted. Missing keys default to enabled
so a new notification type ships unmuted.

Revision ID: 006
Revises: 005
Create Date: 2026-04-27
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.profiles "
        "ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb"
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE {SCHEMA}.profiles DROP COLUMN IF EXISTS notification_prefs")
