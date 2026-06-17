"""Per-artifact translation routes (P5-S51, closes Cat §8.1).

Five endpoints sitting on the moderator-queue path:

  GET  /content/questions/{id}/translations
  POST /content/questions/{id}/translations/{lang}/request
  GET  /content/questions/{id}/translations/{lang}
  POST /content/questions/{id}/translations/{lang}/review

Plus the async job poller:

  GET  /localisation/jobs/{job_id}

Reuses the substrate built in S43/S49: `translate_artifact`,
`upsert_translation_draft`, `approve_translation`,
`reject_translation`, glossary lookup. Adds the artifact-aware route
shape the LLD specifies + the job row.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.ai_gateway import AIGateway, AIGatewayError
from learning.content.db import sessionmaker as content_sessionmaker
from learning.localisation.glossary import list_for_lookup
from learning.localisation.job_repo import (
    complete_translation_job,
    fail_translation_job,
    get_translation_job,
    insert_translation_job,
)
from learning.localisation.repositories import (
    approve_translation,
    reject_translation,
    upsert_translation_draft,
)
from learning.localisation.translator import (
    SUPPORTED_LANGS,
    translate_artifact,
)
from learning.types import get_handler, is_supported

router = APIRouter(tags=["content_translations"])

CONTENT_SCHEMA = "content_schema"


def _gateway(request: Request) -> AIGateway:
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


async def _content_session() -> AsyncSession:
    async with content_sessionmaker()() as s:
        yield s


# ── GET /content/questions/{id}/translations ────────────────────────────────


class TranslationStatus(BaseModel):
    artifactId: str
    language: str
    status: Literal["DRAFT", "IN_REVIEW", "PUBLISHED", "REJECTED"]
    aiConfidence: float | None
    version: int
    updatedAt: str


class TranslationListResponse(BaseModel):
    artifactId: str
    translations: list[TranslationStatus]


@router.get(
    "/content/questions/{question_id}/translations",
    response_model=TranslationListResponse,
)
async def list_translations(
    question_id: str,
    session: AsyncSession = Depends(_content_session),
) -> TranslationListResponse:
    rows = (
        await session.execute(
            text(f"""
                SELECT artifact_id, language, status, ai_confidence,
                       version, updated_at
                  FROM {CONTENT_SCHEMA}.content_artifact_translations
                 WHERE artifact_id = :aid
                 ORDER BY language
            """),
            {"aid": question_id},
        )
    ).mappings().all()
    return TranslationListResponse(
        artifactId=question_id,
        translations=[
            TranslationStatus(
                artifactId=str(r["artifact_id"]),
                language=r["language"],
                status=r["status"],
                aiConfidence=float(r["ai_confidence"]) if r["ai_confidence"] is not None else None,
                version=int(r["version"]),
                updatedAt=r["updated_at"].isoformat(),
            )
            for r in rows
        ],
    )


# ── POST /content/questions/{id}/translations/{lang}/request ────────────────


class TranslationRequestBody(BaseModel):
    sourceLang: str = "en"
    subject: str = "general"


class TranslationJobResponse(BaseModel):
    jobId: str
    artifactId: str
    targetLang: str
    status: str


@router.post(
    "/content/questions/{question_id}/translations/{lang}/request",
    response_model=TranslationJobResponse,
)
async def request_translation(
    question_id: str,
    lang: str,
    body: TranslationRequestBody,
    gateway: AIGateway = Depends(_gateway),
    session: AsyncSession = Depends(_content_session),
) -> TranslationJobResponse:
    """Trigger AI translation for a language.

    v1 runs synchronously — same latency as `/localisation/translate`.
    The job row exists for audit + future async-worker dispatch.
    """
    if lang not in SUPPORTED_LANGS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "unsupported_language",
                "message": f"target_lang={lang!r} not in {SUPPORTED_LANGS}",
            },
        )

    # Load the artifact's typed payload + question_type so the
    # localisation walker has both to work with.
    rows = (
        await session.execute(
            text(f"""
                SELECT id, question_type, payload, stem, choices, correct_idx,
                       language AS source_language
                  FROM {CONTENT_SCHEMA}.questions
                 WHERE id = :id
            """),
            {"id": question_id},
        )
    ).mappings().all()
    if not rows:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "question_not_found",
                "message": f"question id={question_id!r} not in content_schema.questions",
            },
        )
    row = rows[0]
    type_id = row["question_type"] or "MCQ_SINGLE"
    if not is_supported(type_id):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "unsupported_type",
                "message": f"type_id={type_id!r} not registered",
            },
        )

    payload = row["payload"] or _synth_legacy_payload(row)
    if payload is None:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "no_payload",
                "message": "question has no typed payload and choices/correct_idx are missing",
            },
        )

    handler = get_handler(type_id)
    paths = handler.translatable_fields(payload)

    job_id = await insert_translation_job(
        session,
        artifact_id=question_id,
        target_lang=lang,
        source_lang=body.sourceLang,
    )
    await session.commit()

    try:
        glossary = await list_for_lookup(
            session,
            subject=body.subject,
            source_lang=body.sourceLang,
            target_lang=lang,
            text_to_match=" ".join(_collect_strings(payload)),
        )
        draft = await translate_artifact(
            gateway,
            artifact_id=question_id,
            target_lang=lang,
            payload=payload,
            translatable_paths=paths,
            glossary=glossary,
            source_lang=body.sourceLang,
        )
        version = await upsert_translation_draft(
            session,
            artifact_id=question_id,
            target_lang=lang,
            payload_translation=draft.payload_translation,
            ai_confidence=draft.avg_confidence,
            cultural_flags=draft.cultural_flags,
        )
        await complete_translation_job(
            session,
            job_id=job_id,
            output={
                "version": version,
                "fieldsTranslated": draft.fields_translated,
                "avgConfidence": draft.avg_confidence,
                "culturalFlags": draft.cultural_flags,
            },
        )
        await session.commit()
    except AIGatewayError as e:
        await fail_translation_job(session, job_id=job_id, error=f"ai_gateway: {e}")
        await session.commit()
        raise HTTPException(
            status_code=502,
            detail={"code": "ai_gateway_error", "message": str(e)},
        ) from e
    except Exception as e:  # noqa: BLE001
        await fail_translation_job(session, job_id=job_id, error=str(e))
        await session.commit()
        raise HTTPException(
            status_code=500,
            detail={"code": "translation_failed", "message": str(e)},
        ) from e

    return TranslationJobResponse(
        jobId=job_id,
        artifactId=question_id,
        targetLang=lang,
        status="succeeded",
    )


# ── GET /content/questions/{id}/translations/{lang} ─────────────────────────


class SingleTranslationResponse(BaseModel):
    artifactId: str
    language: str
    status: str
    payloadTranslation: dict[str, Any]
    aiConfidence: float | None
    version: int
    reviewerId: str | None
    updatedAt: str


@router.get(
    "/content/questions/{question_id}/translations/{lang}",
    response_model=SingleTranslationResponse,
)
async def get_translation(
    question_id: str,
    lang: str,
    session: AsyncSession = Depends(_content_session),
) -> SingleTranslationResponse:
    rows = (
        await session.execute(
            text(f"""
                SELECT artifact_id, language, status, payload_translation,
                       ai_confidence, version, reviewer_id, updated_at
                  FROM {CONTENT_SCHEMA}.content_artifact_translations
                 WHERE artifact_id = :aid AND language = :lang
            """),
            {"aid": question_id, "lang": lang},
        )
    ).mappings().all()
    if not rows:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "translation_not_found",
                "message": f"no translation for artifact={question_id!r} lang={lang!r}",
            },
        )
    r = rows[0]
    return SingleTranslationResponse(
        artifactId=str(r["artifact_id"]),
        language=r["language"],
        status=r["status"],
        payloadTranslation=r["payload_translation"] or {},
        aiConfidence=float(r["ai_confidence"]) if r["ai_confidence"] is not None else None,
        version=int(r["version"]),
        reviewerId=str(r["reviewer_id"]) if r["reviewer_id"] else None,
        updatedAt=r["updated_at"].isoformat(),
    )


# ── POST /content/questions/{id}/translations/{lang}/review ─────────────────


class ReviewAction(BaseModel):
    action: Literal["approve", "reject"]
    reviewerId: str = Field(min_length=1)
    rejectionReason: str | None = None


@router.post(
    "/content/questions/{question_id}/translations/{lang}/review",
    response_model=SingleTranslationResponse,
)
async def review_translation(
    question_id: str,
    lang: str,
    body: ReviewAction,
    session: AsyncSession = Depends(_content_session),
) -> SingleTranslationResponse:
    if body.action == "approve":
        await approve_translation(
            session,
            artifact_id=question_id,
            target_lang=lang,
            reviewer_id=body.reviewerId,
        )
    else:
        await reject_translation(
            session,
            artifact_id=question_id,
            target_lang=lang,
            reviewer_id=body.reviewerId,
        )
    await session.commit()
    return await get_translation(question_id, lang, session)


# ── GET /localisation/jobs/{job_id} ─────────────────────────────────────────


@router.get("/localisation/jobs/{job_id}")
async def get_job(
    job_id: str,
    session: AsyncSession = Depends(_content_session),
) -> dict[str, Any]:
    job = await get_translation_job(session, job_id=job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "job_not_found", "message": f"job_id={job_id!r}"},
        )
    return job


# ── helpers ─────────────────────────────────────────────────────────────────


def _synth_legacy_payload(row) -> dict[str, Any] | None:  # noqa: ANN001
    """Build the canonical MCQ_SINGLE payload from legacy choices+correct_idx
    columns when `payload` JSONB is NULL (the 480 seeded rows)."""
    choices = row.get("choices") or []
    if not choices:
        return None
    options = [
        {"id": chr(ord("A") + i), "text": str(c)}
        for i, c in enumerate(choices)
    ]
    correct_idx = int(row.get("correct_idx") or 0)
    correct_id = options[correct_idx]["id"] if correct_idx < len(options) else options[0]["id"]
    return {
        "stem": row.get("stem") or "",
        "options": options,
        "correct_id": correct_id,
    }


def _collect_strings(node: Any) -> list[str]:
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
