"""FastAPI router for /catalog/* endpoints — public read-only in Sprint 1."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from catalog.db import get_session
from catalog.flags import premium_enforced
from catalog.repositories import CatalogRepo
from catalog.schemas import Exam, Problem, Subject, Topic, TopicDetail

router = APIRouter(prefix="/catalog", tags=["catalog"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _not_found(msg: str) -> HTTPException:
    return HTTPException(status_code=404, detail=Problem(code="not_found", message=msg).model_dump())


@router.get("/exams", response_model=list[Exam])
async def list_exams(session: SessionDep) -> list[Exam]:
    rows = await CatalogRepo(session).list_exams()
    return [
        Exam(
            id=str(r["id"]),
            code=r["code"],
            name=r["name"],
            subtitle=r.get("subtitle"),
            iconKey=r.get("icon_key"),
        )
        for r in rows
    ]


@router.get("/exams/{exam_id}/subjects", response_model=list[Subject])
async def list_subjects(exam_id: str, session: SessionDep) -> list[Subject]:
    rows = await CatalogRepo(session).subjects_for_exam(exam_id)
    return [
        Subject(id=str(r["id"]), examId=str(r["exam_id"]), name=r["name"], topicCount=int(r["topic_count"]))
        for r in rows
    ]


def _projected_tier(stored_tier: str, enforce: bool) -> str:
    """When `premium_tier_enforcement` is OFF (Sprint 1 closed beta), every topic is
    served as FREE regardless of its stored tier — paywall does not apply yet.
    When ON, the stored tier is returned verbatim."""
    return stored_tier if enforce else "FREE"


@router.get("/subjects/{subject_id}/topics", response_model=list[Topic])
async def list_topics(subject_id: str, session: SessionDep) -> list[Topic]:
    rows = await CatalogRepo(session).topics_for_subject(subject_id)
    enforce = await premium_enforced()
    return [
        Topic(
            id=str(r["id"]),
            subjectId=str(r["subject_id"]),
            title=r["title"],
            questionCount=int(r["question_count"]),
            tier=_projected_tier(r["tier"], enforce),
        )
        for r in rows
    ]


@router.get("/topics/{topic_id}", response_model=TopicDetail)
async def topic_detail(topic_id: str, session: SessionDep) -> TopicDetail:
    row = await CatalogRepo(session).topic(topic_id)
    if row is None:
        raise _not_found(f"Topic {topic_id} not found")
    enforce = await premium_enforced()
    return TopicDetail(
        id=str(row["id"]),
        subjectId=str(row["subject_id"]),
        title=row["title"],
        questionCount=int(row["question_count"]),
        tier=_projected_tier(row["tier"], enforce),
        description=row.get("description"),
        objectives=row.get("objectives", []),
        prerequisites=row.get("prerequisites", []),
    )
