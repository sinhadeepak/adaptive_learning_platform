"""Sprint 9 — Educator Assignments HTTP surface.

Endpoint inventory:
  POST   /content/assignments                   — create DRAFT (educator)
  GET    /content/assignments?cohortId=...      — list (filter by cohort)
  GET    /content/assignments?mine=true         — student inbox view
  GET    /content/assignments/{id}              — fetch detail + question list
  PUT    /content/assignments/{id}/questions    — replace question set
  POST   /content/assignments/{id}/publish      — DRAFT → PUBLISHED + NATS
  POST   /content/assignments/{id}/progress     — student records completion
  GET    /content/assignments/{id}/leaderboard  — educator-side roster view

Auth model: educator-write endpoints require TEACHER / EXPERT / MODERATOR
/ INSTITUTION_ADMIN / PLATFORM_ADMIN. Student endpoints (mine inbox,
record progress) accept any authenticated role. The cross-schema
cohort-membership check happens at the SQL JOIN in
`list_assignments_for_user` (works in single-DB compose; production
splits to an HTTP call to Institution but that's a Sprint 10 concern).
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from content import events
from content.assignments_repo import (
    create_assignment,
    get_assignment,
    list_assignment_progress,
    list_assignment_questions,
    list_assignments_for_user,
    list_cohort_assignments,
    publish_assignment,
    set_assignment_questions,
    upsert_progress,
)
from content.db import sessionmaker
from content.security import JwtPrincipal, current_principal

router = APIRouter(prefix="/content/assignments", tags=["assignments"])

EDUCATOR_ROLES = {
    "TEACHER",
    "EXPERT",
    "MODERATOR",
    "INSTITUTION_ADMIN",
    "PLATFORM_ADMIN",
}


async def _session() -> Any:
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]
PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


def _require_educator(p: JwtPrincipal) -> None:
    if p.role not in EDUCATOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "forbidden",
                "message": f"Role {p.role} cannot manage assignments",
            },
        )


# ─────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────


class AssignmentCreate(BaseModel):
    cohortId: str
    title: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    tenantId: str | None = None
    dueAt: str | None = None  # ISO-8601


class AssignmentQuestionsBody(BaseModel):
    questionIds: list[str] = Field(min_length=1, max_length=100)


class ProgressBody(BaseModel):
    correctCount: int = Field(ge=0)
    totalCount: int = Field(ge=1)


class AssignmentOut(BaseModel):
    id: str
    cohortId: str
    tenantId: str | None
    title: str
    description: str | None
    createdBy: str
    dueAt: str | None
    publishedAt: str | None
    createdAt: str
    updatedAt: str
    # Student view: own progress (null when not yet attempted).
    myCompletedAt: str | None = None
    myCorrectCount: int | None = None
    myTotalCount: int | None = None


def _to_out(row: dict[str, Any]) -> AssignmentOut:
    def _iso(v: Any) -> str | None:
        return v.isoformat() if hasattr(v, "isoformat") else None

    return AssignmentOut(
        id=str(row["id"]),
        cohortId=str(row["cohort_id"]),
        tenantId=str(row["tenant_id"]) if row.get("tenant_id") else None,
        title=row["title"],
        description=row.get("description"),
        createdBy=str(row["created_by"]),
        dueAt=_iso(row.get("due_at")),
        publishedAt=_iso(row.get("published_at")),
        createdAt=_iso(row["created_at"]) or "",
        updatedAt=_iso(row["updated_at"]) or "",
        myCompletedAt=_iso(row.get("my_completed_at")) if "my_completed_at" in row else None,
        myCorrectCount=row.get("my_correct_count"),
        myTotalCount=row.get("my_total_count"),
    )


# ─────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────


@router.post("", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED)
async def post_assignment(
    body: AssignmentCreate, session: SessionDep, principal: PrincipalDep
) -> AssignmentOut:
    _require_educator(principal)
    row = await create_assignment(
        session,
        cohort_id=body.cohortId,
        title=body.title,
        description=body.description,
        tenant_id=body.tenantId,
        created_by=principal.user_id,
        due_at=body.dueAt,
    )
    await session.commit()
    return _to_out(row)


@router.get("", response_model=list[AssignmentOut])
async def get_assignments(
    session: SessionDep,
    principal: PrincipalDep,
    cohort_id: str | None = Query(default=None, alias="cohortId"),
    mine: bool = Query(default=False),
) -> list[AssignmentOut]:
    if mine:
        rows = await list_assignments_for_user(session, principal.user_id)
        return [_to_out(r) for r in rows]
    if cohort_id:
        # Educator listing — drafts + published. Students must use ?mine=true.
        only_published = principal.role not in EDUCATOR_ROLES
        rows = await list_cohort_assignments(
            session, cohort_id, only_published=only_published
        )
        return [_to_out(r) for r in rows]
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "code": "missing_filter",
            "message": "Pass cohortId=... or mine=true",
        },
    )


@router.get("/{assignment_id}", response_model=AssignmentOut)
async def get_assignment_detail(
    assignment_id: str, session: SessionDep, principal: PrincipalDep
) -> AssignmentOut:
    row = await get_assignment(session, assignment_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "assignment_not_found", "message": "No assignment with that id"},
        )
    # Students only see published. Educators see drafts too.
    if row.get("published_at") is None and principal.role not in EDUCATOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "assignment_not_found", "message": "No assignment with that id"},
        )
    return _to_out(row)


@router.put("/{assignment_id}/questions")
async def put_questions(
    assignment_id: str,
    body: AssignmentQuestionsBody,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict:
    _require_educator(principal)
    row = await get_assignment(session, assignment_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "assignment_not_found", "message": "No assignment with that id"},
        )
    if row.get("published_at") is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "already_published",
                "message": "Cannot edit question list after publish",
            },
        )
    await set_assignment_questions(
        session, assignment_id=assignment_id, question_ids=body.questionIds
    )
    await session.commit()
    return {"ok": True, "count": len(body.questionIds)}


@router.get("/{assignment_id}/questions")
async def get_questions(
    assignment_id: str, session: SessionDep, principal: PrincipalDep
) -> list[dict]:
    """Returns the ordered question list — used by both the student
    quiz-runner (after they hit Start) and the educator preview."""
    row = await get_assignment(session, assignment_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "assignment_not_found", "message": "No assignment with that id"},
        )
    if row.get("published_at") is None and principal.role not in EDUCATOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "assignment_not_found", "message": "No assignment with that id"},
        )
    rows = await list_assignment_questions(session, assignment_id)
    return [
        {
            "questionId": str(r["question_id"]),
            "position": r["position"],
            "stem": r.get("stem"),
            "subjectId": str(r["subject_id"]) if r.get("subject_id") else None,
            "topicId": str(r["topic_id"]) if r.get("topic_id") else None,
            "language": r.get("language"),
        }
        for r in rows
    ]


@router.post("/{assignment_id}/publish", response_model=AssignmentOut)
async def post_publish(
    assignment_id: str, session: SessionDep, principal: PrincipalDep
) -> AssignmentOut:
    _require_educator(principal)
    row = await get_assignment(session, assignment_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "assignment_not_found", "message": "No assignment with that id"},
        )
    was_published = row.get("published_at") is not None
    updated = await publish_assignment(session, assignment_id)
    await session.commit()
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "publish_failed", "message": "Could not publish"},
        )
    # Fire NATS only on the first publish — re-publishing is idempotent
    # and shouldn't re-spam the cohort with `assignment.new` notifications.
    if not was_published:
        try:
            await events.publish_assignment_created(updated)
        except Exception:
            # Best-effort fanout; the row is the durable record. A future
            # admin "re-fanout" CLI can replay if needed.
            pass
    return _to_out(updated)


@router.post("/{assignment_id}/progress")
async def post_progress(
    assignment_id: str,
    body: ProgressBody,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict:
    """Student records their finished attempt. The Quiz session itself is
    independent; this endpoint just records "I did the assignment, here's
    my score". Last-write-wins on (assignment, user) so the educator
    sees the most recent attempt."""
    if body.correctCount > body.totalCount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_score",
                "message": "correctCount cannot exceed totalCount",
            },
        )
    row = await get_assignment(session, assignment_id)
    if row is None or row.get("published_at") is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "assignment_not_found", "message": "No assignment with that id"},
        )
    progress = await upsert_progress(
        session,
        assignment_id=assignment_id,
        user_id=principal.user_id,
        correct_count=body.correctCount,
        total_count=body.totalCount,
    )
    await session.commit()
    return {
        "assignmentId": str(progress["assignment_id"]),
        "userId": str(progress["user_id"]),
        "correctCount": progress["correct_count"],
        "totalCount": progress["total_count"],
        "completedAt": progress["completed_at"].isoformat(),
    }


@router.get("/{assignment_id}/leaderboard")
async def get_leaderboard(
    assignment_id: str, session: SessionDep, principal: PrincipalDep
) -> list[dict]:
    """Educator-side: every cohort member's score for this assignment.
    Ordered by accuracy DESC. Members who haven't completed are not
    listed (assignment_progress row only exists post-completion)."""
    _require_educator(principal)
    if await get_assignment(session, assignment_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "assignment_not_found", "message": "No assignment with that id"},
        )
    rows = await list_assignment_progress(session, assignment_id)
    return [
        {
            "userId": str(r["user_id"]),
            "correctCount": r["correct_count"],
            "totalCount": r["total_count"],
            "accuracyPct": int(r["accuracy_pct"] or 0),
            "completedAt": r["completed_at"].isoformat(),
        }
        for r in rows
    ]
