"""FastAPI router for /doubts/*.

Lifecycle:
  POST   /doubts                          — create new doubt (text + optional photo + optional initial AI answer)
  GET    /doubts                          — list mine
  GET    /doubts/{id}                     — single doubt + answers
  POST   /doubts/{id}/answers             — append a new answer (peer/expert/ai)
  POST   /doubts/{id}/answers/{aid}/accept — owner marks an answer accepted; doubt → RESOLVED
"""

from __future__ import annotations

import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from doubts.config import settings
from doubts.db import sessionmaker
from doubts.repositories import (
    accept_answer,
    create_doubt,
    get_doubt,
    insert_answer,
    list_answers,
    list_doubts_for_user,
)

log = logging.getLogger(__name__)
from doubts.schemas import (
    AnswerCreate,
    Doubt,
    DoubtCreate,
    DoubtDetail,
    DoubtList,
    Problem,
)
from doubts.security import JwtPrincipal, current_principal

router = APIRouter(prefix="/doubts", tags=["doubts"])

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


def _to_doubt(row: dict) -> Doubt:
    return Doubt(
        id=row["id"],
        userId=row["user_id"],
        questionText=row["question_text"],
        photoDataUrl=row.get("photo_data_url"),
        topicId=row.get("topic_id"),
        topicTitle=row.get("topic_title"),
        status=row["status"],
        createdAt=row["created_at"],
        lastActivityAt=row["last_activity_at"],
        answerCount=row.get("answer_count", 0),
    )


def _to_answer(row: dict) -> dict:
    return {
        "id": row["id"],
        "doubtId": row["doubt_id"],
        "authorId": row.get("author_id"),
        "authorRole": row["author_role"],
        "content": row["content"],
        "source": row["source"],
        "createdAt": row["created_at"],
        "accepted": row["accepted"],
    }


@router.post("", response_model=DoubtDetail, status_code=status.HTTP_201_CREATED)
async def create_doubt_endpoint(
    body: DoubtCreate,
    session: SessionDep,
    principal: PrincipalDep,
) -> DoubtDetail:
    row = await create_doubt(
        session,
        user_id=principal.user_id,
        question_text=body.questionText,
        photo_data_url=body.photoDataUrl,
        topic_id=body.topicId,
        topic_title=body.topicTitle,
    )
    answers: list[dict] = []
    if body.initialAiAnswer:
        ans = await insert_answer(
            session,
            doubt_id=row["id"],
            author_id=None,
            author_role="AI",
            content=body.initialAiAnswer,
            source="ai",
        )
        answers = [_to_answer(ans)]
        # Re-load doubt to pick up status flip + last_activity bump.
        row = await get_doubt(session, row["id"]) or row
    await session.commit()
    return DoubtDetail(**_to_doubt(row).model_dump(), answers=answers)


@router.get("", response_model=DoubtList)
async def list_my_doubts(session: SessionDep, principal: PrincipalDep) -> DoubtList:
    rows = await list_doubts_for_user(session, principal.user_id)
    return DoubtList(items=[_to_doubt(r) for r in rows])


@router.get("/{doubt_id}", response_model=DoubtDetail)
async def get_doubt_endpoint(
    doubt_id: str,
    session: SessionDep,
    principal: PrincipalDep,
) -> DoubtDetail:
    row = await get_doubt(session, doubt_id)
    if row is None:
        raise _problem("not_found", "Doubt not found", http_status=404)
    if row["user_id"] != principal.user_id and principal.role not in (
        "TEACHER",
        "EXPERT",
        "MODERATOR",
        "INSTITUTION_ADMIN",
        "PLATFORM_ADMIN",
    ):
        raise _problem("forbidden", "Not allowed to view this doubt", http_status=403)
    answers = await list_answers(session, doubt_id)
    return DoubtDetail(**_to_doubt(row).model_dump(), answers=[_to_answer(a) for a in answers])


@router.post("/{doubt_id}/answers")
async def add_answer(
    doubt_id: str,
    body: AnswerCreate,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict:
    row = await get_doubt(session, doubt_id)
    if row is None:
        raise _problem("not_found", "Doubt not found", http_status=404)
    # Anyone with a valid token can append an answer; in production we'd
    # gate `expert` source to TEACHER/EXPERT/MODERATOR roles only.
    final_role = principal.role
    final_source = body.source
    if body.source == "expert" and principal.role not in (
        "TEACHER",
        "EXPERT",
        "MODERATOR",
        "INSTITUTION_ADMIN",
        "PLATFORM_ADMIN",
    ):
        # Demote to peer if a non-expert tries to claim expert source.
        final_source = "peer"
    ans = await insert_answer(
        session,
        doubt_id=doubt_id,
        author_id=principal.user_id,
        author_role=final_role,
        content=body.content,
        source=final_source,
    )
    await session.commit()

    # Notify the doubt's owner so they see the reply land in their inbox.
    # Skip when the owner is the same person posting the answer (e.g.,
    # student adds context to their own thread). Best-effort — failures
    # never roll back the answer write.
    owner_id = str(row["user_id"])
    if owner_id != principal.user_id:
        try:
            await _post_inbox_notification(
                user_id=owner_id,
                type_="doubt.answered",
                payload={
                    "doubtId": doubt_id,
                    "source": final_source,
                    "answerId": str(ans.get("id", "")),
                },
            )
        except Exception:
            log.exception("doubt.answered notification post failed")

    return _to_answer(ans)


async def _post_inbox_notification(*, user_id: str, type_: str, payload: dict) -> None:
    base = (settings.notification_base_url or "").rstrip("/")
    if not base:
        return
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            f"{base}/notifications/inbox",
            json={"userId": user_id, "type": type_, "payload": payload},
        )


@router.post("/{doubt_id}/answers/{answer_id}/accept")
async def accept_answer_endpoint(
    doubt_id: str,
    answer_id: str,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict:
    row = await get_doubt(session, doubt_id)
    if row is None:
        raise _problem("not_found", "Doubt not found", http_status=404)
    if row["user_id"] != principal.user_id:
        raise _problem("forbidden", "Only the doubt owner can accept an answer", http_status=403)
    ok = await accept_answer(session, doubt_id, answer_id)
    if not ok:
        raise _problem("answer_not_found", "Answer not found on this doubt", http_status=404)
    await session.commit()
    return {"ok": True}
