"""Sprint 24 (P4-S24) — PYQ HTTP routes."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import get_session
from learning.pyq import repositories as _repo

router = APIRouter(prefix="/content/pyqs", tags=["pyqs"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("")
async def list_pyqs_route(
    session: SessionDep,
    examId: Annotated[str | None, Query()] = None,
    subjectId: Annotated[str | None, Query()] = None,
    topicId: Annotated[str | None, Query()] = None,
    year: Annotated[int | None, Query(ge=1990, le=2100)] = None,
    paperSession: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    perPage: Annotated[int, Query(ge=1, le=100, alias="perPage")] = 50,
) -> dict[str, Any]:
    return await _repo.list_pyqs(
        session,
        exam_id=examId,
        subject_id=subjectId,
        topic_id=topicId,
        year=year,
        paper_session=paperSession,
        page=page,
        per_page=perPage,
    )


@router.get("/frequency")
async def chapter_frequency_route(
    session: SessionDep,
    examId: Annotated[str, Query()],
    subjectId: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    chapters = await _repo.chapter_frequency(
        session, exam_id=examId, subject_id=subjectId
    )
    return {"examId": examId, "subjectId": subjectId, "chapters": chapters}
