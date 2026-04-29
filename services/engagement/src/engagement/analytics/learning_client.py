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
