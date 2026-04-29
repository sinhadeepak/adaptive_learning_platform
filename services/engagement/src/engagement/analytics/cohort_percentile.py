"""Sprint 31 (P4-S31) — cohort percentile distribution.

Pure-function helpers for bucketing readiness, computing percentile from
a distribution, and gating cold-start regimes. DB read/write helpers are
in the same module but separated; the pure functions can be tested in
isolation.

Per ADR-0015.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "analytics_schema"

DEFAULT_BUCKET_STEP = 0.05
COLD_START_THRESHOLD = 50  # min cohort users to use cohort path
HIGH_CONFIDENCE_THRESHOLD = 250


def bucket_for_readiness(readiness: float, *, step: float = DEFAULT_BUCKET_STEP) -> float:
    """Snap a readiness value to the bucket grid. 0.0 → 0.0; 0.05 → 0.05;
    0.83 → 0.80 with step=0.05."""
    if readiness <= 0:
        return 0.0
    if readiness >= 1:
        return round(1.0 - step, 4)
    # Floor to step.
    snapped = (readiness // step) * step
    return round(snapped, 4)


def percentile_from_distribution(
    readiness: float, distribution: list[dict[str, Any]]
) -> float:
    """Pure function: percentile rank in [0, 100] for a user's readiness
    given the distribution rows.

    `distribution` is a list of `{readiness_bucket, user_count}` dicts.
    Returns the fraction of cohort users in *strictly lower* buckets,
    expressed as a percentile (so a fresh user with readiness 0.0
    returns 0; a user with readiness above every bucket returns close
    to 100)."""
    if not distribution:
        return 0.0
    user_bucket = bucket_for_readiness(readiness)
    total = sum(int(d.get("user_count", 0) or 0) for d in distribution)
    if total == 0:
        return 0.0
    below = sum(
        int(d.get("user_count", 0) or 0)
        for d in distribution
        if float(d.get("readiness_bucket", 0.0) or 0.0) < user_bucket
    )
    return round(100.0 * below / total, 2)


def confidence_from_cohort_size(n: int) -> tuple[str, float]:
    """Returns (label, half_width_fraction). Wider band = less confident."""
    if n < COLD_START_THRESHOLD:
        return "low", 0.40
    if n < HIGH_CONFIDENCE_THRESHOLD:
        return "medium", 0.20
    return "high", 0.10


def is_cohort_sufficient(
    distribution: list[dict[str, Any]],
    *,
    min_total: int = COLD_START_THRESHOLD,
) -> bool:
    total = sum(int(d.get("user_count", 0) or 0) for d in distribution)
    return total >= min_total


def total_cohort_size(distribution: list[dict[str, Any]]) -> int:
    return sum(int(d.get("user_count", 0) or 0) for d in distribution)


# ---- DB helpers (impure) ----


async def aggregate_cohort_distribution(
    session: AsyncSession,
    *,
    exam_id: str,
    topic_id: str | None = None,
) -> int:
    """Re-aggregate the distribution rows for an (exam, topic) pair from
    the source readiness/mastery tables. Idempotent — fully overwrites.

    Returns the number of bucket rows written.
    """
    now = datetime.now(tz=UTC)
    if topic_id is None:
        # Whole-exam: bucket users' overall readiness.
        # Note: the readiness table stores per-user score across all topics
        # they've engaged with — we use it directly.
        rows = (
            await session.execute(
                text(
                    f"""
                    SELECT (FLOOR(score / :step) * :step)::REAL AS bucket,
                           COUNT(DISTINCT user_id) AS n
                      FROM {SCHEMA}.readiness
                     WHERE scope = 'GLOBAL'
                     GROUP BY bucket
                    """
                ),
                {"step": DEFAULT_BUCKET_STEP},
            )
        ).mappings().all()
    else:
        rows = (
            await session.execute(
                text(
                    f"""
                    SELECT (FLOOR(ewa / :step) * :step)::REAL AS bucket,
                           COUNT(DISTINCT user_id) AS n
                      FROM {SCHEMA}.mastery
                     WHERE topic_id = :tid
                     GROUP BY bucket
                    """
                ),
                {"step": DEFAULT_BUCKET_STEP, "tid": topic_id},
            )
        ).mappings().all()

    # Wipe existing distribution for this (exam, topic) before reinserting.
    if topic_id is None:
        await session.execute(
            text(
                f"""
                DELETE FROM {SCHEMA}.cohort_percentile_distribution
                 WHERE exam_id = :eid AND topic_id IS NULL
                """
            ),
            {"eid": exam_id},
        )
    else:
        await session.execute(
            text(
                f"""
                DELETE FROM {SCHEMA}.cohort_percentile_distribution
                 WHERE exam_id = :eid AND topic_id = :tid
                """
            ),
            {"eid": exam_id, "tid": topic_id},
        )

    written = 0
    for r in rows:
        await session.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.cohort_percentile_distribution
                  (exam_id, topic_id, readiness_bucket, user_count, computed_at)
                VALUES
                  (:eid, :tid, :bucket, :n, :now)
                """
            ),
            {
                "eid": exam_id,
                "tid": topic_id,
                "bucket": float(r["bucket"]),
                "n": int(r["n"]),
                "now": now,
            },
        )
        written += 1
    return written


async def load_cohort_distribution(
    session: AsyncSession,
    *,
    exam_id: str,
    topic_id: str | None = None,
) -> list[dict[str, Any]]:
    """Read the distribution rows for an (exam, topic) pair. Returns a
    list of `{readiness_bucket, user_count}` dicts (empty list when no
    distribution has been aggregated yet)."""
    if topic_id is None:
        rows = (
            await session.execute(
                text(
                    f"""
                    SELECT readiness_bucket, user_count, computed_at
                      FROM {SCHEMA}.cohort_percentile_distribution
                     WHERE exam_id = :eid AND topic_id IS NULL
                     ORDER BY readiness_bucket
                    """
                ),
                {"eid": exam_id},
            )
        ).mappings().all()
    else:
        rows = (
            await session.execute(
                text(
                    f"""
                    SELECT readiness_bucket, user_count, computed_at
                      FROM {SCHEMA}.cohort_percentile_distribution
                     WHERE exam_id = :eid AND topic_id = :tid
                     ORDER BY readiness_bucket
                    """
                ),
                {"eid": exam_id, "tid": topic_id},
            )
        ).mappings().all()
    return [
        {
            "readiness_bucket": float(r["readiness_bucket"]),
            "user_count": int(r["user_count"]),
            "computed_at": r["computed_at"].isoformat() if r["computed_at"] else None,
        }
        for r in rows
    ]
