"""AI Gateway audit log writer.

Per ADR-0019 §"Audit log". Every Gateway call produces an
ai_generation_jobs row capturing prompt template + version + provider
+ model + tokens + cost + status. Retention 90 days (purge job lands
as a scheduled maintenance task).

Decoupled from `gateway.py` so the audit write can run async-fire-
and-forget — a slow DB doesn't slow the actual call. The Gateway
still emits structured logs (`ai_gateway.call`) so the audit row is
defence in depth, not the only record.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker as content_sessionmaker

log = logging.getLogger(__name__)

CONTENT_SCHEMA = "content_schema"


async def write_audit_row(
    *,
    artifact_id: str | None,
    prompt_template_id: str,
    prompt_version: str,
    model: str,
    status: str,                       # "succeeded" | "failed"
    output: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> str | None:
    """Write one ai_generation_jobs row using a fresh session.

    Returns the row id on success; None on failure (we never raise
    from the audit path — a Gateway call must not be blocked by an
    audit-row write failure).
    """
    job_id = str(uuid.uuid4())
    try:
        async with content_sessionmaker()() as session:
            await session.execute(
                text(f"""
                    INSERT INTO {CONTENT_SCHEMA}.ai_generation_jobs
                      (id, artifact_id, prompt_template_id, prompt_version,
                       model, status, output, error_message,
                       created_at, completed_at)
                    VALUES (:id, :aid, :ptid, :pv,
                            :model, :status, CAST(:output AS jsonb), :err,
                            now(), now())
                """),
                {
                    "id": job_id,
                    "aid": artifact_id,
                    "ptid": prompt_template_id,
                    "pv": prompt_version,
                    "model": model,
                    "status": status,
                    "output": json.dumps(output) if output is not None else None,
                    "err": error_message,
                },
            )
            await session.commit()
        return job_id
    except Exception as e:  # noqa: BLE001
        log.warning("ai_generation_jobs.write_failed: %s", e)
        return None


async def purge_older_than_days(
    session: AsyncSession, *, days: int = 90,
) -> int:
    """Retention purge — drops rows older than `days`. Returns rows
    deleted. Scheduled maintenance task; not on the hot path."""
    rows = (
        await session.execute(
            text(f"""
                DELETE FROM {CONTENT_SCHEMA}.ai_generation_jobs
                 WHERE created_at < now() - make_interval(days => :days)
                 RETURNING id
            """),
            {"days": days},
        )
    ).mappings().all()
    return len(rows)
