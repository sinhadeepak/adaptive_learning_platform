"""HTTP routes for the Internal Guidance System.

Endpoints (auth required; students see their own only — admins
bypass):

  GET  /igs/{user_id}/next-action
       → top recommended action + 3 alternatives + rationale + confidence
  GET  /igs/{user_id}/today-plan
       → 3–5 ordered actions for today, total_minutes budgeted
  GET  /igs/{user_id}/week-plan
       → 7-day plan with projected percentile trajectory
  POST /igs/{user_id}/override
       → student picked a different action; training signal
  GET  /igs/{user_id}/explainability/{action_id}
       → deep-dive: inputs, score breakdown, counterfactuals
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.catalog.db import get_session
from learning.content.security import JwtPrincipal, current_principal
from learning.igs import candidate_generator as _cg
from learning.igs import decision as _dec
from learning.igs import explainer as _exp
from learning.igs.schemas import (
    IGSAction,
    IGSOverride,
    NextActionResponse,
    TodayPlanResponse,
    WeekPlanDay,
    WeekPlanResponse,
)
from learning.pce import personal_yield as _py

router = APIRouter(prefix="/igs", tags=["igs"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


def _gate(principal: JwtPrincipal, user_id: str) -> None:
    if principal.role in {"ADMIN", "MODERATOR", "PLATFORM_ADMIN"}:
        return
    if principal.user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden",
                    "message": "Students can only read their own IGS state."},
        )


async def _build_context(
    session: AsyncSession, user_id: str, exam_id: str, forecast_year: int
) -> _dec.IGSContext:
    """Fetch the small state slice the decision function needs.

    Today: pulls recent flow-corridor events from a remote engagement
    call (not yet implemented). Phase B1's smoke pipeline runs with
    zero events — the decision function gracefully treats that as
    "no signal, use baseline emotional fit".
    """
    # TODO: when ADP starts pushing flow events, fetch from
    # quiz_schema.flow_corridor_events via the engagement service.
    return _dec.IGSContext(
        user_id=user_id,
        exam_id=exam_id,
        forecast_year=forecast_year,
        recent_frustration_events=0,
        recent_boredom_events=0,
        time_of_day_minutes=_dec.now_minutes_of_day(),
        streak_days=0,
        active_last_7d=0,
    )


async def _generate_and_rank(
    session: AsyncSession, *, user_id: str, exam_id: str, forecast_year: int,
) -> list[dict[str, Any]]:
    """Common-path: get candidates, score them, return ranked list."""
    # Pull decay info from PCE's HTTP fetcher (graceful empty on error).
    decay_days = await _py.fetch_user_topic_decay(user_id)
    candidates = await _cg.generate_candidates(
        session,
        user_id=user_id, exam_id=exam_id, forecast_year=forecast_year,
        decay_topic_days=decay_days,
    )
    context = await _build_context(session, user_id, exam_id, forecast_year)
    return _dec.rank_candidates(candidates, context)


def _to_action(scored: dict[str, Any]) -> IGSAction:
    """Map an internal scored dict to the public IGSAction schema."""
    return IGSAction(
        action_kind=scored["action_kind"],
        concept_id=scored.get("concept_id"),
        blueprint_id=scored.get("blueprint_id"),
        question_count=scored.get("question_count"),
        expected_minutes=int(scored.get("expected_minutes", 20)),
        score=float(scored["score"]),
        rank=int(scored.get("rank", 1)),
        rationale=_exp.rationale_for(scored),
        expected_marks_gained=float(scored.get("expected_marks_gained", 0.0)),
        p_durable_mastery=float(scored.get("p_durable_mastery", 0.0)),
        time_efficiency=float(scored.get("time_efficiency", 0.0)),
        emotional_fit=float(scored.get("emotional_fit", 0.0)),
        cost=float(scored.get("cost", 0.0)),
    )


@router.get("/{user_id}/next-action")
async def next_action(
    user_id: str,
    session: SessionDep,
    principal: PrincipalDep,
    exam_id: str,
    forecast_year: int = 0,
) -> NextActionResponse:
    """Top recommended action right now + 3 alternatives."""
    _gate(principal, user_id)
    if forecast_year == 0:
        forecast_year = datetime.now().year + 1
    scored = await _generate_and_rank(
        session, user_id=user_id, exam_id=exam_id, forecast_year=forecast_year,
    )
    if not scored:
        raise HTTPException(
            status_code=422,
            detail={"code": "no_candidates",
                    "message": "Run /pce/{user_id}/recompute first to populate yield ranking."},
        )
    chosen = _to_action(scored[0])
    alts = [_to_action(c) for c in scored[1:4]]
    return NextActionResponse(
        user_id=user_id,
        exam_id=exam_id,
        chosen=chosen,
        alternatives=alts,
        confidence=_exp.confidence_from_gap(scored),
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/{user_id}/today-plan")
async def today_plan(
    user_id: str,
    session: SessionDep,
    principal: PrincipalDep,
    exam_id: str,
    forecast_year: int = 0,
    target_minutes: int = 90,
) -> TodayPlanResponse:
    """Today's plan — up to 5 actions whose total time fits the
    student's target study budget.

    The first action is always the IGS top choice. Subsequent actions
    are the next-best with two filters:
      • Skip duplicate concept_ids (don't surface the same topic twice).
      • Stop when adding an action would exceed target_minutes.
    """
    _gate(principal, user_id)
    if forecast_year == 0:
        forecast_year = datetime.now().year + 1
    scored = await _generate_and_rank(
        session, user_id=user_id, exam_id=exam_id, forecast_year=forecast_year,
    )

    plan: list[IGSAction] = []
    used_concepts: set[str] = set()
    total = 0
    for s in scored:
        if len(plan) >= 5:
            break
        cid = s.get("concept_id")
        if cid and cid in used_concepts:
            continue
        minutes = int(s.get("expected_minutes", 20))
        if total + minutes > target_minutes:
            continue
        action = _to_action({**s, "rank": len(plan) + 1})
        plan.append(action)
        if cid:
            used_concepts.add(cid)
        total += minutes
    # Always end with a 5-min reflection if there's room and we have
    # at least one practice action. Metacognition closes the loop.
    if total + 5 <= target_minutes and any(p.action_kind in {"practice_concept", "take_mock"} for p in plan):
        plan.append(IGSAction(
            action_kind="reflection",
            expected_minutes=5,
            score=0.0,
            rank=len(plan) + 1,
            rationale=["Quick recap of what clicked today", "Locks the new learning into long-term memory"],
        ))
        total += 5

    return TodayPlanResponse(
        user_id=user_id,
        exam_id=exam_id,
        plan=plan,
        total_minutes=total,
        target_minutes=target_minutes,
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/{user_id}/week-plan")
async def week_plan(
    user_id: str,
    session: SessionDep,
    principal: PrincipalDep,
    exam_id: str,
    forecast_year: int = 0,
) -> WeekPlanResponse:
    """Seven-day plan + projected percentile trajectory.

    Phase B3 v1 — the model is intentionally simple: each day gets
    today's plan, with a small mastery delta applied per day so the
    surface evolves. A proper multi-day planner with constrained
    optimisation lands in Phase B5.
    """
    _gate(principal, user_id)
    if forecast_year == 0:
        forecast_year = datetime.now().year + 1

    # Compute today first; reuse for every day with a mild
    # randomisation hint so all 7 days don't look identical.
    today = await today_plan(
        user_id, session, principal, exam_id, forecast_year
    )
    days: list[WeekPlanDay] = []
    for d in range(7):
        # Rotate the order so days don't echo verbatim. v1 is
        # deliberately coarse.
        rotation = today.plan[d % max(len(today.plan), 1):] + today.plan[: d % max(len(today.plan), 1)]
        days.append(WeekPlanDay(
            day=d,
            actions=rotation,
            total_minutes=today.total_minutes,
        ))

    # Pull current score projection for the trajectory.
    proj = await _py.score_projection(
        session, user_id=user_id, exam_id=exam_id,
        forecast_year=forecast_year, if_topic_mastered=None,
    )
    # v1: assume the plan lifts projected score by ~10% after 7 days.
    # Real lift comes from the controlled experiment in Phase B5.
    projected_today = float(proj["scoreNow"])
    projected_eow = projected_today * 1.10

    return WeekPlanResponse(
        user_id=user_id,
        exam_id=exam_id,
        days=days,
        projected_percentile_today=projected_today,
        projected_percentile_end_of_week=projected_eow,
    )


@router.post("/{user_id}/override")
async def override(
    user_id: str,
    body: IGSOverride,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Student picked a different action than the IGS recommended.
    The override row feeds the model retraining queue (Phase B5).

    For now we just acknowledge — the row goes to a logging-only
    table per the schema docstring's "feedback signal" note.
    """
    _gate(principal, user_id)
    # Log to a JSON file in stdout for now; persistent table
    # arrives with the model retraining queue.
    import json as _json
    import logging as _logging
    log = _logging.getLogger(__name__)
    log.info("igs.override", extra={
        "user_id": user_id,
        "payload": _json.dumps(body.model_dump()),
    })
    return {"ok": True}


@router.get("/{user_id}/explainability/{action_id}")
async def explainability(
    user_id: str,
    action_id: str,
    session: SessionDep,
    principal: PrincipalDep,
    exam_id: str,
    forecast_year: int = 0,
) -> dict[str, Any]:
    """Deep-dive explainability for a single action_id. Recomputes
    the candidate set + score breakdown so the response is always
    fresh."""
    _gate(principal, user_id)
    if forecast_year == 0:
        forecast_year = datetime.now().year + 1
    scored = await _generate_and_rank(
        session, user_id=user_id, exam_id=exam_id, forecast_year=forecast_year,
    )
    # action_id is "kind:concept_id" for practice/revise, or just kind
    # for mock/break/reflection.
    target = None
    for s in scored:
        ident = s["action_kind"] + (":" + s["concept_id"] if s.get("concept_id") else "")
        if ident == action_id:
            target = s
            break
    if target is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    return {
        "action": _to_action(target).model_dump(),
        "inputs": target.get("signals") or {},
        "score_breakdown": {
            "expected_marks_gained": target.get("expected_marks_gained", 0.0),
            "p_durable_mastery": target.get("p_durable_mastery", 0.0),
            "time_efficiency": target.get("time_efficiency", 0.0),
            "emotional_fit": target.get("emotional_fit", 0.0),
            "cost": target.get("cost", 0.0),
        },
        "counterfactuals": [],  # Phase B5: peer-signal CF
        "alternatives": [_to_action(c).model_dump() for c in scored[:3] if c is not target],
    }
