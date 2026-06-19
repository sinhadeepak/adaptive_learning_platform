"""Single-artifact translate core, shared by the per-question endpoint
and the batch worker. Loads the artifact payload, runs the glossary +
AI translation, and persists a DRAFT. Returns the result metadata."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.ai_gateway import AIGateway
from learning.localisation.artifact_payload import collect_strings, synth_legacy_payload
from learning.localisation.glossary import list_for_lookup
from learning.localisation.repositories import upsert_translation_draft
from learning.localisation.translator import translate_artifact
from learning.types import get_handler, is_supported

CONTENT_SCHEMA = "content_schema"


async def translate_question_into(
    session: AsyncSession, gateway: AIGateway, *,
    question_id: str, target_lang: str,
    subject: str = "general", source_lang: str = "en",
) -> dict[str, Any]:
    rows = (await session.execute(text(f"""
        SELECT id, question_type, payload, stem, choices, correct_idx,
               language AS source_language
          FROM {CONTENT_SCHEMA}.questions WHERE id = :id
    """), {"id": question_id})).mappings().all()
    if not rows:
        raise ValueError(f"question id={question_id!r} not found")
    row = rows[0]
    type_id = row["question_type"] or "MCQ_SINGLE"
    if not is_supported(type_id):
        raise ValueError(f"unsupported question type {type_id!r}")
    payload = row["payload"] or synth_legacy_payload(row)
    if payload is None:
        raise ValueError("question has no typed payload and no legacy choices")

    handler = get_handler(type_id)
    paths = handler.translatable_fields(payload)
    glossary = await list_for_lookup(
        session, subject=subject, source_lang=source_lang,
        target_lang=target_lang, text_to_match=" ".join(collect_strings(payload)))
    draft = await translate_artifact(
        gateway, artifact_id=question_id, target_lang=target_lang,
        payload=payload, translatable_paths=paths, glossary=glossary,
        source_lang=source_lang)
    version = await upsert_translation_draft(
        session, artifact_id=question_id, target_lang=target_lang,
        payload_translation=draft.payload_translation,
        ai_confidence=draft.avg_confidence, cultural_flags=draft.cultural_flags)
    return {
        "version": version, "fieldsTranslated": draft.fields_translated,
        "avgConfidence": draft.avg_confidence, "culturalFlags": draft.cultural_flags,
    }
