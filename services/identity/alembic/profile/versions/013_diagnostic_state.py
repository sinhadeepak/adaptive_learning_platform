"""F2b — Diagnostic onboarding state + waiver flag.

Extends the onboarding FSM with an optional DIAGNOSTIC_DONE state that
sits between EXAM_SELECTED and ONBOARDED. Institutions that require a
placement diagnostic before students reach the home dashboard will use
this gate; consumer users who answer the lazy modal (F2a) follow the
existing EXAM_SELECTED → ONBOARDED path.

Also adds profiles.diagnostic_waived — an admin escape hatch so a
tenant admin can unblock a student who can't complete the diagnostic
for legitimate reasons (accessibility, retake-blocked, etc.).

Postgres ENUM types can't be altered transactionally in older versions
(< PG12), so we use the modern `ALTER TYPE ... ADD VALUE` syntax which
is online-safe on PG14+.

Revision ID: 013
Revises: 012
Create Date: 2026-05-12
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "013"
down_revision: str | None = "012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"


def upgrade() -> None:
    # Extend the existing enum. PG14+ allows BEFORE/AFTER positioning;
    # we place DIAGNOSTIC_DONE between EXAM_SELECTED and ONBOARDED so
    # enum ordering reflects the FSM progression for any ORDER BY.
    op.execute(
        f"""
        ALTER TYPE {SCHEMA}.onboarding_state_enum
        ADD VALUE IF NOT EXISTS 'DIAGNOSTIC_DONE'
        AFTER 'EXAM_SELECTED'
        """
    )
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.profiles
        ADD COLUMN IF NOT EXISTS diagnostic_waived BOOLEAN NOT NULL DEFAULT FALSE
        """
    )


def downgrade() -> None:
    # Enum value removal is not supported in PG; leaving it in place on
    # downgrade is harmless because nothing references it once code is
    # rolled back. Drop only the column.
    op.execute(
        f"ALTER TABLE {SCHEMA}.profiles DROP COLUMN IF EXISTS diagnostic_waived"
    )
