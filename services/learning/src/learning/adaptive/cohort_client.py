"""Sprint 31 (P4-S31) — alp-learning → alp-engagement HTTP client for the
cohort percentile distribution.

Mirrors the existing fetch_mastery / fetch_readiness pattern in clients.py.
Empty distribution on any error so rank.py degrades gracefully to the
hardcoded fallback.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from learning.adaptive.config import settings

log = structlog.get_logger(__name__)

_HTTP_TIMEOUT = httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=5.0)


async def fetch_cohort_distribution(
    exam_id: str, topic_id: str | None = None
) -> dict[str, Any]:
    """Returns `{examId, topicId, totalUsers, computedAt, buckets: [...]}`.

    On any error, returns an empty distribution (`buckets=[], totalUsers=0`)
    so the caller can fall back to the hardcoded calibration without an
    exception path."""
    url = f"{settings.analytics_base_url}/analytics/cohort-distribution"
    params: dict[str, Any] = {"examId": exam_id}
    if topic_id is not None:
        params["topicId"] = topic_id
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            r = await client.get(url, params=params)
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("fetch_cohort_distribution.failed", error=str(e), exam_id=exam_id)
            return {
                "examId": exam_id,
                "topicId": topic_id,
                "totalUsers": 0,
                "computedAt": None,
                "buckets": [],
            }
    return r.json()


def buckets_to_distribution_rows(
    buckets: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Translate the camelCase API shape to the snake_case shape that the
    pure-function percentile helper consumes (mirrors what the engagement
    repository's `load_cohort_distribution` returns directly)."""
    return [
        {
            "readiness_bucket": float(b.get("readinessBucket") or 0.0),
            "user_count": int(b.get("userCount") or 0),
        }
        for b in buckets
    ]
