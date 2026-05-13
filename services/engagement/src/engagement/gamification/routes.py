"""Phase 1D-9 — Gamification HTTP routes."""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Query

from engagement.analytics.db import sessionmaker
from engagement.gamification import service as svc

router = APIRouter(tags=["gamification"])


@router.get("/gamification/users/{user_id}/xp")
async def get_user_xp(user_id: str) -> dict:
    async with sessionmaker()() as session:
        return asdict(await svc.get_status(session, user_id=user_id))


@router.post("/gamification/users/{user_id}/xp")
async def post_user_xp(user_id: str, body: dict) -> dict:
    """Award XP. Body: {eventType: str, sourceId?: str, xpDelta?: int}.
    Internal use only — gateway should rate-limit by service identity."""
    async with sessionmaker()() as session:
        new_total = await svc.award_xp(
            session,
            user_id=user_id,
            event_type=body.get("eventType", ""),
            source_id=body.get("sourceId"),
            xp_delta=body.get("xpDelta"),
        )
    return {"userId": user_id, "totalXp": new_total}


@router.get("/gamification/leagues/{league_id}")
async def get_league_standings(
    league_id: str,
    limit: int = Query(50, ge=1, le=200),
) -> dict:
    async with sessionmaker()() as session:
        rows = await svc.league_standings(
            session, league_id=league_id.upper(), limit=limit,
        )
    return {"leagueId": league_id.upper(), "standings": rows}


@router.post("/gamification/cron/promote-demote")
async def cron_promote_demote() -> dict:
    """Run weekly. v1: callable from a scheduled task or admin."""
    async with sessionmaker()() as session:
        return await svc.promote_demote(session)
