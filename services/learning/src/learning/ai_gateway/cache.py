"""Deterministic-input prompt cache (P5-S52, closes AIM §1.1 #5).

Same `(prompt_template_id, version, scrubbed_inputs)` -> same cached
response. Cuts cost on repeated translations + repeated quality checks
on identical text.

Pure-stdlib LRU + TTL-aware. A Redis-backed implementation lands when
multi-process sharing matters; in-process caching is enough for
single-process FastAPI workers (uvicorn `--workers 1` in dev/staging,
multiple workers each cache independently in prod — acceptable since
the benefit compounds at the touchpoint level not the request level).

Per ADR-0019 §"Cache for deterministic-input prompts". Caching is
applied to **idempotent touchpoints only** (translation, quality_check,
vision); authoring and evaluation are NOT cached because they're
expected to vary on request-time context.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from threading import Lock
from typing import Any

from learning.ai_gateway.metrics import record_cache_hit

# Per-touchpoint cacheability. Authoring + evaluation paths bypass the
# cache because they're context-sensitive (creator state, response state).
CACHEABLE_TOUCHPOINTS = frozenset({"translation", "quality_check", "vision"})

# Default TTL — 24 hours. Long enough that cost savings on repeated
# input dominates; short enough that prompt-template revisions take
# effect within a day.
DEFAULT_TTL_SECONDS = 24 * 3600

# Default LRU size — 10K entries. Each entry is a small dict; well
# under 100 MB at typical payload sizes.
DEFAULT_MAX_ENTRIES = 10_000


class _LruEntry:
    __slots__ = ("value", "expires_at")

    def __init__(self, value: Any, expires_at: float) -> None:
        self.value = value
        self.expires_at = expires_at


class GatewayCache:
    """In-process LRU + TTL cache. Thread-safe via a single mutex —
    Gateway calls don't share fast paths, so contention is negligible."""

    def __init__(
        self,
        *,
        max_entries: int = DEFAULT_MAX_ENTRIES,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
    ) -> None:
        self._store: OrderedDict[str, _LruEntry] = OrderedDict()
        self._max = max_entries
        self._ttl = ttl_seconds
        self._lock = Lock()

    def get(self, *, touchpoint: str, key: str) -> Any | None:
        """Returns the cached value when present + unexpired; else None.

        Hits are reported to `ai_gateway_cache_hit_total{touchpoint}`.
        Non-cacheable touchpoints always miss (caller decides whether
        to skip the lookup entirely; the function is side-effect-free
        on miss)."""
        if touchpoint not in CACHEABLE_TOUCHPOINTS:
            return None
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            if entry.expires_at < time.time():
                self._store.pop(key, None)
                return None
            # LRU touch.
            self._store.move_to_end(key)
        record_cache_hit(touchpoint)
        return entry.value

    def put(self, *, touchpoint: str, key: str, value: Any) -> None:
        """Insert + evict LRU when over `max_entries`. No-op for
        non-cacheable touchpoints so callers don't need to gate."""
        if touchpoint not in CACHEABLE_TOUCHPOINTS:
            return
        expires_at = time.time() + self._ttl
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
                self._store[key] = _LruEntry(value, expires_at)
                return
            if len(self._store) >= self._max:
                self._store.popitem(last=False)
            self._store[key] = _LruEntry(value, expires_at)

    def clear(self) -> None:
        """Test-only: clear the cache. Production use only via lifecycle
        hooks (none today)."""
        with self._lock:
            self._store.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._store)


# Module-level singleton — same pattern as `metrics._METRICS`.
_CACHE = GatewayCache()


def get_cache() -> GatewayCache:
    return _CACHE


def reset_for_tests() -> None:
    _CACHE.clear()
