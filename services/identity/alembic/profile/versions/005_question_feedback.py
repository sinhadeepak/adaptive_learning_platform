"""Add question_feedback so students can report an ambiguous, wrong, or
typo'd question from the quiz review surface. Surfaces to moderators in
Sprint 5+ via a tiny admin endpoint; for now the table just collects the
signal so we don't lose it.

Revision ID: 005
Revises: 004
Create Date: 2026-04-27
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.question_feedback (
            id          UUID NOT NULL DEFAULT gen_random_uuid(),
            user_id     UUID NOT NULL,
            question_id UUID NOT NULL,
            kind        TEXT NOT NULL CHECK (kind IN ('WRONG_ANSWER', 'AMBIGUOUS', 'TYPO', 'OTHER')),
            note        TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (id),
            UNIQUE (user_id, question_id, kind)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_question_feedback_question ON {SCHEMA}.question_feedback (question_id, created_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.question_feedback")
