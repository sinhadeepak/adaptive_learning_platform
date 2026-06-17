"""In-memory + Redis-backed token store for anonymous screening sessions.

Anonymous students get a UUID token + 30-min TTL. Falls back to an
in-process dict when REDIS_URL isn't set (dev) — single-process only.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any
from uuid import uuid4

log = logging.getLogger(__name__)

TTL_SECONDS = 30 * 60
KEY_PREFIX = "screening:"

_inproc: dict[str, tuple[float, dict[str, Any]]] = {}
_redis_pool: Any = None


async def _redis() -> Any:
    global _redis_pool
    if _redis_pool is not None:
        return _redis_pool
    url = os.environ.get("REDIS_URL")
    if not url:
        return None
    try:
        import redis.asyncio as aioredis
    except ImportError:
        return None
    _redis_pool = aioredis.from_url(url, decode_responses=True)
    return _redis_pool


async def create(payload: dict[str, Any]) -> str:
    token = str(uuid4())
    redis = await _redis()
    if redis is not None:
        await redis.setex(KEY_PREFIX + token, TTL_SECONDS, json.dumps(payload))
    else:
        _inproc[token] = (time.time() + TTL_SECONDS, payload)
    return token


async def get(token: str) -> dict[str, Any] | None:
    redis = await _redis()
    if redis is not None:
        raw = await redis.get(KEY_PREFIX + token)
        return json.loads(raw) if raw else None
    entry = _inproc.get(token)
    if entry is None:
        return None
    expires_at, payload = entry
    if expires_at < time.time():
        _inproc.pop(token, None)
        return None
    return payload


async def update(token: str, payload: dict[str, Any]) -> None:
    redis = await _redis()
    if redis is not None:
        await redis.setex(KEY_PREFIX + token, TTL_SECONDS, json.dumps(payload))
    else:
        _inproc[token] = (time.time() + TTL_SECONDS, payload)


async def delete(token: str) -> None:
    redis = await _redis()
    if redis is not None:
        await redis.delete(KEY_PREFIX + token)
    else:
        _inproc.pop(token, None)
