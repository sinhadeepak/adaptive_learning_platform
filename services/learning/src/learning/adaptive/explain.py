"""On-demand explanation generator.

Used by QuizResult when a question's stored explanation is null. Takes the
question stem + choices + correct index + (optional) the student's chosen
answer, and returns a short teaching note: why the correct answer is right
and — if the student got it wrong — why their pick is a common misconception.

When OPENAI_API_KEY is unset we return a deterministic, generic stub. The UI
treats both the same; the source field tells you which it was.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from learning.adaptive import llm
from learning.content import explanations_repo

PROMPT_TEMPLATE_ID = "question_explanation"
PROMPT_TEMPLATE_VERSION = "1.0.0"

EXPLAIN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["explanation", "key_concept", "common_pitfall"],
    "properties": {
        "explanation": {
            "type": "string",
            "description": "2–4 sentences. Why is the correct answer correct? Cite the principle, not just restate the answer.",
        },
        "key_concept": {
            "type": "string",
            "description": "The single concept this question is testing. <= 60 chars.",
        },
        "common_pitfall": {
            "type": "string",
            "description": "One sentence on the most common mistake students make on items like this. If the student picked a wrong answer, address that specific pick.",
        },
    },
}


SYSTEM_PROMPT = """You are an expert tutor for Indian competitive exams (NEET, JEE, UPSC, CBSE).
A student just answered a multiple-choice question. Generate a short teaching note that
helps them learn from the question, not just see the green/red tick.

Hard rules:
- Be concrete. Reference the specific concept, formula, or fact the question hinges on.
- If the student picked a wrong answer, name the misconception directly.
- Plain English. No padding ("Great question!" / "Let's dive in!").
- Max ~80 words across all three fields combined."""


def _heuristic(stem: str, choices: list[str], correct_idx: int, picked_idx: int | None) -> dict[str, Any]:
    correct_text = choices[correct_idx] if 0 <= correct_idx < len(choices) else "(unknown)"
    pitfall = (
        f"Re-read the question carefully — your pick ({choices[picked_idx]}) is a common trap when the wording isn't parsed precisely."
        if picked_idx is not None and picked_idx != correct_idx and 0 <= picked_idx < len(choices)
        else "Many students rush past the qualifier in the stem; slow down on questions like this one."
    )
    return {
        "explanation": (
            f"The correct answer is \"{correct_text}\". "
            f"Review the underlying concept and try a similar question to lock it in."
        ),
        "key_concept": "Review the topic notes",
        "common_pitfall": pitfall,
        "source": "heuristic",
    }


async def explain_question(
    *,
    stem: str,
    choices: list[str],
    correct_idx: int,
    picked_idx: int | None = None,
    topic_title: str | None = None,
    language: str = "en",
    question_id: str | None = None,
    session: AsyncSession | None = None,
) -> dict[str, Any]:
    """Generate or read-through-cache a teaching note.

    When `question_id` and `session` are both provided the cache
    layer is consulted first — a hit returns immediately with no
    LLM call. On miss the LLM runs, the result is persisted, and
    we return it. When either is missing (e.g. tests, ad-hoc
    previews) we skip the cache entirely.

    Heuristic fallbacks are not cached — they're cheap to compute
    and their content is stable for the same inputs anyway.
    """
    cache_eligible = question_id is not None and session is not None

    if cache_eligible:
        cached = await explanations_repo.get_cached_explanation(
            session,
            question_id=question_id,
            picked_idx=picked_idx,
            language=language,
            prompt_template_version=PROMPT_TEMPLATE_VERSION,
        )
        if cached is not None:
            return cached

    correct_text = choices[correct_idx] if 0 <= correct_idx < len(choices) else "(unknown)"
    picked_text = (
        choices[picked_idx]
        if picked_idx is not None and 0 <= picked_idx < len(choices)
        else None
    )

    user_lines = []
    if topic_title:
        user_lines.append(f"Topic: {topic_title}")
    user_lines.append(f"Language: {language}")
    user_lines.append(f"Question: {stem}")
    user_lines.append("Choices:")
    for i, ch in enumerate(choices):
        marker = " ← correct" if i == correct_idx else ""
        marker += " ← student's pick" if picked_idx == i else ""
        user_lines.append(f"  {chr(ord('A') + i)}. {ch}{marker}")
    if picked_text is not None and picked_idx != correct_idx:
        user_lines.append(
            f"The student picked '{picked_text}', which is wrong. Correct: '{correct_text}'."
        )
    elif picked_idx == correct_idx:
        user_lines.append("The student answered correctly. Reinforce the concept.")
    else:
        user_lines.append("The student has not answered yet — produce a generic teaching note.")
    user_lines.append("Task: explain.")

    out = await llm.call_structured(
        system=SYSTEM_PROMPT,
        user="\n".join(user_lines),
        schema_name=PROMPT_TEMPLATE_ID,
        schema=EXPLAIN_SCHEMA,
    )
    if out is not None:
        out["source"] = "ai"
        out["model"] = "openai-default"
        out["prompt_template_id"] = PROMPT_TEMPLATE_ID
        out["prompt_template_version"] = PROMPT_TEMPLATE_VERSION
        out["cache"] = "miss"
        if cache_eligible:
            await explanations_repo.upsert_explanation(
                session,
                question_id=question_id,
                picked_idx=picked_idx,
                language=language,
                payload=out,
            )
        return out
    return _heuristic(stem, choices, correct_idx, picked_idx)
