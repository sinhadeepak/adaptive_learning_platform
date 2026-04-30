"""Phase 5 (P5-S39): confidence calibration — predicted vs actual + Brier score.

Per ADR-0017 dim 6. Each per-question confidence-self-report stored
alongside the actual outcome. Brier score = mean((p - o)^2) computed
on read; surfaces in the multi-profile endpoint.

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

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.confidence_calibration (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id             UUID NOT NULL,
            question_id         UUID NOT NULL,
            predicted_correct   REAL NOT NULL CHECK (predicted_correct BETWEEN 0 AND 1),
            actual_correct      BOOLEAN NOT NULL,
            submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        f"CREATE INDEX idx_confidence_user "
        f"ON {SCHEMA}.confidence_calibration (user_id, submitted_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.confidence_calibration")
