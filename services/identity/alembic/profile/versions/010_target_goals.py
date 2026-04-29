"""Sprint 30 (P4-S30): target goals on profile_schema.profiles.

Adds three nullable columns: target_exam_id, target_exam_date, target_rank.
Used by the closed-loop study plan to pace recommendations + by the
pre-mock revision sprint mode in S27's revision queue.

Revision ID: 010
Revises: 009
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "010"
down_revision: str | None = "009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(f"""
        ALTER TABLE {SCHEMA}.profiles
            ADD COLUMN IF NOT EXISTS target_exam_id   UUID NULL,
            ADD COLUMN IF NOT EXISTS target_exam_date DATE NULL,
            ADD COLUMN IF NOT EXISTS target_rank      INTEGER NULL
    """)


def downgrade() -> None:
    op.execute(f"""
        ALTER TABLE {SCHEMA}.profiles
            DROP COLUMN IF EXISTS target_exam_id,
            DROP COLUMN IF EXISTS target_exam_date,
            DROP COLUMN IF EXISTS target_rank
    """)
