"""Analytics HTTP read-side surface."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from analytics.db import sessionmaker
from analytics.repositories import get_mastery, get_readiness, list_user_mastery

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
