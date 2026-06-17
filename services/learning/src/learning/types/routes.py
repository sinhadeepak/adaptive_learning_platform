"""Type registry HTTP surface (P5-S51, closes CE-104).

Per Question Catalogue §8.1. Four endpoints exposing the in-process
type registry to the authoring UI and content moderator queue:

  GET /content/types
  GET /content/types/{type_id}/payload-schema
  GET /content/types/{type_id}/translatable-fields
  GET /content/exams/{exam_id}/supported-types

The registry itself is read-only after startup (see registry.py); these
routes are thin readers — no DB hits except the per-exam filter, which
queries `catalog_schema.exam_question_type_support` (S37 schema).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.catalog.db import sessionmaker as catalog_sessionmaker
from learning.types import (
    TypeMeta,
    all_type_metas,
    get_handler,
    is_supported,
)

router = APIRouter(prefix="/content", tags=["content_types"])

CATALOG_SCHEMA = "catalog_schema"


async def _catalog_session() -> AsyncSession:
    async with catalog_sessionmaker()() as s:
        yield s


# ── /content/types ───────────────────────────────────────────────────────────


@router.get("/types", response_model=list[TypeMeta])
async def list_types() -> list[TypeMeta]:
    """All registered question types — alphabetised for deterministic
    rendering. Authoring UI consumes this to populate the type-picker."""
    return all_type_metas()


# ── /content/types/{type_id}/payload-schema ──────────────────────────────────


@router.get("/types/{type_id}/payload-schema")
async def get_payload_schema(type_id: str) -> dict:
    """JSON Schema for the type's payload. Authoring UI uses Ajv (or
    equivalent) to validate author input client-side before submit."""
    if not is_supported(type_id):
        raise HTTPException(
            status_code=404,
            detail={
                "code": "unknown_type",
                "message": f"type_id={type_id!r} is not registered",
            },
        )
    handler = get_handler(type_id)
    return {
        "type_id": type_id,
        "schema": handler.payload_schema.model_json_schema(),
    }


# ── /content/types/{type_id}/translatable-fields ─────────────────────────────


class TranslatableFieldsResponse(BaseModel):
    type_id: str
    fields: list[str]


@router.get(
    "/types/{type_id}/translatable-fields",
    response_model=TranslatableFieldsResponse,
)
async def get_translatable_fields(type_id: str) -> TranslatableFieldsResponse:
    """Dotted-path fields translated by the localisation walker. The
    `payload` arg is irrelevant for v1 handlers (paths are static per
    type); we pass {} to satisfy the Protocol signature."""
    if not is_supported(type_id):
        raise HTTPException(
            status_code=404,
            detail={
                "code": "unknown_type",
                "message": f"type_id={type_id!r} is not registered",
            },
        )
    handler = get_handler(type_id)
    return TranslatableFieldsResponse(
        type_id=type_id,
        fields=handler.translatable_fields({}),
    )


# ── /content/exams/{exam_id}/supported-types ─────────────────────────────────


class SupportedTypesResponse(BaseModel):
    exam_id: str
    types: list[TypeMeta]


@router.get(
    "/exams/{exam_id}/supported-types",
    response_model=SupportedTypesResponse,
)
async def get_exam_supported_types(
    exam_id: str,
    session: AsyncSession = Depends(_catalog_session),
) -> SupportedTypesResponse:
    """Per-exam type filter. Authoring UI uses this to hide types the
    exam doesn't allow (per Question Catalogue §2.2 coverage matrix)."""
    rows = (
        await session.execute(
            text(f"""
                SELECT type_id
                  FROM {CATALOG_SCHEMA}.exam_question_type_support
                 WHERE exam_id = :eid
                   AND enabled = TRUE
            """),
            {"eid": exam_id},
        )
    ).mappings().all()

    enabled_ids = {r["type_id"] for r in rows}
    if not enabled_ids:
        # No row in the support table → return all registered types
        # (open default). The S37 backfill seeded the matrix for the 7
        # known exams; unknown exam ids fall through to "everything".
        return SupportedTypesResponse(exam_id=exam_id, types=all_type_metas())

    return SupportedTypesResponse(
        exam_id=exam_id,
        types=[m for m in all_type_metas() if m.type_id in enabled_ids],
    )
