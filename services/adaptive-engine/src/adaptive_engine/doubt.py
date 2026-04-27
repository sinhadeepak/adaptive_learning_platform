"""Photo-doubt resolution.

Flow:
  1. Receive an image (data URL) of a handwritten or printed question.
  2. Vision LLM extracts: question text, subject, suggested topic, step-by-step
     solution, final answer.
  3. We match the suggested topic against the live catalog (best-match by
     normalised title) and pull 3 similar problems from the Quiz bank for that
     topic.
  4. Return the bundle to the UI: ocr extract + solution + similar items.

Graceful degrade: when the LLM is off, we return a stub that tells the user
the feature requires OPENAI_API_KEY — the surface still loads, the UI still
renders, the action just isn't useful until a key is set.
"""

from __future__ import annotations

import re
from typing import Any

import structlog

from adaptive_engine import llm
from adaptive_engine.clients import fetch_similar_problems, fetch_topic_catalog

log = structlog.get_logger(__name__)


DOUBT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "extracted_question",
        "subject",
        "suggested_topic",
        "solution_steps",
        "final_answer",
        "confidence",
    ],
    "properties": {
        "extracted_question": {
            "type": "string",
            "description": "The question as you read it from the image. Reproduce it cleanly — fix obvious OCR errors but don't paraphrase.",
        },
        "subject": {
            "type": "string",
            "enum": ["Physics", "Chemistry", "Mathematics", "Biology", "Other"],
        },
        "suggested_topic": {
            "type": "string",
            "description": "Best-fit topic name for this question (e.g. 'Mechanics', 'Thermodynamics', 'Calculus'). Stay within the canonical exam-syllabus topic vocabulary.",
        },
        "solution_steps": {
            "type": "array",
            "minItems": 1,
            "maxItems": 8,
            "items": {"type": "string"},
            "description": "Each step on its own line. Show the reasoning + arithmetic, not just the result.",
        },
        "final_answer": {
            "type": "string",
            "description": "One-line final answer. Include units when applicable.",
        },
        "confidence": {
            "type": "string",
            "enum": ["high", "medium", "low"],
            "description": "How confident you are in the OCR + solution. 'low' means re-photograph at better lighting.",
        },
    },
}


SYSTEM_PROMPT = """You are a tutor for Indian competitive exams (NEET, JEE, UPSC, CBSE).
A student has photographed a question — handwritten or printed — and asks you to solve it.

Hard rules:
- OCR the image carefully. If the image is blurry or partially cut off, set confidence='low' and do your best.
- Identify subject + topic from the canonical syllabus, not whatever wording the student used.
- Produce a step-by-step solution. Each step is one bullet; show working, not just the final result.
- If the question is non-academic or ambiguous, say so in extracted_question and set confidence='low'.
- Never invent a question that wasn't in the image. If the image contains no question, say so explicitly."""


def _stub_response() -> dict[str, Any]:
    return {
        "extracted_question": "",
        "subject": "Other",
        "suggested_topic": "",
        "solution_steps": [
            "Photo-doubt requires the AI vision model to be enabled.",
            "Set OPENAI_API_KEY in the adaptive-engine container and try again.",
        ],
        "final_answer": "",
        "confidence": "low",
        "similar_problems": [],
        "matched_topic_id": None,
        "source": "stub",
    }


_NORMALIZE_RE = re.compile(r"[^a-z0-9]+")


def _normalize(s: str) -> str:
    return _NORMALIZE_RE.sub("", s.lower())


async def _match_topic_id(suggested: str) -> str | None:
    """Best-effort match of the LLM's suggested topic name → a real topic UUID
    in our catalog. We compare normalised titles (lowercase, alnum-only) so
    "Cell Biology" matches "cellbiology". Returns None on no match."""
    if not suggested:
        return None
    target = _normalize(suggested)
    catalog = await fetch_topic_catalog()
    # Exact normalised match first.
    for t in catalog:
        if _normalize(t.get("title", "")) == target:
            return t.get("topicId")
    # Substring match — "calculus" → "differential calculus".
    for t in catalog:
        title_norm = _normalize(t.get("title", ""))
        if target and (target in title_norm or title_norm in target):
            return t.get("topicId")
    return None


async def solve_doubt(*, image_data_url: str) -> dict[str, Any]:
    """Resolve a photographed doubt end-to-end. Always returns the bundle shape
    the UI expects, even when the LLM is disabled (stub) or errors (stub)."""
    if not llm.is_enabled():
        return _stub_response()

    parsed = await llm.call_vision_structured(
        system=SYSTEM_PROMPT,
        user_text="Solve the question in this image. Follow the rules in the system prompt.",
        image_data_url=image_data_url,
        schema_name="photo_doubt",
        schema=DOUBT_SCHEMA,
    )
    if parsed is None:
        return _stub_response()

    matched_topic_id = await _match_topic_id(parsed.get("suggested_topic", ""))
    similar: list[dict[str, Any]] = []
    if matched_topic_id:
        similar = await fetch_similar_problems(matched_topic_id, limit=3)

    return {
        **parsed,
        "matched_topic_id": matched_topic_id,
        "similar_problems": similar,
        "source": "ai",
    }
