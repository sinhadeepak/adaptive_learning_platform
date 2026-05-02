"""DB repo for daily_missions."""

from __future__ import annotations

import json
from datetime import date as _date
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "content_schema"


def _row_to_dict(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "user_id": str(r["user_id"]),
        "mission_date": r["mission_date"].isoformat(),
        "kind": r["kind"],
        "concept_id": str(r["concept_id"]) if r["concept_id"] else None,
        "topic_id": str(r["topic_id"]) if r["topic_id"] else None,
        "expected_minutes": int(r["expected_minutes"]),
        "expected_questions": int(r["expected_questions"]),
        "why_picked": r["why_picked"],
        "why_picked_source": r["why_picked_source"],
        "primary_cta": r["primary_cta"],
        "plan_session_id": str(r["plan_session_id"]) if r["plan_session_id"] else None,
        "status": r["status"],
        "started_at": r["started_at"].isoformat() if r["started_at"] else None,
        "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
        "skipped_at": r["skipped_at"].isoformat() if r["skipped_at"] else None,
        "linked_session_id": str(r["linked_session_id"]) if r["linked_session_id"] else None,
        "completion_quality_score": float(r["completion_quality_score"]) if r["completion_quality_score"] is not None else None,
    }


async def get_today(
    session: AsyncSession, *, user_id: str, on_date: _date,
) -> dict[str, Any] | None:
    res = await session.execute(
        text(
            f"""
            SELECT id, user_id, mission_date, kind, concept_id, topic_id,
                   expected_minutes, expected_questions, why_picked,
                   why_picked_source, primary_cta, plan_session_id,
                   status, started_at, completed_at, skipped_at,
                   linked_session_id, completion_quality_score
              FROM {SCHEMA}.daily_missions
             WHERE user_id = CAST(:uid AS uuid) AND mission_date = :d
             LIMIT 1
            """
        ),
        {"uid": user_id, "d": on_date},
    )
    row = res.mappings().first()
    return _row_to_dict(row) if row else None


async def upsert_today(
    session: AsyncSession,
    *,
    user_id: str,
    on_date: _date,
    mission: dict[str, Any],
) -> dict[str, Any]:
    """Insert or return existing mission for the day. Idempotent."""
    mid = str(uuid4())
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.daily_missions
              (id, user_id, mission_date, kind, concept_id, topic_id,
               expected_minutes, expected_questions, why_picked,
               why_picked_source, primary_cta, plan_session_id, status)
            VALUES
              (CAST(:id AS uuid), CAST(:uid AS uuid), :d, :kind,
               CAST(:cid AS uuid), CAST(:tid AS uuid),
               :em, :eq, :why, :wsource,
               CAST(:cta AS jsonb),
               CAST(:psid AS uuid),
               'pending')
            ON CONFLICT (user_id, mission_date) DO NOTHING
            RETURNING id, user_id, mission_date, kind, concept_id, topic_id,
                      expected_minutes, expected_questions, why_picked,
                      why_picked_source, primary_cta, plan_session_id,
                      status, started_at, completed_at, skipped_at,
                      linked_session_id, completion_quality_score
            """
        ),
        {
            "id": mid,
            "uid": user_id,
            "d": on_date,
            "kind": mission["kind"],
            "cid": mission.get("concept_id"),
            "tid": mission.get("topic_id"),
            "em": mission["expected_minutes"],
            "eq": mission["expected_questions"],
            "why": mission["why_picked"],
            "wsource": mission.get("why_picked_source", "heuristic"),
            "cta": json.dumps(mission["primary_cta"]),
            "psid": mission.get("plan_session_id"),
        },
    )
    row = res.mappings().first()
    if row is None:
        # Already existed — read it back
        existing = await get_today(session, user_id=user_id, on_date=on_date)
        return existing  # type: ignore[return-value]
    return _row_to_dict(row)


async def update_status(
    session: AsyncSession,
    *,
    mission_id: str,
    status: str,
    linked_session_id: str | None = None,
    completion_quality_score: float | None = None,
) -> dict[str, Any] | None:
    timestamp_col = {
        "started": "started_at",
        "completed": "completed_at",
        "skipped": "skipped_at",
    }.get(status)
    set_clauses = ["status = :status"]
    params: dict[str, Any] = {"id": mission_id, "status": status}
    if timestamp_col:
        set_clauses.append(f"{timestamp_col} = now()")
    if linked_session_id is not None:
        set_clauses.append("linked_session_id = CAST(:lsid AS uuid)")
        params["lsid"] = linked_session_id
    if completion_quality_score is not None:
        set_clauses.append("completion_quality_score = :cqs")
        params["cqs"] = completion_quality_score

    res = await session.execute(
        text(
            f"""
            UPDATE {SCHEMA}.daily_missions
               SET {', '.join(set_clauses)}
             WHERE id = CAST(:id AS uuid)
         RETURNING id, user_id, mission_date, kind, concept_id, topic_id,
                   expected_minutes, expected_questions, why_picked,
                   why_picked_source, primary_cta, plan_session_id,
                   status, started_at, completed_at, skipped_at,
                   linked_session_id, completion_quality_score
            """
        ),
        params,
    )
    row = res.mappings().first()
    return _row_to_dict(row) if row else None


async def get_last_mission(
    session: AsyncSession, *, user_id: str, before_date: _date,
) -> dict[str, Any] | None:
    res = await session.execute(
        text(
            f"""
            SELECT kind, concept_id
              FROM {SCHEMA}.daily_missions
             WHERE user_id = CAST(:uid AS uuid)
               AND mission_date < :d
          ORDER BY mission_date DESC
             LIMIT 1
            """
        ),
        {"uid": user_id, "d": before_date},
    )
    row = res.mappings().first()
    if row is None:
        return None
    return {
        "kind": row["kind"],
        "concept_id": str(row["concept_id"]) if row["concept_id"] else None,
    }
