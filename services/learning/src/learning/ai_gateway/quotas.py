"""Per-touchpoint + per-creator quotas — Redis-backed.

Per ADR-0019. Defaults: 50 authoring/creator/day, 100 translations/
creator/day, unlimited quality_check (background); platform-wide
200 authoring/min, 500 evaluation/min.

Enforced *before* the provider call. QuotaExceededError causes
AIGateway to fail the call with a 429-equivalent at the application
layer (calling handler can degrade per its own semantics — authoring
shows quota_reset_at to the author; evaluation routes to humans).

When Redis is unavailable, **fail-open** — better to over-spend
than to break the engine. Cost dashboard surfaces the actuals.
"""

from __future__ import annotations

import logging
import time
from typing import Awaitable, Callable

log = logging.getLogger(__name__)


class QuotaExceededError(Exception):
    """Raised when a quota check fails. AIGateway surfaces as a
    non-retryable error so fallback isn't attempted (over-quota on
    primary remains over-quota on fallback)."""

    def __init__(self, scope: str, reset_at: float):
        super().__init__(f"quota exceeded: {scope} (resets at {reset_at})")
        self.scope = scope
        self.reset_at = reset_at


class QuotaConfig:
    """Per-touchpoint quota knobs. Defaults match ADR-0019 §"Routing
    config" rate_limits stanza."""

    __slots__ = ("per_creator_per_day", "platform_per_minute")

    def __init__(
        self,
        per_creator_per_day: dict[str, int | None] | None = None,
        platform_per_minute: dict[str, int | None] | None = None,
    ):
        # None argument = use defaults; empty dict {} = no limits.
        # `is None` (not truthy-check) so callers can pass {} to
        # disable limits explicitly without falling back to defaults.
        self.per_creator_per_day = (
            per_creator_per_day
            if per_creator_per_day is not None
            else {"authoring": 50, "quality_check": None, "translation": 100}
        )
        self.platform_per_minute = (
            platform_per_minute
            if platform_per_minute is not None
            else {"authoring": 200, "evaluation": 500}
        )


# Type alias — async function (key, ttl_seconds) → current count after increment.
RedisIncrFn = Callable[[str, int], Awaitable[int]]


class QuotaChecker:
    """Checks + increments per-touchpoint counters.

    `incr_fn` is a Redis-backed INCR/EXPIRE wrapper. Tests inject a
    pure-function fake; production wires `redis.asyncio.Redis.incr` +
    `expire`. Fail-open: any exception in `incr_fn` is logged + the
    quota check returns OK.
    """

    def __init__(
        self,
        config: QuotaConfig,
        incr_fn: RedisIncrFn | None = None,
    ):
        self.config = config
        self._incr = incr_fn

    async def check(
        self,
        *,
        touchpoint: str,
        creator_id: str | None = None,
    ) -> None:
        """Raises QuotaExceededError if the touchpoint+creator is over
        its limit. Side-effect: increments the counter (so this call
        consumes one unit of quota even if a downstream provider
        fails)."""
        if self._incr is None:
            return  # No Redis configured — fail open.

        # Per-creator-per-day check.
        cap = self.config.per_creator_per_day.get(touchpoint)
        if cap is not None and creator_id:
            day_key = _day_key(touchpoint, creator_id)
            ttl = _seconds_to_midnight()
            try:
                count = await self._incr(day_key, ttl)
            except Exception as e:  # noqa: BLE001
                log.warning("quota.creator.fail_open touchpoint=%s err=%s", touchpoint, e)
                count = 0
            if count > cap:
                raise QuotaExceededError(
                    f"creator={creator_id} touchpoint={touchpoint} day",
                    reset_at=time.time() + ttl,
                )

        # Platform-per-minute check (no creator_id needed).
        plat = self.config.platform_per_minute.get(touchpoint)
        if plat is not None:
            min_key = _minute_key(touchpoint)
            try:
                count = await self._incr(min_key, 60)
            except Exception as e:  # noqa: BLE001
                log.warning("quota.platform.fail_open touchpoint=%s err=%s", touchpoint, e)
                count = 0
            if count > plat:
                raise QuotaExceededError(
                    f"platform touchpoint={touchpoint} minute",
                    reset_at=time.time() + 60,
                )


def _day_key(touchpoint: str, creator_id: str) -> str:
    day = time.strftime("%Y%m%d", time.gmtime())
    return f"ai_gateway:quota:{touchpoint}:creator:{creator_id}:{day}"


def _minute_key(touchpoint: str) -> str:
    minute = int(time.time() // 60)
    return f"ai_gateway:quota:{touchpoint}:platform:{minute}"


def _seconds_to_midnight() -> int:
    """UTC seconds until next midnight."""
    now = time.gmtime()
    return (
        (24 - now.tm_hour) * 3600
        - now.tm_min * 60
        - now.tm_sec
    )


async def make_redis_incr_fn(redis_url: str) -> RedisIncrFn:
    """Build a Redis-backed incr_fn from a URL. Lazy-imports redis.asyncio.

    Returns an async fn `(key, ttl_seconds) -> count_after_incr`. On
    Redis errors, raises (caller catches + fails-open).
    """
    try:
        import redis.asyncio as aioredis
    except ImportError as e:
        raise RuntimeError("redis package not installed") from e

    pool = aioredis.from_url(redis_url, decode_responses=True)

    async def _incr(key: str, ttl_seconds: int) -> int:
        # INCR + EXPIRE in a transaction. EXPIRE only sets TTL on
        # first hit; subsequent calls are no-ops but cheap.
        async with pool.pipeline(transaction=True) as pipe:
            await pipe.incr(key)
            await pipe.expire(key, ttl_seconds)
            results = await pipe.execute()
        return int(results[0])

    return _incr
