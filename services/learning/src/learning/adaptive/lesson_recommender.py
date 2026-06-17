"""Phase 1C — lesson plan recommender for teachers.

For a teacher's cohort, surfaces the top 3 topics that the next class
should cover. Score per topic is:

    score = weakness × importance × decay

where:
  - weakness   = (1 - cohort_avg_ewa)   — how stuck the cohort is
  - importance = topic_importance.weight — exam-weighted
  - decay      = 1 if no recent activity, else 1 - recent_activity_share
                 (proxy for "needs revisit"; topics being practiced
                 right now don't need to be re-taught).

Surfaces an LLM-generated narrative when available; otherwise the
heuristic-only fallback.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from learning.adaptive import llm
from learning.adaptive.config import settings

log = structlog.get_logger(__name__)

_HTTP_TIMEOUT = httpx.Timeout(connect=2.0, read=8.0, write=5.0, pool=5.0)
_TOP_K = 3


LESSON_PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["headline", "diagnosis", "recommendations", "encouragement"],
    "properties": {
        "headline": {"type": "string"},
        "diagnosis": {"type": "string"},
        "recommendations": {
            "type": "array",
            "minItems": 1,
            "maxItems": 5,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "topicId",
                    "topicTitle",
                    "rank",
                    "rationale",
                    "suggestedFormat",
                    "estMinutes",
                ],
                "properties": {
                    "topicId": {"type": "string"},
                    "topicTitle": {"type": "string"},
                    "rank": {"type": "integer"},
                    "rationale": {"type": "string"},
                    "suggestedFormat": {
                        "type": "string",
                        "enum": ["LECTURE", "DRILL", "DISCUSSION", "REVISION", "MOCK_SLICE"],
                    },
                    "estMinutes": {"type": "integer", "minimum": 10, "maximum": 120},
                },
            },
        },
        "encouragement": {"type": "string"},
    },
}


SYSTEM_PROMPT = """You are a senior teacher coach for Indian competitive exam prep (NEET, JEE, UPSC, CBSE).
Given a cohort's weakness signal (per-topic average EWA) and topic exam importance,
pick the TOP 3 topics for the next class.

Hard rules:
- Use topicId values verbatim from the catalog you are given.
- Recommend topics with HIGH weakness × HIGH importance first.
- Pick `suggestedFormat` carefully:
  - LECTURE for foundational gaps (cohort EWA < 0.3)
  - DRILL for known-but-not-fluent (EWA 0.3-0.55)
  - DISCUSSION for conceptual nuance (EWA 0.55-0.7)
  - REVISION for high-EWA topics with recent decay
  - MOCK_SLICE for exam-heavy topics already at moderate mastery
- Tight prose. Speak like a coach who's seen 500 cohorts."""


async def recommend(cohort_id: str, exam_id: str | None = None) -> dict[str, Any]:
    weakness_rows = await _fetch_cohort_weakness(cohort_id)
    importance = await _fetch_importance_map(exam_id) if exam_id else {}

    scored = _score_topics(weakness_rows, importance)
    if not scored:
        return {
            "cohortId": cohort_id,
            "headline": "Not enough activity yet.",
            "diagnosis": "No mastery data for this cohort yet — assign a quick diagnostic to seed the recommender.",
            "recommendations": [],
            "encouragement": "Run a 10-question diagnostic and the recommender will populate.",
            "source": "empty",
        }

    user_payload = _format_prompt(cohort_id, scored)
    plan = await llm.call_structured(
        system=SYSTEM_PROMPT,
        user=user_payload,
        schema_name="lesson_plan",
        schema=LESSON_PLAN_SCHEMA,
    )
    if plan is not None:
        plan["cohortId"] = cohort_id
        plan["source"] = "ai"
        return plan

    return _heuristic_plan(cohort_id, scored)


async def _fetch_cohort_weakness(cohort_id: str) -> list[dict[str, Any]]:
    """[ {topicId, topicTitle, avgEwa, nStudents}, ... ] sorted weakest first.

    AP-01 — fetch cohort members from institution first, then ask engagement
    to roll up mastery for that user list. Avoids the broken cross-schema
    join in /analytics/cohorts/{cid}/topic-heatmap.
    """
    inst = settings.institution_base_url.rstrip("/")
    members_url = f"{inst}/institution/cohorts/{cohort_id}/members"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as c:
        try:
            r = await c.get(members_url)
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning(
                "lesson_recommender.members_fetch_failed",
                error=str(e),
                cohort_id=cohort_id,
            )
            return []
    members = r.json() if isinstance(r.json(), list) else []
    user_ids = [m["userId"] for m in members if m.get("role") == "STUDENT"]
    if not user_ids:
        return []

    analytics = settings.analytics_base_url.rstrip("/")
    agg_url = f"{analytics}/analytics/topic-mastery-aggregate"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as c:
        try:
            ar = await c.post(agg_url, json={"userIds": user_ids})
            ar.raise_for_status()
        except httpx.HTTPError as e:
            log.warning(
                "lesson_recommender.aggregate_fetch_failed",
                error=str(e),
                cohort_id=cohort_id,
            )
            return []
    rows = ar.json().get("topics", [])

    titles = await _fetch_topic_titles([r["topicId"] for r in rows])
    return [
        {
            "topicId": r["topicId"],
            "topicTitle": titles.get(r["topicId"], ""),
            "avgEwa": float(r["avgEwa"]),
            "nStudents": int(r["nStudents"]),
        }
        for r in rows
    ]


