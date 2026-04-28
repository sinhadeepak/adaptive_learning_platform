"""Dispatcher tests — drive a single tick with a stub Sender against the
real Postgres so the SELECT … FOR UPDATE SKIP LOCKED + UPDATE round-trip
is exercised end-to-end. SMTP is stubbed; nothing leaves the test process.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration
import pytest_asyncio
from sqlalchemy import text

from engagement.notification import db, profile_lookup
from engagement.notification.dispatcher import run_one_tick
from engagement.notification.repositories import append_notification, mark_event_processed

pytestmark = pytest.mark.asyncio


class StubSender:
    """Records every sent email; can be configured to fail to test retry."""

    def __init__(self, *, fail: bool = False) -> None:
        self.sent: list[dict] = []
        self.fail = fail

    async def send_email(self, *, to: str, subject: str, body: str, message_id: str) -> None:
        if self.fail:
            raise RuntimeError("stub: SMTP unreachable")
        self.sent.append({"to": to, "subject": subject, "body": body, "message_id": message_id})


@pytest_asyncio.fixture(autouse=True)
async def _reset_email_cache() -> AsyncIterator[None]:
    profile_lookup.clear_cache()
    yield


async def _seed_notification(*, user_id: str, type_: str, payload: dict) -> str:
    nid = str(uuid4())
    async with db.sessionmaker()() as session:
        await append_notification(
            session,
            notification_id=nid,
            user_id=user_id,
            type_=type_,
            channel="email",
            payload=payload,
        )
        # A processed_events row is normally written by the JetStream subscriber
        # alongside the notification; mirror that here for realism.
        await mark_event_processed(session, str(uuid4()))
        await session.commit()
    return nid


async def _row_state(notif_id: str) -> dict:
    async with db.sessionmaker()() as session:
        res = await session.execute(
            text(
                "SELECT dispatched_at, dispatch_attempts, last_dispatch_error "
                "FROM notification_schema.notifications WHERE id = :id"
            ),
            {"id": notif_id},
        )
        row = res.first()
        assert row is not None
        return {"dispatched_at": row[0], "attempts": row[1], "error": row[2]}


async def test_dispatcher_sends_pending_email_and_marks_dispatched() -> None:
    user = str(uuid4())
    nid = await _seed_notification(
        user_id=user,
        type_="quiz.completed",
        payload={"sessionId": str(uuid4()), "score": 0.8, "topicId": str(uuid4())},
    )
    sender = StubSender()
    sent = await run_one_tick(sender)
    assert sent == 1
    assert len(sender.sent) == 1
    msg = sender.sent[0]
    assert msg["message_id"] == nid
    assert "80%" in msg["subject"]
    assert "80%" in msg["body"]
    state = await _row_state(nid)
    assert state["dispatched_at"] is not None
    assert state["attempts"] == 1


async def test_dispatcher_does_not_resend_already_dispatched_rows() -> None:
    user = str(uuid4())
    nid = await _seed_notification(
        user_id=user,
        type_="quiz.completed",
        payload={"sessionId": str(uuid4()), "score": 0.5, "topicId": str(uuid4())},
    )
    sender = StubSender()
    await run_one_tick(sender)
    await run_one_tick(sender)  # second tick should be a no-op for this row
    assert len(sender.sent) == 1
    state = await _row_state(nid)
    assert state["attempts"] == 1


async def test_dispatcher_records_error_and_keeps_row_pending_on_send_failure() -> None:
    user = str(uuid4())
    nid = await _seed_notification(
        user_id=user,
        type_="quiz.completed",
        payload={"sessionId": str(uuid4()), "score": 1.0, "topicId": str(uuid4())},
    )
    sender = StubSender(fail=True)
    sent = await run_one_tick(sender)
    assert sent == 0
    state = await _row_state(nid)
    assert state["dispatched_at"] is None
    assert state["attempts"] == 1
    assert state["error"] is not None and "stub" in state["error"]

    # Recovery on next tick: swap to a working sender.
    ok_sender = StubSender(fail=False)
    sent2 = await run_one_tick(ok_sender)
    assert sent2 == 1
    state2 = await _row_state(nid)
    assert state2["dispatched_at"] is not None
    assert state2["attempts"] == 2
    assert state2["error"] is None


async def test_dispatcher_skips_non_email_channel_for_now() -> None:
    user = str(uuid4())
    nid = str(uuid4())
    async with db.sessionmaker()() as session:
        # SMS row — no SMS sender wired in Sprint 3; row should be marked
        # dispatched so it doesn't loop forever in the queue.
        await append_notification(
            session,
            notification_id=nid,
            user_id=user,
            type_="quiz.completed",
            channel="sms",
            payload={"score": 0.6},
        )
        await session.commit()
    sender = StubSender()
    sent = await run_one_tick(sender)
    assert sent == 0  # no email sent
    assert sender.sent == []
    state = await _row_state(nid)
    assert state["dispatched_at"] is not None  # but marked dispatched anyway


async def test_render_quiz_completed_template() -> None:
    """Direct unit test of the template helper — no DB / SMTP."""
    from engagement.notification.sender import render_email

    subject, body = render_email("quiz.completed", {"score": 0.6, "topicId": "t-1"})
    assert "60%" in subject
    assert "60%" in body
    assert body.endswith("ALP\n")


async def test_render_unknown_type_falls_through() -> None:
    from engagement.notification.sender import render_email

    subject, body = render_email("future.event", {"meta": "data"})
    assert "future.event" in subject
    assert "data" in body
