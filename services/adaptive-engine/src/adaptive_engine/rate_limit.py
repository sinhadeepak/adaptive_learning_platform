"""Sprint 8 R-4 — photo-doubt rate limiter.

Free students get 3 photo-doubt resolutions per UTC day. STUDENT_PREMIUM
(and anything that isn't STUDENT or anonymous — TEACHER, ADMIN, etc.)
bypass entirely. Counts live in Redis under a date-partitioned key with
a 36h TTL so the window naturally rolls forward without us running a
cleanup job.

Why per-day rather than rolling 24h: the latter requires a sorted-set
LREM at every check; per-day is one INCR + one (optional) EXPIRE. We
care about cost-control, not perfectly-spaced quotas.

Pure helpers (`limit_for_role`, `daily_key`) are extracted so unit tests
can pin the contract without standing up Redis.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

log = logging.getLogger(__name__)

FREE_TIER_DAILY_LIMIT = 3


def limit_for_role(role: str | None) -> int | None:
    """None means "no limit" (premium/staff bypass). An int is the daily cap."""
    if not role:
        # Anonymous traffic (no JWT) gets the free-tier limit. Production
        # JWT-enforcement will reject anonymous before we get here, but
        # keeping it conservative protects the OpenAI bill in any
        # misconfigured env.
        return FREE_TIER_DAILY_LIMIT
    if role == "STUDENT":
        return FREE_TIER_DAILY_LIMIT
    # STUDENT_PREMIUM, TEACHER, EXPERT, MODERATOR, INSTITUTION_ADMIN, PLATFORM_ADMIN.
    return None


def daily_key(user_id: str, now: datetime | None = None) -> str:
    """Redis key shape: `photo_doubt:rl:<YYYYMMDD>:<user_id>`. UTC day so
    the boundary is unambiguous across regions."""
    n = now or datetime.now(tz=timezone.utc)
    return f"photo_doubt:rl:{n.strftime('%Y%m%d')}:{user_id}"


class PhotoDoubtRateLimiter:
    """Thin wrapper around Redis INCR + EXPIRE. The instance is shared
    across requests via FastAPI's app state; close on shutdown."""

    def __init__(self, redis_url: str) -> None:
        self.redis_url = redis_url
        self._client: object | None = None

    async def connect(self) -> None:
        try:
            import redis.asyncio as aioredis  # type: ignore[import-untyped]

            self._client = await aioredis.from_url(
                self.redis_url, decode_responses=True
            )
            # Ping so misconfig surfaces at startup, not first request.
            await self._client.ping()  # type: ignore[union-attr]
        except Exception as e:  # noqa: BLE001
            log.warning("photo-doubt rate limiter disabled (redis down: %s)", e)
            self._client = None

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()  # type: ignore[union-attr]
            except Exception:  # noqa: BLE001
                pass
            self._client = None

    async def check_and_increment(
        self, *, user_id: str, role: str | None
    ) -> tuple[bool, int, int | None]:
        """Returns (allowed, current_count, limit). When `limit` is None
        the user has no cap (premium/staff). When `allowed` is False the
        caller should respond 429."""
        cap = limit_for_role(role)
        if cap is None:
            return True, 0, None
        # If Redis is down we fail-open rather than block paying users —
        # the LLM already has its own per-key budget to protect cost.
        if self._client is None:
            return True, 0, cap
        key = daily_key(user_id)
        try:
            count = await self._client.incr(key)  # type: ignore[union-attr]
            # First increment of the day → set TTL. Use NX-style behaviour
            # by checking the count and only setting EXPIRE on the first hit.
            if count == 1:
                # 36h is enough overlap to cover any clock skew without
                # extending the cap into the next day.
                await self._client.expire(key, 60 * 60 * 36)  # type: ignore[union-attr]
        except Exception as e:  # noqa: BLE001
            log.warning("rate limiter redis error (fail-open): %s", e)
            return True, 0, cap
        allowed = count <= cap
        return allowed, int(count), cap
