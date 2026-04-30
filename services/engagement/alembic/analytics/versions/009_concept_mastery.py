"""Phase 5 (P5-S39): per-concept EWA mastery substrate.

Per ADR-0017 dim 1. Replaces topic-only mastery as the primary
concept-grain signal. Topic-grain mastery rows continue to update
in parallel; topic-EWA becomes a derived rollup (still served by
existing endpoints).

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

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.concept_mastery (
            user_id        UUID NOT NULL,
            concept_id     UUID NOT NULL,
            ewa            REAL NOT NULL DEFAULT 0,
            n              INTEGER NOT NULL DEFAULT 0,
            last_seen_at   TIMESTAMPTZ NULL,
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, concept_id)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_concept_mastery_concept "
        f"ON {SCHEMA}.concept_mastery (concept_id)"
    )
    op.execute(
        f"CREATE INDEX idx_concept_mastery_user_seen "
        f"ON {SCHEMA}.concept_mastery (user_id, last_seen_at DESC NULLS LAST)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.concept_mastery")
