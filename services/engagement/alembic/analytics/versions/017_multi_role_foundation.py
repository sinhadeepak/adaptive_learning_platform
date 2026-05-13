"""multi_role_foundation — Track 2 Sprint A1.

The foundation pass for the multi-role analytics system documented in
``docs/02_planning/19_Multi_Role_Analytics_Design.md`` and
``docs/02_planning/20_Multi_Role_Analytics_Implementation_Plan.md``.

Two structural changes ship in this single migration:

1. **tenant_id columns** added to every analytics fact table that
   downstream institute / teacher dashboards will need to filter by.
   Nullable for backward compatibility — existing rows stay valid;
   new writes carry the tenant_id from the NATS event payload. A
   one-shot backfill (separate migration once it lands in prod) reads
   from ``identity.users.tenant_id``.

2. **Five new aggregate tables** that the institute / teacher /
   platform dashboards read from instead of recomputing on every
   request:

     - institution_aggregates  — daily rollups per (tenant, exam, cohort)
     - teacher_aggregates      — daily rollups per (educator, cohort)
     - platform_funnels        — append-only signup → first_session →
                                 first_mock → premium_purchased events
     - real_exam_outcomes      — student-self-reported real-exam scores
                                 (opt-in, drives outcome correlation)
     - manual_interventions    — teacher → student "REVISE / DIAGNOSE /
                                 PRACTICE" flags. Drives the cross-role
                                 flow where a teacher's nudge appears
                                 in the student's Guided Next Steps
                                 with a "from {teacher}" badge.

Indexes are scoped to the dominant access path per table. We deliberately
avoid composite indexes that would never be used — they're expensive on
analytics tables that see ingest-heavy write patterns.

Revision ID: 017
Revises: 016
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "017"
down_revision: str | None = "016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "analytics_schema"

# Tables that get a nullable tenant_id column. Pulled from the audit
# in 19_Multi_Role_Analytics_Design.md §4.1.
_TENANT_TABLES = (
    "mastery",
    "readiness",
    "processed_sessions",
    "session_section_stats",
    "concept_mastery",
    "bloom_mastery",
    "error_classifications",
    "revision_queue",
    "peer_percentile",
    "cohort_percentile_distribution",
)


def upgrade() -> None:
    # ── 1. tenant_id on the analytics fact tables ───────────────────
    for tbl in _TENANT_TABLES:
        op.execute(
            f"ALTER TABLE {SCHEMA}.{tbl} ADD COLUMN IF NOT EXISTS tenant_id UUID"
        )
    # Single-column index on tenant_id is the dominant filter for the
    # institute dashboards. Rows without a tenant_id (cross-tenant
    # users like platform admins) skip the index.
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_mastery_tenant "
        f"ON {SCHEMA}.mastery (tenant_id) WHERE tenant_id IS NOT NULL"
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_readiness_tenant "
        f"ON {SCHEMA}.readiness (tenant_id) WHERE tenant_id IS NOT NULL"
    )

    # ── 2. institution_aggregates — nightly rollup target ───────────
    # exam_id and cohort_id are nullable: a row with both NULL is the
    # whole-tenant headline; (tenant, exam, NULL) is per-exam summary;
    # (tenant, exam, cohort) is the leaf cell.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.institution_aggregates (
            tenant_id        UUID        NOT NULL,
            snapshot_date    DATE        NOT NULL,
            exam_id          UUID        NULL,
            cohort_id        UUID        NULL,
            n_students       INTEGER     NOT NULL DEFAULT 0,
            n_active_7d      INTEGER     NOT NULL DEFAULT 0,
            n_sessions       INTEGER     NOT NULL DEFAULT 0,
            n_completed      INTEGER     NOT NULL DEFAULT 0,
            avg_readiness    REAL        NOT NULL DEFAULT 0,
            median_readiness REAL        NOT NULL DEFAULT 0,
            p25_readiness    REAL        NOT NULL DEFAULT 0,
            p75_readiness    REAL        NOT NULL DEFAULT 0,
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            -- Composite PK: snapshot_date first lets us cleanly drop
            -- stale partitions later. NULL exam_id / cohort_id are
            -- coalesced via a synthetic UUID NIL so the PK stays
            -- non-null.
            PRIMARY KEY (tenant_id, snapshot_date, exam_id, cohort_id)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_institution_aggregates_tenant_date "
        f"ON {SCHEMA}.institution_aggregates (tenant_id, snapshot_date DESC)"
    )

    # ── 3. teacher_aggregates ───────────────────────────────────────
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.teacher_aggregates (
            educator_id          UUID        NOT NULL,
            snapshot_date        DATE        NOT NULL,
            cohort_id            UUID        NOT NULL,
            n_students           INTEGER     NOT NULL DEFAULT 0,
            avg_readiness        REAL        NOT NULL DEFAULT 0,
            -- Net change in cohort avg readiness over rolling windows.
            -- Negative = cohort regressing; positive = improving.
            delta_readiness_7d   REAL        NOT NULL DEFAULT 0,
            delta_readiness_30d  REAL        NOT NULL DEFAULT 0,
            n_at_risk            INTEGER     NOT NULL DEFAULT 0,
            n_top_quartile       INTEGER     NOT NULL DEFAULT 0,
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (educator_id, snapshot_date, cohort_id)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_teacher_aggregates_educator_date "
        f"ON {SCHEMA}.teacher_aggregates (educator_id, snapshot_date DESC)"
    )

    # ── 4. platform_funnels — append-only event log ─────────────────
    # No PK — composite (user_id, event, occurred_at) so a re-emitted
    # event silently dedupes via the unique constraint instead of the
    # PK. Funnel queries always GROUP BY (event, date_trunc('day',
    # occurred_at)) so we index on event first.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.platform_funnels (
            user_id      UUID        NOT NULL,
            event        TEXT        NOT NULL
                CHECK (event IN (
                    'signup',
                    'exam_picked',
                    'first_session',
                    'first_mock',
                    'premium_purchased',
                    'churned'
                )),
            occurred_at  TIMESTAMPTZ NOT NULL,
            tenant_id    UUID        NULL,
            exam_code    TEXT        NULL,
            metadata     JSONB       NULL,
            UNIQUE (user_id, event, occurred_at)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_platform_funnels_event_date "
        f"ON {SCHEMA}.platform_funnels (event, occurred_at)"
    )
    op.execute(
        f"CREATE INDEX idx_platform_funnels_user "
        f"ON {SCHEMA}.platform_funnels (user_id)"
    )

    # ── 5. real_exam_outcomes (opt-in self-report) ──────────────────
    # PK on (user_id, exam_code) so a student updating their score
    # overwrites the previous report. Mainline outcome correlation
    # query is "given mastery m, what's the median real_score for
    # exam X?" — indexed.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.real_exam_outcomes (
            user_id      UUID        NOT NULL,
            exam_code    TEXT        NOT NULL,
            real_score   REAL        NULL,
            real_rank    INTEGER     NULL,
            admitted_to  TEXT        NULL,
            reported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, exam_code)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_real_exam_outcomes_exam "
        f"ON {SCHEMA}.real_exam_outcomes (exam_code)"
    )

    # ── 6. manual_interventions (teacher → student flag) ─────────────
    # `fulfilled_at` is null until the student completes the
    # suggested action (REVISE = practice, DIAGNOSE = diagnostic
    # round, PRACTICE = single quiz). The recommender consults this
    # table and prepends unfulfilled rows to the student's Guided
    # Next Steps with a "from {educator}" badge.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.manual_interventions (
            id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id    UUID        NOT NULL,
            educator_id   UUID        NOT NULL,
            cohort_id     UUID        NOT NULL,
            topic_id      UUID        NOT NULL,
            action        TEXT        NOT NULL
                CHECK (action IN ('REVISE', 'DIAGNOSE', 'PRACTICE')),
            reason        TEXT        NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            fulfilled_at  TIMESTAMPTZ NULL
        )
        """
    )
    # Recommender query: "open flags for this student, ordered by
    # most-recent first."
    op.execute(
        f"CREATE INDEX idx_manual_interventions_student_open "
        f"ON {SCHEMA}.manual_interventions (student_id, created_at DESC) "
        f"WHERE fulfilled_at IS NULL"
    )
    # Teacher dashboard query: "all interventions I've ever logged."
    op.execute(
        f"CREATE INDEX idx_manual_interventions_educator "
        f"ON {SCHEMA}.manual_interventions (educator_id, created_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.manual_interventions")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.real_exam_outcomes")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.platform_funnels")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.teacher_aggregates")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.institution_aggregates")
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_readiness_tenant")
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_mastery_tenant")
    for tbl in _TENANT_TABLES:
        op.execute(f"ALTER TABLE {SCHEMA}.{tbl} DROP COLUMN IF EXISTS tenant_id")
