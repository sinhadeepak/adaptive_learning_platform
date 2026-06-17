"""LLM-backed YouTube search-query suggestions for the resource curator.

Given a topic (title + optional description + optional weak-concept
hint) the model proposes 4-6 search angles a curating teacher can
click to run against the YouTube proxy. Each suggestion carries a
short rationale so the teacher knows why this angle is useful — e.g.
"covers the prerequisite friction model", "Hindi medium walkthrough",
"step-by-step worked examples for JEE-level numerics".

Mirrors the explain.py / session_insights.py pattern:
- Structured output via llm.call_structured (schema-validated, no
  free-form completions in production paths).
- Versioned prompt template id pinned per ADR-0019.
- Deterministic heuristic fallback when OPENAI_API_KEY is unset, so
  the curator UI keeps working in dev.
"""

from __future__ import annotations

from typing import Any

from learning.adaptive import llm

PROMPT_TEMPLATE_ID = "resource_query_suggest"
PROMPT_TEMPLATE_VERSION = "1.0.0"

SUGGEST_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["queries"],
    "properties": {
        "queries": {
            "type": "array",
            "minItems": 4,
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["query", "rationale", "difficulty"],
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "The YouTube search query. Concrete, 4-10 words. "
                            "Reference the specific concept and the cognitive "
                            "level. Add 'JEE' / 'NEET' / 'UPSC' / 'CBSE' / "
                            "'CAT' when the angle is exam-specific. Add "
                            "'Hindi' or 'Tamil' when language is non-English."
                        ),
                    },
                    "rationale": {
                        "type": "string",
                        "description": (
                            "1 sentence explaining why this angle is useful — "
                            "e.g. 'covers the prerequisite force-friction model "
                            "before applying Newton 3', 'Hindi-medium walkthrough "
                            "for vernacular learners', 'numerics drill at JEE-Main "
                            "difficulty'. Be concrete."
                        ),
                    },
                    "difficulty": {
                        "type": "string",
                        "enum": ["EASY", "MEDIUM", "HARD"],
                        "description": (
                            "Cognitive level the suggested clip should target. "
                            "Use this to balance the teacher's curated shelf — "
                            "EASY for first-time exposure, MEDIUM for typical "
                            "exam practice, HARD for stretch / olympiad."
                        ),
                    },
                },
            },
        },
    },
}


SYSTEM_PROMPT = """You are a curriculum-aware curator for Indian competitive
exam prep (JEE, NEET, UPSC, CBSE, CAT). A teacher is about to pin
YouTube clips to a topic shelf that students will see when they're
weak on this topic.

Your job: propose 4-6 *search queries* — not video titles, but the
exact strings a teacher would type into YouTube to find good clips.
Each suggestion should target a different angle:
  - one for the core concept (introduction)
  - one for the hardest cognitive level (Apply or Evaluate)
  - one for a specific common misconception or pitfall
  - one for worked numerical / problem-solving (where relevant)
  - one in a vernacular language (Hindi by default for Indian exams)
    so vernacular learners are served
  - one for the prerequisite concept the student has to nail first

Hard rules:
- Be concrete. Never propose a generic "introduction to X" — name
  the sub-concept ("Newton third law action-reaction pair"), the
  exam ("JEE Main"), or the difficulty ("step-by-step worked
  examples").
- Respect the language hint. If language=hi, at least 2 queries
  should target Hindi-medium content.
- No author/channel names. The teacher chooses the channel; you
  propose the angle.
- Don't repeat. Each query must explore a meaningfully different
  facet of the topic.
- Plain English in the rationale. Skip "Great suggestion!" preamble."""


def _heuristic(
    *,
    topic_title: str | None,
    topic_description: str | None,
    language: str,
) -> dict[str, Any]:
    """Deterministic fallback when no LLM is available. Builds queries
    by combining the topic title with a small set of stock angles.
    Less interesting than the LLM output but keeps the UI usable in
    dev without an API key."""
    title = (topic_title or "this topic").strip()
    desc = (topic_description or "").strip()
    seed_concept = title.split("·")[0].strip() or title
    base = seed_concept

    angles = [
        (f"{base} concept introduction", "Core concept primer for first-time exposure.", "EASY"),
        (f"{base} worked examples step by step", "Procedural drill for typical exam difficulty.", "MEDIUM"),
        (f"{base} common mistakes misconceptions", "Targets the misconception layer the diagnostic surfaces.", "MEDIUM"),
        (f"{base} JEE NEET problem solving", "Exam-grade numerical / application practice.", "HARD"),
    ]
    if language == "hi":
        angles.append(
            (f"{base} hindi medium explained", "Hindi-medium walkthrough for vernacular learners.", "MEDIUM")
        )
    else:
        angles.append(
            (f"{base} prerequisite concepts", "Builds the foundation a weak student is missing.", "EASY")
        )

    return {
        "queries": [
            {"query": q, "rationale": r, "difficulty": d}
            for (q, r, d) in angles
        ],
        "source": "heuristic",
        "model": None,
        "prompt_template_id": None,
        "prompt_template_version": None,
        "topic_hint": desc[:200] if desc else None,
    }


async def suggest_queries(
    *,
    topic_title: str | None,
    topic_description: str | None = None,
    language: str = "en",
    weak_concept: str | None = None,
    exam: str | None = None,
) -> dict[str, Any]:
    """Produce 4-6 search-query suggestions a teacher can run against
    the YouTube proxy. `weak_concept` and `exam` are optional context
    hints — when set, the model tailors the suggestions toward the
    specific gap and exam framing."""
    user_lines = [
        f"Topic: {topic_title or '(unknown)'}",
        f"Language: {language}",
    ]
    if topic_description:
        user_lines.append(f"Topic description: {topic_description}")
    if exam:
        user_lines.append(f"Exam context: {exam}")
    if weak_concept:
        user_lines.append(
            f"Specific gap a student is showing: {weak_concept}. "
            "At least one query should target this."
        )
    user_lines.append("")
    user_lines.append("Task: produce 4-6 YouTube search-query suggestions per the schema.")

    out = await llm.call_structured(
        system=SYSTEM_PROMPT,
        user="\n".join(user_lines),
        schema_name="resource_query_suggest",
        schema=SUGGEST_SCHEMA,
    )
    if out is not None:
        out["source"] = "ai"
        # Report the admin-configured provider that served (best-effort),
        # not a hardcoded "openai" — the call routes through the admin
        # chain (ai_provider_config) via llm.call_structured.
        out["model"] = await llm.active_provider() or "ai"
        out["prompt_template_id"] = PROMPT_TEMPLATE_ID
        out["prompt_template_version"] = PROMPT_TEMPLATE_VERSION
        return out
    return _heuristic(
        topic_title=topic_title,
        topic_description=topic_description,
        language=language,
    )
