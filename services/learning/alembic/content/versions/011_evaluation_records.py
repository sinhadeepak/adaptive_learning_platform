"""Phase 5 (P5-S37): evaluation_records — immutable Resolution per response.

Per ADR-0018. Re-evaluation (rubric edit, prompt-version bump, admin
trigger) inserts a new record; old record retained for audit + appeal.

Revision ID: 011
Revises: 010
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "011"
down_revision: str | None = "010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.evaluation_records (
            id              UUID PRIMARY KEY,
            response_id     UUID NOT NULL,
            evaluator_kind  TEXT NOT NULL CHECK (evaluator_kind IN ('AI','HUMAN','DETERMINISTIC')),
            evaluator_id    TEXT NOT NULL,
            resolution      JSONB NOT NULL,
            confidence      REAL NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
            prompt_version  TEXT NULL,
            rubric_version  INTEGER NULL,
            evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        f"CREATE INDEX idx_evaluation_records_response "
        f"ON {SCHEMA}.evaluation_records (response_id, evaluated_at DESC)"
    )
    op.execute(
        f"CREATE INDEX idx_evaluation_records_kind "
        f"ON {SCHEMA}.evaluation_records (evaluator_kind, evaluated_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.evaluation_records")
