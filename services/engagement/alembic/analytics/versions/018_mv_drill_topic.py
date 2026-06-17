"""Phase 7 (P7-A1): mv_drill_topic materialised view.

Speeds up the hierarchical drill endpoints by pre-aggregating mastery
to (tenant_id, topic_id) granularity. Subject and exam rollups are
performed at query time by the drill route, which fetches the topic →
subject → exam map via HTTP from the learning service (cross-DB
boundary; same AP-01 pattern used by cohort_leaderboard).

Refresh strategy: nightly via the existing aggregator. CONCURRENT
refresh requires the unique index on (tenant_id, topic_id).

Depends on migration 017 having added tenant_id to mastery.

Revision ID: 018
Revises: 017
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "018"
down_revision: str | None = "017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "analytics_schema"


def upgrade() -> None:
    # Materialised view aggregating mastery to (tenant, topic). The
    # subject/exam roll-up happens at query time by the drill route
    # since topic.subject_id lives in the learning DB.
    op.execute(
        f"""
        CREATE MATERIALIZED VIEW {SCHEMA}.mv_drill_topic AS
        SELECT
          tenant_id,
          topic_id,
          COUNT(DISTINCT user_id)               AS n_students,
          AVG(ewa)::real                        AS avg_ewa,
          PERCENTILE_DISC(0.25) WITHIN GROUP (ORDER BY ewa)::real AS p25,
          PERCENTILE_DISC(0.50) WITHIN GROUP (ORDER BY ewa)::real AS p50,
          PERCENTILE_DISC(0.75) WITHIN GROUP (ORDER BY ewa)::real AS p75,
          (COUNT(*) FILTER (WHERE ewa < 0.4))::real
            / NULLIF(COUNT(*), 0)::real         AS weak_pct,
          MAX(updated_at)                       AS last_activity
        FROM {SCHEMA}.mastery
        WHERE tenant_id IS NOT NULL
        GROUP BY tenant_id, topic_id
        """
    )
    # Unique index needed for CONCURRENT refresh.
    op.execute(
        f"""
        CREATE UNIQUE INDEX idx_mvdt_pk
          ON {SCHEMA}.mv_drill_topic (tenant_id, topic_id)
        """
    )
    op.execute(
        f"""
        CREATE INDEX idx_mvdt_topic
          ON {SCHEMA}.mv_drill_topic (topic_id)
        """
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_mvdt_topic")
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_mvdt_pk")
    op.execute(f"DROP MATERIALIZED VIEW IF EXISTS {SCHEMA}.mv_drill_topic")