async def _fetch_topic_titles(topic_ids: list[str]) -> dict[str, str]:
    if not topic_ids:
        return {}
    base = settings.catalog_base_url.rstrip("/")
    out: dict[str, str] = {}
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as c:
        try:
            r = await c.get(
                f"{base}/catalog/topics",
                params={"ids": ",".join(topic_ids)},
            )
            if r.status_code == 200:
                for t in r.json():
                    out[str(t.get("id"))] = t.get("title", "")
        except httpx.HTTPError as e:
            log.warning("lesson_recommender.titles_fetch_failed", error=str(e))
    return out


async def _fetch_importance_map(exam_id: str) -> dict[str, dict[str, Any]]:
    """{topicId: {weight, source, confidence}}"""
    base = settings.catalog_base_url.rstrip("/")
    url = f"{base}/catalog/topic-importance"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as c:
        try:
            r = await c.get(url, params={"examId": exam_id, "includeHidden": "false"})
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("lesson_recommender.importance_fetch_failed", error=str(e), exam_id=exam_id)
            return {}
    out: dict[str, dict[str, Any]] = {}
    for t in r.json().get("topics", []):
        out[t["topicId"]] = {
            "weight": float(t.get("weight") or 0.0),
            "source": t.get("source") or "uniform",
            "confidence": float(t.get("confidence") or 0.0),
        }
    return out


def _score_topics(
    weakness_rows: list[dict[str, Any]],
    importance: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    scored = []
    for r in weakness_rows:
        tid = r.get("topicId")
        if not tid:
            continue
        avg_ewa = float(r.get("avgEwa") or 0.0)
        n_students = int(r.get("nStudents") or 0)
        if n_students < 1:
            continue
        weakness = 1.0 - avg_ewa
        imp = importance.get(tid, {"weight": 0.5, "source": "uniform", "confidence": 0.0})
        score = round(weakness * float(imp["weight"]), 4)
        scored.append({
            "topicId": tid,
            "topicTitle": r.get("topicTitle") or "",
            "avgEwa": round(avg_ewa, 4),
            "nStudents": n_students,
            "weakness": round(weakness, 4),
            "importance": round(float(imp["weight"]), 4),
            "importanceSource": imp["source"],
            "importanceConfidence": round(float(imp["confidence"]), 4),
            "score": score,
        })
    scored.sort(key=lambda r: -r["score"])
    return scored


def _format_prompt(cohort_id: str, scored: list[dict[str, Any]]) -> str:
    lines = [
        f"Cohort: {cohort_id}",
        "",
        "Weakness × Importance ranking (topicId | title | avgEwa | nStudents | importance | source | score):",
    ]
    for r in scored[:20]:
        lines.append(
            f"- {r['topicId']} | {r['topicTitle']} | ewa={r['avgEwa']:.2f} "
            f"| n={r['nStudents']} | imp={r['importance']:.2f} ({r['importanceSource']}) "
            f"| score={r['score']:.2f}"
        )
    lines.append("")
    lines.append("Task: Pick the top 3 topics for the next class.")
    return "\n".join(lines)


def _suggested_format(avg_ewa: float) -> str:
    if avg_ewa < 0.30:
        return "LECTURE"
    if avg_ewa < 0.55:
        return "DRILL"
    if avg_ewa < 0.70:
        return "DISCUSSION"
    return "REVISION"


def _heuristic_plan(cohort_id: str, scored: list[dict[str, Any]]) -> dict[str, Any]:
    top = scored[:_TOP_K]
    if not top:
        return {
            "cohortId": cohort_id,
            "headline": "Not enough data.",
            "diagnosis": "Heatmap empty — assign a diagnostic to seed the recommender.",
            "recommendations": [],
            "encouragement": "",
            "source": "heuristic",
        }
    weakest = top[0]
    diagnosis = (
        f"{weakest['topicTitle']} is the cohort's weakest spot at avg EWA "
        f"{weakest['avgEwa']:.2f} across {weakest['nStudents']} students, and "
        f"its exam weight is {weakest['importance']:.2f}. Address it first."
    )
    recommendations = []
    for i, r in enumerate(top, start=1):
        fmt = _suggested_format(r["avgEwa"])
        est = {"LECTURE": 50, "DRILL": 35, "DISCUSSION": 30, "REVISION": 20}[fmt]
        recommendations.append({
            "topicId": r["topicId"],
            "topicTitle": r["topicTitle"],
            "rank": i,
            "rationale": (
                f"Cohort avg EWA {r['avgEwa']:.2f} × exam importance "
                f"{r['importance']:.2f} = score {r['score']:.2f}."
            ),
            "suggestedFormat": fmt,
            "estMinutes": est,
        })
    return {
        "cohortId": cohort_id,
        "headline": f"Lead with {weakest['topicTitle']} — biggest weakness × importance gap.",
        "diagnosis": diagnosis,
        "recommendations": recommendations,
        "encouragement": "Tight focus on the top 3 will move the needle more than broad coverage.",
        "source": "heuristic",
    }
