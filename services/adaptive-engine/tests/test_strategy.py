"""Test the flag-gated /strategy/select endpoint."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from adaptive_engine.main import app

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_strategy_default_binary_search(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _stub(tenant_id: str | None = None) -> bool:  # noqa: ARG001
        return False

    monkeypatch.setattr("adaptive_engine.main.use_irt", _stub)
    r = await client.get("/strategy/select")
    assert r.status_code == 200
    assert r.json()["strategy"] == "binary_search"


async def test_strategy_irt_when_flag_on(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _stub(tenant_id: str | None = None) -> bool:  # noqa: ARG001
        return True

    monkeypatch.setattr("adaptive_engine.main.use_irt", _stub)
    r = await client.get("/strategy/select")
    assert r.status_code == 200
    assert r.json()["strategy"] == "irt"
