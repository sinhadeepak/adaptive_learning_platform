"""Sprint 28 (P4-S28) — thin HTTP client into alp-learning.

The coverage aggregator needs the syllabus tree (subjects → chapters →
topics) which lives in catalog. Mirrors the existing alp-learning →
alp-engagement client pattern (see learning/adaptive/clients.py) but in
the opposite direction.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from engagement.analytics.config import settings

log = logging.getLogger(__name__)

_HTTP_TIMEOUT = httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=5.0)


async def fetch_syllabus_tree(exam_id: str) -> dict[str, Any]:
    """Returns {examId, subjects: [{subjectId, name, chapters: [...]}]}.

    Empty `subjects` on any error so the caller can degrade gracefully —
    the coverage view shows "no chapters mapped yet" instead of a 500.
    """
    url = f"{settings.learning_base_url}/catalog/syllabus-tree"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            r = await client.get(url, params={"examId": exam_id})
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("fetch_syllabus_tree.failed exam_id=%s err=%s", exam_id, e)
            return {"examId": exam_id, "subjects": []}
    return r.json()


async def fetch_topics_bulk(topic_ids: list[str]) -> dict[str, dict[str, Any]]:
    """Phase 5 (P5-S37.5) — bulk topic lookup by id.

    Replaces cross-DB JOINs against `catalog_schema.topics` from
    engagement-side queries. Returns a `{topic_id: {title, titleHi,
    subjectId, examId}}` dict for O(1) lookup. Missing ids are absent
    (no error). Empty input returns `{}`.

    On HTTP error the function returns an empty dict rather than raising
    — engagement-side handlers fall back to topicTitle="" gracefully.
    Cap of 200 ids per call enforced by the alp-learning endpoint.
    """
    if not topic_ids:
        return {}
    # Deduplicate; alp-learning enforces a 200-id cap so we slice if larger.
    unique_ids = list({tid for tid in topic_ids if tid})
    if not unique_ids:
        return {}
    if len(unique_ids) > 200:
        log.warning(
            "fetch_topics_bulk.truncating ids count=%d cap=200",
            len(unique_ids),
        )
        unique_ids = unique_ids[:200]

    url = f"{settings.learning_base_url}/catalog/topics/bulk"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            r = await client.get(url, params=[("ids", tid) for tid in unique_ids])
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("fetch_topics_bulk.failed n=%d err=%s", len(unique_ids), e)
            return {}
    body = r.json()
    return {t["id"]: t for t in body.get("topics", [])}
