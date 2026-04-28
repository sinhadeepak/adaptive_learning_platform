"""Mark "Calculus" PREMIUM in the seed so the premium_tier_enforcement gate is observable.

GAP-16 wire-up demo: with the flag OFF (Sprint 1 default), the API still returns this
topic as FREE; with the flag ON, it returns PREMIUM. See services/catalog/src/catalog/routes.py.

Revision ID: 003
Revises: 002
Create Date: 2026-04-25
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"
CALCULUS_ID = "33333333-0000-0000-0000-000000000006"


def upgrade() -> None:
    op.execute(
        f"UPDATE {SCHEMA}.topics SET tier = 'PREMIUM' WHERE id = '{CALCULUS_ID}'"
    )


def downgrade() -> None:
    op.execute(
        f"UPDATE {SCHEMA}.topics SET tier = 'FREE' WHERE id = '{CALCULUS_ID}'"
    )
