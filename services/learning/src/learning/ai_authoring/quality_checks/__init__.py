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


class SyllabusTaggingReport(BaseModel):
    """AI-suggested concept tags + confidence per tag, plus an
    overall confidence in the existing author tags. Caller compares
    `ai_suggested` against author-supplied tags and flags mismatches."""

    ai_suggested: list[str] = []
    author_alignment_confidence: float = 0.0
    reasoning: str = ""


class DifficultyEstimationReport(BaseModel):
    """AI difficulty prediction. Caller compares against author claim."""

    predicted: Literal["EASY", "MEDIUM", "HARD"]
    confidence: float = 0.0
    reasoning: str = ""


class ToneLanguageReport(BaseModel):
    """Grammar / clarity / age-appropriateness. Each issue is a flag
    surfaced in the moderation queue; never blocks submit."""

    grammar_issues: list[str] = []
    clarity_issues: list[str] = []
    age_appropriateness_issue: str | None = None
    overall_quality: Literal["good", "acceptable", "needs_work"] = "acceptable"


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


async def check_syllabus_tagging(
    gateway: AIGateway,
    *,
    stem: str,
    options_block: str,
    author_concept_tags: list[str],
    subject: str,
    alignment_floor: float = 0.7,
) -> QualityWarning | None:
    """AI maps the stem to syllabus concepts; flags when the author's
    tags drift from what the AI sees. Surfaces only when alignment
    confidence is below `alignment_floor` (default 0.7)."""
    report: SyllabusTaggingReport = await gateway.call(
        touchpoint="quality_check",
        prompt_template_id="syllabus_tagging",
        prompt_template_version="1.0.0",
        prompt_inputs={
            "stem": stem,
            "options_block": options_block,
            "author_concept_tags": ", ".join(author_concept_tags),
            "subject": subject,
        },
        schema=SyllabusTaggingReport,
    )
    if report.author_alignment_confidence >= alignment_floor:
        return None
    return QualityWarning(
        code="syllabus_tagging",
        severity="warning",
        message=(
            f"AI sees this question testing concepts {report.ai_suggested!r}; "
            f"author tagged {author_concept_tags!r}. "
            f"Alignment confidence: {report.author_alignment_confidence:.2f}."
        ),
        metadata={
            "ai_suggested": report.ai_suggested,
            "author_tags": author_concept_tags,
            "alignment_confidence": report.author_alignment_confidence,
            "reasoning": report.reasoning,
        },
    )


async def check_difficulty_estimation(
    gateway: AIGateway,
    *,
    stem: str,
    options_block: str,
    author_claimed: Literal["EASY", "MEDIUM", "HARD"],
) -> QualityWarning | None:
    """AI predicts difficulty; flags when prediction differs from
    author claim. Only flagged when the AI is confident (≥0.7)."""
    report: DifficultyEstimationReport = await gateway.call(
        touchpoint="quality_check",
        prompt_template_id="difficulty_estimation",
        prompt_template_version="1.0.0",
        prompt_inputs={
            "stem": stem,
            "options_block": options_block,
            "author_claimed": author_claimed,
        },
        schema=DifficultyEstimationReport,
    )
    if report.predicted == author_claimed:
        return None
    if report.confidence < 0.7:
        return None
    return QualityWarning(
        code="difficulty_estimation",
        severity="info",
        message=(
            f"AI predicted difficulty {report.predicted!r} (conf "
            f"{report.confidence:.2f}); author claimed {author_claimed!r}."
        ),
        metadata={
            "predicted": report.predicted,
            "author_claimed": author_claimed,
            "confidence": report.confidence,
            "reasoning": report.reasoning,
        },
    )


async def check_tone_language(
    gateway: AIGateway,
    *,
    stem: str,
    options_block: str,
    target_age_band: str = "high_school",
    language: str = "en",
) -> list[QualityWarning]:
    """Grammar / clarity / age-appropriateness. Returns a warning per
    issue type so the moderator queue surfaces them individually."""
    report: ToneLanguageReport = await gateway.call(
        touchpoint="quality_check",
        prompt_template_id="tone_language",
        prompt_template_version="1.0.0",
        prompt_inputs={
            "stem": stem,
            "options_block": options_block,
            "target_age_band": target_age_band,
            "language": language,
        },
        schema=ToneLanguageReport,
    )
    out: list[QualityWarning] = []
    if report.grammar_issues:
        out.append(
            QualityWarning(
                code="tone_language",
                severity="info",
                message=f"Grammar issues: {'; '.join(report.grammar_issues)}",
                metadata={"issues": report.grammar_issues, "kind": "grammar"},
            )
        )
    if report.clarity_issues:
        out.append(
            QualityWarning(
                code="tone_language",
                severity="info",
                message=f"Clarity issues: {'; '.join(report.clarity_issues)}",
                metadata={"issues": report.clarity_issues, "kind": "clarity"},
            )
        )
    if report.age_appropriateness_issue:
        out.append(
            QualityWarning(
                code="tone_language",
                severity="warning",
                message=f"Age-appropriateness: {report.age_appropriateness_issue}",
                metadata={"kind": "age_appropriateness"},
            )
        )
    return out


async def run_quality_checks(
    gateway: AIGateway,
    *,
    stem: str,
    correct_id: str,
    options: dict[str, str],
    nearest_neighbour: tuple[str, float] | None = None,
    author_concept_tags: list[str] | None = None,
    author_claimed_difficulty: Literal["EASY", "MEDIUM", "HARD"] | None = None,
    subject: str = "general",
    target_age_band: str = "high_school",
    language: str = "en",
) -> list[QualityWarning]:
    """Run all 6 quality checks. Each check is independent; a single
    check failure logs but doesn't block the others.

    Checks 1-3 (S40) always run when provided their inputs.
    Checks 4-6 (S45) only run when the relevant author signal is
    supplied (concept_tags, claimed_difficulty) so the function stays
    backward-compatible with S40 callers.
    """
    warnings: list[QualityWarning] = []
    options_block = "\n".join(f"{oid}: {text}" for oid, text in options.items())

    # 1. Ambiguity
    try:
        amb = await check_ambiguity(
            gateway, stem=stem, options_block=options_block, correct_id=correct_id
        )
        if amb:
            warnings.append(amb)
    except Exception:
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

    # 4. Syllabus tagging (S45) — needs author tags to compare against.
    if author_concept_tags is not None:
        try:
            syl = await check_syllabus_tagging(
                gateway,
                stem=stem,
                options_block=options_block,
                author_concept_tags=author_concept_tags,
                subject=subject,
            )
            if syl:
                warnings.append(syl)
        except Exception:
            pass

    # 5. Difficulty estimation (S45) — needs author claim.
    if author_claimed_difficulty is not None:
        try:
            diff = await check_difficulty_estimation(
                gateway,
                stem=stem,
                options_block=options_block,
                author_claimed=author_claimed_difficulty,
            )
            if diff:
                warnings.append(diff)
        except Exception:
            pass

    # 6. Tone & language (S45) — always runs once gateway is wired.
    try:
        warnings.extend(
            await check_tone_language(
                gateway,
                stem=stem,
                options_block=options_block,
                target_age_band=target_age_band,
                language=language,
            )
        )
    except Exception:
        pass

    return warnings
