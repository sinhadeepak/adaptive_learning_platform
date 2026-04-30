"""Subjective grader — wraps the AI Gateway evaluation touchpoint.

Operates on rubric + model_answer + student response. Returns a
Resolution carrying per-criterion PartDetail + an EvaluatorMetadata
with model + prompt_version + rubric_version. Confidence-based routing
delegates to `learning.evaluation.routing.decide_routing`.

Pure function `aggregate_resolution(...)` is testable without the
Gateway; `grade_subjective(...)` is the Gateway-driven entrypoint.

Per ADR-0019 + ADR-0018 (Resolution contract — never carries marks).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from learning.ai_gateway import AIGateway
from learning.evaluation.routing import EvalDecision, decide_routing
from learning.types.base import (
    EvaluatorMetadata,
    PartDetail,
    Resolution,
    ResolutionStatus,
)


# ── AI Gateway output schemas ────────────────────────────────────────────────


class CriterionVerdict(BaseModel):
    """One criterion-level verdict from the AI grader."""

    criterion_id: str = Field(min_length=1)
    satisfied: float = Field(ge=0.0, le=1.0)  # 0.0 / 0.5 / 1.0 typical
    feedback: str = Field(default="", max_length=500)


class SubjectiveEvaluationReport(BaseModel):
    """Validated AI output for ESSAY / DESCRIPTIVE_LONG / SHORT_TEXT."""

    overall_confidence: float = Field(ge=0.0, le=1.0)
    criteria: list[CriterionVerdict] = Field(default_factory=list, max_length=20)
    summary_feedback: str = Field(default="", max_length=2000)


# ── Pure aggregator ──────────────────────────────────────────────────────────


def aggregate_resolution(
    *,
    question_id: str,
    type_id: str,
    rubric_criteria: list[dict[str, Any]],
    report: SubjectiveEvaluationReport,
    decision: EvalDecision,
    rubric_version: int,
    prompt_version: str,
    model: str,
) -> Resolution:
    """Produce a Resolution from rubric + AI verdict + routing decision.

    Status mapping:
      - HUMAN_REQUIRED  → PENDING_HUMAN_REVIEW (matched/total = 0/N)
      - all criteria satisfied=1.0  → CORRECT
      - all criteria satisfied=0.0  → INCORRECT
      - mixed                       → PARTIAL_CORRECT

    Resolution.matched_count counts criteria with satisfied >= 0.5
    (the half-satisfied threshold mirrors the AI grader's coarse 0/0.5/1
    scale). total_count == len(rubric_criteria) — fixed by the rubric,
    not by what the AI returned (defensive: an AI returning 3 verdicts
    when the rubric has 4 criteria still resolves cleanly).
    """
    total = len(rubric_criteria)
    rubric_ids = [c["id"] for c in rubric_criteria]
    by_id: dict[str, CriterionVerdict] = {v.criterion_id: v for v in report.criteria}

    per_part: list[PartDetail] = []
    matched = 0
    for cid in rubric_ids:
        v = by_id.get(cid)
        if v is None:
            per_part.append(
                PartDetail(
                    id=cid,
                    matched=False,
                    ai_confidence=None,
                    details={"missing_from_ai_report": True},
                )
            )
            continue
        is_match = v.satisfied >= 0.5
        if is_match:
            matched += 1
        per_part.append(
            PartDetail(
                id=cid,
                matched=is_match,
                ai_confidence=report.overall_confidence,
                details={
                    "satisfied": v.satisfied,
                    "feedback": v.feedback,
                },
            )
        )

    if decision.action == "HUMAN_REQUIRED":
        status: ResolutionStatus = "PENDING_HUMAN_REVIEW"
        # When pending human, do not pre-commit a matched score so the
        # human grader's verdict is the single source of truth.
        return Resolution(
            question_id=question_id,
            type_id=type_id,
            status=status,
            matched_count=0,
            total_count=total,
            per_part=per_part,
            evaluation_mode="HYBRID",
            evaluator_metadata=EvaluatorMetadata(
                model=model,
                rubric_version=rubric_version,
                prompt_version=prompt_version,
                evaluated_at=datetime.now(tz=UTC),
                human_review_required=True,
            ),
        )

    if total == 0:
        status = "INCORRECT"
    elif matched == total:
        status = "CORRECT"
    elif matched == 0:
        status = "INCORRECT"
    else:
        status = "PARTIAL_CORRECT"

    return Resolution(
        question_id=question_id,
        type_id=type_id,
        status=status,
        matched_count=matched,
        total_count=total,
        per_part=per_part,
        evaluation_mode="HYBRID",
        evaluator_metadata=EvaluatorMetadata(
            model=model,
            rubric_version=rubric_version,
            prompt_version=prompt_version,
            evaluated_at=datetime.now(tz=UTC),
            human_review_required=False,
        ),
    )


# ── Gateway-driven grader ─────────────────────────────────────────────────────


_PROMPT_BY_TYPE: dict[str, str] = {
    "ESSAY": "subjective_essay_grade",
    "DESCRIPTIVE_LONG": "subjective_descriptive_grade",
    "SHORT_TEXT": "short_text_grade",
}


async def grade_subjective(
    gateway: AIGateway,
    *,
    question_id: str,
    type_id: Literal["ESSAY", "DESCRIPTIVE_LONG", "SHORT_TEXT"],
    response_id: str,
    stem: str,
    model_answer: str,
    student_text: str | None,
    rubric_criteria: list[dict[str, Any]],
    rubric_version: int,
    prompt_template_version: str = "1.0.0",
    persist: bool = True,
) -> Resolution:
    """Grade one subjective response via the Gateway.

    `rubric_criteria` is the JSON form of the rubric: a list of
    {id, text, weight, keywords?, descriptors?} dicts. `student_text`
    is the student's answer (or None if not attempted).

    Returns a Resolution. Confidence-band routing handled internally;
    HYBRID is always the evaluation_mode regardless of branch.
    """
    if not student_text or not student_text.strip():
        return Resolution(
            question_id=question_id,
            type_id=type_id,
            status="UNATTEMPTED",
            matched_count=0,
            total_count=len(rubric_criteria),
            per_part=[],
            evaluation_mode="HYBRID",
            evaluator_metadata=EvaluatorMetadata(
                model=None,
                rubric_version=rubric_version,
                prompt_version=None,
                evaluated_at=datetime.now(tz=UTC),
                human_review_required=False,
            ),
        )

    template_id = _PROMPT_BY_TYPE.get(type_id)
    if template_id is None:
        raise ValueError(f"grade_subjective does not support type_id={type_id!r}")

    rubric_block = "\n".join(
        f"- {c['id']}: {c['text']} (weight={c.get('weight', 0)})"
        for c in rubric_criteria
    )

    confidence: float | None = None
    report: SubjectiveEvaluationReport | None = None
    model_used = "unknown"

    try:
        report = await gateway.call(
            touchpoint="evaluation",
            prompt_template_id=template_id,
            prompt_template_version=prompt_template_version,
            prompt_inputs={
                "stem": stem,
                "model_answer": model_answer,
                "student_text": student_text,
                "rubric_block": rubric_block,
            },
            schema=SubjectiveEvaluationReport,
        )
        confidence = report.overall_confidence
        # Provider-resolved model name lives in audit log; for v1 we
        # record the touchpoint+template tuple as the "model" when the
        # gateway does not surface it back. ADR-0019 follow-up tightens
        # this once the audit-row ai_generation_jobs writer lands.
        model_used = f"{template_id}@{prompt_template_version}"
    except Exception:  # noqa: BLE001
        # Gateway error → confidence None → human routed.
        confidence = None

    decision = decide_routing(confidence=confidence, response_id=response_id)

    if report is None:
        # Fabricate an empty report so aggregator can produce the
        # PENDING_HUMAN_REVIEW Resolution with per_part=[]; concrete
        # criterion verdicts will come from the human grader.
        report = SubjectiveEvaluationReport(overall_confidence=0.0, criteria=[])

    resolution = aggregate_resolution(
        question_id=question_id,
        type_id=type_id,
        rubric_criteria=rubric_criteria,
        report=report,
        decision=decision,
        rubric_version=rubric_version,
        prompt_version=f"{template_id}@{prompt_template_version}",
        model=model_used,
    )

    # P5-S49 — persist the immutable evaluation_record + 5% calibration
    # sample (deterministic via response_id hash). Best-effort writes:
    # the Resolution returns to caller regardless of DB outcome.
    if persist:
        try:
            await _persist_evaluation(
                response_id=response_id,
                resolution=resolution,
                confidence=confidence,
                rubric_criteria=rubric_criteria,
                report=report,
                decision=decision,
            )
        except Exception:  # noqa: BLE001
            import logging
            logging.getLogger(__name__).warning(
                "evaluation persistence failed for response_id=%s", response_id,
            )

    return resolution


async def _persist_evaluation(
    *,
    response_id: str,
    resolution: Resolution,
    confidence: float | None,
    rubric_criteria: list[dict[str, Any]],
    report: SubjectiveEvaluationReport,
    decision: EvalDecision,
) -> None:
    """Write evaluation_records + (when sampled) calibration_samples.

    Lazy-imports content_sessionmaker so the subjective grader still
    runs in tests that don't bring up the DB.
    """
    from learning.content.db import sessionmaker as content_sessionmaker
    from learning.evaluation.repositories import (
        insert_calibration_sample,
        insert_evaluation_record,
    )

    async with content_sessionmaker()() as session:
        await insert_evaluation_record(
            session,
            response_id=response_id,
            resolution=resolution,
            evaluator_kind="AI",
            evaluator_id=resolution.evaluator_metadata.model
            if resolution.evaluator_metadata
            else "ai_gateway",
            confidence=confidence,
        )
        if decision.sampled_for_calibration:
            # Persist one row per criterion the AI scored, so weekly
            # kappa rolls up per criterion.
            for v in report.criteria:
                await insert_calibration_sample(
                    session,
                    response_id=response_id,
                    criterion=v.criterion_id,
                    ai_score=v.satisfied,
                    ai_resolution=resolution.model_dump(mode="json"),
                )
        await session.commit()
