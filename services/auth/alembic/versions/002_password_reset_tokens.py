"""Add password_reset_tokens table (STU-REQ-07).

Separate from otp_tokens because the semantics differ:
- otp_tokens: 6-digit numeric, 10-minute TTL, attempts-bounded.
- password_reset_tokens: 32+ char URL-safe random, 1-hour TTL, single-use.

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

SCHEMA = "auth_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.password_reset_tokens (
          id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id      UUID         NOT NULL
                          REFERENCES {SCHEMA}.users(id) ON DELETE CASCADE,
          token_hash   TEXT         NOT NULL UNIQUE,
          expires_at   TIMESTAMPTZ  NOT NULL,
          used_at      TIMESTAMPTZ,
          created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_pwreset_user_id ON {SCHEMA}.password_reset_tokens (user_id)"
    )
    op.execute(
        f"CREATE INDEX idx_pwreset_expires ON {SCHEMA}.password_reset_tokens (expires_at)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.password_reset_tokens")
