"""Cultural review queue routes (P5-S57, closes CE-404 backend gap).

Per AIM §4.4. Translations whose `cultural_flags` JSONB array is
non-empty land in this queue. Cultural reviewer (a separate role
from the per-language reviewer) approves, suggests substitution, or
marks "do not localise" and sends the artifact back to the source
language with a banner.

  GET  /localisation/cultural-review/queue
  POST /localisation/cultural-review/{artifact_id}/{lang}/action
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker as content_sessionmaker
from learning.localisation.repositories import (
    cultural_review_action,
    list_cultural_pending,
)

router = APIRouter(
    prefix="/localisation/cultural-review",
    tags=["cultural_review"],
)


async def _content_session() -> AsyncSession:
    async with content_sessionmaker()() as s:
        yield s


# ── Queue ──────────────────────────────────────────────────────────────────


class CulturalQueueItem(BaseModel):
    artifactId: str
    language: str
    status: str
    culturalFlags: list[str]
    culturalReviewStatus: str | None
    aiConfidence: float | None
    version: int
    createdAt: str
    updatedAt: str


class CulturalQueueResponse(BaseModel):
    items: list[CulturalQueueItem]
    pendingCount: int


@router.get("/queue", response_model=CulturalQueueResponse)
async def get_queue(
    limit: int = 50,
    session: AsyncSession = Depends(_content_session),
) -> CulturalQueueResponse:
    """Translations awaiting cultural review (oldest first, 5-day SLA)."""
    if limit < 1 or limit > 200:
        raise HTTPException(
            status_code=400,
            detail={"code": "bad_limit", "message": "limit must be 1..200"},
        )
    rows = await list_cultural_pending(session, limit=limit)
    return CulturalQueueResponse(
        items=[CulturalQueueItem(**r) for r in rows],
        pendingCount=len(rows),
    )


# ── Action ─────────────────────────────────────────────────────────────────


CulturalAction = Literal["APPROVED", "SUBSTITUTION_SUGGESTED", "NOT_LOCALISED"]


class CulturalReviewBody(BaseModel):
    action: CulturalAction
    reviewerId: str = Field(min_length=1)
    notes: str | None = Field(default=None, max_length=2000)


class CulturalReviewResponse(BaseModel):
    artifactId: str
    language: str
    action: str
    reviewerId: str


@router.post(
    "/{artifact_id}/{lang}/action",
    response_model=CulturalReviewResponse,
)
async def post_action(
    artifact_id: str,
    lang: str,
    body: CulturalReviewBody,
    session: AsyncSession = Depends(_content_session),
) -> CulturalReviewResponse:
    """Cultural reviewer's verdict.

    APPROVED               -> translation published as-is
    SUBSTITUTION_SUGGESTED -> reviewer's notes propose a culturally-
                              appropriate alternative; per-language
                              reviewer applies + re-submits
    NOT_LOCALISED          -> revert to source language with banner
    """
    await cultural_review_action(
        session,
        artifact_id=artifact_id,
        target_lang=lang,
        action=body.action,
        reviewer_id=body.reviewerId,
        notes=body.notes,
    )
    await session.commit()
    return CulturalReviewResponse(
        artifactId=artifact_id,
        language=lang,
        action=body.action,
        reviewerId=body.reviewerId,
    )
