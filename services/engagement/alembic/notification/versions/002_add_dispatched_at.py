"""Add dispatched_at + dispatch_attempts to notifications.

`dispatched_at` is set when SMTP returns 250 (or equivalent for SMS / push).
NULL means "queued for dispatch". `dispatch_attempts` increments on every
attempt so the worker can apply backoff and stop retrying after a cap.

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

SCHEMA = "notification_schema"


def upgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.notifications "
        "ADD COLUMN dispatched_at TIMESTAMPTZ, "
        "ADD COLUMN dispatch_attempts SMALLINT NOT NULL DEFAULT 0, "
        "ADD COLUMN last_dispatch_error TEXT"
    )
    # Partial index — only on undispatched rows; small + lets the worker
    # poll efficiently even as the table grows.
    op.execute(
        f"CREATE INDEX idx_notifications_pending ON {SCHEMA}.notifications "
        f"(created_at) WHERE dispatched_at IS NULL"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_notifications_pending")
    op.execute(
        f"ALTER TABLE {SCHEMA}.notifications "
        "DROP COLUMN IF EXISTS last_dispatch_error, "
        "DROP COLUMN IF EXISTS dispatch_attempts, "
        "DROP COLUMN IF EXISTS dispatched_at"
    )
