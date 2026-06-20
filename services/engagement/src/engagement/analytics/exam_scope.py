"""Resolve an exam's topic-id set from the learning catalog (cross-service,
cached). Engagement analytics endpoints use this to scope by exam without a
cross-DB JOIN (catalog lives in the learning DB)."""

from __future__ import annotations

import logging
import time

import httpx

from engagement.analytics.config import settings

log = logging.getLogger(__name__)

_HTTP_TIMEOUT = httpx.Timeout(connect=2.0, read=8.0, write=5.0, pool=5.0)
_CACHE_TTL = 600.0  # 10 min; exam topic sets are near-static
_cache: dict[str, tuple[float, set[str]]] = {}


def _reset_cache() -> None:
    _cache.clear()


async def _fetch_exam_topic_ids(exam_id: str) -> set[str]:
    """Uncached HTTP fetch. Returns set() on any HTTP error (caller degrades)."""
    url = f"{settings.learning_base_url}/catalog/exams/{exam_id}/subjects-with-topics"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            r = await client.get(url)
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("resolve_exam_topic_ids.failed exam=%s err=%s", exam_id, e)
            return set()
    body = r.json()
    return {t["id"] for t in body.get("topics", []) if t.get("id")}


async def resolve_exam_topic_ids(exam_id: str, *, clock: float | None = None) -> set[str]:
    """Topic-id set for an exam, cached per exam for _CACHE_TTL seconds.
    `clock` is injectable for tests; defaults to time.monotonic()."""
    now = clock if clock is not None else time.monotonic()
    hit = _cache.get(exam_id)
    if hit is not None and now - hit[0] < _CACHE_TTL:
        return hit[1]
    ids = await _fetch_exam_topic_ids(exam_id)
    _cache[exam_id] = (now, ids)
    return ids
