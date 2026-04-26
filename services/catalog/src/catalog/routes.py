"""FastAPI router for /catalog/* endpoints — public read-only in Sprint 1."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from catalog.db import get_session
from catalog.flags import premium_enforced
from catalog.repositories import CatalogRepo
from catalog.schemas import (
    CreateAssignmentRequest,
    EducatorAssignment,
    Exam,
    Problem,
    Subject,
    Topic,
    TopicDetail,
)
from catalog.security import (
    JwtPrincipal,
    current_principal,
    require_platform_admin,
)

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
            titleHi=r.get("title_hi"),
            questionCount=int(r["question_count"]),
            tier=_projected_tier(r["tier"], enforce),
        )
        for r in rows
    ]


@router.get("/educators/me/exams", response_model=list[Exam])
async def list_my_exams(
    session: SessionDep,
    principal: Annotated[JwtPrincipal, Depends(current_principal)],
) -> list[Exam]:
    """Exams the calling educator can author questions for.

    PLATFORM_ADMIN sees the full published set (mirrors `/catalog/exams`).
    Anyone else gets only the exams they have an `educator_assignments`
    row for. Roles outside the authoring set (e.g. STUDENT) end up with
    an empty list, which the UI renders as "no exams available".
    """
    repo = CatalogRepo(session)
    rows = (
        await repo.list_exams()
        if principal.is_platform_admin
        else await repo.exams_for_educator(principal.user_id)
    )
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


@router.get(
    "/educators/me/exams/{exam_id}/subjects",
    response_model=list[Subject],
)
async def list_my_subjects(
    exam_id: str,
    session: SessionDep,
    principal: Annotated[JwtPrincipal, Depends(current_principal)],
) -> list[Subject]:
    """Subjects under `exam_id` the calling educator can author for.

    PLATFORM_ADMIN bypasses the assignment filter and gets every
    published subject under the exam.
    """
    repo = CatalogRepo(session)
    rows = (
        await repo.subjects_for_exam(exam_id)
        if principal.is_platform_admin
        else await repo.subjects_for_educator_exam(principal.user_id, exam_id)
    )
    return [
        Subject(
            id=str(r["id"]),
            examId=str(r["exam_id"]),
            name=r["name"],
            topicCount=int(r["topic_count"]),
        )
        for r in rows
    ]


def _assignment_to_schema(row: dict) -> EducatorAssignment:
    return EducatorAssignment(
        id=str(row["id"]),
        educatorId=str(row["educator_id"]),
        examId=str(row["exam_id"]),
        subjectId=str(row["subject_id"]) if row.get("subject_id") else None,
        createdAt=row["created_at"].isoformat() if row.get("created_at") else "",
        createdBy=str(row["created_by"]) if row.get("created_by") else None,
    )


@router.get(
    "/admin/educators/{educator_id}/assignments",
    response_model=list[EducatorAssignment],
)
async def admin_list_assignments(
    educator_id: str,
    session: SessionDep,
    _admin: Annotated[JwtPrincipal, Depends(require_platform_admin)],
) -> list[EducatorAssignment]:
    rows = await CatalogRepo(session).list_assignments_for_educator(educator_id)
    return [_assignment_to_schema(r) for r in rows]


@router.post(
    "/admin/educators/{educator_id}/assignments",
    response_model=EducatorAssignment,
    status_code=201,
    responses={409: {"model": Problem}},
)
async def admin_create_assignment(
    educator_id: str,
    body: CreateAssignmentRequest,
    session: SessionDep,
    admin: Annotated[JwtPrincipal, Depends(require_platform_admin)],
) -> EducatorAssignment:
    row = await CatalogRepo(session).insert_assignment(
        educator_id=educator_id,
        exam_id=body.examId,
        subject_id=body.subjectId,
        created_by=admin.user_id,
    )
    if row is None:
        raise HTTPException(
            status_code=409,
            detail=Problem(
                code="duplicate_assignment",
                message="This educator already has that grant.",
            ).model_dump(),
        )
    return _assignment_to_schema(row)


@router.delete(
    "/admin/educators/assignments/{assignment_id}",
    status_code=204,
    responses={404: {"model": Problem}},
)
async def admin_delete_assignment(
    assignment_id: str,
    session: SessionDep,
    _admin: Annotated[JwtPrincipal, Depends(require_platform_admin)],
) -> None:
    deleted = await CatalogRepo(session).delete_assignment(assignment_id)
    if not deleted:
        raise _not_found(f"Assignment {assignment_id} not found")


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
        titleHi=row.get("title_hi"),
        questionCount=int(row["question_count"]),
        tier=_projected_tier(row["tier"], enforce),
        description=row.get("description"),
        objectives=row.get("objectives", []),
        prerequisites=row.get("prerequisites", []),
    )
