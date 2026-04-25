"""Pure-function tests for streak math + integration with process_session.

Math tests don't touch the DB. Integration tests verify that submitting on
different UTC days actually flows through the live `process_session` and
lands in the streaks table correctly.
"""

from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from analytics import db
from analytics.main import app
from analytics.processing import process_session
from analytics.streaks import compute_next_streak

# ---- pure-function tests ---------------------------------------------------


def test_first_session_starts_streak_at_one() -> None:
    today = date(2026, 4, 25)
    u = compute_next_streak(
        today=today, prev_current=None, prev_longest=None, prev_last_active=None
    )
    assert u.current_streak == 1
    assert u.longest_streak == 1
    assert u.last_active_date == today


def test_same_day_repeat_is_a_noop() -> None:
    today = date(2026, 4, 25)
    u = compute_next_streak(today=today, prev_current=3, prev_longest=5, prev_last_active=today)
    assert u.current_streak == 3
    assert u.longest_streak == 5
    assert u.last_active_date == today


def test_consecutive_day_increments() -> None:
    yesterday = date(2026, 4, 24)
    today = date(2026, 4, 25)
    u = compute_next_streak(today=today, prev_current=4, prev_longest=4, prev_last_active=yesterday)
    assert u.current_streak == 5
    assert u.longest_streak == 5
    assert u.last_active_date == today


def test_gap_resets_to_one_but_keeps_longest() -> None:
    long_ago = date(2026, 4, 1)
    today = date(2026, 4, 25)
    u = compute_next_streak(
        today=today, prev_current=10, prev_longest=15, prev_last_active=long_ago
    )
    assert u.current_streak == 1
    assert u.longest_streak == 15  # historic record preserved
    assert u.last_active_date == today


def test_new_streak_can_overtake_longest() -> None:
    yesterday = date(2026, 4, 24)
    today = date(2026, 4, 25)
    u = compute_next_streak(today=today, prev_current=7, prev_longest=7, prev_last_active=yesterday)
    # 7 + 1 = 8, which is the new longest
    assert u.current_streak == 8
    assert u.longest_streak == 8


# ---- integration: drive process_session over multiple days ------------------


@pytest.mark.asyncio
async def test_process_session_lands_streak_row() -> None:
    user = str(uuid4())
    topic = str(uuid4())
    async with db.sessionmaker()() as session:
        applied = await process_session(
            session,
            session_id=str(uuid4()),
            user_id=user,
            topic_id=topic,
            score=0.7,
            activity_date=date(2026, 4, 20),
        )
        await session.commit()
    assert applied is True

    async with db.sessionmaker()() as session:
        row = (
            await session.execute(
                text(
                    "SELECT current_streak, longest_streak, last_active_date "
                    "FROM analytics_schema.streaks WHERE user_id = :u"
                ),
                {"u": user},
            )
        ).first()
    assert row is not None
    assert row[0] == 1
    assert row[1] == 1
    assert row[2] == date(2026, 4, 20)


@pytest.mark.asyncio
async def test_three_consecutive_days_streak_is_three() -> None:
    user = str(uuid4())
    topic = str(uuid4())
    base = date(2026, 4, 20)
    for offset in range(3):
        async with db.sessionmaker()() as session:
            await process_session(
                session,
                session_id=str(uuid4()),
                user_id=user,
                topic_id=topic,
                score=0.5,
                activity_date=base + timedelta(days=offset),
            )
            await session.commit()

    async with db.sessionmaker()() as session:
        row = (
            await session.execute(
                text(
                    "SELECT current_streak, longest_streak, last_active_date "
                    "FROM analytics_schema.streaks WHERE user_id = :u"
                ),
                {"u": user},
            )
        ).first()
    assert row[0] == 3
    assert row[1] == 3
    assert row[2] == base + timedelta(days=2)


@pytest.mark.asyncio
async def test_gap_breaks_streak_keeps_longest() -> None:
    user = str(uuid4())
    topic = str(uuid4())
    base = date(2026, 4, 1)
    for offset in range(3):
        async with db.sessionmaker()() as session:
            await process_session(
                session,
                session_id=str(uuid4()),
                user_id=user,
                topic_id=topic,
                score=0.5,
                activity_date=base + timedelta(days=offset),
            )
            await session.commit()
    # Skip day 3, come back day 7 → streak resets to 1, longest stays 3
    async with db.sessionmaker()() as session:
        await process_session(
            session,
            session_id=str(uuid4()),
            user_id=user,
            topic_id=topic,
            score=0.5,
            activity_date=base + timedelta(days=7),
        )
        await session.commit()

    async with db.sessionmaker()() as session:
        row = (
            await session.execute(
                text(
                    "SELECT current_streak, longest_streak FROM analytics_schema.streaks "
                    "WHERE user_id = :u"
                ),
                {"u": user},
            )
        ).first()
    assert row[0] == 1
    assert row[1] == 3


@pytest.mark.asyncio
async def test_same_day_two_sessions_dont_double_count() -> None:
    user = str(uuid4())
    topic = str(uuid4())
    today = date(2026, 4, 20)
    for _ in range(2):
        async with db.sessionmaker()() as session:
            await process_session(
                session,
                session_id=str(uuid4()),
                user_id=user,
                topic_id=topic,
                score=0.5,
                activity_date=today,
            )
            await session.commit()
    async with db.sessionmaker()() as session:
        row = (
            await session.execute(
                text(
                    "SELECT current_streak, longest_streak FROM analytics_schema.streaks "
                    "WHERE user_id = :u"
                ),
                {"u": user},
            )
        ).first()
    assert row[0] == 1
    assert row[1] == 1


@pytest.mark.asyncio
async def test_streak_endpoint_returns_zero_for_unknown_user() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/analytics/streak/{uuid4()}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["currentStreak"] == 0
    assert body["longestStreak"] == 0
    assert body["lastActiveDate"] is None


@pytest.mark.asyncio
async def test_streak_endpoint_returns_persisted_row() -> None:
    user = str(uuid4())
    async with db.sessionmaker()() as session:
        await process_session(
            session,
            session_id=str(uuid4()),
            user_id=user,
            topic_id=str(uuid4()),
            score=0.5,
            activity_date=date(2026, 4, 25),
        )
        await session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/analytics/streak/{user}")
    body = resp.json()
    assert body["currentStreak"] == 1
    assert body["longestStreak"] == 1
    assert body["lastActiveDate"] == "2026-04-25"
