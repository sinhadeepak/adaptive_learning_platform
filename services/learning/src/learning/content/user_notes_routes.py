"""Per-exam student notebook — owner-scoped rich-text notes.

GET    /content/notes?exam_id=...
POST   /content/notes
GET    /content/notes/{note_id}
PUT    /content/notes/{note_id}
DELETE /content/notes/{note_id}
"""
from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content import user_notes_repo as repo
from learning.content.db import sessionmaker
from learning.content.security import JwtPrincipal, current_principal

router = APIRouter(prefix="/content", tags=["content-user-notes"])

PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]

MAX_BODY_BYTES = 262144  # 256 KB


async def _session() -> AsyncSession:
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]


class NoteSummary(BaseModel):
    id: str
    title: str
    updated_at: str


class NoteOut(BaseModel):
    id: str
    exam_id: str
    title: str
    body: dict
    created_at: str
    updated_at: str


class NoteCreate(BaseModel):
    exam_id: str = Field(..., min_length=1)
    title: str = Field(default="Untitled note", max_length=200)


class NotePatch(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    body: dict | None = None


def _tenant(principal: JwtPrincipal) -> str:
    return getattr(principal, "tenant_id", None) or "00000000-0000-0000-0000-000000000000"


@router.get("/notes", response_model=list[NoteSummary])
async def list_notes(
    session: SessionDep, principal: PrincipalDep,
    exam_id: Annotated[str, Query(min_length=1)],
) -> list[NoteSummary]:
    rows = await repo.list_for_exam(session, user_id=principal.user_id, exam_id=exam_id)
    return [NoteSummary(**r) for r in rows]


@router.post("/notes", response_model=NoteOut, status_code=201)
async def create_note(
    body: NoteCreate, session: SessionDep, principal: PrincipalDep,
) -> NoteOut:
    n = await repo.count_for_exam(session, user_id=principal.user_id, exam_id=body.exam_id)
    if n >= repo.MAX_NOTES_PER_EXAM:
        raise HTTPException(status_code=409, detail={
            "code": "note_limit_reached",
            "message": f"You can keep at most {repo.MAX_NOTES_PER_EXAM} notes per exam.",
        })
    note = await repo.create(
        session, user_id=principal.user_id, tenant_id=_tenant(principal),
        exam_id=body.exam_id, title=body.title)
    return NoteOut(**note)


@router.get("/notes/{note_id}", response_model=NoteOut)
async def get_note(note_id: str, session: SessionDep, principal: PrincipalDep) -> NoteOut:
    note = await repo.get_owned(session, note_id=note_id, user_id=principal.user_id)
    if note is None:
        raise HTTPException(status_code=404, detail="note not found")
    return NoteOut(**note)


@router.put("/notes/{note_id}", response_model=NoteOut)
async def update_note(
    note_id: str, body: NotePatch, session: SessionDep, principal: PrincipalDep,
) -> NoteOut:
    if body.body is not None and len(json.dumps(body.body)) > MAX_BODY_BYTES:
        raise HTTPException(status_code=422, detail={
            "code": "note_too_large",
            "message": f"Note body exceeds {MAX_BODY_BYTES} bytes.",
        })
    note = await repo.update_owned(
        session, note_id=note_id, user_id=principal.user_id,
        title=body.title, body=body.body)
    if note is None:
        raise HTTPException(status_code=404, detail="note not found")
    return NoteOut(**note)


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(note_id: str, session: SessionDep, principal: PrincipalDep) -> None:
    ok = await repo.delete_owned(session, note_id=note_id, user_id=principal.user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="note not found")
