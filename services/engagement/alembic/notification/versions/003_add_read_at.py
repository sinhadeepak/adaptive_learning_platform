"""Add `read_at` to notifications so the in-app inbox can show unread state.

Distinct from `dispatched_at` — that one tracks outbound delivery (SMTP/push).
`read_at` tracks user-side acknowledgment from the inbox UI. NULL means the
notification is sitting unread in the user's inbox.

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

SCHEMA = "notification_schema"


def upgrade() -> None:
    op.execute(f"ALTER TABLE {SCHEMA}.notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ")
    # Partial index — only over the unread tail. Lets the unread-count query
    # finish in O(rows-per-user-unread) instead of O(rows-per-user).
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON {SCHEMA}.notifications "
        f"(user_id) WHERE read_at IS NULL"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_notifications_user_unread")
    op.execute(f"ALTER TABLE {SCHEMA}.notifications DROP COLUMN IF EXISTS read_at")
