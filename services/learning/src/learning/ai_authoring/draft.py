"""AI authoring operations + AI_DRAFT marker.

Per ADR-0019 §"AI Authoring". Three operations:
- draft_question — generate a complete payload for a given type
- expand_explanation — given a stem + answer, produce a step-by-step
- suggest_distractors — given a stem + correct answer, produce 3-5
  plausible distractor options

Every output carries the AI_DRAFT marker so the audit trail survives
author edits (Levenshtein per field tracked at submit time).

The Gateway returns a validated Pydantic instance. Callers are
responsible for relocating the validated payload onto the
content_artifacts row + recording the marker in `ai_origin` JSONB.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from learning.ai_authoring.guardrail import GuardrailEngine, GuardrailVerdict
from learning.ai_authoring.guardrail.prompt_injection import GUARDRAIL_PREAMBLE
from learning.ai_gateway import AIGateway
from learning.ai_gateway.quotas import QuotaExceededError


# ── Output schemas ───────────────────────────────────────────────────────────


class DraftMCQ(BaseModel):
    """Output schema for draft_question(MCQ_SINGLE)."""

    stem: str
    options: list["DraftMCQOption"]
    correct_id: str
    explanation: str | None = None


class DraftMCQOption(BaseModel):
    id: str
    text: str
    is_correct: bool


class ExplanationOutput(BaseModel):
    """Output schema for expand_explanation."""

    explanation: str
    steps: list[str] = Field(default_factory=list)


class DistractorsOutput(BaseModel):
    """Output schema for suggest_distractors."""

    distractors: list[str] = Field(min_length=3, max_length=5)


# P5-S53 — output schemas for non-MCQ_SINGLE objective + numeric drafts.


class DraftTrueFalse(BaseModel):
    stem: str
    correct: bool
    explanation: str | None = None


class DraftAssertionReason(BaseModel):
    assertion: str
    reason: str
    assertion_true: bool
    reason_true: bool
    reason_explains_assertion: bool
    explanation: str | None = None


class DraftMultiStatement(BaseModel):
    stem: str
    statements: list["DraftStatement"]
    correct_option_id: str  # e.g. "A" — the canonical (1-only true / 1+2 / etc) bucket
    options: list["DraftMCQOption"]
    explanation: str | None = None


class DraftStatement(BaseModel):
    id: str
    text: str
    is_correct: bool


class DraftNumericInteger(BaseModel):
    stem: str
    correct: int
    unit: str | None = None
    explanation: str | None = None


class DraftNumericDecimal(BaseModel):
    stem: str
    correct: float
    tolerance: float = Field(gt=0)
    unit: str | None = None
    explanation: str | None = None


class DraftNumericRange(BaseModel):
    stem: str
    low: float
    high: float
    unit: str | None = None
    explanation: str | None = None


class DraftFormulaInput(BaseModel):
    stem: str
    target_expression: str  # MathJax-compatible
    accepted_alternatives: list[str] = Field(default_factory=list)
    explanation: str | None = None


DraftMCQ.model_rebuild()
DraftMultiStatement.model_rebuild()


# ── P5-S58 follow-up: 16 additional types for full AI-generation coverage ───
# Group A — text-only (matching, fill-in, subjective, case-study)


class DraftMatchPair(BaseModel):
    left: str
    right: str


class DraftMatchTheFollowing(BaseModel):
    stem: str
    pairs: list[DraftMatchPair] = Field(min_length=2, max_length=8)
    explanation: str | None = None


class DraftSequencing(BaseModel):
    stem: str
    items: list[str] = Field(min_length=2, max_length=10, description="In correct order")
    explanation: str | None = None


class DraftClassificationItem(BaseModel):
    item: str
    category: str


class DraftClassification(BaseModel):
    stem: str
    categories: list[str] = Field(min_length=2, max_length=6)
    items: list[DraftClassificationItem] = Field(min_length=3, max_length=12)
    explanation: str | None = None


class DraftFillBlankSingle(BaseModel):
    stem: str
    template: str
    accepted: list[str] = Field(min_length=1)
    explanation: str | None = None


class DraftFillBlankMulti(BaseModel):
    stem: str
    template: str
    accepted: list[list[str]] = Field(min_length=2)
    explanation: str | None = None


class DraftClozePassage(BaseModel):
    stem: str
    passage: str = Field(min_length=80)
    accepted: list[list[str]] = Field(min_length=2)
    explanation: str | None = None


class DraftShortText(BaseModel):
    stem: str
    accepted: list[str] = Field(min_length=1)
    expected_word_count: int = Field(default=10, ge=1, le=50)
    explanation: str | None = None


class DraftRubricDescriptor(BaseModel):
    """One performance band on a rubric criterion."""
    level: str  # e.g. "EXCELLENT", "GOOD", "POOR"
    guidance: str  # one-line description of what merits that band


class DraftRubricCriterion(BaseModel):
    criterion: str
    weight: float = Field(gt=0, le=1.0)
    keywords: list[str] = Field(default_factory=list)
    descriptors: list[DraftRubricDescriptor] = Field(default_factory=list)


class DraftEssay(BaseModel):
    stem: str
    expected_word_count_range: list[int] = Field(min_length=2, max_length=2)
    rubric: list[DraftRubricCriterion] = Field(min_length=2, max_length=6)
    model_answer: str | None = None


class DraftDescriptiveLong(BaseModel):
    stem: str
    expected_word_count_range: list[int] = Field(min_length=2, max_length=2)
    rubric: list[DraftRubricCriterion] = Field(min_length=2, max_length=6)
    model_answer: str | None = None


class DraftSubQuestion(BaseModel):
    sub_id: str
    sub_stem: str
    sub_type: str = Field(default="MCQ_SINGLE")
    # Sub-payload is a JSON string so OpenAI strict mode (which forbids
    # `additionalProperties`) doesn't reject the field. Frontend
    # JSON-parses on use; backend stores as-is.
    sub_payload_json: str = Field(default="{}")


class DraftComprehensionLong(BaseModel):
    stem: str
    passage: str = Field(min_length=200)
    sub_questions: list[DraftSubQuestion] = Field(min_length=2, max_length=6)
    explanation: str | None = None


class DraftCaseStudy(BaseModel):
    stem: str
    scenario: str = Field(min_length=150)
    sub_questions: list[DraftSubQuestion] = Field(min_length=2, max_length=6)
    explanation: str | None = None


# Group B — media-bearing types: AI generates the textual structure +
# `media_description`. Author uploads the actual asset.


class DraftHotspot(BaseModel):
    label: str
    target_description: str  # natural-language pointer, not coords


class DraftDiagramHotspot(BaseModel):
    stem: str
    media_description: str = Field(description="What diagram to provide")
    hotspots: list[DraftHotspot] = Field(min_length=1, max_length=8)
    explanation: str | None = None


class DraftDiagramLabel(BaseModel):
    stem: str
    media_description: str
    labels: list[str] = Field(min_length=2, max_length=12)
    explanation: str | None = None


class DraftMapLocation(BaseModel):
    stem: str
    map_type: str  # e.g. "physical-india", "world-political"
    target_label: str
    acceptable_radius_km: int = Field(default=100, ge=10, le=500)
    explanation: str | None = None


class DraftPictorialIdentify(BaseModel):
    stem: str
    media_description: str
    accepted_labels: list[str] = Field(min_length=1)
    explanation: str | None = None


class DraftListeningComp(BaseModel):
    stem: str
    transcript: str = Field(min_length=100)
    sub_questions: list[DraftSubQuestion] = Field(min_length=1, max_length=6)
    explanation: str | None = None


class DraftVideoQuestion(BaseModel):
    stem: str
    video_brief: str = Field(min_length=100)
    sub_questions: list[DraftSubQuestion] = Field(min_length=1, max_length=6)
    explanation: str | None = None


# Group C — interactive presentation wrappers (carry an MCQ inside)


class DraftKBCLifeline(BaseModel):
    stem: str
    options: list[DraftMCQOption] = Field(min_length=4, max_length=4)
    correct_id: str
    explanation: str | None = None
    lifelines_available: list[str] = Field(
        default_factory=lambda: ["FIFTY_FIFTY", "AUDIENCE_POLL", "EXPERT_HINT"],
    )


class DraftTimedReveal(BaseModel):
    stem: str
    options: list[DraftMCQOption] = Field(min_length=4, max_length=4)
    correct_id: str
    explanation: str | None = None
    reveal_seconds: int = Field(default=30, ge=5, le=300)


class DraftAdaptiveDifficulty(BaseModel):
    stem: str
    options: list[DraftMCQOption] = Field(min_length=4, max_length=4)
    correct_id: str
    explanation: str | None = None
    next_easier_topic: str | None = None
    next_harder_topic: str | None = None


DraftComprehensionLong.model_rebuild()
DraftCaseStudy.model_rebuild()
DraftListeningComp.model_rebuild()
DraftVideoQuestion.model_rebuild()


# ── AI_DRAFT marker ──────────────────────────────────────────────────────────


class AIDraftMarker(BaseModel):
    """Persisted on artifacts; survives author edits.

    Reviewer queue renders edit_distance per field so zero-edit
    drafts trigger tighter scrutiny.

    `guardrail` carries the AI Content Guardrail verdict computed at
    generation time. It travels in questions.ai_origin JSONB and is
    re-enforced at the DRAFT-write boundary (create_question) so a FAIL
    can never reach DRAFT.
    """

    original_payload: dict[str, Any]
    prompt_template_id: str
    prompt_template_version: str
    model: str
    created_at: datetime
    author_edited: bool = False
    edit_distance: dict[str, int] = Field(default_factory=dict)
    guardrail: GuardrailVerdict | None = None


# ── Operations ───────────────────────────────────────────────────────────────


SUPPORTED_DRAFT_TYPES = (
    # Objective + Numeric (original 9)
    "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "ASSERTION_REASON", "MULTI_STATEMENT",
    "NUMERIC_INTEGER", "NUMERIC_DECIMAL", "NUMERIC_RANGE", "FORMULA_INPUT",
    # Matching (3)
    "MATCH_THE_FOLLOWING", "SEQUENCING", "CLASSIFICATION",
    # Fill-in (4 incl. SHORT_TEXT)
    "FILL_BLANK_SINGLE", "FILL_BLANK_MULTI", "CLOZE_PASSAGE", "SHORT_TEXT",
    # Subjective + Composite (4)
    "ESSAY", "DESCRIPTIVE_LONG", "COMPREHENSION_LONG", "CASE_STUDY",
    # Visual (4) — generates structure + media_description
    "DIAGRAM_HOTSPOT", "DIAGRAM_LABEL", "MAP_LOCATION", "PICTORIAL_IDENTIFY",
    # Audio/Video (2) — generates transcript/brief + sub-questions
    "LISTENING_COMP", "VIDEO_QUESTION",
    # Interactive wrappers (3) — wrap MCQ
    "KBC_LIFELINE", "TIMED_REVEAL", "ADAPTIVE_DIFFICULTY",
)


class DraftQuestionRequest(BaseModel):
    type_id: Literal[
        "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "ASSERTION_REASON", "MULTI_STATEMENT",
        "NUMERIC_INTEGER", "NUMERIC_DECIMAL", "NUMERIC_RANGE", "FORMULA_INPUT",
        "MATCH_THE_FOLLOWING", "SEQUENCING", "CLASSIFICATION",
        "FILL_BLANK_SINGLE", "FILL_BLANK_MULTI", "CLOZE_PASSAGE", "SHORT_TEXT",
        "ESSAY", "DESCRIPTIVE_LONG", "COMPREHENSION_LONG", "CASE_STUDY",
        "DIAGRAM_HOTSPOT", "DIAGRAM_LABEL", "MAP_LOCATION", "PICTORIAL_IDENTIFY",
        "LISTENING_COMP", "VIDEO_QUESTION",
        "KBC_LIFELINE", "TIMED_REVEAL", "ADAPTIVE_DIFFICULTY",
    ]
    topic: str
    difficulty: Literal["EASY", "MEDIUM", "HARD"] = "MEDIUM"
    exam: str = "JEE-MAIN"
    syllabus_chapter: str | None = None
    source_material: str | None = None


# Per-type-id mapping: prompt template id, output schema. Each entry's
# prompt YAML lives under prompts/authoring/{template_id}_v1.0.0.yaml.
_DRAFT_TYPE_MAP: dict[str, tuple[str, type[BaseModel]]] = {
    # Objective + Numeric
    "MCQ_SINGLE":          ("mcq_single_draft",          DraftMCQ),
    "MCQ_MULTI":           ("mcq_multi_draft",           DraftMCQ),
    "TRUE_FALSE":          ("true_false_draft",          DraftTrueFalse),
    "ASSERTION_REASON":    ("assertion_reason_draft",    DraftAssertionReason),
    "MULTI_STATEMENT":     ("multi_statement_draft",     DraftMultiStatement),
    "NUMERIC_INTEGER":     ("numeric_integer_draft",     DraftNumericInteger),
    "NUMERIC_DECIMAL":     ("numeric_decimal_draft",     DraftNumericDecimal),
    "NUMERIC_RANGE":       ("numeric_range_draft",       DraftNumericRange),
    "FORMULA_INPUT":       ("formula_input_draft",       DraftFormulaInput),
    # Matching
    "MATCH_THE_FOLLOWING": ("match_the_following_draft", DraftMatchTheFollowing),
    "SEQUENCING":          ("sequencing_draft",          DraftSequencing),
    "CLASSIFICATION":      ("classification_draft",      DraftClassification),
    # Fill-in
    "FILL_BLANK_SINGLE":   ("fill_blank_single_draft",   DraftFillBlankSingle),
    "FILL_BLANK_MULTI":    ("fill_blank_multi_draft",    DraftFillBlankMulti),
    "CLOZE_PASSAGE":       ("cloze_passage_draft",       DraftClozePassage),
    "SHORT_TEXT":          ("short_text_draft",          DraftShortText),
    # Subjective + Composite
    "ESSAY":               ("essay_draft",               DraftEssay),
    "DESCRIPTIVE_LONG":    ("descriptive_long_draft",    DraftDescriptiveLong),
    "COMPREHENSION_LONG":  ("comprehension_long_draft",  DraftComprehensionLong),
    "CASE_STUDY":          ("case_study_draft",          DraftCaseStudy),
    # Visual (AI emits structure + media_description)
    "DIAGRAM_HOTSPOT":     ("diagram_hotspot_draft",     DraftDiagramHotspot),
    "DIAGRAM_LABEL":       ("diagram_label_draft",       DraftDiagramLabel),
    "MAP_LOCATION":        ("map_location_draft",        DraftMapLocation),
    "PICTORIAL_IDENTIFY":  ("pictorial_identify_draft",  DraftPictorialIdentify),
    # Audio/Video (AI emits transcript/brief + sub-questions)
    "LISTENING_COMP":      ("listening_comp_draft",      DraftListeningComp),
    "VIDEO_QUESTION":      ("video_question_draft",      DraftVideoQuestion),
    # Interactive wrappers (carry an MCQ inside)
    "KBC_LIFELINE":        ("kbc_lifeline_draft",        DraftKBCLifeline),
    "TIMED_REVEAL":        ("timed_reveal_draft",        DraftTimedReveal),
    "ADAPTIVE_DIFFICULTY": ("adaptive_difficulty_draft", DraftAdaptiveDifficulty),
}


async def draft_question(
    gateway: AIGateway,
    *,
    request: DraftQuestionRequest,
    creator_id: str | None = None,
    engine: GuardrailEngine | None = None,
) -> tuple[BaseModel, AIDraftMarker]:
    """Produce a complete typed payload via the AI Gateway.

    Dispatches on `request.type_id` to the matching prompt template
    + output schema. Returns (validated payload, AI_DRAFT marker).
    Caller persists both: the payload onto content_schema.questions
    (JSONB), the marker onto questions.ai_origin.

    When an `engine` is supplied and enabled, generation runs through the
    AI Content Guardrail (L1 preamble already injected here via
    `guardrail_preamble`, then L2 self-audit + L3 similarity + retry). The
    resulting verdict lands on `marker.guardrail`. When no engine is given
    (or the kill-switch is off) generation behaves exactly as before.

    QuotaExceededError propagates when the creator is over their
    daily cap (default 50/day). Caller surfaces as 429 with reset_at.
    """
    if request.type_id not in _DRAFT_TYPE_MAP:
        raise NotImplementedError(
            f"AI authoring for type_id={request.type_id!r} not yet wired"
        )
    template_id, schema = _DRAFT_TYPE_MAP[request.type_id]

    inputs = {
        "topic": request.topic,
        "difficulty": request.difficulty,
        "exam": request.exam,
        "syllabus_chapter": request.syllabus_chapter or "",
        "source_material": request.source_material or "",
        # L1 — injected into authoring templates that carry the
        # {guardrail_preamble} placeholder. Harmless extra for any that
        # don't (the gateway forwards unreferenced inputs).
        "guardrail_preamble": GUARDRAIL_PREAMBLE,
    }

    async def _generate(_attempt: int) -> BaseModel:
        return await gateway.call(
            touchpoint="authoring",
            prompt_template_id=template_id,
            prompt_template_version="1.0.0",
            prompt_inputs=inputs,
            schema=schema,
            creator_id=creator_id,
        )

    verdict: GuardrailVerdict | None = None
    if engine is not None and engine.config.enabled:
        draft, verdict = await engine.run(
            _generate,
            type_id=request.type_id,
            topic=request.topic,
            group_id=str(uuid4()),
            creator_id=creator_id,
        )
    else:
        draft = await _generate(1)

    marker = AIDraftMarker(
        original_payload=draft.model_dump(),
        prompt_template_id=template_id,
        prompt_template_version="1.0.0",
        model="openai:gpt-4o",  # routing config-resolved; record what we used
        created_at=datetime.now(tz=UTC),
        author_edited=False,
        edit_distance={},
        guardrail=verdict,
    )
    return draft, marker


async def expand_explanation(
    gateway: AIGateway,
    *,
    stem: str,
    answer: str,
    creator_id: str | None = None,
) -> ExplanationOutput:
    """Given a stem + correct answer, produce a step-by-step explanation."""
    return await gateway.call(
        touchpoint="authoring",
        prompt_template_id="explanation_expand",
        prompt_template_version="1.0.0",
        prompt_inputs={"stem": stem, "answer": answer},
        schema=ExplanationOutput,
        creator_id=creator_id,
    )


async def suggest_distractors(
    gateway: AIGateway,
    *,
    stem: str,
    correct_answer: str,
    n: int = 3,
    creator_id: str | None = None,
) -> DistractorsOutput:
    """Given a stem + correct answer, produce 3-5 plausible distractors."""
    if not 3 <= n <= 5:
        raise ValueError("n must be between 3 and 5")
    return await gateway.call(
        touchpoint="authoring",
        prompt_template_id="distractor_suggest",
        prompt_template_version="1.0.0",
        prompt_inputs={
            "stem": stem,
            "correct_answer": correct_answer,
            "n": n,
        },
        schema=DistractorsOutput,
        creator_id=creator_id,
    )


# ── Edit-distance computation ────────────────────────────────────────────────


def compute_edit_distance(original: dict[str, Any], current: dict[str, Any]) -> dict[str, int]:
    """Pure helper: per-field Levenshtein distance between original
    AI draft and the current (possibly edited) payload.

    Used at submit time to fill `AIDraftMarker.edit_distance` so
    reviewers see "stem changed by 47 chars; options[1].text changed
    by 12 chars; correct_id unchanged".

    Skips non-string fields (numeric / bool / list of dicts handled
    recursively via flat key paths like 'options[0].text').
    """
    distances: dict[str, int] = {}

    def walk(key_prefix: str, orig: Any, cur: Any) -> None:
        if isinstance(orig, str) and isinstance(cur, str):
            distances[key_prefix or "<root>"] = _levenshtein(orig, cur)
        elif isinstance(orig, dict) and isinstance(cur, dict):
            for k in set(orig.keys()) | set(cur.keys()):
                next_key = f"{key_prefix}.{k}" if key_prefix else k
                walk(next_key, orig.get(k), cur.get(k))
        elif isinstance(orig, list) and isinstance(cur, list):
            for i in range(max(len(orig), len(cur))):
                next_key = f"{key_prefix}[{i}]"
                o = orig[i] if i < len(orig) else None
                c = cur[i] if i < len(cur) else None
                walk(next_key, o, c)

    walk("", original, current)
    return distances


def _levenshtein(a: str, b: str) -> int:
    """Standard Levenshtein distance. O(len(a)*len(b)) but fine for
    field-grained payloads (stem ≤ 2000, options ≤ 500)."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, start=1):
            cur[j] = min(
                cur[j - 1] + 1,            # insert
                prev[j] + 1,               # delete
                prev[j - 1] + (0 if ca == cb else 1),  # substitute
            )
        prev = cur
    return prev[-1]
