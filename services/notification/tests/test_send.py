"""Test the channel-gated /notifications/send endpoint."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from notification.main import app

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def _stub(values: dict[str, bool]):
    async def _eval(channel: str, tenant_id: str | None = None) -> bool:
        return values.get(channel, False)

    return _eval


async def test_email_send_accepted_when_flag_on(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "notification.main.channel_enabled",
        _stub({"email": True}),
    )
    r = await client.post(
        "/notifications/send",
        json={"userId": "u-1", "channel": "email", "type": "welcome", "payload": {}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert body["channel"] == "email"
    assert body["notificationId"]


async def test_sms_send_503_when_flag_off(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "notification.main.channel_enabled",
        _stub({"sms": False, "email": True, "push": True}),
    )
    r = await client.post(
        "/notifications/send",
        json={"userId": "u-1", "channel": "sms", "type": "otp", "payload": {}},
    )
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "channel_disabled"
    assert r.json()["detail"]["channel"] == "sms"


async def test_push_send_503_when_flag_off(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "notification.main.channel_enabled",
        _stub({"sms": True, "email": True, "push": False}),
    )
    r = await client.post(
        "/notifications/send",
        json={"userId": "u-1", "channel": "push", "type": "result", "payload": {}},
    )
    assert r.status_code == 503
    assert r.json()["detail"]["channel"] == "push"


async def test_validation_rejects_unknown_channel(client: AsyncClient) -> None:
    r = await client.post(
        "/notifications/send",
        json={"userId": "u-1", "channel": "bogus", "type": "x", "payload": {}},
    )
    assert r.status_code == 422  # Literal["push","sms","email"] rejects "bogus"
