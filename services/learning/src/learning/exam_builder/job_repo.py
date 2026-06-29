"""Async exam-builder research jobs — persistence over ai_generation_jobs.

Reuses `content_schema.ai_generation_jobs` (migrations 012 + 044),
discriminated by `prompt_template_id='exam_research'`. Mirrors
`localisation/job_repo.py`. `requested_by` scopes get/list per-admin;
`request_input` stores the original ResearchRequest so the worker (and a
retry) can reconstruct the prompt.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CONTENT_SCHEMA = "content_schema"
TEMPLATE_ID = "exam_research"
TEMPLATE_VERSION = "1.0.0"

# A pending job older than this is reported as failed so the poller never
# spins forever on a worker the process lost (restart / crash mid-job).
STALE_AFTER_MINUTES = 10


def _as_dict(value: Any) -> dict[str, Any] | None:
    """JSONB may surface as a dict or a JSON string depending on driver
    codec config — normalise to a dict."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return value


async def create_research_job(
    session: AsyncSession, *, request_input: dict[str, Any], requested_by: str
) -> str:
    job_id = str(uuid.uuid4())
    await session.execute(
        text(
            f"""
            INSERT INTO {CONTENT_SCHEMA}.ai_generation_jobs
              (id, prompt_template_id, prompt_version, model, status,
               requested_by, request_input, created_at)
            VALUES (:id, :tid, :ver, 'pending', 'pending',
                    :rb, CAST(:ri AS jsonb), now())
            """
        ),
        {
            "id": job_id,
            "tid": TEMPLATE_ID,
            "ver": TEMPLATE_VERSION,
            "rb": requested_by,
            "ri": json.dumps(request_input),
        },
    )
    return job_id


async def complete_research_job(
    session: AsyncSession, *, job_id: str, output: dict[str, Any]
) -> None:
    await session.execute(
        text(
            f"""
            UPDATE {CONTENT_SCHEMA}.ai_generation_jobs
               SET status='succeeded', output=CAST(:out AS jsonb), completed_at=now()
             WHERE id=:id
            """
        ),
        {"id": job_id, "out": json.dumps(output)},
    )


async def fail_research_job(session: AsyncSession, *, job_id: str, error: str) -> None:
    await session.execute(
        text(
            f"""
            UPDATE {CONTENT_SCHEMA}.ai_generation_jobs
               SET status='failed', error_message=:err, completed_at=now()
             WHERE id=:id
            """
        ),
        {"id": job_id, "err": error[:500]},
    )


def _effective_status(status: str, created_at: Any, completed_at: Any) -> str:
    """A row stuck 'pending' past the stale cutoff reads as 'failed'."""
    if status != "pending" or created_at is None:
        return status
    # created_at is timezone-aware; compare against its own clock domain via
    # the DB is cleaner, but a Python-side cutoff keeps this query-free.
    import datetime as _dt

    now = _dt.datetime.now(tz=created_at.tzinfo)
    if (now - created_at) > _dt.timedelta(minutes=STALE_AFTER_MINUTES):
        return "failed"
    return status


async def get_research_job(
    session: AsyncSession, *, job_id: str, requested_by: str
) -> dict[str, Any] | None:
    row = (
        (
            await session.execute(
                text(
                    f"""
                SELECT id, status, output, error_message, created_at, completed_at
                  FROM {CONTENT_SCHEMA}.ai_generation_jobs
                 WHERE id=:id AND prompt_template_id=:tid AND requested_by=:rb
                """
                ),
                {"id": job_id, "tid": TEMPLATE_ID, "rb": requested_by},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return None
    status = _effective_status(row["status"], row["created_at"], row["completed_at"])
    error = row["error_message"]
    if status == "failed" and not error:
        error = "Generation timed out — please retry."
    return {
        "jobId": str(row["id"]),
        "status": status,
        "result": _as_dict(row["output"]),
        "error": error,
    }


async def list_research_jobs(
    session: AsyncSession, *, requested_by: str, since_hours: int = 24
) -> list[dict[str, Any]]:
    rows = (
        (
            await session.execute(
                text(
                    f"""
                SELECT id, status, request_input, created_at, completed_at
                  FROM {CONTENT_SCHEMA}.ai_generation_jobs
                 WHERE prompt_template_id=:tid AND requested_by=:rb
                   AND (status='pending'
                        OR created_at > now() - make_interval(hours => :hrs))
                 ORDER BY created_at DESC
                """
                ),
                {"tid": TEMPLATE_ID, "rb": requested_by, "hrs": since_hours},
            )
        )
        .mappings()
        .all()
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        ri = _as_dict(r["request_input"]) or {}
        out.append(
            {
                "jobId": str(r["id"]),
                "status": _effective_status(r["status"], r["created_at"], r["completed_at"]),
                "examCode": ri.get("code"),
                "examName": ri.get("name"),
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                "completedAt": r["completed_at"].isoformat() if r["completed_at"] else None,
            }
        )
    return out
