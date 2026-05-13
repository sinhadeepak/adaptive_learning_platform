"""Phase 1C — A/B comparison engine.

Two endpoints share this module:

  /analytics/compare/cohorts?a=X&b=Y   — cohort A vs cohort B
  /analytics/compare/students?a=X&b=Y  — student A vs student B

Both produce a side-by-side payload of:
  - headline numbers (avg readiness, weak %, n)
  - per-topic mastery diff (rows where A and B differ by > threshold)
  - top 5 strengths of A vs B and vice versa
  - recommendations ("Cohort B is ahead on Mechanics — schedule a sync")

The engine is symmetric: A and B are interchangeable, the response
labels which side is which.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from engagement.analytics.cohort_leaderboard import fetch_cohort_members

log = logging.getLogger(__name__)

# Per-topic ewa difference threshold to surface in "diffs"
_DIFF_THRESHOLD = 0.10


@dataclass
class TopicDiff:
    topic_id: str
    a_ewa: float
    b_ewa: float
    delta: float                       # b_ewa - a_ewa
    a_n: int
    b_n: int


@dataclass
class CompareSide:
    side: str                          # "a" | "b"
    label: str                         # cohort or user id
    n_topics: int
    n_students: int                    # 1 for compare/students, len(cohort) for compare/cohorts
    avg_ewa: float
    weak_pct: float                    # fraction of topics with ewa < 0.4


@dataclass
class CompareResult:
    side_a: CompareSide
    side_b: CompareSide
    diffs: list[TopicDiff]
    a_strengths: list[TopicDiff]       # topics where a > b by threshold
    b_strengths: list[TopicDiff]       # topics where b > a by threshold
    notes: list[str]


async def compare_cohorts(
    session: AsyncSession, *, cohort_a: str, cohort_b: str
) -> CompareResult:
    members_a = [m["userId"] for m in await fetch_cohort_members(cohort_a) if m.get("role") == "STUDENT"]
    members_b = [m["userId"] for m in await fetch_cohort_members(cohort_b) if m.get("role") == "STUDENT"]
    return await _compare_user_groups(
        session,
        users_a=members_a,
        users_b=members_b,
        label_a=cohort_a,
        label_b=cohort_b,
    )


async def compare_students(
    session: AsyncSession, *, user_a: str, user_b: str
) -> CompareResult:
    return await _compare_user_groups(
        session,
        users_a=[user_a],
        users_b=[user_b],
        label_a=user_a,
        label_b=user_b,
    )


async def _compare_user_groups(
    session: AsyncSession,
    *,
    users_a: list[str],
    users_b: list[str],
    label_a: str,
    label_b: str,
) -> CompareResult:
    notes: list[str] = []

    side_a = await _load_side(session, users=users_a, side="a", label=label_a)
    side_b = await _load_side(session, users=users_b, side="b", label=label_b)

    if side_a.n_topics == 0 and side_b.n_topics == 0:
        notes.append("Neither side has any mastery data yet.")
        return CompareResult(
            side_a=side_a, side_b=side_b, diffs=[],
            a_strengths=[], b_strengths=[], notes=notes,
        )

    # Per-topic compare — only topics where BOTH sides have at least one row.
    a_ewa = await _topic_means(session, users=users_a)
    b_ewa = await _topic_means(session, users=users_b)
    common_topics = set(a_ewa.keys()) & set(b_ewa.keys())

    diffs: list[TopicDiff] = []
    for tid in common_topics:
        ae, an = a_ewa[tid]
        be, bn = b_ewa[tid]
        delta = round(be - ae, 4)
        if abs(delta) >= _DIFF_THRESHOLD:
            diffs.append(TopicDiff(
                topic_id=tid,
                a_ewa=round(ae, 4), b_ewa=round(be, 4),
                delta=delta, a_n=an, b_n=bn,
            ))
    diffs.sort(key=lambda d: -abs(d.delta))

    a_strengths = sorted(
        [d for d in diffs if d.delta < 0], key=lambda d: d.delta
    )[:5]
    b_strengths = sorted(
        [d for d in diffs if d.delta > 0], key=lambda d: -d.delta
    )[:5]

    if not common_topics:
        notes.append("No overlapping topics between A and B yet.")
    elif not diffs:
        notes.append(
            f"All shared topics within {_DIFF_THRESHOLD:.2f} EWA — sides are evenly matched."
        )

    return CompareResult(
        side_a=side_a, side_b=side_b,
        diffs=diffs, a_strengths=a_strengths, b_strengths=b_strengths,
        notes=notes,
    )


async def _load_side(
    session: AsyncSession, *, users: list[str], side: str, label: str
) -> CompareSide:
    if not users:
        return CompareSide(
            side=side, label=label,
            n_topics=0, n_students=0, avg_ewa=0.0, weak_pct=0.0,
        )
    row = (
        await session.execute(
            text(
                """
                SELECT
                  COUNT(DISTINCT topic_id)::int AS n_topics,
                  AVG(ewa)::real AS avg_ewa,
                  (COUNT(*) FILTER (WHERE ewa < 0.4))::real
                    / NULLIF(COUNT(*), 0)::real AS weak_pct
                FROM analytics_schema.mastery
                WHERE user_id = ANY(CAST(:uids AS uuid[]))
                """
            ),
            {"uids": users},
        )
    ).mappings().first()
    return CompareSide(
        side=side,
        label=label,
        n_topics=int(row["n_topics"] or 0) if row else 0,
        n_students=len(users),
        avg_ewa=round(float(row["avg_ewa"] or 0.0), 4) if row else 0.0,
        weak_pct=round(float(row["weak_pct"] or 0.0), 4) if row else 0.0,
    )


async def _topic_means(
    session: AsyncSession, *, users: list[str]
) -> dict[str, tuple[float, int]]:
    if not users:
        return {}
    rows = (
        await session.execute(
            text(
                """
                SELECT topic_id::text AS topic_id,
                       AVG(ewa)::real AS avg_ewa,
                       COUNT(*)::int AS n
                  FROM analytics_schema.mastery
                 WHERE user_id = ANY(CAST(:uids AS uuid[]))
                 GROUP BY topic_id
                """
            ),
            {"uids": users},
        )
    ).mappings().all()
    return {r["topic_id"]: (float(r["avg_ewa"]), int(r["n"])) for r in rows}
