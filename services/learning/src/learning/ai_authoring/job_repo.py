"""Async bulk question-generation jobs — persistence over ai_generation_jobs.

Reuses `content_schema.ai_generation_jobs` (migrations 012 + 044),
discriminated by `prompt_template_id='bulk_questions'`. Mirrors
`exam_builder/job_repo.py`. `requested_by` scopes get/list per-author;
`request_input` stores the original BulkDraftRequest (retry-safe).
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CONTENT_SCHEMA = "content_schema"
TEMPLATE_ID = "bulk_questions"
TEMPLATE_VERSION = "1.0.0"

# A pending job is considered dead only if it hasn't made progress (no chunk
# completed → no heartbeat update) for this long. Progress-based, NOT age-based,
# so a legitimately long job (hundreds of drafts) is never falsely timed out
# while it's still producing. A truly orphaned job (process died) stops
# heart-beating and is reclaimed by startup recovery / this cutoff.
STALE_NO_PROGRESS_MINUTES = 15


def _as_obj(value: Any) -> Any:
    """JSONB may surface as a dict/list or a JSON string depending on driver
    codec — normalise to the parsed object."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return value


def _parse_iso(s: Any):
    import datetime as _dt

    if not isinstance(s, str):
        return None
    try:
        return _dt.datetime.fromisoformat(s)
    except ValueError:
        return None


async def create_bulk_job(
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


async def complete_bulk_job(session: AsyncSession, *, job_id: str, output: dict[str, Any]) -> None:
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


async def fail_bulk_job(session: AsyncSession, *, job_id: str, error: str) -> None:
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


async def update_bulk_progress(
    session: AsyncSession, *, job_id: str, output: dict[str, Any]
) -> None:
    """Persist partial progress mid-run. Keeps status='pending'; `output`
    carries `progress` + `heartbeat` so the job survives a restart (resume)
    and is never falsely timed out while progressing."""
    await session.execute(
        text(
            f"""
            UPDATE {CONTENT_SCHEMA}.ai_generation_jobs
               SET output=CAST(:out AS jsonb)
             WHERE id=:id AND status='pending'
            """
        ),
        {"id": job_id, "out": json.dumps(output)},
    )


def _effective_status(status: str, created_at: Any, heartbeat: Any = None) -> str:
    """A pending job fails only after NO progress for the cutoff. `heartbeat`
    (last chunk-completion time) takes precedence over created_at, so an
    actively-progressing job never times out."""
    if status != "pending" or created_at is None:
        return status
    import datetime as _dt

    last = _parse_iso(heartbeat) or created_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=created_at.tzinfo)
    now = _dt.datetime.now(tz=created_at.tzinfo)
    if (now - last) > _dt.timedelta(minutes=STALE_NO_PROGRESS_MINUTES):
        return "failed"
    return status


async def get_bulk_job(
    session: AsyncSession, *, job_id: str, requested_by: str
) -> dict[str, Any] | None:
    row = (
        (
            await session.execute(
                text(
                    f"""
                SELECT id, status, output, request_input, error_message, created_at
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
    out = _as_obj(row["output"])
    heartbeat = out.get("heartbeat") if isinstance(out, dict) else None
    status = _effective_status(row["status"], row["created_at"], heartbeat)
    error = row["error_message"]
    if status == "failed" and not error:
        error = "Generation stalled — please retry."
    ri = _as_obj(row["request_input"]) or {}
    context = {
        "topicId": ri.get("topic_id"),
        "topicTitle": ri.get("topic_title") or ri.get("topic"),
        "typeId": ri.get("type_id"),
        "exam": ri.get("exam"),
        "language": ri.get("language"),
        "difficulty": ri.get("difficulty"),
    }
    return {
        "jobId": str(row["id"]),
        "status": status,
        "result": out,
        "progress": out.get("progress") if isinstance(out, dict) else None,
        "context": context,
        "error": error,
    }


async def list_bulk_jobs(
    session: AsyncSession, *, requested_by: str, since_hours: int = 24
) -> list[dict[str, Any]]:
    rows = (
        (
            await session.execute(
                text(
                    f"""
                SELECT id, status, request_input, output, created_at, completed_at
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
        ri = _as_obj(r["request_input"]) or {}
        outj = _as_obj(r["output"])
        heartbeat = outj.get("heartbeat") if isinstance(outj, dict) else None
        out.append(
            {
                "jobId": str(r["id"]),
                "status": _effective_status(r["status"], r["created_at"], heartbeat),
                "topic": ri.get("topic"),
                "count": ri.get("count"),
                "progress": outj.get("progress") if isinstance(outj, dict) else None,
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                "completedAt": r["completed_at"].isoformat() if r["completed_at"] else None,
            }
        )
    return out


async def list_resumable_bulk_jobs(session: AsyncSession) -> list[dict[str, Any]]:
    """Every still-pending bulk job, with its request + partial output — for
    startup recovery to resume after a process restart. Not scoped by user
    (recovery runs on behalf of the original requester stored on the row)."""
    rows = (
        (
            await session.execute(
                text(
                    f"""
                SELECT id, requested_by, request_input, output
                  FROM {CONTENT_SCHEMA}.ai_generation_jobs
                 WHERE prompt_template_id=:tid AND status='pending'
                 ORDER BY created_at
                """
                ),
                {"tid": TEMPLATE_ID},
            )
        )
        .mappings()
        .all()
    )
    return [
        {
            "jobId": str(r["id"]),
            "requestedBy": str(r["requested_by"]) if r["requested_by"] else None,
            "request": _as_obj(r["request_input"]) or {},
            "output": _as_obj(r["output"]),
        }
        for r in rows
    ]
