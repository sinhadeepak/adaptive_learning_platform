"""L2 — AI self-audit (detective layer) + decision logic.

After generation, a second LLM call audits the question for expression,
distractor, and explanation originality plus a confidence score, returning
a strict `SelfAuditReport`. The pure `decide()` collapses the L2 report and
the deterministic L3 result into a single PASS / REVIEW / FAIL verdict —
the doc's "9 decision paths" (L2 ∈ {PASS,FAIL,REVIEW} × L3 ∈ {clean,
near-dup, exact-hash}) as a side-effect-free, unit-testable function.
"""

from __future__ import annotations

import json
from typing import Any

from learning.ai_authoring.guardrail.schemas import (
    GuardrailConfig,
    GuardrailStatus,
    L3Result,
    SelfAuditReport,
)
from learning.ai_gateway import AIGateway

# L2 runs on the `quality_check` touchpoint (cacheable, provider-agnostic).
SELF_AUDIT_TEMPLATE_ID = "guardrail_self_audit"


async def run_self_audit(
    gateway: AIGateway,
    *,
    question_payload: dict[str, Any],
    type_id: str,
    topic: str,
    version: str = "1.0.0",
    creator_id: str | None = None,
) -> SelfAuditReport:
    """Audit a generated question for originality via the Gateway."""
    return await gateway.call(
        touchpoint="quality_check",
        prompt_template_id=SELF_AUDIT_TEMPLATE_ID,
        prompt_template_version=version,
        prompt_inputs={
            "question_json": json.dumps(question_payload, ensure_ascii=False),
            "type_id": type_id,
            "topic": topic,
        },
        schema=SelfAuditReport,
        creator_id=creator_id,
    )


def decide_l2(report: SelfAuditReport, config: GuardrailConfig) -> GuardrailStatus:
    """Map a self-audit report to a PASS / REVIEW / FAIL with confidence
    floors layered on top of the model's own `overall` call.

    - confidence < fail_floor  → FAIL (too uncertain to trust).
    - any check failed, or confidence below review_floor, downgrades an
      otherwise-PASS verdict to REVIEW (human recovery, not rejection).
    - the model's explicit FAIL/REVIEW is never *upgraded*.
    """
    if report.confidence < config.confidence_fail_floor:
        return "FAIL"

    base = report.overall
    if base == "FAIL":
        return "FAIL"
    if base == "REVIEW":
        return "REVIEW"

    # base == PASS — apply the softer downgrades.
    all_checks_pass = (
        report.check1_expression_pass
        and report.check2_distractor_pass
        and report.check3_explanation_pass
    )
    if not all_checks_pass or report.confidence < config.confidence_review_floor:
        return "REVIEW"
    return "PASS"


def decide(
    report: SelfAuditReport,
    l3: L3Result,
    config: GuardrailConfig,
) -> GuardrailStatus:
    """Combine L2 + L3 into the final verdict.

    Precedence (the 9-path matrix):
      - exact-hash collision → FAIL, unconditionally (instant duplicate).
      - near-duplicate (cosine over threshold): FAIL if L2 also FAIL, else
        at least REVIEW.
      - otherwise the L2 verdict stands.
    """
    if l3.exact_hash_hit:
        return "FAIL"

    l2 = decide_l2(report, config)
    if l3.over_threshold:
        return "FAIL" if l2 == "FAIL" else "REVIEW"
    return l2
