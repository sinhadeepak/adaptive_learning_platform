"""Phase 5 (P5-S37 schema, S43 use): calibration_samples for AI vs human kappa.

Per ADR-0019 §"Calibration pipeline". 5% of HYBRID responses route to
humans regardless of AI confidence (deterministic via
hash(response_id) % 20 == 0). Stored here with ai_resolution; human
fills human_resolution async via grader queue. Weekly batch computes
Cohen's kappa per criterion; auto-pause AI evaluation if kappa < 0.7.

Schema lands in S37 alongside the other Phase 5 tables; the
calibration sampler + kappa batch wire up in S43.

Revision ID: 016
Revises: 015
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "016"
down_revision: str | None = "015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.calibration_samples (
            id                UUID PRIMARY KEY,
            response_id       UUID NOT NULL,
            ai_resolution     JSONB NOT NULL,
            human_resolution  JSONB NULL,
            criterion         TEXT NOT NULL,
            ai_score          REAL NOT NULL,
            human_score       REAL NULL,
            sampled_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            human_graded_at   TIMESTAMPTZ NULL
        )
    """)
    op.execute(
        f"CREATE INDEX idx_calibration_criterion_sampled "
        f"ON {SCHEMA}.calibration_samples (criterion, sampled_at DESC)"
    )
    op.execute(
        f"CREATE INDEX idx_calibration_pending_human "
        f"ON {SCHEMA}.calibration_samples (sampled_at) "
        f"WHERE human_resolution IS NULL"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.calibration_samples")
