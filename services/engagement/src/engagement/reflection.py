"""Reflection + commitment routes — Phase 6 S57 / UX-27."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from engagement.analytics.db import sessionmaker

reflection_router = APIRouter()

SCHEMA = "analytics_schema"


class ReflectionIn(BaseModel):
    user_id: str
    trigger: Literal["session", "mock", "weekly"]
    trigger_artifact_id: str | None = None
    prompt_id: str = Field(default="default_prompt", max_length=80)
    response: str | None = Field(default=None, max_length=2000)
    commitment: str | None = Field(default=None, max_length=400)
    commitment_due_at: str | None = None       # ISO timestamp


@reflection_router.post("/reflections", status_code=201)
async def post_reflection(body: ReflectionIn) -> dict:
    rid = str(uuid4())
    async with sessionmaker()() as s:
        cstatus = "pending" if body.commitment else None
        await s.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.reflections_commitments
                  (id, user_id, trigger, trigger_artifact_id, prompt_id,
                   response, commitment, commitment_due_at, commitment_status)
                VALUES
                  (CAST(:id AS uuid), CAST(:uid AS uuid), :tr,
                   CAST(:taid AS uuid), :pid, :resp, :commit,
                   CAST(:due AS timestamptz),
                   :cstatus)
                """
            ),
            {
                "id": rid,
                "uid": body.user_id,
                "tr": body.trigger,
                "taid": body.trigger_artifact_id,
                "pid": body.prompt_id,
                "resp": body.response,
                "commit": body.commitment,
                "due": body.commitment_due_at,
                "cstatus": cstatus,
            },
        )
        await s.commit()
    return {"id": rid, "trigger": body.trigger, "commitment_status": "pending" if body.commitment else None}


class CheckInIn(BaseModel):
    kept: bool
    note: str | None = Field(default=None, max_length=400)


@reflection_router.post("/commitments/{rid}/check-in")
async def check_in(rid: str, body: CheckInIn) -> dict:
    new_status = "kept" if body.kept else "missed"
    async with sessionmaker()() as s:
        res = await s.execute(
            text(
                f"""
                UPDATE {SCHEMA}.reflections_commitments
                   SET commitment_status = :st,
                       check_in_response = :note,
                       last_check_in_at = now()
                 WHERE id = CAST(:id AS uuid) AND commitment_status = 'pending'
             RETURNING id, commitment_status
                """
            ),
            {"id": rid, "st": new_status, "note": body.note},
        )
        row = res.mappings().first()
        if row is None:
            raise HTTPException(404, detail={"code": "not_found_or_already_decided"})
        await s.commit()
    return {"id": str(row["id"]), "commitment_status": row["commitment_status"]}


@reflection_router.get("/commitments/{user_id}")
async def list_commitments(user_id: str, status: str | None = None):
    where = ["user_id = CAST(:uid AS uuid)", "commitment IS NOT NULL"]
    params = {"uid": user_id}
    if status:
        where.append("commitment_status = :st")
        params["st"] = status
    async with sessionmaker()() as s:
        res = await s.execute(
            text(
                f"""
                SELECT id, trigger, prompt_id, commitment,
                       commitment_due_at, commitment_status,
                       occurred_at, last_check_in_at
                  FROM {SCHEMA}.reflections_commitments
                 WHERE {' AND '.join(where)}
              ORDER BY occurred_at DESC
                """
            ),
            params,
        )
        items = []
        for row in res.mappings():
            items.append({
                "id": str(row["id"]),
                "trigger": row["trigger"],
                "prompt_id": row["prompt_id"],
                "commitment": row["commitment"],
                "due_at": row["commitment_due_at"].isoformat() if row["commitment_due_at"] else None,
                "status": row["commitment_status"],
                "occurred_at": row["occurred_at"].isoformat(),
                "last_check_in_at": row["last_check_in_at"].isoformat() if row["last_check_in_at"] else None,
            })
    return {"user_id": user_id, "items": items}
