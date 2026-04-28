"""AI-assisted question authoring.

Educators paste a topic-scoped brief; we return N MCQs with explanations,
ready to drop into Content's DRAFT → REVIEW → PUBLISHED FSM.

This is the *content-depth multiplier*. The platform's biggest practical gap
versus PW/BYJU's is raw question volume; this surface lets one educator
produce a sprint's worth of items in minutes — but every item still goes
through the existing review FSM, so quality control is unchanged.

Design choices:
- Strict-JSON output via OpenAI's response_format with json_schema.
- Each generated item carries: stem, 4 choices, correctIdx, difficulty_b,
  language, explanation, suggested_tags. (a/c calibration stays at 2PL
  defaults — those values mean nothing until real students answer.)
- Difficulty b is an LLM-suggested number in [-2, 2]; the educator can
  override during review.
- Heuristic fallback when LLM is off: returns an empty list + a status
  message. The UI surfaces the message; no fake items are inserted.
"""

from __future__ import annotations

from typing import Any

import structlog

from learning.adaptive import llm
from learning.adaptive.tutor import _fetch_topic

log = structlog.get_logger(__name__)

GENERATED_QUESTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["questions"],
    "properties": {
        "questions": {
            "type": "array",
            "minItems": 1,
            "maxItems": 30,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "stem",
                    "choices",
                    "correctIdx",
                    "difficultyB",
                    "explanation",
                    "tags",
                ],
                "properties": {
                    "stem": {
                        "type": "string",
                        "description": "The question. Must end with a question mark or fill-in-the-blank prompt.",
                    },
                    "choices": {
                        "type": "array",
                        "minItems": 4,
                        "maxItems": 4,
                        "items": {"type": "string"},
                        "description": "Exactly 4 plausible MCQ options. Distractors must be wrong but defensible — not absurd.",
                    },
                    "correctIdx": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 3,
                    },
                    "difficultyB": {
                        "type": "number",
                        "description": "IRT difficulty in [-2, 2]. -2 = easy, 0 = average, 2 = hard. Match the requested band.",
                    },
                    "explanation": {
                        "type": "string",
                        "description": "Why the correct answer is right (1-3 sentences) + WHY each common wrong pick is tempting.",
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 1,
                        "maxItems": 4,
                        "description": "Short labels for the sub-concept tested (e.g. 'first law', 'isothermal process').",
                    },
                },
            },
        }
    },
}


SYSTEM_PROMPT = """You are an expert exam-content author for Indian competitive exams (NEET, JEE, UPSC, CBSE).
You generate high-quality MCQs that match a real exam's difficulty + style.

Hard rules:
- All choices must be plausible. A weak distractor (e.g. "the moon", "a banana") is unacceptable.
- The correct answer must be unambiguously correct given the stem — no "all of the above" hedges unless the stem genuinely demands it.
- Explanations must teach. Don't just restate the answer — give the principle, formula, or fact.
- Stay strictly within the requested topic. Don't drift into adjacent topics even if a question would be valid there.
- Difficulty discipline: if asked for easy items (b ≈ -1), keep arithmetic simple; for hard (b ≈ +1.5), require a multi-step inference. Match the band.
- Generate the requested language. Do NOT mix English and Hindi within a single item — pick one and stay there.
- Each question must be distinct. No paraphrases of the same item with different numbers."""


def _stub_response(reason: str) -> dict[str, Any]:
    return {
        "questions": [],
        "source": "stub",
        "message": reason,
    }


async def generate_questions(
    *,
    topic_id: str,
    count: int,
    language: str = "en",
    difficulty: str = "mixed",
    extra_context: str = "",
) -> dict[str, Any]:
    """Generate `count` MCQs for the given topic. Returns the raw schema-typed
    bundle plus a `source` field. Caller (UI) is expected to render the items
    in a review list; nothing is auto-saved to Content."""
    if not llm.is_enabled():
        return _stub_response(
            "AI authoring requires OPENAI_API_KEY to be set in adaptive-engine."
        )

    if count < 1 or count > 30:
        return _stub_response("Count must be between 1 and 30.")

    topic_meta = await _fetch_topic(topic_id)
    if topic_meta is None:
        return _stub_response(
            f"Could not resolve topic id '{topic_id}' in the catalog. "
            "Make sure the topic exists and the catalog service is reachable."
        )

    title = topic_meta.get("title") or "this topic"
    subject = topic_meta.get("subjectName") or "—"
    exam = topic_meta.get("examName") or "—"

    band_hint = {
        "easy": "Target IRT b around -1.0 (easy: 1-step recall).",
        "medium": "Target IRT b around 0 (single-step inference).",
        "hard": "Target IRT b around +1.0 to +1.5 (multi-step or trap-laden).",
        "mixed": "Mix difficulties: roughly a third easy (b ≈ -1), a third medium (b ≈ 0), a third hard (b ≈ +1).",
    }.get(difficulty, "Mix easy, medium, and hard items.")

    user_lines = [
        f"Topic: {title}",
        f"Subject: {subject}",
        f"Exam: {exam}",
        f"Language: {'Hindi (Devanagari)' if language == 'hi' else 'English'}",
        f"Number of items to generate: {count}",
        f"Difficulty distribution: {band_hint}",
    ]
    if extra_context.strip():
        user_lines.append(f"Author's brief: {extra_context.strip()}")
    user_lines.append("Task: generate the questions.")

    parsed = await llm.call_structured(
        system=SYSTEM_PROMPT,
        user="\n".join(user_lines),
        schema_name="generated_questions",
        schema=GENERATED_QUESTION_SCHEMA,
    )
    if parsed is None:
        return _stub_response(
            "The model returned no items. Try a smaller count or simpler topic brief."
        )

    items = parsed.get("questions", [])
    # Defensive: enforce minimum integrity even though strict mode should already.
    cleaned: list[dict[str, Any]] = []
    for q in items:
        choices = q.get("choices") or []
        if len(choices) != 4:
            continue
        ci = int(q.get("correctIdx", 0))
        if ci < 0 or ci >= len(choices):
            continue
        cleaned.append(
            {
                "stem": q["stem"],
                "choices": choices,
                "correctIdx": ci,
                "difficultyB": float(q.get("difficultyB", 0.0)),
                "explanation": q.get("explanation", ""),
                "tags": q.get("tags", []),
                "language": language,
            }
        )

    log.info("authoring_generated", topic_id=topic_id, requested=count, got=len(cleaned))
    return {
        "questions": cleaned,
        "topicId": topic_id,
        "topicTitle": title,
        "subjectName": subject,
        "examName": exam,
        "source": "ai",
    }
