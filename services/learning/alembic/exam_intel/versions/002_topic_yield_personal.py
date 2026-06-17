"""PCE — Probabilistic Curriculum Engine (Pillar B — Phase B2).

Adds `topic_yield_personal` to `exam_intelligence_schema`. One row
per (user, exam, topic, forecast_year) holding the **personalised**
yield: base_yield × (1 − mastery) × decay_severity × time_pressure.

The "base_yield" is just `expected_marks` from `topic_forecast` — we
denormalise into this table so the per-user ranking is a single-row
read per user (no join into the forecast table on the read path).

Refreshed in two ways:
  1. Nightly batch job (recomputes every user with recent activity).
  2. Event-driven (subscribes to mastery.delta on the analytics
     stream; recomputes the affected (user, topic) rows).

Revision ID: 002
Revises: 001
Create Date: 2026-05-13
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "exam_intelligence_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.topic_yield_personal (
            user_id          uuid    NOT NULL,
            exam_id          uuid    NOT NULL,
            topic_id         uuid    NOT NULL,
            forecast_year    smallint NOT NULL,
            base_yield       real    NOT NULL,
            mastery          real    NOT NULL,
            decay_severity   real    NOT NULL DEFAULT 0.0,
            time_pressure    real    NOT NULL DEFAULT 1.0,
            personal_yield   real    NOT NULL,
            rank             smallint NOT NULL,
            computed_at      timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, exam_id, topic_id, forecast_year)
        )
        """
    )
    # The hot read pattern is "give me the top-N for this user, this
    # exam" — index supports the order-by-personal_yield-desc scan.
    op.execute(
        f"""
        CREATE INDEX topic_yield_personal_user_rank_idx
            ON {SCHEMA}.topic_yield_personal (user_id, exam_id, rank ASC)
        """
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.topic_yield_personal")
