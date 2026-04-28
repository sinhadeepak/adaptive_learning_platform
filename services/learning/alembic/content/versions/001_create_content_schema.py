"""Initial schema for Content — questions + topic-link table.

Authoring lifecycle: DRAFT → REVIEW → PUBLISHED (or REJECTED). PUBLISHED
rows are mirrored into Quiz's question bank by an event consumer in
Sprint 4. For now, content authors create questions here and Quiz reads
its own seed; the bridge lands when content.published events fire.

Revision ID: 001
Revises:
Create Date: 2026-04-25
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.questions (
            id              UUID PRIMARY KEY,
            topic_id        UUID NOT NULL,
            stem            TEXT NOT NULL,
            choices         JSONB NOT NULL,
            correct_idx     SMALLINT NOT NULL,
            difficulty_b    REAL NOT NULL DEFAULT 0.0,
            language        TEXT NOT NULL DEFAULT 'en',
            status          TEXT NOT NULL DEFAULT 'DRAFT',
            created_by      UUID NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            submitted_at    TIMESTAMPTZ,
            reviewed_by     UUID,
            reviewed_at     TIMESTAMPTZ,
            review_notes    TEXT,
            CONSTRAINT chk_correct_idx_nonneg CHECK (correct_idx >= 0),
            CONSTRAINT chk_status CHECK (status IN ('DRAFT','REVIEW','PUBLISHED','REJECTED','RETIRED'))
        )
        """
    )
    op.execute(f"CREATE INDEX idx_questions_status ON {SCHEMA}.questions (status, topic_id)")
    op.execute(f"CREATE INDEX idx_questions_author ON {SCHEMA}.questions (created_by, created_at DESC)")


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.questions")
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
