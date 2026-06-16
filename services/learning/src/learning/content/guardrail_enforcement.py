"""DRAFT-write enforcement for the AI Content Guardrail.

The guardrail verdict is computed at generation time (ai_authoring) and
travels in `questions.ai_origin.guardrail`. `POST /content/questions` is
publicly reachable and bypassable, so it is the unbypassable boundary
where the verdict must be *enforced*: a FAIL can never reach DRAFT.

This module is pure (no DB / no Redis) so the admission decision is fully
unit-testable. The richer submit-time L3 re-check (recompute MD5 + pgvector
cosine on the final, possibly-edited stem) layers on top via the engine's
stores once migrations 040/041 are applied — see the engine wiring.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AdmissionDecision:
    admit: bool
    guardrail_status: str | None  # PASS | REVIEW | FAIL | None (no guardrail)
    code: str | None = None       # problem code when rejected
    reason: str | None = None


def guardrail_admission(ai_origin: dict[str, Any] | None) -> AdmissionDecision:
    """Decide whether an incoming question may be written to DRAFT.

    - No ai_origin / no guardrail block → admit (human-authored or a
      question generated before the guardrail shipped).
    - guardrail.status == FAIL → reject (caller raises 409).
    - PASS / REVIEW → admit, carrying the status so the row records it and
      a REVIEW lands in the moderator sub-queue.
    """
    if not ai_origin:
        return AdmissionDecision(admit=True, guardrail_status=None)

    guardrail = ai_origin.get("guardrail")
    if not isinstance(guardrail, dict):
        return AdmissionDecision(admit=True, guardrail_status=None)

    status = guardrail.get("status")
    if status == "FAIL":
        return AdmissionDecision(
            admit=False,
            guardrail_status="FAIL",
            code="guardrail_failed",
            reason=guardrail.get("fail_reason")
            or "Question failed the AI content guardrail (originality/copyright).",
        )
    if status in ("PASS", "REVIEW"):
        return AdmissionDecision(admit=True, guardrail_status=status)
    # Unknown/garbled status → admit but flag for human review (fail-safe).
    return AdmissionDecision(admit=True, guardrail_status="REVIEW")
