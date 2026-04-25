"""Add per-item IRT calibration columns to content questions.

Sprint 4 SPIKE-01 follow-up — pairs with Quiz migration 003. Defaults match
Quiz (a=1.0, c=0.0) so existing rows continue to behave as 2PL items until
a moderator calibrates them.

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

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.questions
            ADD COLUMN discrimination_a REAL NOT NULL DEFAULT 1.0,
            ADD COLUMN guessing_c       REAL NOT NULL DEFAULT 0.0
        """
    )
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.questions
            ADD CONSTRAINT chk_discrimination_a_pos CHECK (discrimination_a > 0),
            ADD CONSTRAINT chk_guessing_c_range     CHECK (guessing_c >= 0 AND guessing_c < 1)
        """
    )


def downgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.questions DROP CONSTRAINT IF EXISTS chk_guessing_c_range"
    )
    op.execute(
        f"ALTER TABLE {SCHEMA}.questions DROP CONSTRAINT IF EXISTS chk_discrimination_a_pos"
    )
    op.execute(f"ALTER TABLE {SCHEMA}.questions DROP COLUMN IF EXISTS guessing_c")
    op.execute(f"ALTER TABLE {SCHEMA}.questions DROP COLUMN IF EXISTS discrimination_a")
