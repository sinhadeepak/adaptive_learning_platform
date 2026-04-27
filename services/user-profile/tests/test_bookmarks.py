"""Tests for BookmarksRepo (S7) — covers the idempotent upsert that lets
the result-page bookmark icon be tapped repeatedly without creating dup
rows, and the COALESCE-merge that preserves prior topic_title/stem/note
when a re-bookmark omits them.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from user_profile.repositories import BookmarksRepo

os.environ.setdefault(
    "USER_PROFILE_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/user_profile",
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(os.environ["USER_PROFILE_DATABASE_URL"])
    sm = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text("TRUNCATE profile_schema.bookmarks RESTART IDENTITY CASCADE")
            )
        async with sm() as s:
            yield s
    finally:
        await engine.dispose()


def _uid() -> str:
    return str(uuid.uuid4())


async def test_add_returns_full_row(session: AsyncSession) -> None:
    repo = BookmarksRepo(session)
    user = _uid()
    qid = _uid()
    tid = _uid()
    row = await repo.add(
        user_id=user,
        question_id=qid,
        topic_id=tid,
        topic_title="Mechanics",
        stem="What is Newton's second law?",
        note="ambiguous",
    )
    await session.commit()
    assert row["question_id"] == uuid.UUID(qid)
    assert row["topic_title"] == "Mechanics"
    assert row["stem"] == "What is Newton's second law?"
    assert row["note"] == "ambiguous"
    assert "created_at" in row


async def test_re_add_same_pair_is_idempotent(session: AsyncSession) -> None:
    """Tapping the bookmark icon twice should not create a duplicate row."""
    repo = BookmarksRepo(session)
    user = _uid()
    qid = _uid()
    await repo.add(
        user_id=user, question_id=qid, topic_id=None, topic_title=None, stem="A", note=None,
    )
    await repo.add(
        user_id=user, question_id=qid, topic_id=None, topic_title=None, stem="A", note=None,
    )
    await session.commit()
    rows = await repo.list_for_user(user)
    assert len(rows) == 1


async def test_re_add_preserves_prior_snapshot_when_new_is_null(
    session: AsyncSession,
) -> None:
    """COALESCE merge: a re-bookmark that omits topic_title / stem / note keeps
    the originally captured values rather than nulling them out."""
    repo = BookmarksRepo(session)
    user = _uid()
    qid = _uid()
    await repo.add(
        user_id=user,
        question_id=qid,
        topic_id=_uid(),
        topic_title="Original topic",
        stem="Original stem",
        note="Original note",
    )
    # Re-tap with all snapshot fields None — should NOT erase the originals.
    await repo.add(
        user_id=user,
        question_id=qid,
        topic_id=None,
        topic_title=None,
        stem=None,
        note=None,
    )
    await session.commit()
    rows = await repo.list_for_user(user)
    assert len(rows) == 1
    assert rows[0]["topic_title"] == "Original topic"
    assert rows[0]["stem"] == "Original stem"
    assert rows[0]["note"] == "Original note"


async def test_remove_deletes_row_and_returns_true(session: AsyncSession) -> None:
    repo = BookmarksRepo(session)
    user = _uid()
    qid = _uid()
    await repo.add(
        user_id=user, question_id=qid, topic_id=None, topic_title=None, stem=None, note=None,
    )
    await session.commit()
    ok = await repo.remove(user_id=user, question_id=qid)
    await session.commit()
    assert ok is True
    rows = await repo.list_for_user(user)
    assert rows == []


async def test_remove_unknown_returns_false(session: AsyncSession) -> None:
    repo = BookmarksRepo(session)
    ok = await repo.remove(user_id=_uid(), question_id=_uid())
    assert ok is False


async def test_list_for_user_orders_newest_first(session: AsyncSession) -> None:
    repo = BookmarksRepo(session)
    user = _uid()
    q1, q2, q3 = _uid(), _uid(), _uid()
    await repo.add(user_id=user, question_id=q1, topic_id=None, topic_title=None, stem="first", note=None)
    await session.commit()
    await repo.add(user_id=user, question_id=q2, topic_id=None, topic_title=None, stem="second", note=None)
    await session.commit()
    await repo.add(user_id=user, question_id=q3, topic_id=None, topic_title=None, stem="third", note=None)
    await session.commit()
    rows = await repo.list_for_user(user)
    stems = [r["stem"] for r in rows]
    assert stems == ["third", "second", "first"]


async def test_list_for_user_isolation(session: AsyncSession) -> None:
    repo = BookmarksRepo(session)
    user_a, user_b = _uid(), _uid()
    await repo.add(user_id=user_a, question_id=_uid(), topic_id=None, topic_title=None, stem="A1", note=None)
    await repo.add(user_id=user_a, question_id=_uid(), topic_id=None, topic_title=None, stem="A2", note=None)
    await repo.add(user_id=user_b, question_id=_uid(), topic_id=None, topic_title=None, stem="B1", note=None)
    await session.commit()
    rows_a = await repo.list_for_user(user_a)
    rows_b = await repo.list_for_user(user_b)
    assert sorted(r["stem"] for r in rows_a) == ["A1", "A2"]
    assert sorted(r["stem"] for r in rows_b) == ["B1"]


async def test_add_with_minimal_fields(session: AsyncSession) -> None:
    """A bookmark created without topic/stem/note (e.g., via a future API
    that just takes questionId) should still persist with sensible nulls."""
    repo = BookmarksRepo(session)
    user = _uid()
    qid = _uid()
    row = await repo.add(
        user_id=user,
        question_id=qid,
        topic_id=None,
        topic_title=None,
        stem=None,
        note=None,
    )
    await session.commit()
    assert row["topic_title"] is None
    assert row["stem"] is None
    assert row["note"] is None
