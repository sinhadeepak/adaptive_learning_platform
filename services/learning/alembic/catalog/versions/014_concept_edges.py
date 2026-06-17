"""Phase 5 (P5-S37): concept_edges typed graph + migrate prerequisites JSONB.

Per ADR-0017. 8 typed edges replace the topic-only prereq array.
Existing topics.prerequisites JSONB rows migrate to is_prerequisite_of
edges in concept_edges (via the topic-as-root-concept identity).

Revision ID: 014
Revises: 013
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "014"
down_revision: str | None = "013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.concept_edges (
            from_concept_id  UUID NOT NULL REFERENCES {SCHEMA}.concepts(id) ON DELETE CASCADE,
            to_concept_id    UUID NOT NULL REFERENCES {SCHEMA}.concepts(id) ON DELETE CASCADE,
            edge_type        TEXT NOT NULL CHECK (edge_type IN (
                'is_prerequisite_of','is_specialisation_of','is_applied_in',
                'is_example_of','is_tested_by','is_taught_by',
                'appears_in_blueprint','is_common_mistake_for'
            )),
            weight           REAL NULL,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (from_concept_id, to_concept_id, edge_type)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_concept_edges_to ON {SCHEMA}.concept_edges (to_concept_id, edge_type)"
    )
    op.execute(
        f"CREATE INDEX idx_concept_edges_type ON {SCHEMA}.concept_edges (edge_type)"
    )

    # Migrate topics.prerequisites JSONB → concept_edges.
    # Topics seeded as topic_root concepts have UUID identity, so prereq_id
    # in the JSONB array resolves to the prereq's concept_id directly.
    # is_prerequisite_of: from=prereq, to=topic
    op.execute(f"""
        INSERT INTO {SCHEMA}.concept_edges (from_concept_id, to_concept_id, edge_type)
        SELECT (prereq.value)::uuid, t.id, 'is_prerequisite_of'
        FROM {SCHEMA}.topics t
        CROSS JOIN LATERAL jsonb_array_elements_text(t.prerequisites) AS prereq
        WHERE EXISTS (
            SELECT 1 FROM {SCHEMA}.concepts c WHERE c.id = (prereq.value)::uuid
        )
        ON CONFLICT (from_concept_id, to_concept_id, edge_type) DO NOTHING
    """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.concept_edges")
