"""Six-level hierarchical drill query layer.

Tenant → Exam → Subject → Topic → Concept → Student

Each drill function returns a list of dicts already shaped for the API
response. Queries reuse `analytics_schema.mv_drill_topic` (the
materialised view from migration 018) where possible, falling back to
`analytics_schema.mastery` directly when finer-grained filters don't
match the MV grouping.

Topic → subject → exam → subjects mapping is fetched via HTTP from the
learning service (AP-01 cross-service pattern; same as cohort_leaderboard).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from engagement.analytics.config import settings
from engagement.analytics.scope import ScopeFilter

log = logging.getLogger(__name__)


# ── Tenant-list level ─────────────────────────────────────────────────


async def drill_tenants(
    session: AsyncSession, scope: ScopeFilter
) -> list[dict[str, Any]]:
    """Return tenants with rolled-up stats. PLATFORM mode lists all
    tenants; TENANT mode returns just the one."""
    if scope.mode not in ("PLATFORM", "TENANT"):
        return []
    where = "tenant_id IS NOT NULL"
    params: dict[str, Any] = {}
    if scope.mode == "TENANT" and scope.tenant_ids:
        where += " AND tenant_id = ANY(CAST(:tids AS uuid[]))"
        params["tids"] = list(scope.tenant_ids)

    rows = (
        await session.execute(
            text(
                f"""
                SELECT tenant_id::text AS tenant_id,
                       SUM(n_students)::int        AS n_students_topic_sum,
                       AVG(avg_ewa)::real          AS avg_ewa,
                       AVG(weak_pct)::real         AS avg_weak_pct,
                       MAX(last_activity)          AS last_activity
                  FROM analytics_schema.mv_drill_topic
                 WHERE {where}
              GROUP BY tenant_id
              ORDER BY tenant_id
                """
            ),
            params,
        )
    ).mappings().all()
    return [dict(r) for r in rows]


# ── Tenant → exams ────────────────────────────────────────────────────


async def drill_exams(
    session: AsyncSession, tenant_id: str, scope: ScopeFilter
) -> list[dict[str, Any]]:
    """For a tenant, list exams attempted by its users. Resolves
    topic→exam via learning catalog (HTTP). Cold-start friendly."""
    user_ids = await _scope_user_ids(session, scope, tenant_id)
    if not user_ids:
        return []
    rows = (
        await session.execute(
            text(
                """
                SELECT topic_id::text AS topic_id,
                       AVG(ewa)::real AS avg_ewa,
                       COUNT(DISTINCT user_id)::int AS n_students
                  FROM analytics_schema.mastery
                 WHERE user_id = ANY(CAST(:uids AS uuid[]))
              GROUP BY topic_id
                """
            ),
            {"uids": list(user_ids)},
        )
    ).mappings().all()
    by_topic = {r["topic_id"]: dict(r) for r in rows}
    if not by_topic:
        return []

    topic_meta = await _topic_to_subject_exam(list(by_topic.keys()))
    by_exam: dict[str, dict[str, Any]] = {}
    for tid, row in by_topic.items():
        meta = topic_meta.get(tid)
        if not meta or not meta.get("exam_id"):
            continue
        eid = meta["exam_id"]
        slot = by_exam.setdefault(
            eid,
            {
                "exam_id": eid,
                "exam_name": meta.get("exam_name"),
                "exam_code": meta.get("exam_code"),
                "n_students": 0,
                "avg_ewa_acc": 0.0,
                "n_topics": 0,
            },
        )
        slot["n_students"] = max(slot["n_students"], row["n_students"])
        slot["avg_ewa_acc"] += row["avg_ewa"] or 0.0
        slot["n_topics"] += 1

    out = []
    for slot in by_exam.values():
        avg = slot["avg_ewa_acc"] / max(1, slot["n_topics"])
        out.append({
            "examId": slot["exam_id"],
            "examName": slot["exam_name"],
            "examCode": slot["exam_code"],
            "studentCount": slot["n_students"],
            "avgReadiness": round(avg, 4),
        })
    return sorted(out, key=lambda x: -x["avgReadiness"])


# ── Exam → subjects ────────────────────────────────────────────────────


async def drill_subjects(
    session: AsyncSession,
    tenant_id: str,
    exam_id: str,
    scope: ScopeFilter,
    importance_map: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Per-subject rollup for an exam, importance-weighted readiness."""
    user_ids = await _scope_user_ids(session, scope, tenant_id)
    if not user_ids:
        return []
    topic_meta = await _exam_topics_with_subject(exam_id)
    topic_ids = list(topic_meta.keys())
    if not topic_ids:
        return []

    rows = (
        await session.execute(
            text(
                """
                SELECT topic_id::text AS topic_id,
                       AVG(ewa)::real AS avg_ewa,
                       COUNT(DISTINCT user_id)::int AS n_students,
                       (COUNT(*) FILTER (WHERE ewa < 0.4))::real
                          / NULLIF(COUNT(*), 0)::real AS weak_pct
                  FROM analytics_schema.mastery
                 WHERE user_id = ANY(CAST(:uids AS uuid[]))
                   AND topic_id = ANY(CAST(:tids AS uuid[]))
              GROUP BY topic_id
                """
            ),
            {"uids": list(user_ids), "tids": topic_ids},
        )
    ).mappings().all()
    topic_stats = {r["topic_id"]: dict(r) for r in rows}

    by_subject: dict[str, dict[str, Any]] = {}
    for tid, meta in topic_meta.items():
        sid = meta["subject_id"]
        slot = by_subject.setdefault(
            sid,
            {
                "subject_id": sid,
                "subject_name": meta.get("subject_name"),
                "n_students": 0,
                "avg_ewa_acc": 0.0,
                "weighted_ewa_acc": 0.0,
                "weight_sum": 0.0,
                "topic_count": 0,
                "weak_pct_acc": 0.0,
            },
        )
        s = topic_stats.get(tid, {})
        slot["topic_count"] += 1
        slot["n_students"] = max(slot["n_students"], int(s.get("n_students") or 0))
        slot["avg_ewa_acc"] += float(s.get("avg_ewa") or 0.0)
        slot["weak_pct_acc"] += float(s.get("weak_pct") or 0.0)
        if importance_map:
            iw = importance_map.get(tid)
            if iw:
                slot["weighted_ewa_acc"] += iw.weight * float(s.get("avg_ewa") or 0.0)
                slot["weight_sum"] += iw.weight

    out = []
    for slot in by_subject.values():
        n = max(1, slot["topic_count"])
        avg = slot["avg_ewa_acc"] / n
        importance_weighted = (
            slot["weighted_ewa_acc"] / slot["weight_sum"]
            if slot["weight_sum"] > 0 else avg
        )
        out.append({
            "subjectId": slot["subject_id"],
            "subjectName": slot["subject_name"],
            "studentCount": slot["n_students"],
            "avgReadiness": round(avg, 4),
            "importanceWeightedReadiness": round(importance_weighted, 4),
            "weakPct": round(slot["weak_pct_acc"] / n, 4),
            "topicCount": slot["topic_count"],
        })
    return sorted(out, key=lambda x: x["importanceWeightedReadiness"])


