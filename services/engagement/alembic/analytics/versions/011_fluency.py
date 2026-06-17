"""Phase 5 (P5-S39): per-concept fluency — calibrated time-per-question.

Per ADR-0017 dim 3. fluency_score = expected_ms / actual_ms_rolling_avg.
> 1 = slower than baseline; < 1 = faster.

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

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.fluency (
            user_id                 UUID NOT NULL,
            concept_id              UUID NOT NULL,
            expected_ms_baseline    REAL NOT NULL,
            actual_ms_rolling_avg   REAL NOT NULL,
            n                       INTEGER NOT NULL DEFAULT 0,
            fluency_score           REAL NOT NULL,
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, concept_id)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_fluency_user "
        f"ON {SCHEMA}.fluency (user_id, fluency_score)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.fluency")
