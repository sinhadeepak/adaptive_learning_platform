"""Phase 5 (P5-S37): evaluation_rubrics — versioned rubric for subjective family.

Per ADR-0018. Used by ESSAY / DESCRIPTIVE_LONG / CASE_STUDY children /
COMPREHENSION_LONG children. Rubric is part of *content*, not scoring —
it defines *what* counts as correct, never how many marks.

Versioned: editing creates a new row; old responses retain their
rubric_version reference on re-evaluation.

Revision ID: 010
Revises: 009
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "010"
down_revision: str | None = "009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.evaluation_rubrics (
            id                    UUID PRIMARY KEY,
            artifact_id           UUID NOT NULL REFERENCES {SCHEMA}.questions(id) ON DELETE CASCADE,
            version               INTEGER NOT NULL CHECK (version >= 1),
            criteria              JSONB NOT NULL,
            max_score_points      INTEGER NULL,
            applies_to_languages  TEXT[] NOT NULL DEFAULT ARRAY['en']::TEXT[],
            created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (artifact_id, version)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_evaluation_rubrics_artifact "
        f"ON {SCHEMA}.evaluation_rubrics (artifact_id, version DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.evaluation_rubrics")