# ── Subject → topics ───────────────────────────────────────────────────


async def drill_topics(
    session: AsyncSession,
    tenant_id: str,
    exam_id: str,
    subject_id: str,
    scope: ScopeFilter,
    importance_map: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Per-topic rollup within a subject."""
    user_ids = await _scope_user_ids(session, scope, tenant_id)
    if not user_ids:
        return []
    topic_meta = await _exam_topics_with_subject(exam_id)
    topic_ids = [tid for tid, m in topic_meta.items() if m["subject_id"] == subject_id]
    if not topic_ids:
        return []

    rows = (
        await session.execute(
            text(
                """
                SELECT topic_id::text AS topic_id,
                       AVG(ewa)::real AS avg_ewa,
                       COUNT(DISTINCT user_id)::int AS n_students,
                       (COUNT(*) FILTER (WHERE ewa < 0.4))::real
                          / NULLIF(COUNT(*), 0)::real AS weak_pct
                  FROM analytics_schema.mastery
                 WHERE user_id = ANY(CAST(:uids AS uuid[]))
                   AND topic_id = ANY(CAST(:tids AS uuid[]))
              GROUP BY topic_id
                """
            ),
            {"uids": list(user_ids), "tids": topic_ids},
        )
    ).mappings().all()
    stats = {r["topic_id"]: dict(r) for r in rows}

    out = []
    for tid in topic_ids:
        meta = topic_meta[tid]
        s = stats.get(tid, {})
        iw = (importance_map or {}).get(tid)
        out.append({
            "topicId": tid,
            "topicTitle": meta.get("topic_title"),
            "studentCount": int(s.get("n_students") or 0),
            "avgReadiness": round(float(s.get("avg_ewa") or 0.0), 4),
            "weakPct": round(float(s.get("weak_pct") or 0.0), 4),
            "importance": (
                {
                    "weight": iw.weight,
                    "source": iw.source,
                    "confidence": iw.confidence,
                    "hidden": iw.hidden,
                }
                if iw else None
            ),
        })
    # Sort: importance DESC if present, else avgReadiness ASC (weakest first)
    if importance_map:
        out.sort(key=lambda x: -(x["importance"]["weight"] if x["importance"] else 0))
    else:
        out.sort(key=lambda x: x["avgReadiness"])
    return out


# ── Topic → concepts (with sparse Bloom matrix) ───────────────────────


async def drill_concepts(
    session: AsyncSession,
    tenant_id: str,
    topic_id: str,
    scope: ScopeFilter,
) -> list[dict[str, Any]]:
    """Per-concept rollup with sparse Bloom matrix overlay."""
    user_ids = await _scope_user_ids(session, scope, tenant_id)
    if not user_ids:
        return []
    # Concept rows
    concept_rows = (
        await session.execute(
            text(
                """
                SELECT cm.concept_id::text AS concept_id,
                       AVG(cm.ewa)::real AS avg_ewa,
                       COUNT(DISTINCT cm.user_id)::int AS n_students
                  FROM analytics_schema.concept_mastery cm
                  JOIN dblink(
                    'host=postgres dbname=learning user=postgres password=postgres',
                    'SELECT id::text, parent_topic_id::text, title FROM catalog_schema.concepts'
                  ) AS c(concept_id text, parent_topic_id text, title text)
                       ON c.concept_id = cm.concept_id::text
                 WHERE cm.user_id = ANY(CAST(:uids AS uuid[]))
                   AND c.parent_topic_id = :tid
              GROUP BY cm.concept_id
                """
            ),
            {"uids": list(user_ids), "tid": topic_id},
        )
    ).mappings().all()

    if not concept_rows:
        return []

    concept_ids = [r["concept_id"] for r in concept_rows]

    # Sparse bloom matrix — only cells with n>=3
    bloom_rows = (
        await session.execute(
            text(
                """
                SELECT concept_id::text AS concept_id, bloom_level,
                       AVG(ewa)::real AS avg_ewa, SUM(n)::int AS total_n
                  FROM analytics_schema.bloom_mastery
                 WHERE user_id = ANY(CAST(:uids AS uuid[]))
                   AND concept_id = ANY(CAST(:cids AS uuid[]))
              GROUP BY concept_id, bloom_level
                HAVING SUM(n) >= 3
                """
            ),
            {"uids": list(user_ids), "cids": concept_ids},
        )
    ).mappings().all()

    bloom_by_concept: dict[str, dict[str, dict[str, Any]]] = {}
    for r in bloom_rows:
        bloom_by_concept.setdefault(r["concept_id"], {})[r["bloom_level"]] = {
            "avgEwa": round(float(r["avg_ewa"]), 4),
            "n": int(r["total_n"]),
        }

    # Concept titles via dblink (we already JOINed but need the title)
    title_rows = (
        await session.execute(
            text(
                """
                SELECT * FROM dblink(
                  'host=postgres dbname=learning user=postgres password=postgres',
                  'SELECT id::text, title FROM catalog_schema.concepts WHERE parent_topic_id = ''' || :tid || ''''
                ) AS c(id text, title text)
                """
            ),
            {"tid": topic_id},
        )
    ).all()
    titles = {r[0]: r[1] for r in title_rows}

    out = []
    for r in concept_rows:
        cid = r["concept_id"]
        out.append({
            "conceptId": cid,
            "conceptTitle": titles.get(cid),
            "studentCount": int(r["n_students"]),
            "avgReadiness": round(float(r["avg_ewa"]), 4),
            "bloomMatrix": bloom_by_concept.get(cid, {}),
        })
    return sorted(out, key=lambda x: x["avgReadiness"])


# ── Topic → students (leaf) ───────────────────────────────────────────


async def drill_students(
    session: AsyncSession,
    tenant_id: str,
    topic_id: str,
    scope: ScopeFilter,
    limit: int = 50,
    cursor_ewa: float | None = None,
    cursor_user_id: str | None = None,
) -> list[dict[str, Any]]:
    """Leaf-level: per-student mastery on a specific topic."""
    if scope.mode == "STUDENT":
        return []  # use /student-self/topic/{tid} instead
    user_ids = await _scope_user_ids(session, scope, tenant_id)
    if not user_ids:
        return []
    where = ["m.user_id = ANY(CAST(:uids AS uuid[]))", "m.topic_id = :tid"]
    params: dict[str, Any] = {"uids": list(user_ids), "tid": topic_id, "lim": limit}
    if cursor_ewa is not None and cursor_user_id is not None:
        where.append("(m.ewa, m.user_id::text) < (:cewa, :cuid)")
        params["cewa"] = cursor_ewa
        params["cuid"] = cursor_user_id
    rows = (
        await session.execute(
            text(
                f"""
                SELECT m.user_id::text AS user_id,
                       m.ewa, m.n,
                       m.updated_at AS last_active_at
                  FROM analytics_schema.mastery m
                 WHERE {' AND '.join(where)}
              ORDER BY m.ewa DESC, m.user_id::text DESC
                 LIMIT :lim
                """
            ),
            params,
        )
    ).mappings().all()
    return [
        {
            "userId": r["user_id"],
            "ewa": round(float(r["ewa"]), 4),
            "n": int(r["n"]),
            "lastActiveAt": r["last_active_at"].isoformat() if r["last_active_at"] else None,
            "isWeak": float(r["ewa"]) < 0.4,
        }
        for r in rows
    ]


# ── Cold-start helper ─────────────────────────────────────────────────


def synthetic_curve(exam_code: str | None = None) -> dict[str, Any]:
    """Cheap projection — placeholder distribution when a tenant has no
    students yet. UI watermarks this as 'Projected'. Real implementation
    would average across neighbour-tenant historical curves; for v1 we
    return a neutral baseline."""
    return {
        "type": "synthetic",
        "exam_code": exam_code,
        "subjects": [
            {"name": "Subject A", "expectedAvgReadiness": 0.45},
            {"name": "Subject B", "expectedAvgReadiness": 0.50},
            {"name": "Subject C", "expectedAvgReadiness": 0.42},
        ],
        "note": "Projected baseline — real curves will appear once 5+ students enroll.",
    }


# ── Internal: scope → user_ids ────────────────────────────────────────


async def _scope_user_ids(
    session: AsyncSession, scope: ScopeFilter, tenant_id: str
) -> list[str]:
    if scope.mode == "STUDENT":
        return list(scope.user_ids)
    if scope.mode == "COHORTS":
        return list(scope.user_ids)
    if scope.mode == "TENANT":
        # Already pinned to tenant.
        rows = (
            await session.execute(
                text(
                    """
                    SELECT user_id::text FROM dblink(
                      'host=postgres dbname=identity user=postgres password=postgres',
                      'SELECT user_id::text FROM institution_schema.user_tenant_memberships
                        WHERE tenant_id = ''' || :tid || ''''
                    ) AS m(user_id text)
                    """
                ),
                {"tid": tenant_id},
            )
        ).all()
        return [r[0] for r in rows]
    if scope.mode == "PLATFORM":
        rows = (
            await session.execute(
                text(
                    """
                    SELECT user_id::text FROM dblink(
                      'host=postgres dbname=identity user=postgres password=postgres',
                      'SELECT user_id::text FROM institution_schema.user_tenant_memberships
                        WHERE tenant_id = ''' || :tid || ''''
                    ) AS m(user_id text)
                    """
                ),
                {"tid": tenant_id},
            )
        ).all()
        return [r[0] for r in rows]
    return []


# ── Internal: catalog HTTP fetches ────────────────────────────────────


async def _topic_to_subject_exam(topic_ids: list[str]) -> dict[str, dict[str, Any]]:
    """Fetch topic→subject→exam mapping in bulk from learning catalog."""
    if not topic_ids:
        return {}
    base = settings.learning_base_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(
                f"{base}/catalog/topics/bulk",
                params=[("ids", t) for t in topic_ids],
            )
            if r.status_code != 200:
                return {}
            data = r.json()
            # The bulk endpoint returns {"topics": [...]} (current
            # contract). Older code paths used {"items": [...]} — accept
            # both for forward-compat.
            items = data.get("topics") or data.get("items") or []
            return {t["id"]: {
                "subject_id": t.get("subjectId"),
                "subject_name": t.get("subjectName"),
                "exam_id": t.get("examId"),
                "exam_code": t.get("examCode"),
                "exam_name": t.get("examName"),
                "topic_title": t.get("title"),
            } for t in items}
    except httpx.HTTPError as exc:
        log.warning("_topic_to_subject_exam failed: %s", exc)
        return {}


async def _exam_topics_with_subject(exam_id: str) -> dict[str, dict[str, Any]]:
    """All topics in an exam with subject metadata, fetched via HTTP from
    the learning catalog's bulk endpoint."""
    base = settings.learning_base_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{base}/catalog/exams/{exam_id}/subjects-with-topics")
            if r.status_code == 200:
                return {
                    t["id"]: {
                        "subject_id": t.get("subjectId"),
                        "subject_name": t.get("subjectName"),
                        "topic_title": t.get("title"),
                    }
                    for t in r.json().get("topics", [])
                }
    except httpx.HTTPError as exc:
        log.warning("_exam_topics_with_subject HTTP failed: %s", exc)
    return {}
