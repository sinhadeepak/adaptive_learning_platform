"""AI quality checks — three v1 in S40, three more in S45.

Per ADR-0019 §"Six AI quality checks". All run on artifact submit:
- ambiguity (S40): multiple defensibly-correct options
- distractor_plausibility (S40): distractor 0-1 score
- duplicate_detection (S40): embedding similarity > 0.92
- syllabus_tagging (S45): AI-mapped tags vs author-supplied
- difficulty_estimation (S45): AI-predicted vs author-claimed
- tone_language (S45): grammar / clarity / age-appropriateness

Output is a list of QualityWarning. Surfaces in the moderation
queue but **never blocks submit** per ADR-0019 §"How to apply".
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

from learning.ai_gateway import AIGateway


class QualityWarning(BaseModel):
    code: Literal[
        "ambiguity",
        "distractor_plausibility",
        "duplicate_detection",
        "syllabus_tagging",
        "difficulty_estimation",
        "tone_language",
    ]
    severity: Literal["info", "warning"] = "warning"
    message: str
    field: str | None = None
    metadata: dict[str, Any] | None = None


# ── Output schemas (Gateway-validated) ───────────────────────────────────────


class AmbiguityReport(BaseModel):
    is_ambiguous: bool
    reasoning: str = ""
    defensible_alternative_ids: list[str] = []


class DistractorPlausibilityReport(BaseModel):
    """One score per distractor option_id, in [0, 1]. <0.3 flagged."""

    scores: dict[str, float]


# Duplicate detection is embedding-similarity-based; the v1 stub
# returns a single similarity score against a hypothetical existing-bank
# nearest neighbour. Real wiring lives in the duplicate_detection.py
# module which queries the existing question bank's embeddings.


# ── Operations ───────────────────────────────────────────────────────────────


async def check_ambiguity(
    gateway: AIGateway,
    *,
    stem: str,
    options_block: str,
    correct_id: str,
) -> QualityWarning | None:
    """Run the ambiguity prompt against the Gateway. Returns a
    QualityWarning when AI flags ambiguous, else None."""
    report: AmbiguityReport = await gateway.call(
        touchpoint="quality_check",
        prompt_template_id="mcq_ambiguity",
        prompt_template_version="1.0.0",
        prompt_inputs={
            "stem": stem,
            "options_block": options_block,
            "correct_id": correct_id,
        },
        schema=AmbiguityReport,
    )
    if not report.is_ambiguous:
        return None
    return QualityWarning(
        code="ambiguity",
        severity="warning",
        message=f"AI flagged this MCQ as ambiguous: {report.reasoning}",
        metadata={
            "defensible_alternative_ids": report.defensible_alternative_ids,
            "reasoning": report.reasoning,
        },
    )


async def check_distractor_plausibility(
    gateway: AIGateway,
    *,
    stem: str,
    correct_id: str,
    distractors: dict[str, str],
    flag_below: float = 0.3,
) -> list[QualityWarning]:
    """Score each distractor 0-1; flag implausible ones (default <0.3)."""
    if not distractors:
        return []
    distractor_block = "\n".join(f"{oid}: {text}" for oid, text in distractors.items())
    report: DistractorPlausibilityReport = await gateway.call(
        touchpoint="quality_check",
        prompt_template_id="distractor_plausibility",
        prompt_template_version="1.0.0",
        prompt_inputs={
            "stem": stem,
            "correct_id": correct_id,
            "distractor_block": distractor_block,
        },
        schema=DistractorPlausibilityReport,
    )
    warnings: list[QualityWarning] = []
    for option_id, score in report.scores.items():
        if score < flag_below:
            warnings.append(
                QualityWarning(
                    code="distractor_plausibility",
                    severity="warning",
                    message=(
                        f"Option {option_id!r} scored {score:.2f} "
                        f"(below {flag_below}); consider replacing"
                    ),
                    field=f"options.{option_id}",
                    metadata={"score": score},
                )
            )
    return warnings


# Pure-function duplicate-detection helper (embedding similarity is
# computed by callers via OpenAI embeddings or alternative).


def check_duplicate_via_similarity(
    *,
    candidate_text: str,
    nearest_neighbour_text: str,
    similarity: float,
    threshold: float = 0.92,
) -> QualityWarning | None:
    """Pure: given a precomputed cosine similarity, surface a duplicate
    warning when ≥ threshold. Embedding generation + nearest-neighbour
    lookup are caller responsibility — keeps this function deterministic
    + cheap to unit-test."""
    if similarity < threshold:
        return None
    return QualityWarning(
        code="duplicate_detection",
        severity="warning",
        message=(
            f"Candidate is highly similar to an existing question "
            f"(cosine {similarity:.3f} ≥ {threshold:.2f})"
        ),
        metadata={
            "similarity": similarity,
            "nearest_neighbour_text": nearest_neighbour_text[:200],
        },
    )


# ── Composite runner ────────────────────────────────────────────────────────


async def run_quality_checks(
    gateway: AIGateway,
    *,
    stem: str,
    correct_id: str,
    options: dict[str, str],
    nearest_neighbour: tuple[str, float] | None = None,
) -> list[QualityWarning]:
    """Run the 3 v1 quality checks (S40). Each check is independent;
    a single check failure logs but doesn't block the others.

    `nearest_neighbour` is an optional (text, similarity) tuple from
    a precomputed embedding-search; absent → duplicate check skipped.
    """
    warnings: list[QualityWarning] = []

    # 1. Ambiguity
    options_block = "\n".join(f"{oid}: {text}" for oid, text in options.items())
    try:
        amb = await check_ambiguity(
            gateway, stem=stem, options_block=options_block, correct_id=correct_id
        )
        if amb:
            warnings.append(amb)
    except Exception:
        # Defensive — a Gateway failure on one check should not block
        # the other checks. The submit path proceeds with whatever
        # warnings did come back. Logging happens via the Gateway's
        # own audit log + record_call metric.
        pass

    # 2. Distractor plausibility
    distractors = {oid: txt for oid, txt in options.items() if oid != correct_id}
    try:
        warnings.extend(
            await check_distractor_plausibility(
                gateway, stem=stem, correct_id=correct_id, distractors=distractors,
            )
        )
    except Exception:
        pass

    # 3. Duplicate detection (only when caller supplies the neighbour)
    if nearest_neighbour:
        nn_text, sim = nearest_neighbour
        dup = check_duplicate_via_similarity(
            candidate_text=stem,
            nearest_neighbour_text=nn_text,
            similarity=sim,
        )
        if dup:
            warnings.append(dup)

    return warnings
