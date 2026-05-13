"""Per-topic student-authored notes (Phase 7 P7-A1).

GET    /content/topic-notes/{user_id}/{topic_id}
PUT    /content/topic-notes/{user_id}/{topic_id}
DELETE /content/topic-notes/{user_id}/{topic_id}

Visibility enum:
  PRIVATE          — only the author
  TEACHER_VISIBLE  — author + their teachers
  COHORT           — all students in a cohort the author belongs to
  PUBLIC           — anyone authenticated

In v1 the default is PRIVATE; the column is forward-compat for "share
with my tutor" flow. Teachers/admins reading another user's note must
have visibility ≥ TEACHER_VISIBLE.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker
from learning.content.security import JwtPrincipal, current_principal

router = APIRouter(prefix="/content", tags=["content-notes"])

PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


def _problem(code: str, msg: str, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status, detail={"code": code, "message": msg}
    )


async def _session() -> AsyncSession:
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]


class TopicNoteOut(BaseModel):
    userId: str
    topicId: str
    contentMd: str
    visibility: str
    updatedAt: str


class TopicNotePut(BaseModel):
    contentMd: str = Field(..., max_length=4096)
    visibility: str | None = Field(
        default=None,
        pattern="^(PRIVATE|TEACHER_VISIBLE|COHORT|PUBLIC)$",
    )


@router.get(
    "/topic-notes/{user_id}/{topic_id}",
    response_model=TopicNoteOut,
)
async def get_topic_note(
    user_id: str,
    topic_id: str,
    session: SessionDep,
    principal: PrincipalDep,
) -> TopicNoteOut:
    row = (
        await session.execute(
            text(
                """
                SELECT user_id::text AS user_id, topic_id::text AS topic_id,
                       content_md, visibility::text AS visibility, updated_at
                  FROM content_schema.user_topic_notes
                 WHERE user_id = CAST(:uid AS uuid) AND topic_id = CAST(:tid AS uuid)
                """
            ),
            {"uid": user_id, "tid": topic_id},
        )
    ).mappings().first()
    if row is None:
        raise _problem("not_found", "No note", status.HTTP_404_NOT_FOUND)

    # Authorisation: own user always; PLATFORM_ADMIN always; teachers/
    # institute admins iff visibility ≥ TEACHER_VISIBLE.
    is_self = principal.user_id == user_id
    is_admin = principal.role == "PLATFORM_ADMIN"
    teacher_ok = (
        principal.role in ("TEACHER", "LEAD_TEACHER", "INSTITUTION_ADMIN")
        and row["visibility"] in ("TEACHER_VISIBLE", "COHORT", "PUBLIC")
    )
    if not (is_self or is_admin or teacher_ok):
        raise _problem("forbidden", "Cannot read this note",
                       status.HTTP_403_FORBIDDEN)

    return TopicNoteOut(
        userId=row["user_id"],
        topicId=row["topic_id"],
        contentMd=row["content_md"],
        visibility=row["visibility"],
        updatedAt=row["updated_at"].isoformat(),
    )


@router.put(
    "/topic-notes/{user_id}/{topic_id}",
    response_model=TopicNoteOut,
)
async def put_topic_note(
    user_id: str,
    topic_id: str,
    body: TopicNotePut,
    session: SessionDep,
    principal: PrincipalDep,
) -> TopicNoteOut:
    if principal.user_id != user_id and principal.role != "PLATFORM_ADMIN":
        raise _problem("forbidden", "Can only edit your own notes",
                       status.HTTP_403_FORBIDDEN)

    visibility = body.visibility or "PRIVATE"
    row = (
        await session.execute(
            text(
                """
                INSERT INTO content_schema.user_topic_notes
                  (user_id, tenant_id, topic_id, content_md, visibility, updated_at)
                VALUES (
                  CAST(:uid AS uuid),
                  CAST(:tnt AS uuid),
                  CAST(:tid AS uuid),
                  :body,
                  CAST(:vis AS content_schema.note_visibility),
                  NOW()
                )
                ON CONFLICT (user_id, topic_id) DO UPDATE
                  SET content_md = EXCLUDED.content_md,
                      visibility = EXCLUDED.visibility,
                      updated_at = NOW()
                RETURNING user_id::text AS user_id, topic_id::text AS topic_id,
                          content_md, visibility::text AS visibility, updated_at
                """
            ),
            {
                "uid": user_id,
                "tnt": principal.tenant_id,
                "tid": topic_id,
                "body": body.contentMd,
                "vis": visibility,
            },
        )
    ).mappings().first()
    await session.commit()
    return TopicNoteOut(
        userId=row["user_id"],
        topicId=row["topic_id"],
        contentMd=row["content_md"],
        visibility=row["visibility"],
        updatedAt=row["updated_at"].isoformat(),
    )


@router.delete("/topic-notes/{user_id}/{topic_id}", status_code=204)
async def delete_topic_note(
    user_id: str,
    topic_id: str,
    session: SessionDep,
    principal: PrincipalDep,
) -> Response:
    if principal.user_id != user_id and principal.role != "PLATFORM_ADMIN":
        raise _problem("forbidden", "Can only delete your own notes",
                       status.HTTP_403_FORBIDDEN)
    await session.execute(
        text(
            """
            DELETE FROM content_schema.user_topic_notes
             WHERE user_id = CAST(:uid AS uuid) AND topic_id = CAST(:tid AS uuid)
            """
        ),
        {"uid": user_id, "tid": topic_id},
    )
    await session.commit()
    return Response(status_code=204)
