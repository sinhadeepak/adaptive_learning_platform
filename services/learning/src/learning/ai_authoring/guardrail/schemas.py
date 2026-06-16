"""Guardrail schemas — L2 self-audit output, L3 result, verdict, config.

The AI Content Guardrail (per the AI Guardrail Action Plan) ensures every
AI-generated question is copyright-safe and pedagogically original before
it can reach DRAFT. Concepts/facts are free to test; the *expression*
(phrasing, distractors, explanations) must always be original.

These models are deliberately pure (no I/O) so the decision logic in
`audit.decide()` and the engine's verdict combination are unit-testable
without a gateway, DB, or Redis.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

GuardrailStatus = Literal["PASS", "REVIEW", "FAIL"]


class SelfAuditReport(BaseModel):
    """L2 self-audit output — Gateway-validated (strict structured output).

    A second LLM call audits the generated question for expression,
    distractor, and explanation originality plus an overall confidence.
    Shape mirrors the Action Plan §4.2 audit JSON.
    """

    check1_expression_pass: bool
    check1_reason: str = ""
    check2_distractor_pass: bool
    check2_reason: str = ""
    check3_explanation_pass: bool
    check3_reason: str = ""
    confidence: int = Field(ge=0, le=100)
    overall: GuardrailStatus
    fail_reason: str = ""


class L3Result(BaseModel):
    """Deterministic L3 verification outcome.

    `exact_hash_hit` is an instant-reject signal (normalised-stem MD5
    collision). `over_threshold` is True when the nearest pgvector
    neighbour's cosine similarity exceeds the configured threshold.
    """

    exact_hash_hit: bool = False
    similarity_score: float | None = None
    nearest_neighbour_id: str | None = None
    over_threshold: bool = False


class GuardrailVerdict(BaseModel):
    """Final guardrail outcome for one generated question.

    Persisted into `AIDraftMarker.guardrail` (questions.ai_origin JSONB)
    and re-enforced at the DRAFT-write boundary (`create_question`).
    """

    status: GuardrailStatus
    generation_attempt: int = Field(ge=1)
    guardrail_version: str
    audit_confidence: int | None = None
    similarity_score: float | None = None
    nearest_neighbour_id: str | None = None
    exact_hash_hit: bool = False
    normalized_hash: str | None = None
    fail_reason: str | None = None
    self_audit: SelfAuditReport | None = None


class GuardrailConfig(BaseModel):
    """Tunable guardrail thresholds. Feature-flagged via env (see
    `content/config.py::guardrail_config`). `similarity_threshold` and the
    kill-switch are adjustable without redeploy (Action Plan R6)."""

    enabled: bool = True
    similarity_threshold: float = Field(default=0.92, ge=0.0, le=1.0)
    # Below this L2 confidence → FAIL outright; below review_floor but
    # at/above fail_floor → at most REVIEW (Action Plan §4.2 scoring guide:
    # 90-100 clearly original, 80-89 likely original, <80 flag).
    confidence_fail_floor: int = Field(default=60, ge=0, le=100)
    confidence_review_floor: int = Field(default=80, ge=0, le=100)
    max_attempts: int = Field(default=3, ge=1, le=10)
    prompt_version: str = "1.0.0"
