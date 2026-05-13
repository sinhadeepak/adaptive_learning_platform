"""Phase 1D-4 — Career-outcome correlation.

Given a student's current readiness, look up the historical distribution of
real-exam outcomes for opted-in students who reached a similar readiness.

Returns a rank-bucket histogram + admit-list breakdown so the student can
calibrate their expected outcome. K-anonymity floor of 50 — when fewer
than 50 opt-in samples exist in the readiness band, return `hidden=true`.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

K_ANON_FLOOR = 50

# Static rank buckets for AIR display
_RANK_BUCKETS: list[tuple[str, int | None, int | None]] = [
    ("under_5k", None, 5000),
    ("5k_15k", 5000, 15000),
    ("15k_50k", 15000, 50000),
    ("over_50k", 50000, None),
]


@dataclass
class RankBucket:
    label: str
    n: int
    pct: float
    rank_low: int | None
    rank_high: int | None


@dataclass
class CareerOutcomeReport:
    exam_code: str
    readiness_low: float
    readiness_high: float
    n_samples: int
    hidden: bool
    rank_buckets: list[RankBucket]
    top_admits: list[tuple[str, int]]   # (admitted_to, count)
    notes: list[str]


async def compute(
    session: AsyncSession,
    *,
    exam_code: str,
    readiness: float,
    band: float = 0.05,
) -> CareerOutcomeReport:
    notes: list[str] = []
    lo = max(0.0, readiness - band)
    hi = min(1.0, readiness + band)

    rows = (
        await session.execute(
            text(
                """
                SELECT reo.real_rank, reo.admitted_to,
                       COALESCE(r.score, 0.0) AS readiness_score
                  FROM analytics_schema.real_exam_outcomes reo
                  JOIN analytics_schema.readiness r
                       ON r.user_id = reo.user_id
                      AND r.scope = 'GLOBAL'
                 WHERE reo.exam_code = :ec
                   AND r.score BETWEEN :lo AND :hi
                """
            ),
            {"ec": exam_code, "lo": lo, "hi": hi},
        )
    ).all()

    n = len(rows)
    if n < K_ANON_FLOOR:
        return CareerOutcomeReport(
            exam_code=exam_code,
            readiness_low=round(lo, 4),
            readiness_high=round(hi, 4),
            n_samples=n,
            hidden=True,
            rank_buckets=[],
            top_admits=[],
            notes=[
                f"Only {n} opted-in samples in this readiness band — "
                f"need at least {K_ANON_FLOOR} for a useful estimate. "
                "Card hidden until cohort grows.",
            ],
        )

    # Rank histogram
    bucket_counts: dict[str, int] = {b[0]: 0 for b in _RANK_BUCKETS}
    for r in rows:
        rank = r[0]
        if rank is None:
            continue
        for label, lo_b, hi_b in _RANK_BUCKETS:
            if (lo_b is None or rank > lo_b) and (hi_b is None or rank <= hi_b):
                bucket_counts[label] += 1
                break

    rank_buckets = []
    n_with_rank = sum(bucket_counts.values())
    for label, lo_b, hi_b in _RANK_BUCKETS:
        c = bucket_counts[label]
        rank_buckets.append(
            RankBucket(
                label=label,
                n=c,
                pct=round(c / n_with_rank, 4) if n_with_rank > 0 else 0.0,
                rank_low=lo_b,
                rank_high=hi_b,
            )
        )

    # Top admits
    admit_counts: dict[str, int] = {}
    for r in rows:
        if r[1]:
            admit_counts[r[1]] = admit_counts.get(r[1], 0) + 1
    top_admits = sorted(admit_counts.items(), key=lambda kv: -kv[1])[:10]

    return CareerOutcomeReport(
        exam_code=exam_code,
        readiness_low=round(lo, 4),
        readiness_high=round(hi, 4),
        n_samples=n,
        hidden=False,
        rank_buckets=rank_buckets,
        top_admits=top_admits,
        notes=notes,
    )
