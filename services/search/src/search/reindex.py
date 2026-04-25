"""Reindex pipeline — fetches catalog over HTTP and bulk-indexes into OpenSearch.

Sprint 1: manual trigger via POST /admin/reindex (admin scope).
Sprint 2: NATS-driven via `topic.published` consumer subscriber. Same logic, event-source replaces HTTP pull.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from search.config import settings
from search.index import bulk_index_topics, drop_index, ensure_index

log = logging.getLogger(__name__)


async def fetch_catalog_topics() -> list[dict[str, Any]]:
    """Walk catalog HTTP: exams → subjects → topics. Returns flattened topic docs."""
    docs: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=10.0) as http:
        exams = (await http.get(f"{settings.catalog_base_url}/exams")).json()
        for exam in exams:
            subjects = (await http.get(f"{settings.catalog_base_url}/exams/{exam['id']}/subjects")).json()
            for subject in subjects:
                topics = (await http.get(f"{settings.catalog_base_url}/subjects/{subject['id']}/topics")).json()
                for topic in topics:
                    docs.append(
                        {
                            "id": topic["id"],
                            "type": "topic",
                            "title": topic["title"],
                            "subtitle": f"{subject['name']} · {exam['name']}",
                            "subject_name": subject["name"],
                            "exam_code": exam["code"],
                            "tier": topic["tier"],
                            "title_suggest": {
                                "input": [topic["title"], subject["name"]],
                                "weight": topic.get("questionCount", 1),
                            },
                        }
                    )
    return docs


async def reindex_all() -> dict[str, int]:
    """Drop the index, recreate it, fetch + bulk index. Returns {indexed: N}."""
    await drop_index()
    await ensure_index()
    docs = await fetch_catalog_topics()
    indexed = await bulk_index_topics(docs)
    log.info("reindexed %d topic docs", indexed)
    return {"indexed": indexed}
