"""Localisation HTTP routes — translation pipeline + glossary CRUD.

Endpoints:
- POST /localisation/translate                          (single artifact)
- GET  /localisation/glossary/{subject}/{lang}          (lookup)
- POST /localisation/glossary/{subject}/{lang}          (upsert)
- POST /localisation/glossary/{subject}/{lang}/import   (bulk CSV — v1 stub)

Per-language reviewer queue + cultural review queue land alongside the
admin UI in S45 (separate web-portal routes); this module focuses on
the substrate the UI calls.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from learning.ai_gateway import AIGateway, AIGatewayError
from learning.content.db import sessionmaker as content_sessionmaker
from learning.localisation.glossary import (
    GlossaryEntry,
    GlossaryEntryIn,
    list_for_lookup,
    upsert_entry,
)
from learning.localisation.translator import (
    SUPPORTED_LANGS,
    TranslationDraft,
    translate_artifact,
)

router = APIRouter(prefix="/localisation", tags=["localisation"])


def get_gateway(request: Request) -> AIGateway:
    gw = getattr(request.app.state, "ai_gateway", None)
    if gw is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "ai_gateway_unavailable",
                "message": "AI Gateway is not available; translation pipeline disabled.",
            },
        )
    return gw


async def get_session() -> AsyncSession:
    async with content_sessionmaker()() as s:
        yield s


# ── /translate ───────────────────────────────────────────────────────────────


class TranslateRequest(BaseModel):
    artifactId: str = Field(min_length=1)
    targetLang: str = Field(min_length=2, max_length=8)
    payload: dict[str, Any]
    translatablePaths: list[str] = Field(min_length=1, max_length=40)
    sourceLang: str = "en"
    subject: str = "general"


class TranslateResponse(BaseModel):
    artifactId: str
    targetLang: str
    payloadTranslation: dict[str, Any]
    culturalFlags: list[str]
    avgConfidence: float
    fieldsTranslated: int


@router.post("/translate", response_model=TranslateResponse)
async def post_translate(
    req: TranslateRequest,
    gateway: AIGateway = Depends(get_gateway),
    session: AsyncSession = Depends(get_session),
) -> TranslateResponse:
    """Translate an artifact end-to-end. Caller persists the
    `payloadTranslation` into `content_artifact_translations` (DRAFT
    status) — this endpoint is read-only over content_schema."""
    if req.targetLang not in SUPPORTED_LANGS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "unsupported_language",
                "message": f"target_lang={req.targetLang!r} not in {SUPPORTED_LANGS}",
            },
        )

    # Fetch glossary entries relevant to this artifact's subject + lang pair.
    # Concatenate all translatable strings to seed the relevance filter.
    payload_blob = " ".join(_collect_strings(req.payload))
    entries = await list_for_lookup(
        session,
        subject=req.subject,
        source_lang=req.sourceLang,
        target_lang=req.targetLang,
        text_to_match=payload_blob,
    )

    try:
        draft: TranslationDraft = await translate_artifact(
            gateway,
            artifact_id=req.artifactId,
            target_lang=req.targetLang,
            payload=req.payload,
            translatable_paths=req.translatablePaths,
            glossary=entries,
            source_lang=req.sourceLang,
        )
    except AIGatewayError as e:
        raise HTTPException(
            status_code=502,
            detail={"code": "ai_gateway_error", "message": str(e)},
        ) from e

    return TranslateResponse(
        artifactId=draft.artifact_id,
        targetLang=draft.target_lang,
        payloadTranslation=draft.payload_translation,
        culturalFlags=draft.cultural_flags,
        avgConfidence=draft.avg_confidence,
        fieldsTranslated=draft.fields_translated,
    )


def _collect_strings(node: Any) -> list[str]:
    """Crude flat-collector — pulls every string out of a payload tree."""
    out: list[str] = []
    if isinstance(node, str):
        out.append(node)
    elif isinstance(node, dict):
        for v in node.values():
            out.extend(_collect_strings(v))
    elif isinstance(node, list):
        for v in node:
            out.extend(_collect_strings(v))
    return out


# ── /glossary CRUD ────────────────────────────────────────────────────────────


class GlossaryListResponse(BaseModel):
    entries: list[GlossaryEntry]


@router.get("/glossary/{subject}/{lang_pair}", response_model=GlossaryListResponse)
async def get_glossary(
    subject: str,
    lang_pair: str,
    session: AsyncSession = Depends(get_session),
) -> GlossaryListResponse:
    """`lang_pair` shape: 'en-hi'. Returns all glossary entries for
    the (subject, source_lang, target_lang) tuple."""
    if "-" not in lang_pair:
        raise HTTPException(
            status_code=400,
            detail={"code": "bad_lang_pair", "message": "lang_pair must be 'src-tgt'"},
        )
    src, tgt = lang_pair.split("-", 1)
    entries = await list_for_lookup(
        session, subject=subject, source_lang=src, target_lang=tgt,
    )
    return GlossaryListResponse(entries=entries)


@router.post("/glossary/{subject}/{lang_pair}", response_model=dict)
async def post_glossary_upsert(
    subject: str,
    lang_pair: str,
    entry: GlossaryEntryIn,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Upsert a glossary entry. URL `subject` + `lang_pair` override
    the body when they conflict (URL is authoritative)."""
    if "-" not in lang_pair:
        raise HTTPException(
            status_code=400,
            detail={"code": "bad_lang_pair", "message": "lang_pair must be 'src-tgt'"},
        )
    src, tgt = lang_pair.split("-", 1)
    forced = entry.model_copy(update={
        "subject": subject, "source_lang": src, "target_lang": tgt,
    })
    eid = await upsert_entry(session, forced)
    await session.commit()
    return {"id": eid, "status": "upserted"}
