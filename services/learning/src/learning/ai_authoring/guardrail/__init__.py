"""AI Content Guardrail — 3-layer copyright/originality guard for AI
question authoring (L1 preventive prompt, L2 self-audit, L3 similarity).

Per the AI Content Guardrail Action Plan, adapted to route every LLM call
through the ADR-0019 AI Gateway.
"""

from __future__ import annotations

from learning.ai_authoring.guardrail.audit import decide, decide_l2, run_self_audit
from learning.ai_authoring.guardrail.engine import GuardrailEngine
from learning.ai_authoring.guardrail.prompt_injection import (
    GUARDRAIL_PREAMBLE,
    GUARDRAIL_PROMPT_VERSION,
    preamble_inputs,
)
from learning.ai_authoring.guardrail.schemas import (
    GuardrailConfig,
    GuardrailStatus,
    GuardrailVerdict,
    L3Result,
    SelfAuditReport,
)

__all__ = [
    "GuardrailEngine",
    "GuardrailConfig",
    "GuardrailStatus",
    "GuardrailVerdict",
    "L3Result",
    "SelfAuditReport",
    "GUARDRAIL_PREAMBLE",
    "GUARDRAIL_PROMPT_VERSION",
    "preamble_inputs",
    "decide",
    "decide_l2",
    "run_self_audit",
]
