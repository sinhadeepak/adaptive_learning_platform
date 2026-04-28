"""Tests for doubts repositories — covers the lifecycle a real student
walks through: create → list → fetch with answer count → append answers
(peer + AI) → accept one → confirm doubt status flipped to RESOLVED.

The status FSM is the trickiest part:
  OPEN     → created with no answers
  ANSWERED → first answer appended (insert_answer flips status if currently OPEN)
  RESOLVED → owner accepts an answer

A regression in any of these transitions breaks the inbox `doubt.answered`
notification (only fires on first answer when answerer != owner) and the
"Accept" button visibility on web/mobile (gated on status != RESOLVED).
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from doubts.repositories import (
    accept_answer,
    create_doubt,
    get_doubt,
    insert_answer,
    list_answers,
    list_doubts_for_user,
)

os.environ.setdefault(
    "DOUBTS_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/doubts",
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(os.environ["DOUBTS_DATABASE_URL"])
    sm = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as conn:
            # Truncate both tables — order matters because answers FK to doubts.
            await conn.execute(
                text(
                    "TRUNCATE doubts_schema.doubt_answers, doubts_schema.doubts "
                    "RESTART IDENTITY CASCADE"
                )
            )
        async with sm() as s:
            yield s
    finally:
        await engine.dispose()


def _uid() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────────────────
# create_doubt
# ─────────────────────────────────────────────────────────────────────────


async def test_create_doubt_starts_open_with_zero_answers(
    session: AsyncSession,
) -> None:
    user = _uid()
    row = await create_doubt(
        session,
        user_id=user,
        question_text="How do I solve quadratic equations?",
        photo_data_url=None,
        topic_id=None,
        topic_title=None,
    )
    await session.commit()
    assert row["status"] == "OPEN"
    assert row["answer_count"] == 0
    assert row["question_text"] == "How do I solve quadratic equations?"
    assert row["topic_id"] is None
    assert row["topic_title"] is None


async def test_create_doubt_with_topic_and_photo(session: AsyncSession) -> None:
    user, tid = _uid(), _uid()
    row = await create_doubt(
        session,
        user_id=user,
        question_text="What is acceleration?",
        photo_data_url="data:image/png;base64,iVBORw0KGgo=",
        topic_id=tid,
        topic_title="Mechanics",
    )
    await session.commit()
    assert row["topic_id"] == tid
    assert row["topic_title"] == "Mechanics"
    assert row["photo_data_url"].startswith("data:image/png;base64,")


# ─────────────────────────────────────────────────────────────────────────
# get_doubt + answer_count rollup
# ─────────────────────────────────────────────────────────────────────────


async def test_get_doubt_returns_none_for_unknown(session: AsyncSession) -> None:
    out = await get_doubt(session, _uid())
    assert out is None


async def test_get_doubt_includes_answer_count(session: AsyncSession) -> None:
    user, teacher = _uid(), _uid()
    doubt = await create_doubt(
        session,
        user_id=user,
        question_text="Test",
        photo_data_url=None,
        topic_id=None,
        topic_title=None,
    )
    await session.commit()
    await insert_answer(
        session,
        doubt_id=doubt["id"],
        author_id=teacher,
        author_role="TEACHER",
        content="Try the formula.",
        source="expert",
    )
    await insert_answer(
        session,
        doubt_id=doubt["id"],
        author_id=None,
        author_role="SYSTEM",
        content="AI: here is the worked solution.",
        source="ai",
    )
    await session.commit()
    fetched = await get_doubt(session, doubt["id"])
    assert fetched is not None
    assert fetched["answer_count"] == 2


# ─────────────────────────────────────────────────────────────────────────
# insert_answer + status FSM
# ─────────────────────────────────────────────────────────────────────────


async def test_first_answer_flips_status_open_to_answered(
    session: AsyncSession,
) -> None:
    user, teacher = _uid(), _uid()
    doubt = await create_doubt(
        session,
        user_id=user,
        question_text="Q",
        photo_data_url=None,
        topic_id=None,
        topic_title=None,
    )
    await session.commit()
    assert doubt["status"] == "OPEN"

    await insert_answer(
        session,
        doubt_id=doubt["id"],
        author_id=teacher,
        author_role="TEACHER",
        content="A",
        source="expert",
    )
    await session.commit()

    fetched = await get_doubt(session, doubt["id"])
    assert fetched is not None
    assert fetched["status"] == "ANSWERED"


async def test_subsequent_answers_keep_status_answered(
    session: AsyncSession,
) -> None:
    """The status flip is OPEN → ANSWERED. Subsequent answers don't bounce
    it back to OPEN. (The CASE expression in insert_answer is the guard.)"""
    user, teacher = _uid(), _uid()
    doubt = await create_doubt(
        session,
        user_id=user,
        question_text="Q",
        photo_data_url=None,
        topic_id=None,
        topic_title=None,
    )
    await session.commit()
    for i in range(3):
        await insert_answer(
            session,
            doubt_id=doubt["id"],
            author_id=teacher,
            author_role="TEACHER",
            content=f"A{i}",
            source="expert",
        )
    await session.commit()
    fetched = await get_doubt(session, doubt["id"])
    assert fetched is not None
    assert fetched["status"] == "ANSWERED"


async def test_insert_answer_returns_full_row(session: AsyncSession) -> None:
    user, teacher = _uid(), _uid()
    doubt = await create_doubt(
        session,
        user_id=user,
        question_text="Q",
        photo_data_url=None,
        topic_id=None,
        topic_title=None,
    )
    await session.commit()
    ans = await insert_answer(
        session,
        doubt_id=doubt["id"],
        author_id=teacher,
        author_role="TEACHER",
        content="Worked solution",
        source="expert",
    )
    await session.commit()
    assert ans["doubt_id"] == doubt["id"]
    assert ans["author_id"] == teacher
    assert ans["author_role"] == "TEACHER"
    assert ans["content"] == "Worked solution"
    assert ans["source"] == "expert"
    assert ans["accepted"] is False


async def test_insert_answer_with_null_author(session: AsyncSession) -> None:
    """AI answers come with author_id=None — the column tolerates NULL."""
    user = _uid()
    doubt = await create_doubt(
        session,
        user_id=user,
        question_text="Q",
        photo_data_url=None,
        topic_id=None,
        topic_title=None,
    )
    await session.commit()
    ans = await insert_answer(
        session,
        doubt_id=doubt["id"],
        author_id=None,
        author_role="SYSTEM",
        content="AI reply",
        source="ai",
    )
    await session.commit()
    assert ans["author_id"] is None


# ─────────────────────────────────────────────────────────────────────────
# accept_answer + RESOLVED FSM
# ─────────────────────────────────────────────────────────────────────────


async def test_accept_flips_doubt_to_resolved(session: AsyncSession) -> None:
    user, teacher = _uid(), _uid()
    doubt = await create_doubt(
        session,
        user_id=user,
        question_text="Q",
        photo_data_url=None,
        topic_id=None,
        topic_title=None,
    )
    await session.commit()
    ans = await insert_answer(
        session,
        doubt_id=doubt["id"],
        author_id=teacher,
        author_role="TEACHER",
        content="A",
        source="expert",
    )
    await session.commit()
    ok = await accept_answer(session, doubt["id"], ans["id"])
    await session.commit()
    assert ok is True
    fetched = await get_doubt(session, doubt["id"])
    assert fetched is not None
    assert fetched["status"] == "RESOLVED"
    rows = await list_answers(session, doubt["id"])
    assert rows[0]["accepted"] is True


async def test_accept_unknown_answer_returns_false(session: AsyncSession) -> None:
    user = _uid()
    doubt = await create_doubt(
        session,
        user_id=user,
        question_text="Q",
        photo_data_url=None,
        topic_id=None,
        topic_title=None,
    )
    await session.commit()
    ok = await accept_answer(session, doubt["id"], _uid())
    assert ok is False
    fetched = await get_doubt(session, doubt["id"])
    assert fetched is not None
    assert fetched["status"] == "OPEN"  # not flipped


async def test_accept_only_works_when_answer_belongs_to_doubt(
    session: AsyncSession,
) -> None:
    """An answer ID from doubt A cannot be accepted on doubt B (the WHERE
    clause checks both id and doubt_id)."""
    user, teacher = _uid(), _uid()
    doubt_a = await create_doubt(
        session, user_id=user, question_text="A", photo_data_url=None, topic_id=None, topic_title=None
    )
    doubt_b = await create_doubt(
        session, user_id=user, question_text="B", photo_data_url=None, topic_id=None, topic_title=None
    )
    await session.commit()
    ans_a = await insert_answer(
        session, doubt_id=doubt_a["id"], author_id=teacher, author_role="TEACHER", content="x", source="expert"
    )
    await session.commit()
    # Try to accept answer-from-A under doubt-B's id — must fail.
    ok = await accept_answer(session, doubt_b["id"], ans_a["id"])
    assert ok is False
    # Doubt B stays OPEN; doubt A stays ANSWERED.
    fetched_b = await get_doubt(session, doubt_b["id"])
    fetched_a = await get_doubt(session, doubt_a["id"])
    assert fetched_b is not None and fetched_b["status"] == "OPEN"
    assert fetched_a is not None and fetched_a["status"] == "ANSWERED"


# ─────────────────────────────────────────────────────────────────────────
# list_doubts_for_user + list_answers ordering
# ─────────────────────────────────────────────────────────────────────────


async def test_list_doubts_for_user_orders_by_last_activity_desc(
    session: AsyncSession,
) -> None:
    user, teacher = _uid(), _uid()
    d1 = await create_doubt(
        session, user_id=user, question_text="oldest", photo_data_url=None, topic_id=None, topic_title=None
    )
    await session.commit()
    d2 = await create_doubt(
        session, user_id=user, question_text="middle", photo_data_url=None, topic_id=None, topic_title=None
    )
    await session.commit()
    d3 = await create_doubt(
        session, user_id=user, question_text="newest", photo_data_url=None, topic_id=None, topic_title=None
    )
    await session.commit()

    # Answer d1 — bumps its last_activity_at to now(), which should put it
    # at the top of the list ahead of d3 (which was created later but has
    # had no activity since).
    await insert_answer(
        session, doubt_id=d1["id"], author_id=teacher, author_role="TEACHER", content="x", source="expert"
    )
    await session.commit()

    rows = await list_doubts_for_user(session, user)
    questions = [r["question_text"] for r in rows]
    assert questions == ["oldest", "newest", "middle"]


async def test_list_doubts_for_user_isolation(session: AsyncSession) -> None:
    user_a, user_b = _uid(), _uid()
    await create_doubt(
        session, user_id=user_a, question_text="A1", photo_data_url=None, topic_id=None, topic_title=None
    )
    await create_doubt(
        session, user_id=user_a, question_text="A2", photo_data_url=None, topic_id=None, topic_title=None
    )
    await create_doubt(
        session, user_id=user_b, question_text="B1", photo_data_url=None, topic_id=None, topic_title=None
    )
    await session.commit()
    a = await list_doubts_for_user(session, user_a)
    b = await list_doubts_for_user(session, user_b)
    assert sorted(r["question_text"] for r in a) == ["A1", "A2"]
    assert sorted(r["question_text"] for r in b) == ["B1"]


async def test_list_answers_orders_oldest_first(session: AsyncSession) -> None:
    """Chronological order is essential for the multi-turn AI tutor flow:
    the doubt detail page rebuilds the message stack from oldest → newest,
    alternating user / assistant roles."""
    user, teacher = _uid(), _uid()
    doubt = await create_doubt(
        session, user_id=user, question_text="Q", photo_data_url=None, topic_id=None, topic_title=None
    )
    await session.commit()
    for label in ["first", "second", "third"]:
        await insert_answer(
            session,
            doubt_id=doubt["id"],
            author_id=teacher,
            author_role="TEACHER",
            content=label,
            source="expert",
        )
        await session.commit()
    rows = await list_answers(session, doubt["id"])
    contents = [r["content"] for r in rows]
    assert contents == ["first", "second", "third"]


async def test_list_answers_empty_for_unanswered(session: AsyncSession) -> None:
    user = _uid()
    doubt = await create_doubt(
        session, user_id=user, question_text="Q", photo_data_url=None, topic_id=None, topic_title=None
    )
    await session.commit()
    rows = await list_answers(session, doubt["id"])
    assert rows == []
