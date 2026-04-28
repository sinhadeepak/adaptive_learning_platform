"""Tests for the read_at column + helpers added in migration 003 (S7).

The bell badge on web + mobile relies on `unread_count_for_user` returning
exactly the count of rows with `read_at IS NULL`. mark_read flips one row
idempotently (so a tap-twice doesn't error), and mark_all_read returns the
count it actually flipped — a regression there would either silently
mis-count the badge or break the optimistic UI rollback.
"""

from __future__ import annotations

import uuid

import pytest

from engagement.notification.db import sessionmaker
from engagement.notification.repositories import (
    append_notification,
    list_for_user,
    mark_all_read,
    mark_read,
    unread_count_for_user,
)

pytestmark = pytest.mark.asyncio


def _uid() -> str:
    return str(uuid.uuid4())


async def _seed_notification(user_id: str, type_: str = "quiz.completed") -> str:
    notification_id = str(uuid.uuid4())
    async with sessionmaker()() as session:
        await append_notification(
            session,
            notification_id=notification_id,
            user_id=user_id,
            type_=type_,
            channel="inbox",
            payload={},
        )
        await session.commit()
    return notification_id


# ─────────────────────────────────────────────────────────────────────────
# unread_count_for_user
# ─────────────────────────────────────────────────────────────────────────


async def test_unread_count_zero_for_unknown_user() -> None:
    async with sessionmaker()() as session:
        n = await unread_count_for_user(session, _uid())
    assert n == 0


async def test_unread_count_matches_seeded_rows() -> None:
    user = _uid()
    await _seed_notification(user)
    await _seed_notification(user)
    await _seed_notification(user)
    async with sessionmaker()() as session:
        assert await unread_count_for_user(session, user) == 3


async def test_unread_count_excludes_read_rows() -> None:
    user = _uid()
    a = await _seed_notification(user)
    b = await _seed_notification(user)
    c = await _seed_notification(user)
    async with sessionmaker()() as session:
        await mark_read(session, user_id=user, notification_id=a)
        await mark_read(session, user_id=user, notification_id=b)
        await session.commit()
        assert await unread_count_for_user(session, user) == 1
    # Only c should remain unread now.
    assert isinstance(c, str)


async def test_unread_count_isolation_between_users() -> None:
    user_a, user_b = _uid(), _uid()
    await _seed_notification(user_a)
    await _seed_notification(user_a)
    await _seed_notification(user_b)
    async with sessionmaker()() as session:
        assert await unread_count_for_user(session, user_a) == 2
        assert await unread_count_for_user(session, user_b) == 1


# ─────────────────────────────────────────────────────────────────────────
# mark_read
# ─────────────────────────────────────────────────────────────────────────


async def test_mark_read_flips_first_call_returns_true() -> None:
    user = _uid()
    nid = await _seed_notification(user)
    async with sessionmaker()() as session:
        flipped = await mark_read(session, user_id=user, notification_id=nid)
        await session.commit()
    assert flipped is True


async def test_mark_read_idempotent_second_call_returns_false() -> None:
    """The bell on web optimistically marks-read on tap. If the user
    refreshes and taps again, the second call must be a no-op (False)
    rather than an error — otherwise we'd mis-decrement the unread count."""
    user = _uid()
    nid = await _seed_notification(user)
    async with sessionmaker()() as session:
        first = await mark_read(session, user_id=user, notification_id=nid)
        await session.commit()
        second = await mark_read(session, user_id=user, notification_id=nid)
        await session.commit()
    assert first is True
    assert second is False


async def test_mark_read_wrong_user_returns_false() -> None:
    """The WHERE clause includes user_id, so user A can't mark user B's
    notifications read. Critical for multi-tenant safety."""
    user_a, user_b = _uid(), _uid()
    nid = await _seed_notification(user_a)
    async with sessionmaker()() as session:
        flipped = await mark_read(session, user_id=user_b, notification_id=nid)
        await session.commit()
    assert flipped is False
    # User A's unread count is unchanged.
    async with sessionmaker()() as session:
        assert await unread_count_for_user(session, user_a) == 1


async def test_mark_read_unknown_id_returns_false() -> None:
    user = _uid()
    async with sessionmaker()() as session:
        flipped = await mark_read(session, user_id=user, notification_id=str(uuid.uuid4()))
    assert flipped is False


async def test_mark_read_sets_read_at_in_list_response() -> None:
    """After mark_read, list_for_user must surface the readAt timestamp so
    the web/mobile UI can render the row at reduced opacity."""
    user = _uid()
    nid = await _seed_notification(user)
    async with sessionmaker()() as session:
        await mark_read(session, user_id=user, notification_id=nid)
        await session.commit()
        rows = await list_for_user(session, user)
    assert len(rows) == 1
    assert rows[0].read_at is not None


# ─────────────────────────────────────────────────────────────────────────
# mark_all_read
# ─────────────────────────────────────────────────────────────────────────


async def test_mark_all_read_returns_flipped_count() -> None:
    user = _uid()
    for _ in range(5):
        await _seed_notification(user)
    async with sessionmaker()() as session:
        flipped = await mark_all_read(session, user)
        await session.commit()
    assert flipped == 5
    async with sessionmaker()() as session:
        assert await unread_count_for_user(session, user) == 0


async def test_mark_all_read_skips_already_read_rows() -> None:
    """The WHERE clause includes `read_at IS NULL`, so calling mark_all_read
    a second time returns 0 (and doesn't bump read_at on already-read rows
    to a new timestamp)."""
    user = _uid()
    await _seed_notification(user)
    await _seed_notification(user)
    async with sessionmaker()() as session:
        first = await mark_all_read(session, user)
        await session.commit()
        second = await mark_all_read(session, user)
        await session.commit()
    assert first == 2
    assert second == 0


async def test_mark_all_read_isolation_between_users() -> None:
    user_a, user_b = _uid(), _uid()
    await _seed_notification(user_a)
    await _seed_notification(user_a)
    await _seed_notification(user_b)
    async with sessionmaker()() as session:
        flipped_a = await mark_all_read(session, user_a)
        await session.commit()
    assert flipped_a == 2
    # User B's notification stays unread.
    async with sessionmaker()() as session:
        assert await unread_count_for_user(session, user_b) == 1


async def test_mark_all_read_returns_zero_for_user_with_no_notifications() -> None:
    async with sessionmaker()() as session:
        flipped = await mark_all_read(session, _uid())
    assert flipped == 0


# ─────────────────────────────────────────────────────────────────────────
# list_for_user surfaces read_at
# ─────────────────────────────────────────────────────────────────────────


async def test_list_for_user_returns_read_at_null_initially() -> None:
    user = _uid()
    await _seed_notification(user)
    async with sessionmaker()() as session:
        rows = await list_for_user(session, user)
    assert len(rows) == 1
    assert rows[0].read_at is None


async def test_list_for_user_orders_newest_first() -> None:
    user = _uid()
    n1 = await _seed_notification(user, "quiz.completed")
    n2 = await _seed_notification(user, "streak.milestone")
    n3 = await _seed_notification(user, "achievement.unlocked")
    async with sessionmaker()() as session:
        rows = await list_for_user(session, user)
    ids = [r.id for r in rows]
    # Newest first: n3, n2, n1
    assert ids == [n3, n2, n1]
