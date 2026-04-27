"""Tests for AchievementsRepo (S7) — covers the `(row, created)` tuple
return that drives the `achievement.unlocked` notification fan-out.

The interesting path is idempotency: grant the same (user, kind) twice and
the second call must return `created=False` so the route skips the inbox
notification. A regression here would either silently double-notify or
silently swallow real first-grants.

Tests run against the local compose Postgres at 35432 (same as the rest of
the user-profile suite). They TRUNCATE profile_schema.achievements on each
test so the suite is repeatable.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from user_profile.repositories import AchievementsRepo

os.environ.setdefault(
    "USER_PROFILE_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/user_profile",
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def session() -> AsyncIterator[AsyncSession]:
    """Per-test session with a clean achievements table."""
    engine = create_async_engine(os.environ["USER_PROFILE_DATABASE_URL"])
    sm = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text("TRUNCATE profile_schema.achievements RESTART IDENTITY CASCADE")
            )
        async with sm() as s:
            yield s
    finally:
        await engine.dispose()


def _uid() -> str:
    return str(uuid.uuid4())


async def test_grant_returns_created_true_on_first_call(session: AsyncSession) -> None:
    repo = AchievementsRepo(session)
    user_id = _uid()
    row, created = await repo.grant(user_id=user_id, kind="streak_3", payload={"days": 3})
    await session.commit()
    assert created is True
    assert row["kind"] == "streak_3"
    assert row["payload"] == {"days": 3}
    assert "id" in row


async def test_grant_returns_created_false_on_duplicate(session: AsyncSession) -> None:
    repo = AchievementsRepo(session)
    user_id = _uid()
    first_row, first_created = await repo.grant(
        user_id=user_id, kind="streak_3", payload={"days": 3}
    )
    await session.commit()
    second_row, second_created = await repo.grant(
        user_id=user_id, kind="streak_3", payload={"days": 999}
    )
    await session.commit()
    assert first_created is True
    assert second_created is False
    # Second call returns the EXISTING row — id and original payload preserved,
    # not the new payload that was passed in.
    assert second_row["id"] == first_row["id"]
    assert second_row["payload"] == {"days": 3}


async def test_grant_independent_kinds_both_created(session: AsyncSession) -> None:
    """Granting the same user two DIFFERENT kinds creates both."""
    repo = AchievementsRepo(session)
    user_id = _uid()
    _, c1 = await repo.grant(user_id=user_id, kind="streak_3", payload={"days": 3})
    _, c2 = await repo.grant(user_id=user_id, kind="first_session", payload={})
    await session.commit()
    assert c1 is True
    assert c2 is True


async def test_grant_same_kind_different_users_both_created(
    session: AsyncSession,
) -> None:
    """UNIQUE is on (user_id, kind) — different users with the same kind are independent."""
    repo = AchievementsRepo(session)
    user_a = _uid()
    user_b = _uid()
    _, ca = await repo.grant(user_id=user_a, kind="streak_3", payload={"days": 3})
    _, cb = await repo.grant(user_id=user_b, kind="streak_3", payload={"days": 3})
    await session.commit()
    assert ca is True
    assert cb is True


async def test_list_for_user_returns_newest_first(session: AsyncSession) -> None:
    repo = AchievementsRepo(session)
    user_id = _uid()
    # Insert in a deterministic order; awarded_at defaults to now() so each
    # subsequent insert lands strictly after the previous.
    await repo.grant(user_id=user_id, kind="first_session", payload={})
    await session.commit()
    await repo.grant(user_id=user_id, kind="streak_3", payload={"days": 3})
    await session.commit()
    await repo.grant(user_id=user_id, kind="streak_7", payload={"days": 7})
    await session.commit()

    rows = await repo.list_for_user(user_id)
    kinds = [r["kind"] for r in rows]
    # Newest first per ORDER BY awarded_at DESC.
    assert kinds == ["streak_7", "streak_3", "first_session"]


async def test_list_for_user_empty_when_no_grants(session: AsyncSession) -> None:
    repo = AchievementsRepo(session)
    rows = await repo.list_for_user(_uid())
    assert rows == []


async def test_list_for_user_isolation_between_users(session: AsyncSession) -> None:
    """One user's grants must not appear in another user's list."""
    repo = AchievementsRepo(session)
    user_a = _uid()
    user_b = _uid()
    await repo.grant(user_id=user_a, kind="streak_3", payload={"days": 3})
    await repo.grant(user_id=user_a, kind="first_session", payload={})
    await repo.grant(user_id=user_b, kind="mock_first", payload={})
    await session.commit()

    rows_a = await repo.list_for_user(user_a)
    rows_b = await repo.list_for_user(user_b)
    kinds_a = sorted(r["kind"] for r in rows_a)
    kinds_b = sorted(r["kind"] for r in rows_b)
    assert kinds_a == ["first_session", "streak_3"]
    assert kinds_b == ["mock_first"]


async def test_grant_payload_is_jsonb_round_trip(session: AsyncSession) -> None:
    """JSONB payload survives a grant + list round-trip with nested values."""
    repo = AchievementsRepo(session)
    user_id = _uid()
    payload = {"days": 7, "currentStreak": 7, "nested": {"a": 1, "b": [1, 2, 3]}}
    _, created = await repo.grant(user_id=user_id, kind="streak_7", payload=payload)
    await session.commit()
    assert created is True
    rows = await repo.list_for_user(user_id)
    assert len(rows) == 1
    assert rows[0]["payload"] == payload


async def test_grant_with_empty_payload_uses_default(session: AsyncSession) -> None:
    repo = AchievementsRepo(session)
    user_id = _uid()
    row, created = await repo.grant(user_id=user_id, kind="first_session")
    await session.commit()
    assert created is True
    assert row["payload"] == {}
