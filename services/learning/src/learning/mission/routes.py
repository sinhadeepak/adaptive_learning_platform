"""Daily mission routes — Phase 6 S50.

Endpoints:
  POST /missions/today              (lazy generate)
  POST /missions/{id}/start
  POST /missions/{id}/complete
  POST /missions/{id}/skip

Mission generation reads engagement (concept_mastery, decay) via HTTP
since alp-learning and alp-engagement are separate services. Falls
back to a cold-start mission when engagement signals are unavailable.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker
from learning.content.security import JwtPrincipal, current_principal
from learning.mission import repositories as _repo
from learning.mission import selector as _sel

router = APIRouter(prefix="/missions", tags=["missions"])


PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


async def _session() -> AsyncSession:  # type: ignore[return-value]
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]


class MissionResponse(BaseModel):
    id: str
    user_id: str
    mission_date: str
    kind: str
    concept_id: str | None
    topic_id: str | None
    expected_minutes: int
    expected_questions: int
    why_picked: str
    why_picked_source: str
    primary_cta: dict[str, Any]
    status: str


async def _fetch_engagement_signals(user_id: str) -> dict[str, Any]:
    """Best-effort fetch of concept_mastery + decay from engagement.
    Falls back to empty dicts on any failure."""
    base = "http://engagement:8000"
    out: dict[str, Any] = {"concept_mastery": {}, "decays": [], "mocks": []}
    async with httpx.AsyncClient(timeout=httpx.Timeout(3.0)) as client:
        try:
            r = await client.get(f"{base}/analytics/concept-mastery/{user_id}")
            if r.status_code == 200:
                body = r.json()
                for c in body.get("concepts", []):
                    cid = c.get("conceptId")
                    if cid:
                        out["concept_mastery"][cid] = _sel.MasteryRow(
                            concept_id=cid,
                            ewa=float(c.get("ewa", 0.0)),
                            n=int(c.get("n", 0)),
                            last_seen_at=None,
                        )
        except Exception:
            pass
    return out


@router.post("/today", response_model=MissionResponse)
async def get_or_create_today(
    session: SessionDep, principal: PrincipalDep,
) -> MissionResponse:
    today = datetime.now(timezone.utc).date()
    existing = await _repo.get_today(session, user_id=principal.user_id, on_date=today)
    if existing:
        return MissionResponse(**{k: existing[k] for k in MissionResponse.model_fields.keys() if k in existing})

    # Generate
    signals = await _fetch_engagement_signals(principal.user_id)
    last = await _repo.get_last_mission(session, user_id=principal.user_id, before_date=today)
    mission = _sel.select_mission(
        time_budget_minutes=25,
        concept_mastery=signals["concept_mastery"],
        last_mission_kind=last["kind"] if last else None,
        last_mission_concept_id=last["concept_id"] if last else None,
        today=datetime.now(timezone.utc),
    )
    payload = {
        "kind": mission.kind,
        "concept_id": mission.concept_id,
        "topic_id": mission.topic_id,
        "expected_minutes": mission.expected_minutes,
        "expected_questions": mission.expected_questions,
        "why_picked": mission.why_picked,
        "why_picked_source": "heuristic",
        "primary_cta": mission.primary_cta,
    }
    saved = await _repo.upsert_today(
        session, user_id=principal.user_id, on_date=today, mission=payload,
    )
    await session.commit()
    return MissionResponse(**{k: saved[k] for k in MissionResponse.model_fields.keys() if k in saved})


class _StatusBody(BaseModel):
    linked_session_id: str | None = None
    completion_quality_score: float | None = None


@router.post("/{mid}/start", response_model=MissionResponse)
async def start_mission(
    mid: str, session: SessionDep, principal: PrincipalDep, body: _StatusBody | None = None,
) -> MissionResponse:
    body = body or _StatusBody()
    row = await _repo.update_status(
        session, mission_id=mid, status="started",
        linked_session_id=body.linked_session_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Mission not found"})
    await session.commit()
    return MissionResponse(**{k: row[k] for k in MissionResponse.model_fields.keys() if k in row})


@router.post("/{mid}/complete", response_model=MissionResponse)
async def complete_mission(
    mid: str, session: SessionDep, principal: PrincipalDep, body: _StatusBody | None = None,
) -> MissionResponse:
    body = body or _StatusBody()
    row = await _repo.update_status(
        session, mission_id=mid, status="completed",
        linked_session_id=body.linked_session_id,
        completion_quality_score=body.completion_quality_score,
    )
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Mission not found"})
    await session.commit()
    return MissionResponse(**{k: row[k] for k in MissionResponse.model_fields.keys() if k in row})


@router.post("/{mid}/skip", response_model=MissionResponse)
async def skip_mission(
    mid: str, session: SessionDep, principal: PrincipalDep,
) -> MissionResponse:
    row = await _repo.update_status(session, mission_id=mid, status="skipped")
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Mission not found"})
    await session.commit()
    return MissionResponse(**{k: row[k] for k in MissionResponse.model_fields.keys() if k in row})
