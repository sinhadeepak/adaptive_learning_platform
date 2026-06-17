"""Sprint 22 (P4-S22) — per-section aggregation from quiz.session.completed
items array.

The submit payload from alp-quiz now carries an optional `items` array; this
module groups items by section_id (falling back to topic_id when no blueprint
was attached to the session) and upserts a row in
analytics_schema.session_section_stats per group.

Pure-function aggregator + thin DB writer; both are unit-tested independently.

ADR-0013 (time-per-question + per-section analytics).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "analytics_schema"


def aggregate_items_by_section(items: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    """Group session items into per-section rollups.

    Keys are section_id when present, else topic_id. The fallback to topic_id
    is the v1 behaviour for sessions that aren't bound to a blueprint —
    practice + assignment sessions land here. P4-S23 introduces real
    section_ids when blueprints exist.

    Returns {key: {"correct_count": int, "served_count": int, "total_time_ms": int}}.
    """
    rollup: dict[str, dict[str, int]] = defaultdict(
        lambda: {"correct_count": 0, "served_count": 0, "total_time_ms": 0}
    )
    for it in items:
        section = it.get("section_id") or it.get("topic_id")
        if not section:
            continue
        rollup[section]["served_count"] += 1
        if it.get("is_correct"):
            rollup[section]["correct_count"] += 1
        rollup[section]["total_time_ms"] += int(it.get("time_spent_ms") or 0)
    return dict(rollup)


async def upsert_session_section_stats(
    session: AsyncSession,
    *,
    session_id: str,
    user_id: str,
    items: list[dict[str, Any]],
) -> int:
    """Persist per-section aggregates for a submitted session.

    Idempotent: re-applying the same items array overwrites the existing rows
    with identical values. Returns the number of distinct sections written.
    """
    rollup = aggregate_items_by_section(items)
    if not rollup:
        return 0
    for section_key, stats in rollup.items():
        await session.execute(
            text(f"""
                INSERT INTO {SCHEMA}.session_section_stats
                  (session_id, section_id, user_id, correct_count, served_count, total_time_ms)
                VALUES (:sid, :sec, :uid, :c, :s, :t)
                ON CONFLICT (session_id, section_id) DO UPDATE
                  SET correct_count = EXCLUDED.correct_count,
                      served_count  = EXCLUDED.served_count,
                      total_time_ms = EXCLUDED.total_time_ms,
                      computed_at   = now()
            """),
            {
                "sid": session_id,
                "sec": section_key,
                "uid": user_id,
                "c": stats["correct_count"],
                "s": stats["served_count"],
                "t": stats["total_time_ms"],
            },
        )
    return len(rollup)


async def load_session_breakdown(
    session: AsyncSession, session_id: str
) -> list[dict[str, Any]]:
    """Per-section breakdown for a single submitted session."""
    rows = (
        await session.execute(
            text(f"""
                SELECT section_id, correct_count, served_count, total_time_ms
                  FROM {SCHEMA}.session_section_stats
                 WHERE session_id = :sid
                 ORDER BY section_id
            """),
            {"sid": session_id},
        )
    ).mappings().all()
    return [
        {
            "sectionId": r["section_id"],
            "correctCount": int(r["correct_count"]),
            "servedCount": int(r["served_count"]),
            "totalTimeMs": int(r["total_time_ms"]),
            "accuracy": (
                float(r["correct_count"]) / float(r["served_count"])
                if r["served_count"] > 0
                else 0.0
            ),
        }
        for r in rows
    ]


async def load_user_time_stats(
    session: AsyncSession, user_id: str
) -> list[dict[str, Any]]:
    """Per-section aggregates across every session the user has submitted.

    Returns one row per distinct section_id; values are summed across sessions
    so the surface shows "total minutes spent on Mechanics this term" rather
    than per-session noise.
    """
    rows = (
        await session.execute(
            text(f"""
                SELECT section_id,
                       SUM(correct_count) AS correct_total,
                       SUM(served_count)  AS served_total,
                       SUM(total_time_ms) AS time_total,
                       COUNT(*)           AS session_count
                  FROM {SCHEMA}.session_section_stats
                 WHERE user_id = :uid
                 GROUP BY section_id
                 ORDER BY served_total DESC
            """),
            {"uid": user_id},
        )
    ).mappings().all()
    return [
        {
            "sectionId": r["section_id"],
            "correctCount": int(r["correct_total"] or 0),
            "servedCount": int(r["served_total"] or 0),
            "totalTimeMs": int(r["time_total"] or 0),
            "sessionCount": int(r["session_count"] or 0),
            "accuracy": (
                float(r["correct_total"]) / float(r["served_total"])
                if r["served_total"] and r["served_total"] > 0
                else 0.0
            ),
            "avgTimePerQuestionMs": (
                float(r["time_total"]) / float(r["served_total"])
                if r["served_total"] and r["served_total"] > 0
                else 0.0
            ),
        }
        for r in rows
    ]
