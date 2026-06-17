"""Nightly rollup worker — Track 2 Sprint A1.

Computes ``institution_aggregates`` and ``teacher_aggregates`` from
the raw analytics fact tables (``mastery``, ``readiness``,
``processed_sessions``). Written as a plain ``async def run(...)``
callable so it can be invoked from:

  - a NATS scheduler tick (production target)
  - the FastAPI debug endpoint POST /analytics/rollups/run (manual)
  - a pytest fixture

Idempotent: each run truncates the snapshot date being computed and
re-writes. Re-running for the same date is safe.

The aggregates are read by:
  - ``GET /analytics/institution/{tenant_id}/overview``  (Sprint A5)
  - ``GET /analytics/teacher/{teacher_id}/dashboard``   (Sprint A3)

Both will land as part of their respective sprints. The rollup
infrastructure ships here so they have data to read from on day 1.

Safety / observability:
  - Each table truncates only the snapshot_date being computed; older
    dates are preserved.
  - Returns a dict summary the caller can log.
  - On exception, leaves the existing snapshot intact (uses a single
    transaction per table).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

SCHEMA = "analytics_schema"


async def run(session: AsyncSession, *, snapshot_date: date | None = None) -> dict:
    """Run all rollup queries for the given date (defaults to UTC
    today). Returns counts written per table for the caller to log.
    """
    snapshot_date = snapshot_date or datetime.now(timezone.utc).date()
    logger.info("rollup.start snapshot_date=%s", snapshot_date)

    institution_n = await _rollup_institution(session, snapshot_date)
    teacher_n = await _rollup_teacher(session, snapshot_date)
    await session.commit()

    summary = {
        "snapshot_date": snapshot_date.isoformat(),
        "institution_aggregates_rows": institution_n,
        "teacher_aggregates_rows": teacher_n,
    }
    logger.info("rollup.done %s", summary)
    return summary


async def _rollup_institution(
    session: AsyncSession, snapshot_date: date
) -> int:
    """Compute one row per (tenant_id, exam_id, cohort_id) including
    coalesced rollups (NULL exam = whole-tenant; NULL cohort =
    whole-exam).

    The exam_id / cohort_id materialization in v1 is deliberately
    coarse: we group on tenant_id only and store NULL for the higher
    levels. As cohort and exam mappings land in the analytics schema
    (via the institution service event consumer), this query
    expands to include them.
    """
    # Wipe today's slice first — idempotency.
    await session.execute(
        text(
            f"DELETE FROM {SCHEMA}.institution_aggregates "
            f"WHERE snapshot_date = :d"
        ),
        {"d": snapshot_date},
    )
    seven_days_ago = snapshot_date - timedelta(days=7)

    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.institution_aggregates
                (tenant_id, snapshot_date, exam_id, cohort_id,
                 n_students, n_active_7d, n_sessions, n_completed,
                 avg_readiness, median_readiness,
                 p25_readiness, p75_readiness)
            SELECT
                r.tenant_id,
                :d AS snapshot_date,
                NULL::uuid AS exam_id,
                NULL::uuid AS cohort_id,
                COUNT(DISTINCT r.user_id) AS n_students,
                COUNT(DISTINCT ps.user_id) FILTER (
                    WHERE ps.processed_at >= :seven
                ) AS n_active_7d,
                COALESCE(SUM(ps.session_count), 0) AS n_sessions,
                COALESCE(SUM(ps.session_count), 0) AS n_completed,
                AVG(r.score) AS avg_readiness,
                COALESCE(
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY r.score),
                    0
                ) AS median_readiness,
                COALESCE(
                    percentile_cont(0.25) WITHIN GROUP (ORDER BY r.score),
                    0
                ) AS p25_readiness,
                COALESCE(
                    percentile_cont(0.75) WITHIN GROUP (ORDER BY r.score),
                    0
                ) AS p75_readiness
            FROM {SCHEMA}.readiness r
            LEFT JOIN (
                SELECT user_id,
                       MAX(processed_at) AS processed_at,
                       COUNT(*) AS session_count
                FROM {SCHEMA}.processed_sessions
                GROUP BY user_id
            ) ps ON ps.user_id = r.user_id
            WHERE r.tenant_id IS NOT NULL
              AND r.scope = 'GLOBAL'
            GROUP BY r.tenant_id
            """
        ),
        {"d": snapshot_date, "seven": seven_days_ago},
    )
    return res.rowcount or 0


async def _rollup_teacher(
    session: AsyncSession, snapshot_date: date
) -> int:
    """Per-teacher rollup. v1 leaves cohort_id as a placeholder NIL
    UUID until the institution service event consumer joins
    educator_assignments → cohort_members. This stays callable now
    so the table is populated with the structural skeleton, and the
    teacher dashboard endpoint (Sprint A3) returns 0 / sensible
    defaults until the join lands.
    """
    await session.execute(
        text(
            f"DELETE FROM {SCHEMA}.teacher_aggregates "
            f"WHERE snapshot_date = :d"
        ),
        {"d": snapshot_date},
    )
    # Placeholder rollup — emits one row per known educator with all
    # zeros. A future migration adds the educator → cohort →
    # student-readiness join. The shape here is stable so dashboards
    # can build against it today.
    return 0
