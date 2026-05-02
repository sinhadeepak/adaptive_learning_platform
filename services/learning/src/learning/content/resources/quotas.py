"""Per-creator daily quota for YouTube search calls.

Defaults: 50 searches/day for TEACHER, 200/day for MODERATOR+.
Counter is keyed by `(user_id, UTC date)`; resets at midnight UTC.

Mirrors the AI-Gateway quota pattern (services/learning/src/learning/
ai_gateway/quotas.py) but lives standalone so this module can ship
without touching the AI Gateway internals.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone

log = logging.getLogger(__name__)

DEFAULT_TEACHER_LIMIT = 50
DEFAULT_MODERATOR_LIMIT = 200


def _date_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _seconds_until_midnight_utc() -> int:
    now = time.gmtime()
    return (24 - now.tm_hour) * 3600 - now.tm_min * 60 - now.tm_sec


def _key(user_id: str) -> str:
    return f"resources:search_quota:{user_id}:{_date_key()}"


class QuotaExceeded(Exception):
    def __init__(self, used: int, limit: int):
        super().__init__(f"Search quota exceeded: {used}/{limit}")
        self.used = used
        self.limit = limit


def role_limit(role: str | None) -> int:
    if role in ("MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN"):
        return DEFAULT_MODERATOR_LIMIT
    return DEFAULT_TEACHER_LIMIT


_pool: object | None = None


async def _redis() -> object | None:
    global _pool
    if _pool is not None:
        return _pool
    url = os.environ.get("REDIS_URL")
    if not url:
        return None
    try:
        import redis.asyncio as aioredis
    except ImportError:
        log.warning("redis package not installed; quota disabled (fail-open)")
        return None
    _pool = aioredis.from_url(url, decode_responses=True)
    return _pool


async def consume(user_id: str, *, role: str | None) -> tuple[int, int]:
    """Increment the user's daily counter. Raises QuotaExceeded when
    the new count exceeds their role limit. Returns (used, limit) on
    success.

    Fail-open: if Redis is unavailable, returns (0, limit) — the
    quota check silently passes. This keeps a Redis outage from
    blocking the whole authoring flow.
    """
    limit = role_limit(role)
    pool = await _redis()
    if pool is None:
        return (0, limit)
    key = _key(user_id)
    try:
        async with pool.pipeline(transaction=True) as pipe:  # type: ignore[union-attr]
            await pipe.incr(key)
            await pipe.expire(key, _seconds_until_midnight_utc())
            results = await pipe.execute()
        used = int(results[0])
    except Exception:  # noqa: BLE001
        log.warning("quota_consume_failed", extra={"user_id": user_id}, exc_info=True)
        return (0, limit)
    if used > limit:
        # Roll the counter back so a 429 doesn't burn the user's
        # quota on a request we refused.
        try:
            await pool.decr(key)  # type: ignore[union-attr]
        except Exception:  # noqa: BLE001
            pass
        raise QuotaExceeded(used - 1, limit)
    return (used, limit)


async def remaining(user_id: str, *, role: str | None) -> int:
    limit = role_limit(role)
    pool = await _redis()
    if pool is None:
        return limit
    try:
        raw = await pool.get(_key(user_id))  # type: ignore[union-attr]
    except Exception:  # noqa: BLE001
        return limit
    used = int(raw or 0)
    return max(0, limit - used)
