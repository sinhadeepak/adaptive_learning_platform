"""Backfill tests against live Postgres (notification + quiz DBs).

Skipped when the quiz DB isn't reachable. Each test seeds a SUBMITTED row
into Quiz's table, runs the backfill, and asserts the matching row in
notification (or its absence when channel-flag drops it).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from engagement.notification import backfill
from engagement.notification import processing as processing_module
from engagement.notification.config import settings


@pytest_asyncio.fixture
async def quiz_session() -> async_sessionmaker:
    """Direct-write session into quiz_schema for seeding fixtures."""
    engine = create_async_engine(settings.quiz_database_url, pool_size=1, max_overflow=1)
    sm = async_sessionmaker(engine, expire_on_commit=False)
    try:
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


@pytest.fixture
def channel_on(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force the email channel flag to True so we test the append path."""

    async def _on(_channel: str, tenant_id: str | None = None) -> bool:
        return True

    monkeypatch.setattr(processing_module, "channel_enabled", _on)


@pytest.fixture
def channel_off(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _off(_channel: str, tenant_id: str | None = None) -> bool:
        return False

    monkeypatch.setattr(processing_module, "channel_enabled", _off)


@pytest.mark.asyncio
async def test_backfill_appends_when_channel_on(quiz_session, channel_on) -> None:
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
        assert stats.appended >= 1
        assert stats.failed == 0

        # Notification row landed for this user
        from engagement.notification.db import sessionmaker as n_sm

        async with n_sm()() as s:
            r = await s.execute(
                text(
                    "SELECT user_id, type, channel, payload FROM notification_schema.notifications "
                    "WHERE user_id = :u AND type = 'quiz.completed' "
                    "AND payload->>'sessionId' = :sid"
                ),
                {"u": user_id, "sid": sid},
            )
            row = r.first()
            assert row is not None
            assert str(row[0]) == user_id
            assert row[1] == "quiz.completed"
            assert row[2] == "email"
    finally:
        await _cleanup_quiz_session(quiz_session, sid)


@pytest.mark.asyncio
async def test_backfill_drops_when_channel_off(quiz_session, channel_off) -> None:
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
        stats = await backfill.run_backfill(since=submitted_at - timedelta(minutes=1))
        assert stats.dropped >= 1

        # No notification row — channel was off
        from engagement.notification.db import sessionmaker as n_sm

        async with n_sm()() as s:
            r = await s.execute(
                text(
                    "SELECT 1 FROM notification_schema.notifications "
                    "WHERE payload->>'sessionId' = :sid"
                ),
                {"sid": sid},
            )
            assert r.first() is None

        # But processed_events DOES have it (terminal — flag-flip later
        # shouldn't replay backlog into the inbox).
        async with n_sm()() as s:
            r = await s.execute(
                text("SELECT 1 FROM notification_schema.processed_events WHERE event_id = :sid"),
                {"sid": sid},
            )
            assert r.first() is not None
    finally:
        await _cleanup_quiz_session(quiz_session, sid)


@pytest.mark.asyncio
async def test_backfill_skips_already_processed(quiz_session, channel_on) -> None:
    user_id = str(uuid4())
    topic_id = "33333333-0000-0000-0000-000000000001"
    submitted_at = datetime.now(tz=UTC) - timedelta(minutes=3)
    sid = await _seed_quiz_session(
        quiz_session,
        user_id=user_id,
        topic_id=topic_id,
        served=5,
        correct=3,
        submitted_at=submitted_at,
    )
    try:
        # First pass — appends
        stats1 = await backfill.run_backfill(since=submitted_at - timedelta(minutes=1))
        # Second pass — must skip (idempotent)
        stats2 = await backfill.run_backfill(since=submitted_at - timedelta(minutes=1))
        assert stats1.appended >= 1
        assert stats2.skipped >= 1
        assert stats2.appended == 0
        assert stats2.failed == 0
    finally:
        await _cleanup_quiz_session(quiz_session, sid)


@pytest.mark.asyncio
async def test_backfill_respects_since_filter(quiz_session, channel_on) -> None:
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
        # Run with a 1h window — the 30-day-old row must NOT be touched.
        await backfill.run_backfill(since=datetime.now(tz=UTC) - timedelta(hours=1))
        from engagement.notification.db import sessionmaker as n_sm

        # Specific check: this seeded row didn't make it into the inbox
        async with n_sm()() as s:
            r = await s.execute(
                text(
                    "SELECT 1 FROM notification_schema.notifications "
                    "WHERE payload->>'sessionId' = :sid"
                ),
                {"sid": sid},
            )
            assert r.first() is None
        # … and it's not in processed_events either (proves filter, not skip)
        async with n_sm()() as s:
            r = await s.execute(
                text("SELECT 1 FROM notification_schema.processed_events WHERE event_id = :sid"),
                {"sid": sid},
            )
            assert r.first() is None
    finally:
        await _cleanup_quiz_session(quiz_session, sid)
