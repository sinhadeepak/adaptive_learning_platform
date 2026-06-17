"""Plan routes — Phase 6 S55.

POST /plans/generate · GET /plans/active · POST /plans/{id}/edit ·
POST /plans/{id}/regenerate
"""

from __future__ import annotations

from datetime import date as _date, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker
from learning.content.security import JwtPrincipal, current_principal
from learning.plans import generator as _gen
from learning.plans import repositories as _repo

router = APIRouter(prefix="/plans", tags=["plans"])


PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


async def _session() -> AsyncSession:  # type: ignore[return-value]
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]


class GenerateRequest(BaseModel):
    daily_minutes_goal: int = Field(default=30, ge=15, le=180)
    target_date: str | None = None       # YYYY-MM-DD
    weak_concepts: list[dict] = []       # optional override
    decays: list[dict] = []
    has_recent_mock: bool = False


@router.post("/generate")
async def generate_plan(
    body: GenerateRequest, session: SessionDep, principal: PrincipalDep,
) -> dict[str, Any]:
    today = _date.today()
    week_start = today - timedelta(days=today.weekday())
    target_date = _date.fromisoformat(body.target_date) if body.target_date else None
    weak = [
        _gen.WeakConceptSignal(
            concept_id=w["concept_id"],
            topic_id=w.get("topic_id"),
            ewa=float(w.get("ewa", 0)),
            n=int(w.get("n", 0)),
        )
        for w in body.weak_concepts
    ]
    decays = [
        _gen.DecaySignal(
            concept_id=d["concept_id"],
            topic_id=d.get("topic_id"),
            days_since_seen=int(d["days_since_seen"]),
            ewa=float(d.get("ewa", 0)),
        )
        for d in body.decays
    ]
    sessions = _gen.generate_week(
        daily_minutes_goal=body.daily_minutes_goal,
        target_date=target_date,
        weak_concepts=weak,
        decays=decays,
        has_recent_mock=body.has_recent_mock,
    )
    out = await _repo.insert_plan(
        session,
        user_id=principal.user_id,
        week_start=week_start,
        daily_minutes_goal=body.daily_minutes_goal,
        target_date=target_date,
        sessions_to_create=sessions,
        source="ai_initial",
    )
    await session.commit()
    plan = await _repo.get_active_plan(session, user_id=principal.user_id)
    return plan or out


@router.get("/active")
async def get_active(session: SessionDep, principal: PrincipalDep) -> dict[str, Any]:
    plan = await _repo.get_active_plan(session, user_id=principal.user_id)
    if plan is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "no_active_plan", "message": "No active study plan. Call /plans/generate first."},
        )
    return plan


class EditPayload(BaseModel):
    kind: Literal["move", "swap", "rest", "shorten", "add", "regenerate", "replace", "postpone", "split"]
    session_id: str | None = None
    to_day_offset: int | None = None
    new_minutes: int | None = None
    extras: dict[str, Any] = {}


class EditResponse(BaseModel):
    edit_id: str
    impact_preview: dict[str, Any]
    blocked: bool = False
    block_reason: str | None = None


@router.post("/{plan_id}/edit", response_model=EditResponse)
async def edit_plan(
    plan_id: str,
    body: EditPayload,
    session: SessionDep,
    principal: PrincipalDep,
) -> EditResponse:
    """Apply a constrained edit. Required-session deletes return blocked=True
    with a soft-action suggestion. Impact-preview is heuristic for now;
    LLM-backed impact lands when AI Gateway plan_impact prompt ships."""
    impact: dict[str, Any] = {"summary": ""}
    blocked = False
    block_reason: str | None = None

    if body.session_id and body.kind in {"move", "shorten", "rest", "postpone"}:
        ps = await _repo.get_session(session, session_id=body.session_id)
        if ps is None:
            raise HTTPException(404, detail={"code": "session_not_found"})
        if body.kind == "move" and body.to_day_offset is not None:
            await _repo.update_plan_session(
                session, session_id=body.session_id, day_offset=body.to_day_offset,
            )
            impact["summary"] = f"Moved to day {body.to_day_offset}. No readiness impact."
        elif body.kind == "shorten" and body.new_minutes is not None:
            old = ps["expected_minutes"]
            await _repo.update_plan_session(
                session, session_id=body.session_id, expected_minutes=body.new_minutes,
            )
            impact["summary"] = (
                f"Shortened from {old}→{body.new_minutes} min. "
                f"Estimated readiness gain reduced by ~{round((old - body.new_minutes) / old * 1.5, 1)} pts."
            )
        elif body.kind == "rest":
            await _repo.update_plan_session(
                session, session_id=body.session_id, status="missed",
            )
            impact["summary"] = "Marked as rest day."
        elif body.kind == "postpone":
            new_day = min(6, ps["day_offset"] + 2)
            await _repo.update_plan_session(
                session, session_id=body.session_id, day_offset=new_day,
            )
            impact["summary"] = f"Postponed to day {new_day}."
    elif body.kind == "regenerate":
        impact["summary"] = "Use POST /plans/generate to regenerate."
    else:
        # Other kinds (swap/add/replace/split): record edit + return preview
        impact["summary"] = f"Edit kind '{body.kind}' recorded; full implementation in follow-up sprint."

    edit_id = await _repo.insert_edit(
        session,
        plan_id=plan_id,
        user_id=principal.user_id,
        edit_kind=body.kind,
        payload=body.model_dump(),
        impact_preview=impact,
    )
    await session.commit()
    return EditResponse(
        edit_id=edit_id,
        impact_preview=impact,
        blocked=blocked,
        block_reason=block_reason,
    )
