"""FastAPI router for /content/* endpoints.

Authoring lifecycle:
  POST   /content/questions             — TEACHER+ creates DRAFT
  GET    /content/questions             — list (filter by status; default = mine)
  GET    /content/questions/{id}        — fetch single
  POST   /content/questions/{id}/submit — DRAFT → REVIEW (author only)
  POST   /content/questions/{id}/review — MODERATOR+ approves/rejects
"""

from __future__ import annotations

from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content import events
from learning.content.catalog_client import authorize_topic
from learning.content.db import sessionmaker
from learning.content.repositories import (
    get_question,
    insert_question,
    list_questions,
    review,
    submit_for_review,
)
from learning.content.schemas import (
    Problem,
    QuestionCreate,
    QuestionDetail,
    QuestionList,
    ReviewDecision,
)
from learning.content.security import JwtPrincipal, current_principal

router = APIRouter(prefix="/content", tags=["content"])

PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


async def _session() -> AsyncSession:  # type: ignore[return-value]
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]


def _problem(code: str, message: str, *, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail=Problem(code=code, message=message).model_dump(),
    )


def _to_detail(row: dict) -> QuestionDetail:
    return QuestionDetail(
        id=row["id"],
        topicId=row["topic_id"],
        stem=row["stem"],
        choices=row["choices"],
        correctIdx=row["correct_idx"],
        difficultyB=row["difficulty_b"],
        discriminationA=row["discrimination_a"],
        guessingC=row["guessing_c"],
        language=row["language"],
        status=row["status"],
        explanation=row.get("explanation"),
        createdBy=row["created_by"],
        createdAt=row["created_at"],
        submittedAt=row.get("submitted_at"),
        reviewedBy=row.get("reviewed_by"),
        reviewedAt=row.get("reviewed_at"),
        reviewNotes=row.get("review_notes"),
        # Sprint 24 (P4-S24)
        examYear=row.get("exam_year"),
        paperSession=row.get("paper_session"),
        pyqFlag=bool(row.get("pyq_flag", False)),
        # Phase 5 (P5-S37) — polymorphic discriminator.
        questionType=row.get("question_type") or "MCQ_SINGLE",
    )


def _require_role(p: JwtPrincipal, *roles: str) -> None:
    if p.role not in roles:
        raise _problem(
            "forbidden",
            f"Role {p.role} cannot perform this action (required: {', '.join(roles)})",
            http_status=status.HTTP_403_FORBIDDEN,
        )


@router.post("/questions", response_model=QuestionDetail, status_code=status.HTTP_201_CREATED)
async def create_question(
    body: QuestionCreate,
    session: SessionDep,
    principal: PrincipalDep,
    authorization: Annotated[str | None, Header()] = None,
) -> QuestionDetail:
    _require_role(
        principal, "TEACHER", "EXPERT", "MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN"
    )
    if body.correctIdx >= len(body.choices):
        raise _problem("invalid_correct_idx", "correctIdx out of range", http_status=400)

    # Topic scope check — catalog is the source of truth for educator
    # assignments. Forward the inbound bearer so catalog can identify
    # the same principal we just verified. PLATFORM_ADMIN bypass is
    # handled on catalog's side; we don't branch here.
    bearer = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization.split(" ", 1)[1].strip()
    auth_result = await authorize_topic(
        bearer_token=bearer, topic_id=body.topicId
    )
    if auth_result.not_found:
        raise _problem(
            "topic_not_found",
            f"Topic {body.topicId} does not exist or is unpublished.",
            http_status=400,
        )
    if not auth_result.allowed:
        raise _problem(
            "not_assigned",
            "You are not assigned to author for this topic.",
            http_status=status.HTTP_403_FORBIDDEN,
        )

    row = await insert_question(
        session,
        question_id=str(uuid4()),
        topic_id=body.topicId,
        stem=body.stem,
        choices=body.choices,
        correct_idx=body.correctIdx,
        difficulty_b=body.difficultyB,
        discrimination_a=body.discriminationA,
        guessing_c=body.guessingC,
        language=body.language,
        created_by=principal.user_id,
        explanation=body.explanation,
        # Sprint 24 (P4-S24) — PYQ metadata.
        exam_year=body.examYear,
        paper_session=body.paperSession,
        pyq_flag=body.pyqFlag,
        # Phase 5 (P5-S58) — polymorphic.
        question_type=body.questionType,
        payload=body.payload,
        ai_origin=body.aiOrigin,
    )
    await session.commit()
    return _to_detail(row)


@router.get("/questions", response_model=QuestionList)
async def list_questions_endpoint(
    session: SessionDep,
    principal: PrincipalDep,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    scope: Annotated[str, Query(pattern="^(mine|all)$")] = "mine",
) -> QuestionList:
    """
    scope=mine (default) — only questions authored by the caller.
    scope=all — every question; only MODERATOR+ may use this (review queue).
    """
    if scope == "all":
        _require_role(principal, "MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN")
        author = None
    else:
        author = principal.user_id
    rows = await list_questions(session, created_by=author, status_filter=status_filter)
    return QuestionList(items=[_to_detail(r) for r in rows])


@router.get("/questions/{qid}", response_model=QuestionDetail)
async def get_question_endpoint(
    qid: str, session: SessionDep, principal: PrincipalDep
) -> QuestionDetail:
    row = await get_question(session, qid)
    if row is None:
        raise _problem("not_found", "Question not found", http_status=404)
    # Authors see their own; MODERATOR+ see anything in REVIEW or beyond.
    if row["created_by"] != principal.user_id and principal.role not in (
        "MODERATOR",
        "INSTITUTION_ADMIN",
        "PLATFORM_ADMIN",
    ):
        raise _problem("forbidden", "Not allowed to view this question", http_status=403)
    return _to_detail(row)


@router.post("/questions/{qid}/submit", response_model=QuestionDetail)
async def submit_question(qid: str, session: SessionDep, principal: PrincipalDep) -> QuestionDetail:
    ok = await submit_for_review(session, qid, by_user=principal.user_id)
    if not ok:
        # Either the question doesn't exist, isn't in DRAFT, or the caller
        # isn't the author. Disambiguate by reading.
        row = await get_question(session, qid)
        if row is None:
            raise _problem("not_found", "Question not found", http_status=404)
        if row["created_by"] != principal.user_id:
            raise _problem("forbidden", "Only the author can submit", http_status=403)
        raise _problem(
            "invalid_state",
            f"Cannot submit from status {row['status']}",
            http_status=409,
        )
    await session.commit()
    row = await get_question(session, qid)
    return _to_detail(row)


@router.post("/questions/{qid}/review", response_model=QuestionDetail)
async def review_question(
    qid: str,
    body: ReviewDecision,
    session: SessionDep,
    principal: PrincipalDep,
) -> QuestionDetail:
    _require_role(principal, "MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN")
    ok = await review(
        session,
        qid,
        reviewer=principal.user_id,
        approve=body.approve,
        notes=body.notes,
    )
    if not ok:
        row = await get_question(session, qid)
        if row is None:
            raise _problem("not_found", "Question not found", http_status=404)
        if row["created_by"] == principal.user_id:
            raise _problem(
                "forbidden",
                "Authors can't review their own questions",
                http_status=403,
            )
        raise _problem(
            "invalid_state",
            f"Cannot review from status {row['status']}",
            http_status=409,
        )
    await session.commit()
    row = await get_question(session, qid)
    if body.approve and row is not None and row["status"] == "PUBLISHED":
        # Best-effort fan-out — Quiz mirrors this into its bank.
        await events.publish_question_published(row)
    return _to_detail(row)
