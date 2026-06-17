"""Phase 5 (P5-S37): ai_generation_jobs — AI authoring audit log.

Per ADR-0019. Tracks every authoring assist call (draft_question /
expand_explanation / suggest_distractors). Authors browse history;
moderators audit AI provenance via the AI_DRAFT marker on artifacts.

Revision ID: 012
Revises: 011
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "012"
down_revision: str | None = "011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.ai_generation_jobs (
            id                  UUID PRIMARY KEY,
            artifact_id         UUID NULL REFERENCES {SCHEMA}.questions(id) ON DELETE SET NULL,
            prompt_template_id  TEXT NOT NULL,
            prompt_version      TEXT NOT NULL,
            model               TEXT NOT NULL,
            status              TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed')),
            output              JSONB NULL,
            error_message       TEXT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            completed_at        TIMESTAMPTZ NULL
        )
    """)
    op.execute(
        f"CREATE INDEX idx_ai_jobs_artifact "
        f"ON {SCHEMA}.ai_generation_jobs (artifact_id) "
        f"WHERE artifact_id IS NOT NULL"
    )
    op.execute(
        f"CREATE INDEX idx_ai_jobs_created "
        f"ON {SCHEMA}.ai_generation_jobs (created_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.ai_generation_jobs")
