"""Bulk verification queue — list DRAFT (or other) translations with their
source payload for side-by-side review, plus bulk approve/reject."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.localisation.artifact_payload import synth_legacy_payload
from learning.localisation.repositories import approve_translation, reject_translation
from learning.types import get_handler, is_supported

CONTENT_SCHEMA = "content_schema"


async def list_queue(
    session: AsyncSession, *, lang: str | None = None, status: str = "DRAFT",
    batch_id: str | None = None, min_confidence: float | None = None,
    limit: int = 50, offset: int = 0,
) -> dict[str, Any]:
    clauses = ["t.status = :status"]
    params: dict[str, Any] = {"status": status, "limit": limit, "offset": offset}
    if lang:
        clauses.append("t.language = :lang")
        params["lang"] = lang
    if min_confidence is not None:
        clauses.append("t.ai_confidence >= :minc")
        params["minc"] = min_confidence
    if batch_id:
        clauses.append(
            "EXISTS (SELECT 1 FROM {s}.translation_batch_tasks bt "
            "WHERE bt.batch_id = :bid AND bt.question_id = t.artifact_id "
            "AND bt.language = t.language)".format(s=CONTENT_SCHEMA))
        params["bid"] = batch_id
    where = " AND ".join(clauses)

    count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}
    total = (await session.execute(text(f"""
        SELECT count(*) FROM {CONTENT_SCHEMA}.content_artifact_translations t WHERE {where}
    """), count_params)).scalar()

    rows = (await session.execute(text(f"""
        SELECT t.artifact_id, t.language, t.status, t.ai_confidence, t.version,
               t.cultural_flags, t.payload_translation,
               q.stem, q.question_type, q.payload, q.choices, q.correct_idx
          FROM {CONTENT_SCHEMA}.content_artifact_translations t
          JOIN {CONTENT_SCHEMA}.questions q ON q.id = t.artifact_id
         WHERE {where}
         ORDER BY t.updated_at, t.artifact_id, t.language
         LIMIT :limit OFFSET :offset
    """), params)).mappings().all()

    items = []
    for r in rows:
        type_id = r["question_type"] or "MCQ_SINGLE"
        source_payload = r["payload"]
        paths: list[str] = []
        if is_supported(type_id):
            source_payload = source_payload or synth_legacy_payload(r)
            if source_payload is not None:
                paths = get_handler(type_id).translatable_fields(source_payload)
        items.append({
            "questionId": str(r["artifact_id"]), "language": r["language"],
            "status": r["status"], "aiConfidence": r["ai_confidence"],
            "version": r["version"], "culturalFlags": list(r["cultural_flags"] or []),
            "stem": r["stem"], "sourcePayload": source_payload or {},
            "payloadTranslation": r["payload_translation"] or {},
            "translatablePaths": paths,
        })
    return {"items": items, "total": int(total or 0)}


async def bulk_decide(
    session: AsyncSession, *, decisions: list[dict[str, Any]], reviewer_id: str,
) -> dict[str, Any]:
    results = []
    for d in decisions:
        qid, lang, action = d["questionId"], d["lang"], d["action"]
        try:
            if action == "approve":
                await approve_translation(session, artifact_id=qid, target_lang=lang, reviewer_id=reviewer_id)
            elif action == "reject":
                # rejectionReason not yet persisted (no column in content_artifact_translations)
                await reject_translation(session, artifact_id=qid, target_lang=lang, reviewer_id=reviewer_id)
            else:
                raise ValueError(f"unknown action {action!r}")
            results.append({"questionId": qid, "lang": lang, "ok": True})
        except Exception as e:  # noqa: BLE001
            results.append({"questionId": qid, "lang": lang, "ok": False, "error": str(e)})
    return {"results": results}
