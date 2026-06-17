"""Language registry CRUD routes (admin)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker as content_sessionmaker
from learning.localisation import language_registry as reg

router = APIRouter(prefix="/localisation", tags=["localisation_languages"])


async def _session() -> AsyncSession:
    async with content_sessionmaker()() as s:
        yield s


class LanguageIn(BaseModel):
    code: str = Field(min_length=2, max_length=8)
    name: str = Field(min_length=1)
    nativeName: str = Field(min_length=1)
    script: str | None = None
    enabled: bool = True
    sortOrder: int = 100


class LanguagePatch(BaseModel):
    enabled: bool | None = None
    sortOrder: int | None = None


@router.get("/languages")
async def list_languages(
    includeDisabled: bool = Query(default=False),
    session: AsyncSession = Depends(_session),
) -> dict:
    return {"languages": await reg.list_languages(session, include_disabled=includeDisabled)}


@router.post("/languages")
async def upsert_language(body: LanguageIn, session: AsyncSession = Depends(_session)) -> dict:
    await reg.upsert_language(
        session, code=body.code, name=body.name, native_name=body.nativeName,
        script=body.script, enabled=body.enabled, sort_order=body.sortOrder,
    )
    await session.commit()
    return await reg.get_language(session, body.code)  # type: ignore[return-value]


@router.patch("/languages/{code}")
async def patch_language(
    code: str, body: LanguagePatch, session: AsyncSession = Depends(_session),
) -> dict:
    current = await reg.get_language(session, code)
    if current is None:
        raise HTTPException(status_code=404, detail={"code": "language_not_found", "message": code})
    if body.enabled is not None:
        await reg.set_enabled(session, code=code, enabled=body.enabled)
    if body.sortOrder is not None:
        await reg.upsert_language(
            session, code=code, name=current["name"], native_name=current["nativeName"],
            script=current["script"],
            enabled=body.enabled if body.enabled is not None else current["enabled"],
            sort_order=body.sortOrder,
        )
    await session.commit()
    return await reg.get_language(session, code)  # type: ignore[return-value]
