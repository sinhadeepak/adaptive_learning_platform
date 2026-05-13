"""F2b — Tenant toggle to require an onboarding diagnostic.

When `tenants.require_onboarding_diagnostic = TRUE`, students belonging
to the tenant must complete the placement diagnostic before reaching
ONBOARDED state. Consumer-tier tenants leave it FALSE; the lazy modal
on /practice continues to serve them.

Revision ID: 008
Revises: 007
Create Date: 2026-05-12
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "institution_schema"


def upgrade() -> None:
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.tenants
        ADD COLUMN IF NOT EXISTS require_onboarding_diagnostic BOOLEAN NOT NULL DEFAULT FALSE
        """
    )


def downgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.tenants DROP COLUMN IF EXISTS require_onboarding_diagnostic"
    )
