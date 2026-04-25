"""Per-IP rate limiting via Redis token bucket — complements per-account lockout.

Lockout is per-account (`/auth/login` failures for a given email); rate limit is
per-IP and per-route, so a single attacker can't sweep across many accounts from
one source. Best-effort — if Redis is down, requests are allowed (Auth's
`account_status=SUSPENDED` and the lockout module remain the durable defenses).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import HTTPException, Request
from redis.exceptions import RedisError

from auth import lockout

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Limit:
    name: str  # used in the Redis key
    max_requests: int
    window_seconds: int


# Sane Sprint 1 defaults — safer to start tight and loosen with metrics in Sprint 2.
LOGIN = Limit("login", max_requests=10, window_seconds=60)
REGISTER = Limit("register", max_requests=3, window_seconds=60)
OTP_RESEND = Limit("otp_resend", max_requests=3, window_seconds=5 * 60)
PASSWORD_FORGOT = Limit("pw_forgot", max_requests=3, window_seconds=5 * 60)


def _client_ip(request: Request) -> str:
    # Behind nginx/CloudFront the upstream sets X-Forwarded-For; trust the leftmost (client).
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


async def enforce(limit: Limit, request: Request) -> None:
    """Raise HTTP 429 with `Retry-After` when the bucket is exhausted."""
    client = lockout.client()  # reuse the same Redis connection as lockout
    if client is None:
        return  # Redis unreachable — fail-open

    ip = _client_ip(request)
    key = f"auth:rl:{limit.name}:{ip}"
    try:
        count = int(await client.incr(key))
        if count == 1:
            await client.expire(key, limit.window_seconds)
        if count > limit.max_requests:
            ttl = int(await client.ttl(key))
            log.info("auth.rate_limit.exceeded route=%s ip=%s count=%d", limit.name, ip, count)
            raise HTTPException(
                status_code=429,
                detail={"code": "rate_limited", "message": "Too many requests — try again shortly."},
                headers={"Retry-After": str(max(1, ttl))},
            )
    except RedisError as err:
        log.warning("auth.rate_limit.redis_error route=%s err=%s", limit.name, err)
        # Fail-open
