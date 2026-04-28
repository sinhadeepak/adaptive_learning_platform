"""Account lockout via Redis (STU-REQ-10).

Threshold of N failures within a sliding window triggers a hard lockout for D
seconds. Counter + lock both keyed by lower-cased email so they survive case
variants and don't bleed across users.

Keys:
- ``auth:fail:{email}``    INT — failure count, expires at end of sliding window.
- ``auth:lock:{email}``    "1" — sentinel for hard lockout, expires at end of lockout duration.

Uses the redis-py asyncio client so lookups stay non-blocking inside FastAPI.
"""

from __future__ import annotations

import logging

from redis.asyncio import Redis
from redis.exceptions import RedisError

from identity.auth.config import settings

log = logging.getLogger(__name__)

_client: Redis | None = None


def client() -> Redis | None:
    return _client


async def connect() -> None:
    """Best-effort Redis connect at startup. Lockout degrades gracefully if Redis is down
    (login still works; we just can't enforce thresholds — Auth's `account_status` SUSPENDED
    flag remains the durable hard-stop)."""
    global _client
    try:
        c = Redis.from_url(settings.redis_url, decode_responses=True)
        await c.ping()
        _client = c
        log.info("auth lockout connected to Redis at %s", settings.redis_url)
    except RedisError as err:
        log.warning("auth lockout Redis unreachable (%s); running without lockout", err)
        _client = None


async def close() -> None:
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        finally:
            _client = None


def _fail_key(email: str) -> str:
    return f"auth:fail:{email.lower()}"


def _lock_key(email: str) -> str:
    return f"auth:lock:{email.lower()}"


async def is_locked(email: str) -> int:
    """Return remaining lockout TTL in seconds (0 if not locked)."""
    if _client is None:
        return 0
    try:
        ttl = await _client.ttl(_lock_key(email))
        return max(0, int(ttl))
    except RedisError:
        return 0


async def record_failure(email: str) -> int:
    """Increment failure count. If we hit the threshold, set the lock sentinel.

    Returns the new failure count (post-increment)."""
    if _client is None:
        return 0
    try:
        key = _fail_key(email)
        count = int(await _client.incr(key))
        if count == 1:
            await _client.expire(key, settings.lockout_window_seconds)
        if count >= settings.lockout_threshold:
            await _client.set(_lock_key(email), "1", ex=settings.lockout_duration_seconds)
            log.info("auth.lockout.triggered email=%s count=%d", email, count)
        return count
    except RedisError as err:
        log.warning("auth lockout Redis op failed: %s", err)
        return 0


async def reset(email: str) -> None:
    if _client is None:
        return
    try:
        await _client.delete(_fail_key(email), _lock_key(email))
    except RedisError:
        pass  # Best-effort — soft-fail is fine here
