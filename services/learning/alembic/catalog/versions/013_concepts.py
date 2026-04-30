"""Phase 5 (P5-S37): concepts table + topic-as-root-concept backfill.

Per ADR-0017. Concept-grain Knowledge Graph replaces topic-only graph
as the substrate. Existing topics seed as kind='topic_root' concepts —
their UUIDs are reused so existing topic_id references resolve as
concept_id without rewrite (no ghost layer).

Revision ID: 013
Revises: 012
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "013"
down_revision: str | None = "012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.concepts (
            id                   UUID PRIMARY KEY,
            parent_topic_id      UUID NOT NULL REFERENCES {SCHEMA}.topics(id) ON DELETE CASCADE,
            parent_concept_id    UUID NULL REFERENCES {SCHEMA}.concepts(id) ON DELETE SET NULL,
            kind                 TEXT NOT NULL CHECK (kind IN (
                'topic_root','concept','sub_concept','definition','formula',
                'derivation','example','theorem','common_mistake','application','lecture_node'
            )),
            title                TEXT NOT NULL,
            description_md       TEXT NULL,
            language             TEXT NOT NULL DEFAULT 'en',
            ordering_hint        INTEGER NULL,
            assessment_optional  BOOLEAN NOT NULL DEFAULT FALSE,
            cognitive_demand     JSONB NULL,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        f"CREATE INDEX idx_concepts_parent_topic "
        f"ON {SCHEMA}.concepts (parent_topic_id)"
    )
    op.execute(
        f"CREATE INDEX idx_concepts_parent_concept "
        f"ON {SCHEMA}.concepts (parent_concept_id) WHERE parent_concept_id IS NOT NULL"
    )

    # Backfill: every existing topic seeds as a kind='topic_root' concept,
    # reusing the topic UUID. Per ADR-0017 — no ghost layer; existing
    # topic_id references resolve as concept_id transparently.
    op.execute(f"""
        INSERT INTO {SCHEMA}.concepts (id, parent_topic_id, kind, title, language)
        SELECT id, id, 'topic_root', title, 'en'
        FROM {SCHEMA}.topics
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.concepts CASCADE")
