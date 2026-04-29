"""Sprint 28 (P4-S28) — syllabus tree HTTP route."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from learning.catalog.db import get_session
from learning.syllabus import repositories as _repo

router = APIRouter(prefix="/catalog/syllabus-tree", tags=["syllabus"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("")
async def syllabus_tree_route(
    session: SessionDep, examId: Annotated[str, Query()]
) -> dict[str, Any]:
    return await _repo.load_syllabus_tree(session, examId)
