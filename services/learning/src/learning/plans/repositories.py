"""DB repo for study_plans + plan_sessions + plan_edits."""

from __future__ import annotations

import json
from datetime import date as _date
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.plans.generator import GeneratedSession

SCHEMA = "content_schema"


def _ps_to_dict(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "plan_id": str(r["plan_id"]),
        "day_offset": int(r["day_offset"]),
        "slot": r["slot"],
        "kind": r["kind"],
        "concept_id": str(r["concept_id"]) if r["concept_id"] else None,
        "topic_id": str(r["topic_id"]) if r["topic_id"] else None,
        "expected_minutes": int(r["expected_minutes"]),
        "expected_questions": int(r["expected_questions"]),
        "is_required": bool(r["is_required"]),
        "locked_reason": r["locked_reason"],
        "status": r["status"],
        "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
        "linked_session_id": str(r["linked_session_id"]) if r["linked_session_id"] else None,
        "position": int(r["position"]),
    }


async def insert_plan(
    session: AsyncSession,
    *,
    user_id: str,
    week_start: _date,
    daily_minutes_goal: int,
    target_date: _date | None,
    sessions_to_create: list[GeneratedSession],
    source: str = "ai_initial",
) -> dict[str, Any]:
    plan_id = str(uuid4())
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.study_plans
              (id, user_id, week_start, target_date, daily_minutes_goal, source)
            VALUES
              (CAST(:id AS uuid), CAST(:uid AS uuid), :ws, :td, :dmg, :src)
            ON CONFLICT (user_id, week_start) DO NOTHING
            """
        ),
        {
            "id": plan_id,
            "uid": user_id,
            "ws": week_start,
            "td": target_date,
            "dmg": daily_minutes_goal,
            "src": source,
        },
    )
    # If insert was a no-op (existing plan for that week), fetch it
    res = await session.execute(
        text(
            f"SELECT id FROM {SCHEMA}.study_plans WHERE user_id = CAST(:uid AS uuid) AND week_start = :ws"
        ),
        {"uid": user_id, "ws": week_start},
    )
    existing = res.mappings().first()
    if existing:
        plan_id = str(existing["id"])

    # Insert sessions
    for s in sessions_to_create:
        await session.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.plan_sessions
                  (plan_id, day_offset, slot, kind, concept_id, topic_id,
                   expected_minutes, expected_questions, is_required,
                   locked_reason, position)
                VALUES
                  (CAST(:pid AS uuid), :do, :slot, :kind,
                   CAST(:cid AS uuid), CAST(:tid AS uuid),
                   :em, :eq, :req, :lr, :pos)
                """
            ),
            {
                "pid": plan_id,
                "do": s.day_offset,
                "slot": s.slot,
                "kind": s.kind,
                "cid": s.concept_id,
                "tid": s.topic_id,
                "em": s.expected_minutes,
                "eq": s.expected_questions,
                "req": s.is_required,
                "lr": s.locked_reason,
                "pos": s.position,
            },
        )
    return {"plan_id": plan_id, "sessions_added": len(sessions_to_create)}


async def get_active_plan(
    session: AsyncSession, *, user_id: str,
) -> dict[str, Any] | None:
    res = await session.execute(
        text(
            f"""
            SELECT id, user_id, week_start, target_date, daily_minutes_goal,
                   source, status, generated_at, last_edited_at
              FROM {SCHEMA}.study_plans
             WHERE user_id = CAST(:uid AS uuid) AND status = 'active'
          ORDER BY week_start DESC LIMIT 1
            """
        ),
        {"uid": user_id},
    )
    row = res.mappings().first()
    if row is None:
        return None
    plan = {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "week_start": row["week_start"].isoformat(),
        "target_date": row["target_date"].isoformat() if row["target_date"] else None,
        "daily_minutes_goal": int(row["daily_minutes_goal"]),
        "source": row["source"],
        "status": row["status"],
    }
    res2 = await session.execute(
        text(
            f"""
            SELECT id, plan_id, day_offset, slot, kind, concept_id, topic_id,
                   expected_minutes, expected_questions, is_required,
                   locked_reason, status, completed_at, linked_session_id, position
              FROM {SCHEMA}.plan_sessions
             WHERE plan_id = CAST(:pid AS uuid)
          ORDER BY day_offset, position
            """
        ),
        {"pid": plan["id"]},
    )
    plan["sessions"] = [_ps_to_dict(r) for r in res2.mappings()]
    return plan


async def get_session(
    session: AsyncSession, *, session_id: str,
) -> dict[str, Any] | None:
    res = await session.execute(
        text(
            f"""
            SELECT id, plan_id, day_offset, slot, kind, concept_id, topic_id,
                   expected_minutes, expected_questions, is_required,
                   locked_reason, status, completed_at, linked_session_id, position
              FROM {SCHEMA}.plan_sessions
             WHERE id = CAST(:sid AS uuid)
            """
        ),
        {"sid": session_id},
    )
    row = res.mappings().first()
    return _ps_to_dict(row) if row else None


async def update_plan_session(
    session: AsyncSession,
    *,
    session_id: str,
    day_offset: int | None = None,
    expected_minutes: int | None = None,
    status: str | None = None,
) -> dict[str, Any] | None:
    set_clauses: list[str] = []
    params: dict[str, Any] = {"sid": session_id}
    if day_offset is not None:
        set_clauses.append("day_offset = :do")
        params["do"] = day_offset
    if expected_minutes is not None:
        set_clauses.append("expected_minutes = :em")
        params["em"] = expected_minutes
    if status is not None:
        set_clauses.append("status = :st")
        params["st"] = status
    if not set_clauses:
        return await get_session(session, session_id=session_id)
    res = await session.execute(
        text(
            f"""
            UPDATE {SCHEMA}.plan_sessions SET {', '.join(set_clauses)}
             WHERE id = CAST(:sid AS uuid)
         RETURNING id, plan_id, day_offset, slot, kind, concept_id, topic_id,
                   expected_minutes, expected_questions, is_required,
                   locked_reason, status, completed_at, linked_session_id, position
            """
        ),
        params,
    )
    row = res.mappings().first()
    return _ps_to_dict(row) if row else None


async def insert_edit(
    session: AsyncSession,
    *,
    plan_id: str,
    user_id: str,
    edit_kind: str,
    payload: dict[str, Any],
    impact_preview: dict[str, Any] | None = None,
) -> str:
    eid = str(uuid4())
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.plan_edits
              (id, plan_id, user_id, edit_kind, payload, impact_preview)
            VALUES
              (CAST(:id AS uuid), CAST(:pid AS uuid), CAST(:uid AS uuid),
               :kind, CAST(:payload AS jsonb),
               CAST(:impact AS jsonb))
            """
        ),
        {
            "id": eid,
            "pid": plan_id,
            "uid": user_id,
            "kind": edit_kind,
            "payload": json.dumps(payload),
            "impact": json.dumps(impact_preview) if impact_preview else None,
        },
    )
    return eid
