"""Translation batch HTTP routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from learning.ai_gateway import AIGateway
from learning.content.db import sessionmaker as content_sessionmaker
from learning.content.security import JwtPrincipal
from learning.localisation import batch_repo
from learning.localisation.auth import require_admin
from learning.localisation.batch_worker import run_batch
from learning.localisation.language_registry import enabled_target_codes

router = APIRouter(
    prefix="/localisation",
    tags=["localisation_batches"],
    dependencies=[Depends(require_admin)],
)


def _gateway(request: Request) -> AIGateway:
    gw = getattr(request.app.state, "ai_gateway", None)
    if gw is None:
        raise HTTPException(status_code=503, detail={
            "code": "ai_gateway_unavailable",
            "message": "AI Gateway is not available; translation disabled."})
    return gw


async def _session() -> AsyncSession:
    async with content_sessionmaker()() as s:
        yield s


class BatchCreate(BaseModel):
    questionIds: list[str] = Field(min_length=1, max_length=1000)
    targetLangs: list[str] = Field(min_length=1, max_length=20)
    subject: str = "general"
    overwriteExisting: bool = False

    @field_validator("questionIds")
    @classmethod
    def validate_question_ids(cls, v: list[str]) -> list[str]:
        for item in v:
            try:
                uuid.UUID(item)
            except ValueError:
                raise ValueError(f"questionId {item!r} is not a valid UUID")
        return v


@router.post("/batches")
async def create_batch(
    body: BatchCreate, background: BackgroundTasks, request: Request,
    session: AsyncSession = Depends(_session),
    principal: JwtPrincipal = Depends(require_admin),
) -> dict:
    # Validate language codes BEFORE checking gateway so that a bad-language
    # request fails fast with 400 even in test environments without a gateway.
    allowed = await enabled_target_codes(session)
    bad = [c for c in body.targetLangs if c not in allowed]
    if bad:
        raise HTTPException(status_code=400, detail={
            "code": "unsupported_language",
            "message": f"not enabled target languages: {bad}"})
    gateway = _gateway(request)
    out = await batch_repo.create_batch(
        session, created_by=principal.user_id, question_ids=body.questionIds,
        target_langs=body.targetLangs, subject=body.subject,
        overwrite_existing=body.overwriteExisting)
    await session.commit()
    if out["totalTasks"] - out["skipped"] > 0:
        background.add_task(run_batch, content_sessionmaker(), gateway, out["batchId"])
    return out


@router.get("/batches")
async def list_batches(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(_session),
) -> dict:
    return await batch_repo.list_batches(session, limit=limit, offset=offset)


@router.get("/batches/{batch_id}")
async def get_batch(batch_id: str, session: AsyncSession = Depends(_session)) -> dict:
    got = await batch_repo.get_batch(session, batch_id)
    if got is None:
        raise HTTPException(status_code=404, detail={"code": "batch_not_found", "message": batch_id})
    return got


@router.post("/batches/{batch_id}/tasks/{task_id}/retry")
async def retry_task(
    batch_id: str, task_id: str, background: BackgroundTasks, request: Request,
    session: AsyncSession = Depends(_session),
) -> dict:
    gateway = _gateway(request)
    ok = await batch_repo.retry_task(session, batch_id=batch_id, task_id=task_id)
    await session.commit()
    if ok:
        background.add_task(run_batch, content_sessionmaker(), gateway, batch_id)
    return {"retried": ok}
