"""Redis-backed query cache for YouTube searches.

Caches the JSON-serialised SearchResultItem list under a key derived
from (language, query) for 24 hours, so identical teacher searches
deduplicate the API call and stay well inside the daily quota.

Lazy-imports redis.asyncio — when REDIS_URL is unset (or the package
is missing) the cache silently no-ops and every call is a miss.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Any

log = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 24 * 3600


def _key(language: str, query: str) -> str:
    norm = (language or "en").lower() + "|" + " ".join(query.lower().split())
    h = hashlib.sha256(norm.encode("utf-8")).hexdigest()[:32]
    # `v2` namespace bump: search filters now enforce a 20-minute
    # duration floor, so any v1-cached results may include short clips
    # and must not be served. Roll the prefix when filter contracts change.
    return f"resources:youtube:search:v2:{language}:{h}"


class _NullCache:
    async def get(self, _: str) -> list[dict[str, Any]] | None:
        return None

    async def set(self, _: str, __: list[dict[str, Any]]) -> None:
        return None


class _RedisCache:
    def __init__(self, redis_url: str):
        self._redis_url = redis_url
        self._pool: Any | None = None

    async def _conn(self) -> Any:
        if self._pool is None:
            try:
                import redis.asyncio as aioredis
            except ImportError:
                log.warning("redis package not installed; cache disabled")
                return None
            self._pool = aioredis.from_url(
                self._redis_url, decode_responses=True
            )
        return self._pool

    async def get(self, key: str) -> list[dict[str, Any]] | None:
        try:
            conn = await self._conn()
            if conn is None:
                return None
            raw = await conn.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:  # noqa: BLE001
            log.warning("cache_get_failed", extra={"key": key}, exc_info=True)
            return None

    async def set(self, key: str, items: list[dict[str, Any]]) -> None:
        try:
            conn = await self._conn()
            if conn is None:
                return
            await conn.set(key, json.dumps(items), ex=CACHE_TTL_SECONDS)
        except Exception:  # noqa: BLE001
            log.warning("cache_set_failed", extra={"key": key}, exc_info=True)


_singleton: _RedisCache | _NullCache | None = None


def get_cache() -> _RedisCache | _NullCache:
    global _singleton
    if _singleton is None:
        url = os.environ.get("REDIS_URL")
        _singleton = _RedisCache(url) if url else _NullCache()
    return _singleton


def reset_cache_for_tests(impl: _RedisCache | _NullCache | None = None) -> None:
    global _singleton
    _singleton = impl


async def get_or_none(language: str, query: str) -> list[dict[str, Any]] | None:
    return await get_cache().get(_key(language, query))


async def put(language: str, query: str, items: list[dict[str, Any]]) -> None:
    await get_cache().set(_key(language, query), items)
