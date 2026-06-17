"""DB-backed guardrail trace sink — writes ai_generation_jobs rows.

Implements the `TraceSink` protocol against the guardrail trace columns
added in migration 041. Best-effort and self-contained (fresh session per
write) so a trace failure never blocks generation — same discipline as
`ai_gateway.audit_log.write_audit_row`. Requires migration 041 applied;
until then writes log-and-skip rather than raising.
"""

from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy import text

from learning.ai_authoring.guardrail.schemas import GuardrailVerdict
from learning.content.db import sessionmaker as content_sessionmaker

log = logging.getLogger(__name__)

CONTENT_SCHEMA = "content_schema"


class AiGenerationJobsTraceSink:
    """Writes one ai_generation_jobs row per guardrail attempt."""

    async def write(
        self,
        *,
        generation_group_id: str,
        layer: str,
        attempt: int,
        verdict: GuardrailVerdict,
        type_id: str,
    ) -> None:
        report = (
            verdict.self_audit.model_dump() if verdict.self_audit is not None else None
        )
        try:
            async with content_sessionmaker()() as session:
                await session.execute(
                    text(
                        f"""
                        INSERT INTO {CONTENT_SCHEMA}.ai_generation_jobs
                          (id, prompt_template_id, prompt_version, model, status,
                           created_at, completed_at,
                           generation_group_id, guardrail_layer, generation_attempt,
                           guardrail_status, audit_confidence, similarity_score,
                           nearest_neighbour_id, exact_hash_hit, guardrail_version,
                           self_audit_report)
                        VALUES
                          (:id, :ptid, :pv, :model, :status, now(), now(),
                           :gid, :layer, :attempt,
                           :gstatus, :conf, :sim,
                           :nn, :hash_hit, :gver,
                           CAST(:report AS jsonb))
                        """
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "ptid": "guardrail",
                        "pv": verdict.guardrail_version,
                        "model": "guardrail",
                        "status": "succeeded" if verdict.status != "FAIL" else "failed",
                        "gid": generation_group_id,
                        "layer": layer,
                        "attempt": attempt,
                        "gstatus": verdict.status,
                        "conf": verdict.audit_confidence,
                        "sim": verdict.similarity_score,
                        "nn": verdict.nearest_neighbour_id,
                        "hash_hit": verdict.exact_hash_hit,
                        "gver": verdict.guardrail_version,
                        "report": json.dumps(report) if report is not None else None,
                    },
                )
                await session.commit()
        except Exception as e:  # noqa: BLE001 — trace must never block generation
            log.warning("guardrail trace write failed: %s", e)
