"""Sprint 28 (P4-S28) — syllabus tree HTTP route.
Sprint 34 (P4-S34) — adds topic_references read endpoint."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from learning.catalog.db import get_session
from learning.syllabus import repositories as _repo

router = APIRouter(prefix="/catalog/syllabus-tree", tags=["syllabus"])

# Sprint 34 — separate router for topic-references; prefix differs.
references_router = APIRouter(prefix="/catalog/topics", tags=["references"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("")
async def syllabus_tree_route(
    session: SessionDep, examId: Annotated[str, Query()]
) -> dict[str, Any]:
    return await _repo.load_syllabus_tree(session, examId)


@references_router.get("/{topic_id}/references")
async def topic_references_route(
    topic_id: str, session: SessionDep
) -> dict[str, Any]:
    """List vetted reference materials for a topic (NCERT chapters,
    textbook references, video explainers, etc.). URLs are filtered for
    safety per S34 NFR; only http(s) entries surface."""
    refs = await _repo.list_topic_references(session, topic_id)
    return {"topicId": topic_id, "references": refs}
