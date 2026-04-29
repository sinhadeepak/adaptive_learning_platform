"""Sprint 24 (P4-S24): PYQ metadata on content_schema.questions.

Per ADR-0012. Quiz mirror columns shipped in S22 migration 007; this
migration adds the source-of-truth columns on the content side so the
authoring path + bridge + ingest CLI can populate them.

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

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"""
        ALTER TABLE {SCHEMA}.questions
            ADD COLUMN IF NOT EXISTS exam_year     SMALLINT NULL,
            ADD COLUMN IF NOT EXISTS paper_session TEXT     NULL,
            ADD COLUMN IF NOT EXISTS pyq_flag      BOOLEAN  NOT NULL DEFAULT FALSE
    """)
    op.execute(
        f"""
        CREATE INDEX IF NOT EXISTS idx_content_questions_pyq
            ON {SCHEMA}.questions (pyq_flag, exam_year, topic_id)
            WHERE pyq_flag = TRUE
        """
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_content_questions_pyq")
    op.execute(f"""
        ALTER TABLE {SCHEMA}.questions
            DROP COLUMN IF EXISTS pyq_flag,
            DROP COLUMN IF EXISTS paper_session,
            DROP COLUMN IF EXISTS exam_year
    """)
