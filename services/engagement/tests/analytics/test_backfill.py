"""Backfill tests — drive the end-to-end recovery path against live
Postgres (analytics + quiz DBs).

Skipped when the quiz DB isn't reachable (CI without docker-compose
postgres). Each test seeds a SUBMITTED row directly into Quiz's table,
runs the backfill, and asserts the matching mastery + processed_sessions
state in Analytics.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from engagement.analytics import backfill
from engagement.analytics.config import settings


@pytest_asyncio.fixture
async def quiz_session() -> async_sessionmaker:
    """Direct-write session into quiz_schema for seeding fixtures.
    Cleans up the rows it inserted on teardown."""
    engine = create_async_engine(settings.quiz_database_url, pool_size=1, max_overflow=1)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    try:
        # Probe — skip if Quiz DB isn't there (CI without compose).
        async with sm() as s:
            await s.execute(text("SELECT 1"))
        yield sm
    except Exception as err:
        pytest.skip(f"quiz DB unavailable: {err}")
    finally:
        await engine.dispose()


async def _seed_quiz_session(
    sm: async_sessionmaker,
    *,
    user_id: str,
    topic_id: str,
    served: int,
    correct: int,
    submitted_at: datetime,
) -> str:
    sid = str(uuid4())
    async with sm() as s:
        await s.execute(
            text(
                """
                INSERT INTO quiz_schema.quiz_sessions
                  (id, user_id, tenant_id, topic_id, mode, strategy, status,
                   target_count, served_count, correct_count, ability_estimate,
                   started_at, expires_at, submitted_at)
                VALUES
                  (:id, :uid, NULL, :tid, 'PRACTICE', 'binary_search', 'SUBMITTED',
                   10, :served, :correct, 0.0,
                   :started, :expires, :submitted)
                """
            ),
            {
                "id": sid,
                "uid": user_id,
                "tid": topic_id,
                "served": served,
                "correct": correct,
                "started": submitted_at - timedelta(minutes=20),
                "expires": submitted_at + timedelta(minutes=70),
                "submitted": submitted_at,
            },
        )
        await s.commit()
    return sid


async def _cleanup_quiz_session(sm: async_sessionmaker, sid: str) -> None:
    async with sm() as s:
        await s.execute(text("DELETE FROM quiz_schema.quiz_sessions WHERE id = :id"), {"id": sid})
        await s.commit()


@pytest.mark.asyncio
async def test_backfill_replays_session_missed_by_consumer(quiz_session) -> None:
    user_id = str(uuid4())
    topic_id = "33333333-0000-0000-0000-000000000001"
    submitted_at = datetime.now(tz=UTC) - timedelta(minutes=10)
    sid = await _seed_quiz_session(
        quiz_session,
        user_id=user_id,
        topic_id=topic_id,
        served=10,
        correct=7,
        submitted_at=submitted_at,
    )
    try:
        stats = await backfill.run_backfill(since=submitted_at - timedelta(minutes=1))
        assert stats.applied >= 1
        # Verify mastery row landed for that user+topic, marked from this session.
        from engagement.analytics.db import sessionmaker as analytics_sm

        async with analytics_sm()() as s:
            r = await s.execute(
                text(
                    "SELECT user_id, topic_id, ewa, n, last_session_id "
                    "FROM analytics_schema.mastery WHERE user_id = :u AND topic_id = :t"
                ),
                {"u": user_id, "t": topic_id},
            )
            row = r.first()
            assert row is not None
            assert str(row[0]) == user_id
            assert str(row[1]) == topic_id
            assert abs(row[2] - 0.7) < 0.01  # ewa == score on cold start
            assert row[3] == 1
            assert str(row[4]) == sid
    finally:
        await _cleanup_quiz_session(quiz_session, sid)


@pytest.mark.asyncio
async def test_backfill_skips_already_processed_sessions(quiz_session) -> None:
    user_id = str(uuid4())
    topic_id = "33333333-0000-0000-0000-000000000001"
    submitted_at = datetime.now(tz=UTC) - timedelta(minutes=5)
    sid = await _seed_quiz_session(
        quiz_session,
        user_id=user_id,
        topic_id=topic_id,
        served=8,
        correct=4,
        submitted_at=submitted_at,
    )
    try:
        # First pass: applies.
        stats1 = await backfill.run_backfill(since=submitted_at - timedelta(minutes=1))
        # Second pass: should skip the same row (idempotency via processed_sessions).
        stats2 = await backfill.run_backfill(since=submitted_at - timedelta(minutes=1))
        assert stats1.applied >= 1
        assert stats2.skipped >= 1
        assert stats2.applied == 0
    finally:
        await _cleanup_quiz_session(quiz_session, sid)


@pytest.mark.asyncio
async def test_backfill_respects_since_filter(quiz_session) -> None:
    """Sessions submitted before --since must be ignored."""
    user_id = str(uuid4())
    topic_id = "33333333-0000-0000-0000-000000000001"
    old_submitted = datetime.now(tz=UTC) - timedelta(days=30)
    sid = await _seed_quiz_session(
        quiz_session,
        user_id=user_id,
        topic_id=topic_id,
        served=10,
        correct=10,
        submitted_at=old_submitted,
    )
    try:
        await backfill.run_backfill(since=datetime.now(tz=UTC) - timedelta(hours=1))
        # The 30-day-old row must NOT be touched by a 1-hour window.
        from engagement.analytics.db import sessionmaker as analytics_sm

        async with analytics_sm()() as s:
            r = await s.execute(
                text("SELECT 1 FROM analytics_schema.mastery WHERE last_session_id = :sid"),
                {"sid": sid},
            )
            assert r.first() is None
        async with analytics_sm()() as s:
            r = await s.execute(
                text("SELECT 1 FROM analytics_schema.processed_sessions WHERE session_id = :sid"),
                {"sid": sid},
            )
            assert r.first() is None
    finally:
        await _cleanup_quiz_session(quiz_session, sid)


@pytest.mark.asyncio
async def test_backfill_handles_zero_served(quiz_session) -> None:
    """Sessions with served_count=0 are filtered out — no division by zero."""
    user_id = str(uuid4())
    topic_id = "33333333-0000-0000-0000-000000000001"
    submitted_at = datetime.now(tz=UTC) - timedelta(minutes=2)
    sid = await _seed_quiz_session(
        quiz_session,
        user_id=user_id,
        topic_id=topic_id,
        served=0,
        correct=0,
        submitted_at=submitted_at,
    )
    try:
        stats = await backfill.run_backfill(since=submitted_at - timedelta(minutes=1))
        # The query filters on served_count > 0, so this shouldn't be touched.
        from engagement.analytics.db import sessionmaker as analytics_sm

        async with analytics_sm()() as s:
            r = await s.execute(
                text("SELECT 1 FROM analytics_schema.mastery WHERE user_id = :u"),
                {"u": user_id},
            )
            assert r.first() is None
        assert stats.applied == 0
    finally:
        await _cleanup_quiz_session(quiz_session, sid)
