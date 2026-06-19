"""Translation batch engine — DB writers/readers.

A batch fans out to one task per (question, language). Tasks are
idempotent on (batch_id, question_id, language). The worker claims
PENDING tasks one at a time (PENDING->RUNNING) so a restart resumes
cleanly. Pairs already PUBLISHED are SKIPPED unless overwrite_existing."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CONTENT_SCHEMA = "content_schema"


async def create_batch(
    session: AsyncSession, *, created_by: str | None,
    question_ids: list[str], target_langs: list[str],
    subject: str = "general", overwrite_existing: bool = False,
) -> dict[str, Any]:
    batch_id = str(uuid.uuid4())
    # Existing PUBLISHED (question, lang) pairs to skip.
    published: set[tuple[str, str]] = set()
    if not overwrite_existing and question_ids and target_langs:
        rows = (await session.execute(text(f"""
            SELECT artifact_id::text AS qid, language
              FROM {CONTENT_SCHEMA}.content_artifact_translations
             WHERE status = 'PUBLISHED'
               AND artifact_id = ANY(CAST(:qids AS uuid[]))
               AND language = ANY(:langs)
        """), {"qids": question_ids, "langs": target_langs})).mappings().all()
        published = {(r["qid"], r["language"]) for r in rows}

    await session.execute(text(f"""
        INSERT INTO {CONTENT_SCHEMA}.translation_batches
          (id, created_by, status, total_tasks, target_langs, subject, overwrite_existing)
        VALUES (:id, :by, 'QUEUED', 0, :langs, :subj, :ow)
    """), {"id": batch_id, "by": created_by, "langs": target_langs,
           "subj": subject, "ow": overwrite_existing})

    total = 0
    skipped = 0
    for qid in question_ids:
        for lang in target_langs:
            is_skip = (qid, lang) in published
            await session.execute(text(f"""
                INSERT INTO {CONTENT_SCHEMA}.translation_batch_tasks
                  (id, batch_id, question_id, language, status)
                VALUES (:id, :bid, :qid, :lang, :st)
                ON CONFLICT (batch_id, question_id, language) DO NOTHING
            """), {"id": str(uuid.uuid4()), "bid": batch_id, "qid": qid,
                   "lang": lang, "st": "SKIPPED" if is_skip else "PENDING"})
            total += 1
            if is_skip:
                skipped += 1

    status = "QUEUED" if total - skipped > 0 else "DONE"
    await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batches
           SET total_tasks = :total, status = :st,
               finished_at = CASE WHEN :st = 'DONE' THEN now() ELSE NULL END
         WHERE id = :id
    """), {"total": total, "st": status, "id": batch_id})
    return {"batchId": batch_id, "totalTasks": total, "skipped": skipped}


def _batch_dict(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]), "status": r["status"],
        "totalTasks": r["total_tasks"], "doneTasks": r["done_tasks"],
        "failedTasks": r["failed_tasks"], "targetLangs": list(r["target_langs"]),
        "subject": r["subject"], "createdAt": r["created_at"].isoformat(),
        "finishedAt": r["finished_at"].isoformat() if r["finished_at"] else None,
    }


async def get_batch(session: AsyncSession, batch_id: str) -> dict | None:
    brows = (await session.execute(text(f"""
        SELECT * FROM {CONTENT_SCHEMA}.translation_batches WHERE id = :id
    """), {"id": batch_id})).mappings().all()
    if not brows:
        return None
    trows = (await session.execute(text(f"""
        SELECT t.id, t.question_id, t.language, t.status, t.error, t.version, q.stem
          FROM {CONTENT_SCHEMA}.translation_batch_tasks t
          LEFT JOIN {CONTENT_SCHEMA}.questions q ON q.id = t.question_id
         WHERE t.batch_id = :id
         ORDER BY t.created_at, t.language
    """), {"id": batch_id})).mappings().all()
    tasks = [{
        "id": str(t["id"]), "questionId": str(t["question_id"]),
        "language": t["language"], "status": t["status"], "error": t["error"],
        "version": t["version"], "stem": t["stem"],
    } for t in trows]
    return {"batch": _batch_dict(brows[0]), "tasks": tasks}


