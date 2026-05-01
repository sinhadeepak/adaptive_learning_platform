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

from pydantic import BaseModel, Field

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


# ── AI_DRAFT marker ──────────────────────────────────────────────────────────


class AIDraftMarker(BaseModel):
    """Persisted on artifacts; survives author edits.

    Reviewer queue renders edit_distance per field so zero-edit
    drafts trigger tighter scrutiny.
    """

    original_payload: dict[str, Any]
    prompt_template_id: str
    prompt_template_version: str
    model: str
    created_at: datetime
    author_edited: bool = False
    edit_distance: dict[str, int] = Field(default_factory=dict)


# ── Operations ───────────────────────────────────────────────────────────────


SUPPORTED_DRAFT_TYPES = (
    "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "ASSERTION_REASON", "MULTI_STATEMENT",
    "NUMERIC_INTEGER", "NUMERIC_DECIMAL", "NUMERIC_RANGE", "FORMULA_INPUT",
)


class DraftQuestionRequest(BaseModel):
    type_id: Literal[
        "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "ASSERTION_REASON", "MULTI_STATEMENT",
        "NUMERIC_INTEGER", "NUMERIC_DECIMAL", "NUMERIC_RANGE", "FORMULA_INPUT",
    ]
    topic: str
    difficulty: Literal["EASY", "MEDIUM", "HARD"] = "MEDIUM"
    exam: str = "JEE-MAIN"
    syllabus_chapter: str | None = None
    source_material: str | None = None


# Per-type-id mapping: prompt template id, output schema. Each entry's
# prompt YAML lives under prompts/authoring/{template_id}_v1.0.0.yaml.
_DRAFT_TYPE_MAP: dict[str, tuple[str, type[BaseModel]]] = {
    "MCQ_SINGLE":         ("mcq_single_draft",         DraftMCQ),
    "MCQ_MULTI":          ("mcq_multi_draft",          DraftMCQ),
    "TRUE_FALSE":         ("true_false_draft",         DraftTrueFalse),
    "ASSERTION_REASON":   ("assertion_reason_draft",   DraftAssertionReason),
    "MULTI_STATEMENT":    ("multi_statement_draft",    DraftMultiStatement),
    "NUMERIC_INTEGER":    ("numeric_integer_draft",    DraftNumericInteger),
    "NUMERIC_DECIMAL":    ("numeric_decimal_draft",    DraftNumericDecimal),
    "NUMERIC_RANGE":      ("numeric_range_draft",      DraftNumericRange),
    "FORMULA_INPUT":      ("formula_input_draft",      DraftFormulaInput),
}


async def draft_question(
    gateway: AIGateway,
    *,
    request: DraftQuestionRequest,
    creator_id: str | None = None,
) -> tuple[BaseModel, AIDraftMarker]:
    """Produce a complete typed payload via the AI Gateway.

    Dispatches on `request.type_id` to the matching prompt template
    + output schema. Returns (validated payload, AI_DRAFT marker).
    Caller persists both: the payload onto content_schema.questions
    (JSONB), the marker onto questions.ai_origin.

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
    }
    draft = await gateway.call(
        touchpoint="authoring",
        prompt_template_id=template_id,
        prompt_template_version="1.0.0",
        prompt_inputs=inputs,
        schema=schema,
        creator_id=creator_id,
    )
    marker = AIDraftMarker(
        original_payload=draft.model_dump(),
        prompt_template_id=template_id,
        prompt_template_version="1.0.0",
        model="openai:gpt-4o",  # routing config-resolved; record what we used
        created_at=datetime.now(tz=UTC),
        author_edited=False,
        edit_distance={},
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
