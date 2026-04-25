"""Drive _on_session_completed directly with a fake Msg, then read back via
GET /notifications/inbox/{userId}. Email channel is gated via monkeypatched
flag; tests cover both sides of the gate.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from notification import events as events_module
from notification.events import _on_session_completed
from notification.main import app

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


class FakeMsg:
    """Mimics nats.aio.msg.Msg for JetStream handler tests — records
    which terminal action (ack/term/nak) the handler called."""

    def __init__(self, payload: dict) -> None:
        self.data = json.dumps(payload).encode("utf-8")
        self.action: str | None = None

    async def ack(self) -> None:
        self.action = "ack"

    async def term(self) -> None:
        self.action = "term"

    async def nak(self, *, delay: int | None = None) -> None:  # noqa: ARG002
        self.action = "nak"


def _payload(*, user_id: str, score: float = 0.7) -> dict:
    return {
        "session_id": str(uuid4()),
        "user_id": user_id,
        "topic_id": str(uuid4()),
        "mode": "PRACTICE",
        "strategy": "binary_search",
        "served_count": 5,
        "correct_count": round(score * 5),
        "ability_estimate": 0.0,
        "score": score,
        "submitted_at": datetime.now(tz=UTC).isoformat(),
        "ts": datetime.now(tz=UTC).isoformat(),
    }


async def test_quiz_completed_enqueues_when_email_flag_on(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _on(_channel: str, tenant_id: str | None = None) -> bool:
        return True

    monkeypatch.setattr(events_module, "channel_enabled", _on)
    user = str(uuid4())
    await _on_session_completed(FakeMsg(_payload(user_id=user, score=0.7)))

    r = await client.get(f"/notifications/inbox/{user}")
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["type"] == "quiz.completed"
    assert item["channel"] == "email"
    assert item["payload"]["score"] == pytest.approx(0.7)


async def test_quiz_completed_dropped_when_email_flag_off(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _off(_channel: str, tenant_id: str | None = None) -> bool:
        return False

    monkeypatch.setattr(events_module, "channel_enabled", _off)
    user = str(uuid4())
    await _on_session_completed(FakeMsg(_payload(user_id=user)))

    r = await client.get(f"/notifications/inbox/{user}")
    assert r.json()["items"] == []


async def test_inbox_filters_by_user(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def _on(_channel: str, tenant_id: str | None = None) -> bool:
        return True

    monkeypatch.setattr(events_module, "channel_enabled", _on)
    user_a = str(uuid4())
    user_b = str(uuid4())
    await _on_session_completed(FakeMsg(_payload(user_id=user_a)))
    await _on_session_completed(FakeMsg(_payload(user_id=user_b)))
    await _on_session_completed(FakeMsg(_payload(user_id=user_a)))

    body_a = (await client.get(f"/notifications/inbox/{user_a}")).json()
    body_b = (await client.get(f"/notifications/inbox/{user_b}")).json()
    assert len(body_a["items"]) == 2
    assert len(body_b["items"]) == 1


async def test_malformed_payload_is_dropped_silently(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _on(_channel: str, tenant_id: str | None = None) -> bool:
        return True

    monkeypatch.setattr(events_module, "channel_enabled", _on)
    # Missing user_id
    msg = FakeMsg({"session_id": str(uuid4()), "score": 0.5})
    await _on_session_completed(msg)
    # Subscriber must NOT crash; bad payload is term'd (poison-pill).
    assert msg.action == "term"
    # And nothing landed in the inbox — query the DB instead of in-memory.
    r = await client.get(f"/notifications/inbox/{uuid4()}")
    assert r.json()["items"] == []
