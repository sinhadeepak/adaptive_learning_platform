"""Client-IP derivation + fail-open safety for the auth rate limiter.

These are pure/unit-level: `_client_ip` takes a Request-like object and the
429-not-swallowed check uses a fake Redis client, so neither needs live infra.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from identity.auth import rate_limit
from identity.auth.config import settings


class _FakeClient:
    """Minimal stand-in for a Request.client (has a `.host`)."""

    def __init__(self, host: str) -> None:
        self.host = host


class _FakeRequest:
    def __init__(self, *, xff: str | None, peer: str | None) -> None:
        self.headers = {"x-forwarded-for": xff} if xff is not None else {}
        self.client = _FakeClient(peer) if peer is not None else None


def _ip(xff: str | None, peer: str | None = "10.0.0.9", hops: int = 1) -> str:
    original = settings.rate_limit_trusted_proxy_hops
    object.__setattr__(settings, "rate_limit_trusted_proxy_hops", hops)
    try:
        return rate_limit._client_ip(_FakeRequest(xff=xff, peer=peer))
    finally:
        object.__setattr__(settings, "rate_limit_trusted_proxy_hops", original)


def test_no_xff_uses_socket_peer() -> None:
    assert _ip(None) == "10.0.0.9"


def test_single_proxy_takes_rightmost_not_leftmost() -> None:
    # Attacker forges "1.2.3.4"; nginx appends the true socket IP on the right.
    assert _ip("1.2.3.4, 203.0.113.7", hops=1) == "203.0.113.7"


def test_spoofed_left_entries_are_ignored() -> None:
    # Many forged entries on the left must not shift the trusted position.
    assert _ip("9.9.9.9, 8.8.8.8, 7.7.7.7, 203.0.113.7", hops=1) == "203.0.113.7"


def test_two_trusted_hops_cdn_plus_nginx() -> None:
    # XFF = [spoofed, real-client(added by CDN), cdn-ip(added by nginx)].
    assert _ip("1.2.3.4, 198.51.100.5, 203.0.113.7", hops=2) == "198.51.100.5"


def test_short_header_falls_back_to_socket_peer() -> None:
    # Fewer entries than trusted hops → don't trust it; use the socket peer.
    assert _ip("1.2.3.4", hops=2) == "10.0.0.9"


def test_hops_zero_disables_xff_trust() -> None:
    assert _ip("203.0.113.7", hops=0) == "10.0.0.9"


class _FakeRedis:
    """Async redis stub whose counter is already over the limit."""

    def __init__(self, count: int) -> None:
        self._count = count

    async def incr(self, key: str) -> int:
        return self._count

    async def expire(self, key: str, ttl: int) -> None:  # pragma: no cover - trivial
        return None

    async def ttl(self, key: str) -> int:
        return 30


async def test_429_is_not_swallowed_by_fail_open(monkeypatch) -> None:
    """The 429 raised inside enforce() must propagate — the except clause only
    catches RedisError, so a genuine rate-limit rejection is never turned into
    a silent fail-open allow."""
    monkeypatch.setattr(rate_limit.lockout, "client", lambda: _FakeRedis(count=999))
    with pytest.raises(HTTPException) as exc:
        await rate_limit.enforce(
            rate_limit.LOGIN, _FakeRequest(xff=None, peer="10.0.0.9")
        )
    assert exc.value.status_code == 429
    assert exc.value.detail["code"] == "rate_limited"
