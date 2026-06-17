"""Sprint 12 S12-D — content quiz.session.completed subscriber tests.

Covers:
- ASSIGNMENT-mode events upsert into assignment_progress.
- Non-ASSIGNMENT modes (PRACTICE, MOCK) are silently ignored.
- Missing fields (assignment_id, user_id, served_count=0) are skipped
  rather than crashing the consumer.
- Replay is idempotent — same event twice → still one row, last-writer-
  wins on score.

Test shape: each test runs a single async coroutine via asyncio.run so
the asyncpg engine stays bound to one event loop. Tests don't go
through TestClient (no FastAPI lifespan); they use raw asyncpg to seed
the assignment row.
"""

from __future__ import annotations

import asyncio
import uuid

import asyncpg
import pytest

from learning.content import db, quiz_session_subscriber as qss


def _payload(
    *,
    mode: str,
    assignment_id: str | None = None,
    user_id: str | None = None,
    served: int = 5,
    correct: int = 3,
) -> dict:
    p: dict = {
        "session_id": str(uuid.uuid4()),
        "user_id": user_id or str(uuid.uuid4()),
        "topic_id": str(uuid.uuid4()),
        "mode": mode,
        "served_count": served,
        "correct_count": correct,
        "score": correct / max(served, 1),
        "submitted_at": "2026-04-28T10:00:00+00:00",
        "ts": "2026-04-28T10:00:01+00:00",
    }
    if assignment_id:
        p["assignment_id"] = assignment_id
    return p


async def _connect_pg() -> asyncpg.Connection:
    return await asyncpg.connect(
        host="localhost",
        port=35432,
        user="postgres",
        password="postgres",  # noqa: S106
        database="learning_test",  # dedicated test DB (see tests/conftest.py)
    )


async def _seed_assignment() -> str:
    """Create + publish an assignment via raw SQL — bypasses the FastAPI
    lifespan + catalog auth so the subscriber test stays focused."""
    aid = str(uuid.uuid4())
    cohort_id = str(uuid.uuid4())
    teacher = str(uuid.uuid4())
    conn = await _connect_pg()
    try:
        await conn.execute(
            """
            INSERT INTO content_schema.assignments
              (id, cohort_id, title, created_by, published_at)
            VALUES ($1::uuid, $2::uuid, $3, $4::uuid, NOW())
            """,
            aid,
            cohort_id,
            "Test assignment",
            teacher,
        )
    finally:
        await conn.close()
    return aid


async def _row(assignment_id: str, user_id: str) -> dict | None:
    conn = await _connect_pg()
    try:
        return await conn.fetchrow(
            """
            SELECT correct_count, total_count
              FROM content_schema.assignment_progress
             WHERE assignment_id = $1::uuid AND user_id = $2::uuid
            """,
            assignment_id,
            user_id,
        )
    finally:
        await conn.close()


def _run(coro: "asyncio.coroutines.Coroutine") -> object:
    """Each test owns its own event loop AND a fresh sessionmaker —
    avoids cross-loop bookkeeping in asyncpg."""
    db._engine = None
    db._sessionmaker = None
    return asyncio.run(coro)


def test_handler_ignores_practice_mode() -> None:
    async def _t() -> None:
        aid = await _seed_assignment()
        user_id = str(uuid.uuid4())
        handled = await qss._handle(
            _payload(mode="PRACTICE", assignment_id=aid, user_id=user_id)
        )
        assert handled is False
        assert await _row(aid, user_id) is None

    _run(_t())


def test_handler_ignores_mock_mode() -> None:
    async def _t() -> None:
        aid = await _seed_assignment()
        user_id = str(uuid.uuid4())
        handled = await qss._handle(
            _payload(mode="MOCK", assignment_id=aid, user_id=user_id)
        )
        assert handled is False
        assert await _row(aid, user_id) is None

    _run(_t())


def test_handler_writes_progress_for_assignment_mode() -> None:
    async def _t() -> None:
        aid = await _seed_assignment()
        user_id = str(uuid.uuid4())
        handled = await qss._handle(
            _payload(
                mode="ASSIGNMENT", assignment_id=aid, user_id=user_id,
                served=5, correct=4,
            )
        )
        assert handled is True
        row = await _row(aid, user_id)
        assert row is not None
        assert row["correct_count"] == 4
        assert row["total_count"] == 5

    _run(_t())


def test_handler_replay_is_idempotent_last_write_wins() -> None:
    async def _t() -> None:
        aid = await _seed_assignment()
        user_id = str(uuid.uuid4())
        await qss._handle(
            _payload(mode="ASSIGNMENT", assignment_id=aid, user_id=user_id,
                     served=5, correct=2)
        )
        await qss._handle(
            _payload(mode="ASSIGNMENT", assignment_id=aid, user_id=user_id,
                     served=5, correct=5)
        )
        row = await _row(aid, user_id)
        assert row is not None
        assert row["correct_count"] == 5

    _run(_t())


def test_handler_skips_when_assignment_id_missing() -> None:
    async def _t() -> None:
        handled = await qss._handle(
            _payload(mode="ASSIGNMENT", user_id=str(uuid.uuid4()))
        )
        assert handled is False

    _run(_t())


def test_handler_skips_when_served_count_zero() -> None:
    async def _t() -> None:
        aid = await _seed_assignment()
        user_id = str(uuid.uuid4())
        handled = await qss._handle(
            _payload(mode="ASSIGNMENT", assignment_id=aid, user_id=user_id,
                     served=0, correct=0)
        )
        assert handled is False
        assert await _row(aid, user_id) is None

    _run(_t())


def test_handler_lowercase_mode_string_is_normalised() -> None:
    """Defensive: some NATS clients may emit lowercase enum values.
    The handler upper-cases before comparing."""
    async def _t() -> None:
        aid = await _seed_assignment()
        user_id = str(uuid.uuid4())
        handled = await qss._handle(
            _payload(mode="assignment", assignment_id=aid, user_id=user_id,
                     served=3, correct=2)
        )
        assert handled is True
        row = await _row(aid, user_id)
        assert row is not None
        assert row["correct_count"] == 2

    _run(_t())
