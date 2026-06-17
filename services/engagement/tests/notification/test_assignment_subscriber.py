"""Sprint 9 E-5 — assignment.new fan-out tests.

Two layers:
- `_handle()` happy path — drives the cohort-member HTTP fetch + writes
  one notification row per member with type `assignment.new`.
- Idempotency — replaying the same event must not duplicate inbox rows
  (uuid5 deterministic id + PK conflict on retry → no-op).

The cohort-members HTTP call is monkeypatched so we don't depend on the
Institution service running in test.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from engagement.notification import assignment_subscriber

os.environ.setdefault(
    "NOTIFICATION_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/engagement",
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def truncated() -> AsyncIterator[None]:
    """Wipe notification tables before each test."""
    engine = create_async_engine(os.environ["NOTIFICATION_DATABASE_URL"])
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "TRUNCATE notification_schema.notifications, "
                    "notification_schema.processed_events RESTART IDENTITY CASCADE"
                )
            )
        yield
    finally:
        await engine.dispose()
        from engagement.notification import db

        if db._engine is not None:  # type: ignore[attr-defined]
            await db._engine.dispose()  # type: ignore[attr-defined]
        db._engine = None  # type: ignore[attr-defined]
        db._sessionmaker = None  # type: ignore[attr-defined]


async def _count_for_user(user_id: str) -> int:
    engine = create_async_engine(os.environ["NOTIFICATION_DATABASE_URL"])
    sm = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with sm() as s:
            res = await s.execute(
                text(
                    "SELECT COUNT(*) FROM notification_schema.notifications "
                    "WHERE user_id = :u AND type = 'assignment.new'"
                ),
                {"u": user_id},
            )
            return int(res.scalar() or 0)
    finally:
        await engine.dispose()


def _payload(assignment_id: str, cohort_id: str) -> dict:
    return {
        "id": assignment_id,
        "cohort_id": cohort_id,
        "tenant_id": None,
        "title": "Mechanics — Week 3",
        "description": "Five FBD problems",
        "created_by": str(uuid.uuid4()),
        "due_at": "2026-05-15T23:59:59+00:00",
        "published_at": "2026-04-28T10:00:00+00:00",
    }


async def test_handle_writes_one_row_per_cohort_member(
    truncated: None,  # noqa: ARG001
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    members = [str(uuid.uuid4()) for _ in range(3)]

    async def _stub(_cid: str) -> list[str]:
        return members

    monkeypatch.setattr(assignment_subscriber, "fetch_cohort_members", _stub)

    aid = str(uuid.uuid4())
    cid = str(uuid.uuid4())
    written = await assignment_subscriber._handle(_payload(aid, cid))
    assert written == 3
    for m in members:
        assert await _count_for_user(m) == 1


async def test_handle_is_idempotent_on_replay(
    truncated: None,  # noqa: ARG001
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """NATS redelivers; the deterministic uuid5 id + PK constraint must
    silently no-op the second pass. The student's inbox sees ONE row,
    not two."""
    member = str(uuid.uuid4())

    async def _stub(_cid: str) -> list[str]:
        return [member]

    monkeypatch.setattr(assignment_subscriber, "fetch_cohort_members", _stub)
    aid = str(uuid.uuid4())
    cid = str(uuid.uuid4())
    await assignment_subscriber._handle(_payload(aid, cid))
    await assignment_subscriber._handle(_payload(aid, cid))
    assert await _count_for_user(member) == 1


async def test_handle_skips_when_cohort_is_empty(
    truncated: None,  # noqa: ARG001
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An assignment published to an empty cohort (or unreachable
    Institution) should ack the NATS message and write zero rows —
    not error out and trigger redelivery storms."""

    async def _stub(_cid: str) -> list[str]:
        return []

    monkeypatch.setattr(assignment_subscriber, "fetch_cohort_members", _stub)
    written = await assignment_subscriber._handle(
        _payload(str(uuid.uuid4()), str(uuid.uuid4()))
    )
    assert written == 0


async def test_handle_drops_payload_with_missing_fields(
    truncated: None,  # noqa: ARG001
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Defensive: a malformed payload (missing title) must not crash —
    return zero, log a warning, and let the NATS handler ack."""

    async def _stub(_cid: str) -> list[str]:
        return [str(uuid.uuid4())]

    monkeypatch.setattr(assignment_subscriber, "fetch_cohort_members", _stub)
    bad = {"id": str(uuid.uuid4()), "cohort_id": str(uuid.uuid4())}  # no title
    assert await assignment_subscriber._handle(bad) == 0


async def test_handle_writes_payload_body_with_assignment_id(
    truncated: None,  # noqa: ARG001
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The notification row payload must carry the assignmentId so the
    inbox tap-handler on web + mobile can deep-link to /assignments/{id}."""
    member = str(uuid.uuid4())

    async def _stub(_cid: str) -> list[str]:
        return [member]

    monkeypatch.setattr(assignment_subscriber, "fetch_cohort_members", _stub)
    aid = str(uuid.uuid4())
    cid = str(uuid.uuid4())
    await assignment_subscriber._handle(_payload(aid, cid))

    engine = create_async_engine(os.environ["NOTIFICATION_DATABASE_URL"])
    sm = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with sm() as s:
            res = await s.execute(
                text(
                    "SELECT payload FROM notification_schema.notifications "
                    "WHERE user_id = :u AND type = 'assignment.new'"
                ),
                {"u": member},
            )
            row = res.mappings().first()
    finally:
        await engine.dispose()
    assert row is not None
    assert row["payload"]["assignmentId"] == aid
