"""Sprint 13 S13-C — per-student drill-down for the educator UI.

Endpoint contract: given (cohort_id, user_id), the educator gets a
single payload with everything they need to coach the student:
  - Overall readiness (`analytics_schema.readiness` GLOBAL row)
  - Per-topic mastery breakdown (analytics_schema.mastery)
  - Streak (current + longest)
  - Last 10 quiz sessions (read-only handle into quiz_schema)

Why a dedicated module rather than stitching it into routes.py: the
Quiz-DB read uses a SECOND engine (the existing backfill pattern) and
keeping it isolated makes that explicit. The route handler in routes.py
is then a thin orchestrator.

Membership check: we do NOT validate that user_id ∈ cohort_id here.
That's the educator's responsibility — they got the user_id from the
leaderboard, which already filtered by cohort. Adding a re-check would
require another HTTP hop to Institution and would only catch the
"educator hand-typed a different user_id" misuse, which isn't worth
the latency hit.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from analytics.config import settings
from analytics.db import sessionmaker
from analytics.repositories import get_readiness, get_streak, list_user_mastery


_quiz_engine: AsyncEngine | None = None


def _quiz_sessionmaker() -> async_sessionmaker:  # type: ignore[type-arg]
    """Lazy connect — the drill-down endpoint is the only consumer; many
    educators will never hit it."""
    global _quiz_engine
    if _quiz_engine is None:
        _quiz_engine = create_async_engine(
            settings.quiz_database_url, pool_size=2, max_overflow=2
        )
    return async_sessionmaker(_quiz_engine, expire_on_commit=False)


async def fetch_recent_sessions(
    user_id: str, limit: int = 10
) -> list[dict[str, Any]]:
    """Read the last N submitted sessions from quiz_schema. Handles the
    cross-DB hop via a separate engine — analytics owns its schema, this
    is a one-way read for educator analytics depth."""
    sm = _quiz_sessionmaker()
    async with sm() as session:
        res = await session.execute(
            text(
                """
                SELECT id, topic_id, mode, status, target_count, served_count,
                       correct_count, started_at, expires_at, submitted_at
                  FROM quiz_schema.quiz_sessions
                 WHERE user_id = :uid AND status = 'SUBMITTED'
              ORDER BY submitted_at DESC NULLS LAST
                 LIMIT :lim
                """
            ),
            {"uid": user_id, "lim": limit},
        )
        return [dict(r) for r in res.mappings().all()]


def aggregate_student_drilldown(
    *,
    user_id: str,
    cohort_id: str,
    readiness_row: dict[str, Any] | None,
    mastery_rows: list[Any],
    streak_row: Any | None,
    recent_sessions: list[dict[str, Any]],
) -> dict[str, Any]:
    """Pure assembly — composes the four sources into the API shape.

    Extracted so unit tests can pin the contract (esp. the `not started`
    paths, where readiness is None and mastery is empty) without
    spinning up Postgres."""
    return {
        "userId": user_id,
        "cohortId": cohort_id,
        "readiness": _shape_readiness(readiness_row),
        "topicMastery": [
            {"topicId": r.topic_id, "ewa": r.ewa, "n": r.n}
            for r in mastery_rows
        ],
        "streak": _shape_streak(streak_row),
        "recentSessions": [
            _shape_session(s) for s in recent_sessions
        ],
    }


def _shape_readiness(row: dict[str, Any] | None) -> dict[str, Any]:
    if row is None:
        return {"score": 0.0, "nTopics": 0, "updatedAt": None}
    return {
        "score": float(row.get("score") or 0.0),
        "nTopics": int(row.get("n_topics") or 0),
        "updatedAt": (
            row["updated_at"].isoformat() if row.get("updated_at") else None
        ),
    }


def _shape_streak(row: Any | None) -> dict[str, Any]:
    if row is None:
        return {"current": 0, "longest": 0, "lastActiveDate": None}
    return {
        "current": int(getattr(row, "current_streak", 0) or 0),
        "longest": int(getattr(row, "longest_streak", 0) or 0),
        "lastActiveDate": (
            row.last_active_date.isoformat()
            if getattr(row, "last_active_date", None)
            else None
        ),
    }


def _shape_session(row: dict[str, Any]) -> dict[str, Any]:
    served = int(row.get("served_count") or 0)
    correct = int(row.get("correct_count") or 0)
    accuracy = round(100 * correct / served) if served > 0 else 0
    submitted = row.get("submitted_at")
    return {
        "sessionId": str(row["id"]),
        "topicId": str(row["topic_id"]) if row.get("topic_id") else None,
        "mode": row.get("mode"),
        "servedCount": served,
        "correctCount": correct,
        "accuracyPct": accuracy,
        "submittedAt": (
            submitted.isoformat() if isinstance(submitted, datetime) else submitted
        ),
    }


async def build_drilldown(*, cohort_id: str, user_id: str) -> dict[str, Any]:
    """Orchestrator — used by the route handler. The four fetches happen
    sequentially; for ~10 sessions + readiness + mastery + streak this
    is faster than asyncio.gather'ing them with separate connections."""
    async with sessionmaker()() as session:
        readiness = await get_readiness(session, user_id, "GLOBAL")
        mastery = await list_user_mastery(session, user_id)
        streak = await get_streak(session, user_id)
    recent = await fetch_recent_sessions(user_id)
    return aggregate_student_drilldown(
        user_id=user_id,
        cohort_id=cohort_id,
        readiness_row=readiness,
        mastery_rows=mastery,
        streak_row=streak,
        recent_sessions=recent,
    )
