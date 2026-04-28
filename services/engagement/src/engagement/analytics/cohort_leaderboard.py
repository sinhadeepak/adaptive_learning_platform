# ruff: noqa: S608 - schema name is a hardcoded constant
"""Sprint 9 L-1 — Cohort leaderboard.

Educator-facing endpoint: rank the students in a cohort by GLOBAL
readiness score so the educator can see who's strong, who's developing,
and who's at risk in one glance.

Cross-schema concern: cohort_members live in institution_schema (owned
by Institution), readiness lives in analytics_schema. The Phase-1 pattern
is HTTP-call-then-batch-DB-query, NOT cross-schema SQL JOIN — schemas are
service-owned (AP-01).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from engagement.analytics.config import settings

log = logging.getLogger(__name__)

SCHEMA = "analytics_schema"


async def fetch_cohort_members(cohort_id: str) -> list[dict[str, Any]]:
    """Hit Institution's cohort-members endpoint. Returns members with
    role attached (so the leaderboard can dim LEAD_TEACHER rows or hide
    them entirely)."""
    base = settings.institution_base_url.rstrip("/")
    url = f"{base}/institution/cohorts/{cohort_id}/members"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(url)
        if r.status_code != 200:
            log.warning("fetch_cohort_members %s → %s", cohort_id, r.status_code)
            return []
        body = r.json()
        return [
            {"userId": m["userId"], "role": m.get("role", "STUDENT")} for m in body
        ]
    except Exception as err:  # noqa: BLE001
        log.warning("fetch_cohort_members %s failed: %s", cohort_id, err)
        return []


async def batch_readiness(
    session: AsyncSession, user_ids: list[str], scope: str = "GLOBAL"
) -> dict[str, dict[str, Any]]:
    """Returns {user_id: {score, n_topics, updated_at}} for users who
    have a readiness row. Users not in the result haven't started yet —
    the caller renders them as "not started"."""
    if not user_ids:
        return {}
    res = await session.execute(
        text(
            f"""
            SELECT user_id, score, n_topics, updated_at
              FROM {SCHEMA}.readiness
             WHERE user_id = ANY(:uids) AND scope = :scope
            """
        ),
        {"uids": user_ids, "scope": scope},
    )
    out: dict[str, dict[str, Any]] = {}
    for r in res.mappings().all():
        out[str(r["user_id"])] = {
            "score": float(r["score"] or 0.0),
            "nTopics": int(r["n_topics"] or 0),
            "updatedAt": r["updated_at"].isoformat() if r["updated_at"] else None,
        }
    return out


def rank_leaderboard(
    members: list[dict[str, Any]],
    readiness_by_user: dict[str, dict[str, Any]],
    *,
    include_teachers: bool = False,
) -> list[dict[str, Any]]:
    """Pure-function ranker — extracted so unit tests can pin the contract
    without touching DB or HTTP.

    Sort key: readiness score DESC, then n_topics DESC (someone with
    score=0.6 over 10 topics ranks above score=0.6 over 1 topic), then
    userId ASC for deterministic tie-break."""
    rows: list[dict[str, Any]] = []
    for m in members:
        if not include_teachers and m.get("role") == "LEAD_TEACHER":
            continue
        r = readiness_by_user.get(m["userId"])
        rows.append(
            {
                "userId": m["userId"],
                "role": m.get("role", "STUDENT"),
                "score": r["score"] if r else 0.0,
                "nTopics": r["nTopics"] if r else 0,
                "started": r is not None,
                "updatedAt": (r or {}).get("updatedAt"),
            }
        )
    rows.sort(
        key=lambda x: (-(x["score"]), -(x["nTopics"]), x["userId"]),
    )
    # 1-indexed rank — UI displays it directly.
    for idx, row in enumerate(rows):
        row["rank"] = idx + 1
    return rows
