"""Add exam_selections.options jsonb for pool picks.

Phase 7 onboarding picker. When an exam has subject_pools (UPSC Mains
optional, etc.), the student's per-pool selection lands as

    {
      "POOL_INDIAN_LANG": ["<subject_id_for_hindi>"],
      "POOL_OPTIONAL_SUBJECT": ["<subject_id_for_psir>"]
    }

Why JSONB and not a join table:
  - Read pattern is always "give me this user's pool picks for this
    selection" — a single row fetch beats a 2-table JOIN for a tiny
    payload (rarely more than 4 picks).
  - Write pattern is whole-document-replace per selection — the student
    picks all options at once on the onboarding screen.
  - No need to query *across* users by selected option in v1; if that
    becomes a use case, add a GIN index on `options`.

NULL means "no picks made yet" (legacy rows, exam without pools).
{} means "exam has no pools, nothing to pick".

Revision ID: 012
Revises: 011
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "012"
down_revision: str | None = "011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.exam_selections
            ADD COLUMN IF NOT EXISTS options jsonb
        """
    )


def downgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.exam_selections DROP COLUMN IF EXISTS options"
    )
