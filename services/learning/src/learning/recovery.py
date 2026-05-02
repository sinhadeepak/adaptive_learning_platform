"""Recovery — Phase 6 S57.

Detects 2+ missed planned sessions in a 7-day window, generates a
4-day catch-up plan that preserves required work, and surfaces it
to the student. Pure-function plan generation; route layer reads/
writes content_schema.recovery_proposals.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date as _date
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker
from learning.content.security import JwtPrincipal, current_principal


@dataclass(frozen=True)
class RecoveryProposal:
    catch_up_payload: list[dict[str, Any]]
    rationale: str
    expected_minutes: int


def propose_recovery(
    *,
    plan_sessions: list[dict[str, Any]],
    missed_session_ids: list[str],
    today: _date,
    daily_minutes_goal: int,
) -> RecoveryProposal:
    """Pure function. v1: take the missed required sessions, spread
    over the next 3-4 days at the user's daily_minutes_goal cap.
    """
    missed = [s for s in plan_sessions if s["id"] in missed_session_ids]
    required_first = sorted(missed, key=lambda s: not s.get("is_required", False))

    catch_up: list[dict[str, Any]] = []
    minutes_today = 0
    day_offset = 0
    for s in required_first[:6]:  # cap 6 catch-up sessions
        em = min(s.get("expected_minutes", 30), daily_minutes_goal)
        if minutes_today + em > daily_minutes_goal:
            day_offset += 1
            minutes_today = 0
            if day_offset > 3:  # 4-day catch-up cap
                break
        catch_up.append(
            {
                "day_offset": day_offset,
                "concept_id": s.get("concept_id"),
                "topic_id": s.get("topic_id"),
                "kind": s.get("kind", "practice"),
                "expected_minutes": em,
                "expected_questions": s.get("expected_questions", em // 3),
                "is_required": s.get("is_required", False),
                "from_missed_id": s["id"],
            }
        )
        minutes_today += em

    if not catch_up:
        return RecoveryProposal(
            catch_up_payload=[],
            rationale="No missed required work — keep going!",
            expected_minutes=0,
        )

    return RecoveryProposal(
        catch_up_payload=catch_up,
        rationale=(
            f"You missed {len(missed_session_ids)} sessions. Here's a "
            f"{day_offset + 1}-day catch-up that preserves your "
            f"{sum(1 for s in catch_up if s['is_required'])} required items."
        ),
        expected_minutes=sum(s["expected_minutes"] for s in catch_up),
    )


# ─────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/recovery", tags=["recovery"])


PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


async def _session() -> AsyncSession:  # type: ignore[return-value]
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]


@router.get("/active")
async def get_active_recovery(
    session: SessionDep, principal: PrincipalDep,
) -> dict[str, Any]:
    """Return the user's most recent pending recovery proposal, or null."""
    res = await session.execute(
        text(
            """
            SELECT id, plan_id, triggered_at, missed_session_ids,
                   catch_up_payload, rationale, expected_minutes, status
              FROM content_schema.recovery_proposals
             WHERE user_id = CAST(:uid AS uuid) AND status = 'pending'
          ORDER BY triggered_at DESC LIMIT 1
            """
        ),
        {"uid": principal.user_id},
    )
    row = res.mappings().first()
    if row is None:
        return {"proposal": None}
    return {
        "proposal": {
            "id": str(row["id"]),
            "plan_id": str(row["plan_id"]),
            "triggered_at": row["triggered_at"].isoformat(),
            "missed_session_ids": row["missed_session_ids"],
            "catch_up_payload": row["catch_up_payload"],
            "rationale": row["rationale"],
            "expected_minutes": int(row["expected_minutes"]),
            "status": row["status"],
        }
    }


class ProposeRequest(BaseModel):
    plan_id: str
    missed_session_ids: list[str]
    daily_minutes_goal: int = 30


@router.post("/propose")
async def propose(
    body: ProposeRequest, session: SessionDep, principal: PrincipalDep,
) -> dict:
    """Generate a recovery proposal and persist it. Triggered by
    engagement when missed-session count threshold passes; can be
    called directly for testing."""
    # Read missed plan_sessions
    res = await session.execute(
        text(
            """
            SELECT id, day_offset, slot, kind, concept_id, topic_id,
                   expected_minutes, expected_questions, is_required
              FROM content_schema.plan_sessions
             WHERE id = ANY(CAST(:ids AS uuid[]))
            """
        ),
        {"ids": body.missed_session_ids},
    )
    rows = [
        {
            "id": str(r["id"]),
            "day_offset": int(r["day_offset"]),
            "slot": r["slot"],
            "kind": r["kind"],
            "concept_id": str(r["concept_id"]) if r["concept_id"] else None,
            "topic_id": str(r["topic_id"]) if r["topic_id"] else None,
            "expected_minutes": int(r["expected_minutes"]),
            "expected_questions": int(r["expected_questions"]),
            "is_required": bool(r["is_required"]),
        }
        for r in res.mappings()
    ]
    proposal = propose_recovery(
        plan_sessions=rows,
        missed_session_ids=body.missed_session_ids,
        today=_date.today(),
        daily_minutes_goal=body.daily_minutes_goal,
    )

    pid = str(uuid4())
    await session.execute(
        text(
            """
            INSERT INTO content_schema.recovery_proposals
              (id, user_id, plan_id, missed_session_ids,
               catch_up_payload, rationale, expected_minutes)
            VALUES
              (CAST(:id AS uuid), CAST(:uid AS uuid), CAST(:pid AS uuid),
               CAST(:missed AS jsonb), CAST(:payload AS jsonb),
               :rationale, :em)
            """
        ),
        {
            "id": pid,
            "uid": principal.user_id,
            "pid": body.plan_id,
            "missed": json.dumps(body.missed_session_ids),
            "payload": json.dumps(proposal.catch_up_payload),
            "rationale": proposal.rationale,
            "em": proposal.expected_minutes,
        },
    )
    await session.commit()
    return {
        "id": pid,
        "rationale": proposal.rationale,
        "expected_minutes": proposal.expected_minutes,
        "catch_up": proposal.catch_up_payload,
    }


@router.post("/{rid}/accept")
async def accept(rid: str, session: SessionDep, principal: PrincipalDep) -> dict:
    res = await session.execute(
        text(
            """
            UPDATE content_schema.recovery_proposals
               SET status = 'accepted', decided_at = now()
             WHERE id = CAST(:id AS uuid)
               AND user_id = CAST(:uid AS uuid)
               AND status = 'pending'
         RETURNING id
            """
        ),
        {"id": rid, "uid": principal.user_id},
    )
    row = res.mappings().first()
    if row is None:
        raise HTTPException(404, detail={"code": "not_found_or_decided"})
    await session.commit()
    return {"id": str(row["id"]), "status": "accepted"}


@router.post("/{rid}/decline")
async def decline(rid: str, session: SessionDep, principal: PrincipalDep) -> dict:
    res = await session.execute(
        text(
            """
            UPDATE content_schema.recovery_proposals
               SET status = 'declined', decided_at = now()
             WHERE id = CAST(:id AS uuid)
               AND user_id = CAST(:uid AS uuid)
               AND status = 'pending'
         RETURNING id
            """
        ),
        {"id": rid, "uid": principal.user_id},
    )
    row = res.mappings().first()
    if row is None:
        raise HTTPException(404, detail={"code": "not_found_or_decided"})
    await session.commit()
    return {"id": str(row["id"]), "status": "declined"}
