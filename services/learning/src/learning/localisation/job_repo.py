"""Async translation job model (P5-S51, closes part of CE-401).

Per Question Catalogue §8.3. `POST /content/questions/{id}/translations/
{lang}/request` enqueues a job and returns `job_id`; clients poll
`GET /localisation/jobs/{job_id}` until status=COMPLETE.

For v1 the job runs synchronously inside the request handler — same
latency profile as `/localisation/translate`, but the route lives at
the artifact-aware path the LLD defines and the job row exists for
audit + replay. Background-worker dispatch lands when the queue grows.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CONTENT_SCHEMA = "content_schema"


async def insert_translation_job(
    session: AsyncSession,
    *,
    artifact_id: str,
    target_lang: str,
    source_lang: str,
    requested_by: str | None = None,
) -> str:
    """Reuses the `ai_generation_jobs` table for translation jobs since
    its shape (prompt_template, version, status, output, timing) is a
    perfect fit. `prompt_template_id='translate_field'` discriminates
    translation jobs from authoring jobs."""
    job_id = str(uuid.uuid4())
    await session.execute(
        text(f"""
            INSERT INTO {CONTENT_SCHEMA}.ai_generation_jobs
              (id, artifact_id, prompt_template_id, prompt_version,
               model, status, output, error_message,
               created_at)
            VALUES (:id, :aid, 'translate_field', '1.0.0',
                    'pending', 'pending', NULL, NULL,
                    now())
        """),
        {"id": job_id, "aid": artifact_id},
    )
    return job_id


async def complete_translation_job(
    session: AsyncSession,
    *,
    job_id: str,
    output: dict[str, Any],
) -> None:
    await session.execute(
        text(f"""
            UPDATE {CONTENT_SCHEMA}.ai_generation_jobs
               SET status       = 'succeeded',
                   output       = CAST(:out AS jsonb),
                   completed_at = now()
             WHERE id = :id
        """),
        {"id": job_id, "out": json.dumps(output)},
    )


async def fail_translation_job(
    session: AsyncSession,
    *,
    job_id: str,
    error: str,
) -> None:
    await session.execute(
        text(f"""
            UPDATE {CONTENT_SCHEMA}.ai_generation_jobs
               SET status        = 'failed',
                   error_message = :err,
                   completed_at  = now()
             WHERE id = :id
        """),
        {"id": job_id, "err": error},
    )


async def get_translation_job(
    session: AsyncSession, *, job_id: str,
) -> dict[str, Any] | None:
    rows = (
        await session.execute(
            text(f"""
                SELECT id, artifact_id, status, output, error_message,
                       created_at, completed_at
                  FROM {CONTENT_SCHEMA}.ai_generation_jobs
                 WHERE id = :id
                   AND prompt_template_id = 'translate_field'
            """),
            {"id": job_id},
        )
    ).mappings().all()
    if not rows:
        return None
    r = rows[0]
    return {
        "jobId": str(r["id"]),
        "artifactId": str(r["artifact_id"]) if r["artifact_id"] else None,
        "status": r["status"],
        "output": r["output"],
        "errorMessage": r["error_message"],
        "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
        "completedAt": r["completed_at"].isoformat() if r["completed_at"] else None,
    }