async def list_batches(session: AsyncSession, *, limit: int = 20, offset: int = 0) -> dict:
    rows = (await session.execute(text(f"""
        SELECT * FROM {CONTENT_SCHEMA}.translation_batches
         ORDER BY created_at DESC LIMIT :lim OFFSET :off
    """), {"lim": limit, "off": offset})).mappings().all()
    return {"batches": [_batch_dict(r) for r in rows]}


async def next_pending_task(session: AsyncSession, batch_id: str) -> dict | None:
    rows = (await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batch_tasks
           SET status = 'RUNNING', updated_at = now()
         WHERE id = (
             SELECT id FROM {CONTENT_SCHEMA}.translation_batch_tasks
              WHERE batch_id = :bid AND status = 'PENDING'
              ORDER BY created_at
              FOR UPDATE SKIP LOCKED
              LIMIT 1)
        RETURNING id, question_id, language
    """), {"bid": batch_id})).mappings().all()
    if not rows:
        return None
    await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batches SET status = 'RUNNING'
         WHERE id = :bid AND status = 'QUEUED'
    """), {"bid": batch_id})
    r = rows[0]
    return {"id": str(r["id"]), "questionId": str(r["question_id"]), "language": r["language"]}


async def complete_task(session: AsyncSession, *, task_id: str, version: int) -> None:
    await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batch_tasks
           SET status = 'SUCCEEDED', version = :v, error = NULL, updated_at = now()
         WHERE id = :id
    """), {"v": version, "id": task_id})
    await _recount(session, task_id=task_id)


async def fail_task(session: AsyncSession, *, task_id: str, error: str) -> None:
    await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batch_tasks
           SET status = 'FAILED', error = :e, updated_at = now()
         WHERE id = :id
    """), {"e": error[:2000], "id": task_id})
    await _recount(session, task_id=task_id)


async def _recount(session: AsyncSession, *, task_id: str) -> None:
    await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batches b
           SET done_tasks = sub.done, failed_tasks = sub.failed
          FROM (
            SELECT batch_id,
                   count(*) FILTER (WHERE status = 'SUCCEEDED') AS done,
                   count(*) FILTER (WHERE status = 'FAILED') AS failed
              FROM {CONTENT_SCHEMA}.translation_batch_tasks
             WHERE batch_id = (SELECT batch_id FROM {CONTENT_SCHEMA}.translation_batch_tasks WHERE id = :id)
             GROUP BY batch_id
          ) sub
         WHERE b.id = sub.batch_id
    """), {"id": task_id})


async def finalize_batch_if_done(session: AsyncSession, batch_id: str) -> None:
    await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batches b
           SET status = CASE WHEN b.failed_tasks > 0 THEN 'DONE_WITH_ERRORS' ELSE 'DONE' END,
               finished_at = now()
         WHERE b.id = :bid
           AND b.status IN ('QUEUED','RUNNING')
           AND NOT EXISTS (
               SELECT 1 FROM {CONTENT_SCHEMA}.translation_batch_tasks t
                WHERE t.batch_id = :bid AND t.status IN ('PENDING','RUNNING'))
    """), {"bid": batch_id})


async def retry_task(session: AsyncSession, *, batch_id: str, task_id: str) -> bool:
    res = await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batch_tasks
           SET status = 'PENDING', error = NULL, updated_at = now()
         WHERE id = :id AND batch_id = :bid AND status = 'FAILED'
    """), {"id": task_id, "bid": batch_id})
    if res.rowcount > 0:
        await session.execute(text(f"""
            UPDATE {CONTENT_SCHEMA}.translation_batches
               SET status = 'RUNNING', finished_at = NULL WHERE id = :bid
        """), {"bid": batch_id})
        await _recount(session, task_id=task_id)
        return True
    return False
