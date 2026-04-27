"""Create doubts_schema with doubts + doubt_answers tables.

Revision ID: 001
Revises:
Create Date: 2026-04-27
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "doubts_schema"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.doubts (
            id                UUID PRIMARY KEY,
            user_id           UUID NOT NULL,
            tenant_id         TEXT,
            question_text     TEXT NOT NULL,
            photo_data_url    TEXT,
            topic_id          UUID,
            topic_title       TEXT,
            status            TEXT NOT NULL DEFAULT 'OPEN',
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT chk_doubt_status CHECK (status IN ('OPEN','ANSWERED','RESOLVED'))
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_doubts_user_recent ON {SCHEMA}.doubts (user_id, last_activity_at DESC)"
    )
    op.execute(
        f"CREATE INDEX idx_doubts_status ON {SCHEMA}.doubts (status)"
    )

    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.doubt_answers (
            id           UUID PRIMARY KEY,
            doubt_id     UUID NOT NULL REFERENCES {SCHEMA}.doubts(id) ON DELETE CASCADE,
            author_id    UUID,
            author_role  TEXT NOT NULL,
            content      TEXT NOT NULL,
            source       TEXT NOT NULL,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            accepted     BOOLEAN NOT NULL DEFAULT FALSE,
            CONSTRAINT chk_answer_source CHECK (source IN ('expert','ai','peer'))
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_answers_doubt_recent ON {SCHEMA}.doubt_answers (doubt_id, created_at)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.doubt_answers")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.doubts")
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE")
