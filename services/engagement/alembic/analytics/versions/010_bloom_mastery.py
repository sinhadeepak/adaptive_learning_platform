"""Phase 5 (P5-S39): per-(concept, bloom-level) EWA — knowledge depth axis.

Per ADR-0017 dim 2. Captures "knows the formula but cannot apply it".

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

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.bloom_mastery (
            user_id      UUID NOT NULL,
            concept_id   UUID NOT NULL,
            bloom_level  TEXT NOT NULL CHECK (bloom_level IN (
                'BLOOM_REMEMBER','BLOOM_UNDERSTAND','BLOOM_APPLY',
                'BLOOM_ANALYSE','BLOOM_EVALUATE','BLOOM_CREATE'
            )),
            ewa          REAL NOT NULL DEFAULT 0,
            n            INTEGER NOT NULL DEFAULT 0,
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, concept_id, bloom_level)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_bloom_mastery_user_concept "
        f"ON {SCHEMA}.bloom_mastery (user_id, concept_id)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.bloom_mastery")
