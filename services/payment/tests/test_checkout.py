"""Test the flag-gated /checkout/start endpoint."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from payment.main import app

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_checkout_disabled_by_default(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _stub(tenant_id: str | None = None) -> bool:  # noqa: ARG001
        return False

    monkeypatch.setattr("payment.main.checkout_enabled", _stub)
    r = await client.post(
        "/checkout/start",
        json={"planId": "premium-yearly", "billingPeriod": "yearly"},
    )
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "checkout_disabled"


async def test_checkout_returns_intent_when_enabled(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _stub(tenant_id: str | None = None) -> bool:  # noqa: ARG001
        return True

    monkeypatch.setattr("payment.main.checkout_enabled", _stub)
    r = await client.post(
        "/checkout/start",
        json={"planId": "premium-yearly", "billingPeriod": "yearly"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["intentId"]
    assert body["url"].startswith("https://checkout.stripe.com/")


async def test_checkout_validates_billing_period(client: AsyncClient) -> None:
    r = await client.post(
        "/checkout/start",
        json={"planId": "x", "billingPeriod": "weekly"},
    )
    assert r.status_code == 422
