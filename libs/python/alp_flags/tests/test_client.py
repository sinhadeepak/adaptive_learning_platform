"""Unit tests for FlagClient — uses pytest-respx-style mocking via httpx MockTransport."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from alp_flags import FlagClient

pytestmark = pytest.mark.asyncio


def _make_client(
    handler: httpx.MockTransport,
    fallbacks: dict[str, bool],
) -> FlagClient:
    client = FlagClient(
        institution_url="http://institution.test",
        nats_url=None,  # offline NATS for unit tests
        fallbacks=fallbacks,
        cache_ttl=30.0,
    )
    # Inject a mock transport so we don't hit a real network.
    client._http = httpx.AsyncClient(
        base_url="http://institution.test",
        transport=handler,
    )
    return client


async def test_evaluates_global_default() -> None:
    def respond(req: httpx.Request) -> httpx.Response:
        assert req.url.path == "/flags/email_channel_enabled"
        return httpx.Response(
            200,
            json={
                "name": "email_channel_enabled",
                "description": "...",
                "defaultValue": True,
                "dangerCritical": True,
                "overrides": [],
                "audit": [],
                "overrideCount": 0,
                "updatedAt": "2026-04-25T00:00:00Z",
            },
        )

    client = _make_client(httpx.MockTransport(respond), {"email_channel_enabled": False})
    assert await client.evaluate("email_channel_enabled") is True


async def test_tenant_override_beats_default() -> None:
    def respond(_req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "name": "irt_model_enabled",
                "description": "...",
                "defaultValue": False,
                "dangerCritical": True,
                "overrides": [
                    {"tenantId": "tenant-A", "value": True, "setByUserId": None, "setAt": "2026-04-25T00:00:00Z"},
                    {"tenantId": "tenant-B", "value": False, "setByUserId": None, "setAt": "2026-04-25T00:00:00Z"},
                ],
                "audit": [],
                "overrideCount": 2,
                "updatedAt": "2026-04-25T00:00:00Z",
            },
        )

    client = _make_client(httpx.MockTransport(respond), {"irt_model_enabled": False})
    assert await client.evaluate("irt_model_enabled", tenant_id="tenant-A") is True
    assert await client.evaluate("irt_model_enabled", tenant_id="tenant-B") is False
    assert await client.evaluate("irt_model_enabled", tenant_id="tenant-C") is False  # default
    assert await client.evaluate("irt_model_enabled") is False  # global default


async def test_cache_avoids_second_http_call() -> None:
    calls: list[Any] = []

    def respond(req: httpx.Request) -> httpx.Response:
        calls.append(req.url.path)
        return httpx.Response(
            200,
            json={
                "name": "email_channel_enabled",
                "description": "...",
                "defaultValue": True,
                "dangerCritical": True,
                "overrides": [],
                "audit": [],
                "overrideCount": 0,
                "updatedAt": "2026-04-25T00:00:00Z",
            },
        )

    client = _make_client(httpx.MockTransport(respond), {"email_channel_enabled": False})
    assert await client.evaluate("email_channel_enabled") is True
    assert await client.evaluate("email_channel_enabled") is True
    assert await client.evaluate("email_channel_enabled") is True
    assert len(calls) == 1


async def test_falls_back_when_institution_returns_500() -> None:
    def respond(_req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    client = _make_client(httpx.MockTransport(respond), {"checkout_enabled": False})
    assert await client.evaluate("checkout_enabled") is False  # fallback


async def test_falls_back_when_flag_unknown_in_institution() -> None:
    def respond(_req: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="not found")

    client = _make_client(httpx.MockTransport(respond), {"new_experiment": True})
    assert await client.evaluate("new_experiment") is True  # fallback


async def test_unknown_flag_with_no_fallback_raises() -> None:
    def respond(_req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    client = _make_client(httpx.MockTransport(respond), {})
    with pytest.raises(KeyError, match="hardcoded fallback"):
        await client.evaluate("undeclared_flag")


async def test_invalidate_drops_all_tenant_entries_for_flag() -> None:
    payload = {
        "name": "irt_model_enabled",
        "description": "...",
        "defaultValue": False,
        "dangerCritical": True,
        "overrides": [
            {"tenantId": "tenant-A", "value": True, "setByUserId": None, "setAt": "2026-04-25T00:00:00Z"},
        ],
        "audit": [],
        "overrideCount": 1,
        "updatedAt": "2026-04-25T00:00:00Z",
    }
    calls: list[str] = []

    def respond(req: httpx.Request) -> httpx.Response:
        calls.append(req.url.path)
        return httpx.Response(200, json=payload)

    client = _make_client(httpx.MockTransport(respond), {"irt_model_enabled": False})
    await client.evaluate("irt_model_enabled")
    await client.evaluate("irt_model_enabled", tenant_id="tenant-A")
    assert client.cache_size() == 2
    assert len(calls) == 2

    # Simulate NATS invalidation
    client._cache.invalidate("irt_model_enabled")
    assert client.cache_size() == 0

    # Next eval re-fetches
    await client.evaluate("irt_model_enabled")
    assert len(calls) == 3
