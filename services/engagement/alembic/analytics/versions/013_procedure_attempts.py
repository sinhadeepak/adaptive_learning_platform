"""Phase 5 (P5-S39): procedural-skill attempts — multi-step problem step-correctness.

Per ADR-0017 dim 8. step_results JSONB stores per-step is_correct +
reasoning. Used by procedural-skill aggregator (S46+ surfaces in
profile UI).

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

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.procedure_attempts (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id         UUID NOT NULL,
            question_id     UUID NOT NULL,
            step_results    JSONB NOT NULL,
            submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        f"CREATE INDEX idx_procedure_user_question "
        f"ON {SCHEMA}.procedure_attempts (user_id, question_id, submitted_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.procedure_attempts")
