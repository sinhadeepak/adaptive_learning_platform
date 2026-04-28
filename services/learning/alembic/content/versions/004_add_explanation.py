"""Add explanation column to content questions.

Sprint 5 deepening — surfaces the "why" alongside the correct answer so QuizResult
can render a real teaching moment instead of just a green/red tick. When the column
is null, the UI calls /adaptive/explain to generate one on demand via the LLM.

Revision ID: 004
Revises: 003
Create Date: 2026-04-27
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.questions ADD COLUMN explanation TEXT"
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE {SCHEMA}.questions DROP COLUMN IF EXISTS explanation")
