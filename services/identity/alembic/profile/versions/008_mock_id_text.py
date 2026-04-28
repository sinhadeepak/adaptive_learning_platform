"""Relax mock_attempts.mock_id from UUID → TEXT. Adaptive-engine generates
mock IDs as `mock_<16-hex>` strings (not full UUIDs) to keep them human-
greppable in logs. The original migration used UUID which rejected those at
insert time.

Revision ID: 008
Revises: 007
Create Date: 2026-04-27
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.mock_attempts ALTER COLUMN mock_id TYPE TEXT USING mock_id::TEXT"
    )


def downgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.mock_attempts ALTER COLUMN mock_id TYPE UUID USING mock_id::UUID"
    )
