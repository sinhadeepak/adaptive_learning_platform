"""HTTP clients to peer services.

The study-plan endpoint reads:
  - per-topic mastery (EWA) from Analytics
  - the topic catalog (titles, subjects, exam) from Catalog

Both are public reads in the local stack — no auth wiring needed for now.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from learning.adaptive.config import settings

log = structlog.get_logger(__name__)

_HTTP_TIMEOUT = httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=5.0)


async def fetch_mastery(user_id: str) -> list[dict[str, Any]]:
    """Returns [{"topicId": ..., "ewa": float, "n": int}, ...] — empty for cold-start users."""
    url = f"{settings.analytics_base_url}/analytics/mastery/{user_id}"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            r = await client.get(url)
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("fetch_mastery_failed", error=str(e), user_id=user_id)
            return []
    body = r.json()
    return body.get("topics", [])


async def fetch_readiness(user_id: str) -> dict[str, Any]:
    url = f"{settings.analytics_base_url}/analytics/readiness/{user_id}"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            r = await client.get(url)
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("fetch_readiness_failed", error=str(e), user_id=user_id)
            return {"score": 0.0, "nTopics": 0}
    return r.json()


async def fetch_user_answered_items(user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    """Pull recent answered items for a user from Quiz, joined with question
    content. Used by the cross-topic weakness diagnosis. [] on any error."""
    url = f"{settings.quiz_base_url}/quiz/users/{user_id}/answered-items"
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=2.0, read=8.0, write=5.0, pool=5.0)) as client:
        try:
            r = await client.get(url, params={"limit": limit})
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("fetch_answered_items_failed", error=str(e), user_id=user_id)
            return []
    body = r.json()
    return body.get("items", [])


async def fetch_similar_problems(topic_id: str, limit: int = 3) -> list[dict[str, Any]]:
    """Pull a handful of PUBLISHED questions for a topic from Quiz. Used by the
    photo-doubt flow to surface similar items after OCR. Returns [] on any error
    so the caller can degrade gracefully (UI still shows the OCR result)."""
    url = f"{settings.quiz_base_url}/quiz/questions"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            r = await client.get(url, params={"topicId": topic_id, "limit": limit})
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("fetch_similar_problems_failed", error=str(e), topic_id=topic_id)
            return []
    body = r.json()
    return body.get("items", [])


async def fetch_topic_catalog(exam_code: str | None = None) -> list[dict[str, Any]]:
    """Returns a flat list of topics with their subject + exam context, suitable for
    composing into an LLM prompt. When `exam_code` is given, scope to that exam only."""
    base = settings.catalog_base_url
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            exams_resp = await client.get(f"{base}/catalog/exams")
            exams_resp.raise_for_status()
            exams = exams_resp.json()
            if exam_code:
                exams = [e for e in exams if e.get("code") == exam_code]
            out: list[dict[str, Any]] = []
            for exam in exams:
                exam_id = exam["id"]
                subj_resp = await client.get(f"{base}/catalog/exams/{exam_id}/subjects")
                subj_resp.raise_for_status()
                for subject in subj_resp.json():
                    topics_resp = await client.get(
                        f"{base}/catalog/subjects/{subject['id']}/topics"
                    )
                    topics_resp.raise_for_status()
                    for t in topics_resp.json():
                        out.append(
                            {
                                "topicId": t["id"],
                                "title": t["title"],
                                "subjectName": subject["name"],
                                "examName": exam["name"],
                                "examCode": exam.get("code"),
                                "questionCount": t.get("questionCount", 0),
                            }
                        )
        except httpx.HTTPError as e:
            log.warning("fetch_topic_catalog_failed", error=str(e))
            return []
    return out
