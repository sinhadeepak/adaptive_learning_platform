"""Add email to profile_schema.profiles.

Email is captured from the `user.created` NATS event Auth publishes after
OTP verification. Profile previously discarded it; the dispatcher in
Notification needs it to send real outbound mail (Sprint 3 carry-over).

Backfill: cross-DB FDW isn't set up, so we leave the column NULL on
existing rows. Auth re-publishes `user.created` for any user touched
after deploy; for the long tail, a backfill script lands in Sprint 4 ops.

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

SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(f"ALTER TABLE {SCHEMA}.profiles ADD COLUMN email TEXT")
    # Per-tenant uniqueness is enforced at Auth (one user per email per tenant);
    # no constraint here — Profile is a denormalised projection.
    op.execute(f"CREATE INDEX idx_profiles_email ON {SCHEMA}.profiles (email) WHERE email IS NOT NULL")


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_profiles_email")
    op.execute(f"ALTER TABLE {SCHEMA}.profiles DROP COLUMN IF EXISTS email")
