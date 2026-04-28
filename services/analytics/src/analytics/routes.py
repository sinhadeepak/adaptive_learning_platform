"""Analytics HTTP read-side surface."""

from __future__ import annotations

import asyncio
import hashlib
import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from analytics.cohort_leaderboard import (
    batch_readiness,
    fetch_cohort_members,
    rank_leaderboard,
)
from analytics.db import sessionmaker
from analytics.repositories import (
    get_mastery,
    get_readiness,
    get_streak,
    list_daily_activity,
    list_user_mastery,
)

router = APIRouter()


@router.get("/analytics/mastery/{user_id}")
async def list_mastery(user_id: str) -> dict:
    async with sessionmaker()() as session:
        rows = await list_user_mastery(session, user_id)
    return {
        "userId": user_id,
        "topics": [{"topicId": r.topic_id, "ewa": r.ewa, "n": r.n} for r in rows],
    }


@router.get("/analytics/mastery/{user_id}/{topic_id}")
async def get_mastery_for_topic(user_id: str, topic_id: str) -> dict:
    async with sessionmaker()() as session:
        row = await get_mastery(session, user_id, topic_id)
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    return {"userId": row.user_id, "topicId": row.topic_id, "ewa": row.ewa, "n": row.n}


@router.get("/analytics/readiness/{user_id}")
async def readiness(user_id: str, scope: str = "GLOBAL") -> dict:
    async with sessionmaker()() as session:
        row = await get_readiness(session, user_id, scope)
    if row is None:
        # No session yet — return a synthesized zero so the UI can render the
        # empty state instead of a 404 on a normal cold-start path.
        return {"userId": user_id, "scope": scope, "score": 0.0, "nTopics": 0, "updatedAt": None}
    return {
        "userId": row["user_id"],
        "scope": row["scope"],
        "score": row["score"],
        "nTopics": row["n_topics"],
        "updatedAt": row["updated_at"],
    }


@router.get("/analytics/daily-activity/{user_id}")
async def daily_activity(
    user_id: str,
    days: int = Query(default=30, ge=1, le=180),
) -> dict:
    """Per-day study activity for the trailing `days` days. Days with no
    activity are absent from the response; UI fills zeros across the
    full window."""
    async with sessionmaker()() as session:
        rows = await list_daily_activity(session, user_id, days=days)
    return {
        "userId": user_id,
        "days": days,
        "activity": [
            {
                "date": r["date"].isoformat(),
                "sessions": r["sessions"],
                "questions": r["questions"],
                "minutes": r["minutes"],
            }
            for r in rows
        ],
    }


@router.get("/analytics/streak/{user_id}")
async def streak(user_id: str) -> dict:
    """Current + longest streak in consecutive UTC days. Returns zeros for a
    user that's never submitted — UI renders the empty 'start your streak'
    state instead of needing to handle a 404."""
    async with sessionmaker()() as session:
        row = await get_streak(session, user_id)
    if row is None:
        return {
            "userId": user_id,
            "currentStreak": 0,
            "longestStreak": 0,
            "lastActiveDate": None,
        }
    return {
        "userId": row.user_id,
        "currentStreak": row.current_streak,
        "longestStreak": row.longest_streak,
        "lastActiveDate": row.last_active_date.isoformat(),
    }


async def _build_leaderboard(
    cohort_id: str, include_teachers: bool
) -> list[dict]:
    members = await fetch_cohort_members(cohort_id)
    if not members:
        return []
    user_ids = [m["userId"] for m in members]
    async with sessionmaker()() as session:
        readiness_by_user = await batch_readiness(session, user_ids)
    return rank_leaderboard(
        members, readiness_by_user, include_teachers=include_teachers
    )


@router.get("/analytics/cohorts/{cohort_id}/leaderboard")
async def cohort_leaderboard(
    cohort_id: str,
    include_teachers: bool = Query(default=False, alias="includeTeachers"),
) -> dict:
    """Sprint 9 L-1 — class leaderboard.

    Joins Institution's cohort-members → Analytics's readiness via the
    HTTP-then-batch-DB pattern (AP-01 keeps schemas service-owned).
    Members without a readiness row render as `started: false` so the
    educator UI can show "not started" badges."""
    rows = await _build_leaderboard(cohort_id, include_teachers)
    return {"cohortId": cohort_id, "leaderboard": rows}


def _leaderboard_digest(rows: list[dict]) -> str:
    """Sprint 12 S12-B — compact hash so the SSE poller can decide whether
    a frame needs to be re-sent. A snapshot is identical iff the digest
    matches; we re-send only on change. Pure function for testability."""
    payload = json.dumps(
        [
            (r["userId"], r["rank"], r["score"], r["nTopics"])
            for r in rows
        ],
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# Tunable; the educator UX says "near-realtime" — 5s is fine.
SSE_POLL_INTERVAL_SECONDS = 5
SSE_HEARTBEAT_SECONDS = 25


@router.get("/analytics/cohorts/{cohort_id}/leaderboard/stream")
async def cohort_leaderboard_stream(
    cohort_id: str,
    include_teachers: bool = Query(default=False, alias="includeTeachers"),
) -> StreamingResponse:
    """Sprint 12 S12-B — SSE leaderboard.

    Frames:
      - `event: snapshot` on connect with the full board
      - `event: delta`    when the digest changes (~5s poll)
      - `: keepalive`     every 25s so proxies don't idle out

    Why poll rather than push: the L-1 endpoint already returns a
    deterministic snapshot; a content-hash diff catches all real changes
    without needing in-process pub/sub plumbing. Sprint 13 can swap in
    a NATS-driven pusher if 5s lag isn't tight enough."""

    async def stream() -> "asyncio.AsyncIterator[bytes]":  # type: ignore[name-defined]
        last_digest: str | None = None
        last_heartbeat = asyncio.get_event_loop().time()
        # Initial snapshot.
        rows = await _build_leaderboard(cohort_id, include_teachers)
        last_digest = _leaderboard_digest(rows)
        yield b"event: snapshot\ndata: " + json.dumps(
            {"cohortId": cohort_id, "leaderboard": rows}
        ).encode() + b"\n\n"

        while True:
            await asyncio.sleep(SSE_POLL_INTERVAL_SECONDS)
            try:
                rows = await _build_leaderboard(cohort_id, include_teachers)
                digest = _leaderboard_digest(rows)
                if digest != last_digest:
                    last_digest = digest
                    yield b"event: delta\ndata: " + json.dumps(
                        {"cohortId": cohort_id, "leaderboard": rows}
                    ).encode() + b"\n\n"
                # Heartbeat regardless of changes so proxies (nginx) don't
                # close the connection during quiet periods.
                now = asyncio.get_event_loop().time()
                if now - last_heartbeat > SSE_HEARTBEAT_SECONDS:
                    last_heartbeat = now
                    yield b": keepalive\n\n"
            except Exception:
                # Best-effort — a transient DB blip shouldn't kill the
                # connection. The next poll retries.
                continue

    return StreamingResponse(stream(), media_type="text/event-stream")
