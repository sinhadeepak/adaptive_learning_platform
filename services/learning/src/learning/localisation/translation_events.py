"""Build + emit content.translation.published from a PUBLISHED translation row.

The quiz service consumes this to mirror translated text into its own DB. We
extract stem/choices/explanation here (learning owns the type handlers) so the
Go consumer stays type-agnostic."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content import events
from learning.types import get_handler, is_supported

CONTENT_SCHEMA = "content_schema"


def _choices_from_payload(payload: dict[str, Any]) -> list[str] | None:
    opts = payload.get("options")
    if isinstance(opts, list) and all(isinstance(o, dict) for o in opts):
        return [str(o.get("text", "")) for o in opts]
    return None


async def build_translation_event(
    session: AsyncSession, *, question_id: str, language: str,
) -> dict[str, Any] | None:
    rows = (await session.execute(text(f"""
        SELECT t.payload_translation, t.version, q.question_type
          FROM {CONTENT_SCHEMA}.content_artifact_translations t
          JOIN {CONTENT_SCHEMA}.questions q ON q.id = t.artifact_id
         WHERE t.artifact_id = :aid AND t.language = :lang AND t.status = 'PUBLISHED'
    """), {"aid": question_id, "lang": language})).mappings().all()
    if not rows:
        return None
    r = rows[0]
    payload = r["payload_translation"] or {}
    # type handler is available for future per-type extraction; choices come
    # from options[*].text which all MCQ-family types share.
    type_id = r["question_type"] or "MCQ_SINGLE"
    _ = get_handler(type_id) if is_supported(type_id) else None
    return {
        "question_id": str(question_id),
        "language": language,
        "stem": payload.get("stem"),
        "choices": _choices_from_payload(payload),
        "explanation": payload.get("explanation"),
        "payload": payload,
        "version": int(r["version"]),
    }


async def emit_translation_published(
    session: AsyncSession, *, question_id: str, language: str,
) -> None:
    """Build + publish. Best-effort: never raises."""
    try:
        ev = await build_translation_event(session, question_id=question_id, language=language)
        if ev is not None:
            await events.publish_translation_published(ev)
    except Exception:  # noqa: BLE001
        # Emission must never break the approve/commit path.
        pass
