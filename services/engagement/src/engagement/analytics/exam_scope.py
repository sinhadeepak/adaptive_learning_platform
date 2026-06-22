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


async def _fetch_exam_topic_ids(exam_id: str) -> set[str] | None:
    """Uncached HTTP fetch.

    Returns the parsed topic-id set on success (may be empty when the
    exam has no topics yet).  Returns ``None`` on any HTTP error so the
    caller can distinguish *failure* (None) from *empty exam* (set()).
    """
    url = f"{settings.learning_base_url}/catalog/exams/{exam_id}/subjects-with-topics"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            r = await client.get(url)
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("resolve_exam_topic_ids.failed exam=%s err=%s", exam_id, e)
            return None
    body = r.json()
    return {t["id"] for t in body.get("topics", []) if t.get("id")}


async def resolve_exam_topic_ids(exam_id: str, *, clock: float | None = None) -> set[str] | None:
    """Topic-id set for an exam, cached per exam for _CACHE_TTL seconds.

    Returns the topic-id set on success (may be empty for an exam with
    no topics).  Returns ``None`` when the upstream catalog call fails so
    that route handlers can gracefully degrade to unscoped (global)
    results rather than silently returning empty topics.

    Failures are NOT cached — the next request will retry the fetch.

    `clock` is injectable for tests; defaults to time.monotonic().
    """
    now = clock if clock is not None else time.monotonic()
    hit = _cache.get(exam_id)
    if hit is not None and now - hit[0] < _CACHE_TTL:
        return hit[1]
    ids = await _fetch_exam_topic_ids(exam_id)
    if ids is None:
        # Resolver failure — do NOT cache so the next request retries.
        return None
    _cache[exam_id] = (now, ids)
    return ids
