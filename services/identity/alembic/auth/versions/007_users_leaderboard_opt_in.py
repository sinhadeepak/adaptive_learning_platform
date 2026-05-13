"""Phase 1D-7: leaderboard opt-in columns on auth_schema.users.

Adds two columns:
  - opt_in_national_leaderboard BOOLEAN NOT NULL DEFAULT FALSE
  - public_display_name         TEXT NULL

The opt-in flag is the source of truth for the cross-tenant national
mock leaderboard (engagement.analytics.national_rank). When NULL, the
display name is redacted to "Student #" + first 6 chars of user_id hash.

Idempotent: uses `ADD COLUMN IF NOT EXISTS` because the columns were
applied directly via psql in dev to unblock work.

Revision ID: 007
Revises: 006
Create Date: 2026-05-05
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE auth_schema.users
          ADD COLUMN IF NOT EXISTS opt_in_national_leaderboard BOOLEAN NOT NULL DEFAULT FALSE
        """
    )
    op.execute(
        """
        ALTER TABLE auth_schema.users
          ADD COLUMN IF NOT EXISTS public_display_name TEXT NULL
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE auth_schema.users DROP COLUMN IF EXISTS public_display_name")
    op.execute(
        "ALTER TABLE auth_schema.users DROP COLUMN IF EXISTS opt_in_national_leaderboard"
    )
