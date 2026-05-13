"""HTTP routes for the Probabilistic Curriculum Engine.

Endpoints (auth required, scoped to the authenticated user — a student
can only read their own PCE state; admins can recompute for anyone):

  POST /pce/{user_id}/recompute              — force-recompute (admin or self)
  GET  /pce/{user_id}/yield-ranking          — top-N personal yields
  GET  /pce/{user_id}/score-projection       — projected score
                                               + ?if_topic_mastered={id}
                                               for counterfactual
  GET  /pce/{user_id}/portfolio              — current-vs-optimal allocation

The recompute call is normally fired by the nightly cron + the
mastery.delta NATS subscriber, but the manual endpoint is useful for
demos and for the IGS to invalidate after a long inactivity gap.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.catalog.db import get_session
from learning.content.security import JwtPrincipal, current_principal
from learning.pce import personal_yield as _py
from learning.pce.schemas import (
    PersonalYieldResponse,
    PersonalYieldRow,
)

router = APIRouter(prefix="/pce", tags=["pce"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


def _gate_self_or_admin(principal: JwtPrincipal, target_user_id: str) -> None:
    """Students may only read their own PCE state. Admins / moderators
    bypass this for ops surfaces."""
    admin_roles = {"ADMIN", "MODERATOR", "PLATFORM_ADMIN"}
    if principal.role in admin_roles:
        return
    if principal.user_id != target_user_id:
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden",
                    "message": "Students can only read their own PCE state."},
        )


@router.post("/{user_id}/recompute")
async def recompute(
    user_id: str,
    session: SessionDep,
    principal: PrincipalDep,
    exam_id: str,
    forecast_year: int = 0,
    days_to_exam: int | None = None,
) -> dict[str, Any]:
    """Force a recompute. Normally fired by the cron + NATS subscriber;
    this endpoint is for demos + on-demand invalidation."""
    _gate_self_or_admin(principal, user_id)
    if forecast_year == 0:
        forecast_year = datetime.now().year + 1
    result = await _py.compute_for_user(
        session,
        user_id=user_id,
        exam_id=exam_id,
        forecast_year=forecast_year,
        days_to_exam=days_to_exam,
    )
    await session.commit()
    return {
        "userId": result.user_id,
        "examId": result.exam_id,
        "forecastYear": result.forecast_year,
        "rowsWritten": result.n_rows,
        "daysToExam": result.days_to_exam,
    }


@router.get("/{user_id}/yield-ranking")
async def yield_ranking(
    user_id: str,
    session: SessionDep,
    principal: PrincipalDep,
    exam_id: str,
    forecast_year: int = 0,
    limit: int = Query(default=20, ge=1, le=100),
) -> PersonalYieldResponse:
    """Top-N personal yield ranking. The student sees this as the
    'what to study now' list."""
    _gate_self_or_admin(principal, user_id)
    if forecast_year == 0:
        forecast_year = datetime.now().year + 1
    rows = await _py.read_ranking(
        session,
        user_id=user_id,
        exam_id=exam_id,
        forecast_year=forecast_year,
        limit=limit,
    )
    items = [
        PersonalYieldRow(
            topic_id=r["topicId"],
            rank=r["rank"],
            base_yield=r["baseYield"],
            mastery=r["mastery"],
            decay_severity=r["decaySeverity"],
            time_pressure=r["timePressure"],
            personal_yield=r["personalYield"],
            rationale=r["rationale"],
        )
        for r in rows
    ]
    return PersonalYieldResponse(
        user_id=user_id,
        exam_id=exam_id,
        forecast_year=forecast_year,
        items=items,
        computed_at=datetime.utcnow(),
    )


@router.get("/{user_id}/score-projection")
async def score_projection(
    user_id: str,
    session: SessionDep,
    principal: PrincipalDep,
    exam_id: str,
    forecast_year: int = 0,
    if_topic_mastered: str | None = None,
) -> dict[str, Any]:
    """Project the student's expected exam score. Pass
    `if_topic_mastered=<topic_id>` to get the counterfactual."""
    _gate_self_or_admin(principal, user_id)
    if forecast_year == 0:
        forecast_year = datetime.now().year + 1
    out = await _py.score_projection(
        session,
        user_id=user_id,
        exam_id=exam_id,
        forecast_year=forecast_year,
        if_topic_mastered=if_topic_mastered,
    )
    return {
        "userId": user_id,
        "examId": exam_id,
        "forecastYear": forecast_year,
        "ifTopicMastered": if_topic_mastered,
        **out,
    }


@router.get("/{user_id}/portfolio")
async def portfolio(
    user_id: str,
    session: SessionDep,
    principal: PrincipalDep,
    exam_id: str,
    forecast_year: int = 0,
) -> dict[str, Any]:
    """Allocation view — current mastery share vs optimal share per
    yield-bucket (High / Medium / Low). Drives the rebalance UI."""
    _gate_self_or_admin(principal, user_id)
    if forecast_year == 0:
        forecast_year = datetime.now().year + 1

    rows = (
        await session.execute(
            text("""
                SELECT base_yield, mastery, personal_yield
                  FROM exam_intelligence_schema.topic_yield_personal
                 WHERE user_id = CAST(:uid AS uuid)
                   AND exam_id = CAST(:eid AS uuid)
                   AND forecast_year = :y
            """),
            {"uid": user_id, "eid": exam_id, "y": forecast_year},
        )
    ).mappings().all()
    if not rows:
        return {
            "userId": user_id,
            "examId": exam_id,
            "buckets": [],
            "reallocationHint": "Run /pce/{user_id}/recompute first.",
        }

    # Bucket by base_yield: top tertile = High, middle = Medium, low = Low.
    sorted_rows = sorted(rows, key=lambda r: -r["base_yield"])
    n = len(sorted_rows)
    high = sorted_rows[: n // 3]
    medium = sorted_rows[n // 3 : 2 * n // 3]
    low = sorted_rows[2 * n // 3 :]

    def share(bucket: list[Any], by: str) -> float:
        total = sum(float(r["base_yield"]) for r in sorted_rows) or 1.0
        if by == "mastery":
            return sum(float(r["mastery"]) * float(r["base_yield"]) for r in bucket) / total
        return sum(float(r["base_yield"]) for r in bucket) / total

    out_buckets = []
    biggest_under_invest = ("", 0.0)
    for label, bucket in (("High", high), ("Medium", medium), ("Low", low)):
        if not bucket:
            continue
        cur = share(bucket, by="mastery")
        opt = share(bucket, by="optimal")
        delta = opt - cur
        out_buckets.append({
            "bucket": label,
            "currentMasteryShare": round(cur, 3),
            "optimalShare": round(opt, 3),
            "delta": round(delta, 3),
        })
        if delta > biggest_under_invest[1]:
            biggest_under_invest = (label, delta)
    hint = (
        f"Shift effort toward the {biggest_under_invest[0]}-yield bucket — "
        f"you're under-invested there by {biggest_under_invest[1]:.0%}."
        if biggest_under_invest[0]
        else "Your allocation is balanced."
    )
    return {
        "userId": user_id,
        "examId": exam_id,
        "buckets": out_buckets,
        "reallocationHint": hint,
    }
