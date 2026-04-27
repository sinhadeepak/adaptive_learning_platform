"""Persist mock-test attempts. Adaptive-engine plans mocks in-memory and the
plan stays in `_active_mocks` for the playback window — but the *result*
(score / accuracy / projected rank) is durable progress that students want
to look back at. This table captures a slim row per scored attempt; the
question-by-question breakdown stays out (sections summary in JSONB is
enough for the dashboard view).

Revision ID: 007
Revises: 006
Create Date: 2026-04-27
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.mock_attempts (
            id              UUID NOT NULL DEFAULT gen_random_uuid(),
            user_id         UUID NOT NULL,
            mock_id         TEXT,
            exam_code       TEXT NOT NULL,
            exam_name       TEXT,
            raw_score       INTEGER NOT NULL,
            max_marks       INTEGER NOT NULL,
            accuracy        REAL NOT NULL,
            total_questions INTEGER NOT NULL,
            n_correct       INTEGER NOT NULL,
            n_wrong         INTEGER NOT NULL,
            n_unanswered    INTEGER NOT NULL,
            percentile      REAL,
            projected_rank  INTEGER,
            confidence      TEXT,
            sections        JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (id)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_mock_attempts_user_recent ON {SCHEMA}.mock_attempts (user_id, created_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.mock_attempts")
