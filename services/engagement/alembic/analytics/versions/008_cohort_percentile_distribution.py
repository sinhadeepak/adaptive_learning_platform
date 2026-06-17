"""Sprint 31 (P4-S31): cohort_percentile_distribution table.

Per ADR-0015. Replaces the hardcoded readiness→percentile lookup in
learning/adaptive/rank.py with a cohort-data-driven distribution
populated nightly (cron landed in the staging-cutover sprint).

Composite PK supports both whole-exam percentile (topic_id NULL) and
per-topic percentile lookups in one table.

Revision ID: 008
Revises: 007
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.cohort_percentile_distribution (
            exam_id          UUID NOT NULL,
            topic_id         UUID NULL,
            readiness_bucket REAL NOT NULL,
            user_count       INTEGER NOT NULL,
            computed_at      TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (exam_id, topic_id, readiness_bucket)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_cohort_pcdist_exam "
        f"ON {SCHEMA}.cohort_percentile_distribution (exam_id, topic_id)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.cohort_percentile_distribution")
