"""Retry/escalation bookkeeping + guardrail audit trace.

One trace record is emitted per generation attempt (a 3-attempt FAIL emits
three) plus a `final` summary, all sharing a `generation_group_id`. Writes
are best-effort and fire-and-forget — a trace failure must never block the
generation path (mirrors `ai_gateway.audit_log.write_audit_row`).

The concrete sink (an `ai_generation_jobs` row writer) is injected so the
engine and its unit tests don't depend on a live DB.
"""

from __future__ import annotations

import logging
from typing import Protocol

from learning.ai_authoring.guardrail.schemas import GuardrailVerdict

log = logging.getLogger(__name__)


class TraceSink(Protocol):
    async def write(
        self,
        *,
        generation_group_id: str,
        layer: str,
        attempt: int,
        verdict: GuardrailVerdict,
        type_id: str,
    ) -> None: ...


class NullTraceSink:
    """Default no-op sink — logs only. Used in dev/tests without a DB."""

    async def write(self, **kw: object) -> None:  # noqa: D401
        log.debug("guardrail.trace", extra={"guardrail_trace": kw})


async def record_attempt(
    sink: TraceSink,
    *,
    generation_group_id: str,
    attempt: int,
    verdict: GuardrailVerdict,
    type_id: str,
    final: bool = False,
) -> None:
    """Emit a trace record; swallow + log any sink error."""
    try:
        await sink.write(
            generation_group_id=generation_group_id,
            layer="final" if final else "attempt",
            attempt=attempt,
            verdict=verdict,
            type_id=type_id,
        )
    except Exception as e:  # noqa: BLE001 — trace must never block generation
        log.warning("guardrail trace write failed: %s", e)


async def escalate_to_admin(
    sink: TraceSink,
    *,
    generation_group_id: str,
    verdict: GuardrailVerdict,
    type_id: str,
) -> None:
    """Record a 3rd-attempt FAIL as an admin escalation (a `final` FAIL
    trace row; the admin metrics endpoint surfaces these counts)."""
    log.info(
        "guardrail.escalation",
        extra={
            "generation_group_id": generation_group_id,
            "type_id": type_id,
            "fail_reason": verdict.fail_reason,
            "attempts": verdict.generation_attempt,
        },
    )
    await record_attempt(
        sink,
        generation_group_id=generation_group_id,
        attempt=verdict.generation_attempt,
        verdict=verdict,
        type_id=type_id,
        final=True,
    )
