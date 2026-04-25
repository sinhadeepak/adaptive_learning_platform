"""In-memory TTL cache keyed by (flag_name, tenant_id_or_None)."""

from __future__ import annotations

import time
from threading import Lock
from typing import Any

CacheKey = tuple[str, str | None]


class TtlCache:
    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._data: dict[CacheKey, tuple[Any, float]] = {}
        self._lock = Lock()

    def get(self, key: CacheKey) -> Any | None:
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if time.monotonic() >= expires_at:
                self._data.pop(key, None)
                return None
            return value

    def put(self, key: CacheKey, value: Any) -> None:
        with self._lock:
            self._data[key] = (value, time.monotonic() + self._ttl)

    def invalidate(self, flag_name: str) -> None:
        """Drop all entries (across tenants) for a single flag."""
        with self._lock:
            for key in [k for k in self._data if k[0] == flag_name]:
                self._data.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
