"""Add `premium_until` to auth_schema.users for tier elevation.

Why this column rather than adding STUDENT_PREMIUM to user_role_enum:

The role enum encodes WHO the user is (STUDENT / TEACHER / ADMIN), not
WHAT entitlements they currently have. A STUDENT with an active Stripe
subscription is still a STUDENT — they just get the PREMIUM tier-gate
flipped on. Conflating the two would force every webhook event to mutate
the role enum and could clobber TEACHER/EXPERT roles on accidental
state changes.

Source of truth: Payment service's `payment.subscription.changed` NATS
event. Auth subscribes and updates `premium_until` to either:
  - `period_end` when state ∈ {ACTIVE, REACTIVATED, PAST_DUE, CANCELED-with-future-period}
  - NULL when state == INACTIVE

JWT issuance reads this column and elevates `role` from "STUDENT" to
"STUDENT_PREMIUM" when premium_until > now() (Sprint 8 R-1 contract that
Quiz / Adaptive consume for tier-gating).

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

SCHEMA = "auth_schema"


def upgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.users "
        f"ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ"
    )
    # Index supports the JWT issuance check (`premium_until > now()`).
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_users_premium_until "
        f"ON {SCHEMA}.users (premium_until) "
        f"WHERE premium_until IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_users_premium_until")
    op.execute(f"ALTER TABLE {SCHEMA}.users DROP COLUMN IF EXISTS premium_until")
