"""Phase 5 (P5-S37): question_concepts (multi-tag) + backfill 480 rows.

Per ADR-0018. Replaces single topic_id with multi-concept tagging.
Each existing question backfills to its topic-root concept (UUID
identity holds via the topic-as-root-concept seed in catalog/013).

Revision ID: 009
Revises: 008
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.question_concepts (
            question_id  UUID NOT NULL REFERENCES {SCHEMA}.questions(id) ON DELETE CASCADE,
            concept_id   UUID NOT NULL,
            role         TEXT NOT NULL CHECK (role IN (
                'primary','prerequisite','distractor_targets','formula_invoked'
            )),
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (question_id, concept_id, role)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_question_concepts_concept "
        f"ON {SCHEMA}.question_concepts (concept_id, role)"
    )

    # Backfill: each existing question tagged to its topic-root concept.
    # Cross-DB concept reference: catalog_schema lives in alp-learning's
    # `learning` DB alongside content_schema, so this resolves locally.
    op.execute(f"""
        INSERT INTO {SCHEMA}.question_concepts (question_id, concept_id, role)
        SELECT id, topic_id, 'primary'
        FROM {SCHEMA}.questions
        ON CONFLICT (question_id, concept_id, role) DO NOTHING
    """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.question_concepts")
