"""Sprint 9 A-1 — payment HTTP fallback tests.

Two layers covered:
- `derive_provisional_until` — pure function pinning the 24h provisional
  window so the JWT carries STUDENT_PREMIUM until the next NATS message
  refines premium_until to the real period_end.
- `fallback_premium_until` — exercises the network path with an in-process
  monkeypatched httpx so we cover the success / failure / fail-open
  branches without standing up the Payment service.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import pytest

from identity.auth.payment_fallback import derive_provisional_until, fallback_premium_until

pytestmark = pytest.mark.asyncio


def test_derive_provisional_until_is_24h_in_future() -> None:
    now = datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc)
    got = derive_provisional_until(now)
    assert got == now + timedelta(hours=24)


def test_derive_provisional_until_preserves_tz() -> None:
    now = datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc)
    assert derive_provisional_until(now).tzinfo is timezone.utc


async def test_fallback_returns_none_when_payment_says_free(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The most common case — Payment confirms the user is free → no
    elevation, no DB write, JWT stays STUDENT."""

    class _Resp:
        status_code = 200

        def json(self) -> dict:
            return {"isPremium": False, "tier": "STUDENT_FREE"}

    class _Client:
        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def get(self, _url: str) -> _Resp:
            return _Resp()

    monkeypatch.setattr(httpx, "AsyncClient", lambda **_: _Client())
    got = await fallback_premium_until("u-1")
    assert got is None


async def test_fallback_returns_provisional_when_payment_says_premium(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Resp:
        status_code = 200

        def json(self) -> dict:
            return {"isPremium": True, "tier": "STUDENT_PREMIUM"}

    class _Client:
        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def get(self, _url: str) -> _Resp:
            return _Resp()

    monkeypatch.setattr(httpx, "AsyncClient", lambda **_: _Client())
    got = await fallback_premium_until("u-2")
    assert got is not None
    # Provisional → ~24h in the future.
    delta = got - datetime.now(tz=timezone.utc)
    assert timedelta(hours=23) < delta < timedelta(hours=25)


async def test_fallback_fails_open_on_network_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If Payment is down or unreachable, we must NOT block login or
    crash — return None and let the user proceed as STUDENT. The next
    NATS message (or next login) will retry."""

    class _Client:
        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def get(self, _url: str) -> object:
            raise httpx.ConnectError("Connection refused")

    monkeypatch.setattr(httpx, "AsyncClient", lambda **_: _Client())
    got = await fallback_premium_until("u-3")
    assert got is None


async def test_fallback_fails_open_on_5xx(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Resp:
        status_code = 503

        def json(self) -> dict:
            return {}

    class _Client:
        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def get(self, _url: str) -> _Resp:
            return _Resp()

    monkeypatch.setattr(httpx, "AsyncClient", lambda **_: _Client())
    assert await fallback_premium_until("u-4") is None
