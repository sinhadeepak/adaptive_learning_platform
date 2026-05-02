"""On-demand explanation generator (v2.0.0 — rich, per-question cache).

Used by QuizResult on every wrong-answer expansion. Returns a
structured teaching note that's identical for every student who
sees the same question (the question doesn't change, so the
canonical explanation shouldn't either). The v2.0.0 schema is
self-contained:

  - headline:        1-sentence answer used as the card title
  - key_concept:     the single concept being tested (≤80 chars)
  - why_correct:     2-3 sentences explaining why the right answer
                     is right, citing the principle
  - options[]:       per-choice verdict (✓/✗ + 1-sentence reason
                     for each). Tells the student why each
                     distractor is tempting AND why it's wrong.
  - common_pitfall:  the highest-impact misconception, called out
                     in its own callout block.
  - worked_example:  step-by-step walkthrough or analogy. Optional.
  - next_steps[]:    2-3 concrete actions ("drill 5 X items",
                     "review the prerequisite Y", "watch the
                     pinned video on Z"). Threads into the
                     prescription leg of the journey loop.

Cache: keyed on (question_id, language, prompt_template_version)
only — picked_idx is no longer part of the key (a canonical -1 is
stored instead). One LLM call per question per language per prompt
version, served to every subsequent expansion.

Heuristic fallback runs when OPENAI_API_KEY is unset.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from learning.adaptive import llm
from learning.content import explanations_repo

PROMPT_TEMPLATE_ID = "question_explanation"
PROMPT_TEMPLATE_VERSION = "2.0.0"

EXPLAIN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "headline",
        "key_concept",
        "why_correct",
        "options",
        "common_pitfall",
        "worked_example",
        "next_steps",
    ],
    "properties": {
        "headline": {
            "type": "string",
            "description": (
                "1-sentence answer the student sees first (≤120 chars). "
                "Direct, no preamble. Example: 'Action and reaction "
                "forces always act on different bodies — never the same one.'"
            ),
        },
        "key_concept": {
            "type": "string",
            "description": (
                "The single concept being tested. ≤80 chars. "
                "Example: 'Newton''s third law of motion'."
            ),
        },
        "why_correct": {
            "type": "string",
            "description": (
                "2-3 sentences explaining why the correct answer is right. "
                "Cite the principle, formula, or fact — don't just restate "
                "the answer. Plain English."
            ),
        },
        "options": {
            "type": "array",
            "description": (
                "One row per choice in the question, in input order. "
                "is_correct flags the right answer; verdict explains "
                "in 1 sentence why each option is right or wrong. "
                "The wrong-option verdicts should each name a "
                "different misconception, not repeat the same gripe."
            ),
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["id", "is_correct", "verdict"],
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "A, B, C, … matching choice order",
                    },
                    "is_correct": {"type": "boolean"},
                    "verdict": {
                        "type": "string",
                        "description": (
                            "1 sentence per option. For correct: cite the "
                            "principle. For wrong: name the specific "
                            "misconception that makes it tempting."
                        ),
                    },
                },
            },
        },
        "common_pitfall": {
            "type": "string",
            "description": (
                "1-2 sentences naming the SINGLE most common mistake "
                "students make on items like this. Concrete: which "
                "qualifier they skip, which sign they flip, which unit "
                "they confuse."
            ),
        },
        "worked_example": {
            "type": "string",
            "description": (
                "Optional step-by-step walkthrough or analogy that drives "
                "the concept home. 60-150 words. May be empty string "
                "when the question is purely factual recall."
            ),
        },
        "next_steps": {
            "type": "array",
            "minItems": 1,
            "maxItems": 3,
            "items": {
                "type": "string",
                "description": (
                    "Imperative — 'drill 5 X items', 'review the "
                    "prerequisite Y', 'watch the pinned clip on Z'. "
                    "Concrete, not 'keep practising'."
                ),
            },
        },
    },
}


SYSTEM_PROMPT = """You are an expert tutor writing the canonical teaching note
for a multiple-choice question on Indian competitive exams (JEE, NEET, UPSC,
CBSE, CAT). The same note will be served to every student who sees this
question regardless of which wrong distractor they picked, so address ALL
distractors — not just one.

Output a structured note per the schema:
  - A 1-line headline that lands the answer immediately.
  - The key concept being tested.
  - Why the correct answer is correct (cite the principle, not the answer).
  - For each option (in input order), a 1-sentence verdict: for correct,
    why it's right; for wrong, name the specific misconception that makes
    it tempting. Each wrong verdict should name a *different* misconception.
  - The single most common pitfall (1-2 sentences).
  - A short worked example or analogy (≤150 words). Empty when not useful.
  - 1-3 concrete next-step actions.

Hard rules:
- Be concrete. Cite specific concepts, formulae, dates, or facts.
- No "Great question!" preamble. No "Let's dive in!".
- The verdicts must address each option's *specific* failure mode, not
  generic "this is incorrect because the right answer is X".
- Plain English. Total ~250 words across all fields.
- Never reference an individual student's pick — the note is canonical."""


def _heuristic(stem: str, choices: list[str], correct_idx: int) -> dict[str, Any]:
    correct_text = choices[correct_idx] if 0 <= correct_idx < len(choices) else "(unknown)"
    options = [
        {
            "id": chr(ord("A") + i),
            "is_correct": i == correct_idx,
            "verdict": (
                f"Correct — see the textbook for why."
                if i == correct_idx
                else "A common distractor; review the principle to see why this doesn't fit."
            ),
        }
        for i, _ in enumerate(choices)
    ]
    return {
        "headline": f"The correct answer is \"{correct_text}\".",
        "key_concept": "Review the topic notes",
        "why_correct": (
            f"\"{correct_text}\" is the textbook answer. Re-read the question "
            "carefully and identify the qualifier that disambiguates it from "
            "the distractors."
        ),
        "options": options,
        "common_pitfall": (
            "Many students rush past a qualifier in the stem; slow down "
            "on questions like this one."
        ),
        "worked_example": "",
        "next_steps": [
            "Re-read the related chapter section.",
            "Practice 5 similar items to lock the concept.",
        ],
        # Legacy fields kept populated for any v1 reader.
        "explanation": (
            f"The correct answer is \"{correct_text}\". Review the underlying "
            "concept and try a similar question to lock it in."
        ),
        "common_pitfall_legacy": "Re-read the question carefully — qualifiers matter.",
        "source": "heuristic",
        "model": None,
        "prompt_template_id": None,
        "prompt_template_version": None,
    }


def _project_legacy_fields(rich: dict[str, Any]) -> dict[str, Any]:
    """Compose the v1 fields (explanation, key_concept, common_pitfall)
    from the v2 rich payload so old clients keep rendering."""
    rich["explanation"] = rich.get("why_correct", "") or rich.get("headline", "")
    rich["key_concept"] = rich.get("key_concept", "")
    rich["common_pitfall"] = rich.get("common_pitfall", "")
    return rich


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
    """Generate or read-through-cache the canonical teaching note.

    The picked_idx parameter is accepted for API compatibility with
    the v1 caller but is NOT part of the cache key. The note is
    canonical per (question_id, language, prompt_template_version).
    """
    cache_eligible = question_id is not None and session is not None

    if cache_eligible:
        cached = await explanations_repo.get_cached_explanation(
            session,
            question_id=question_id,
            picked_idx=None,  # canonical lookup — sentinel handled in repo
            language=language,
            prompt_template_version=PROMPT_TEMPLATE_VERSION,
        )
        if cached is not None:
            return cached

    correct_text = choices[correct_idx] if 0 <= correct_idx < len(choices) else "(unknown)"
    user_lines: list[str] = []
    if topic_title:
        user_lines.append(f"Topic: {topic_title}")
    user_lines.append(f"Language: {language}")
    user_lines.append(f"Question: {stem}")
    user_lines.append("Choices:")
    for i, ch in enumerate(choices):
        marker = " ← correct" if i == correct_idx else ""
        user_lines.append(f"  {chr(ord('A') + i)}. {ch}{marker}")
    user_lines.append(f"\nCorrect answer: '{correct_text}'.")
    user_lines.append("Task: produce the canonical teaching note per the schema.")

    out = await llm.call_structured(
        system=SYSTEM_PROMPT,
        user="\n".join(user_lines),
        schema_name=PROMPT_TEMPLATE_ID,
        schema=EXPLAIN_SCHEMA,
    )
    if out is not None:
        out = _project_legacy_fields(out)
        out["source"] = "ai"
        out["model"] = "openai-default"
        out["prompt_template_id"] = PROMPT_TEMPLATE_ID
        out["prompt_template_version"] = PROMPT_TEMPLATE_VERSION
        out["cache"] = "miss"
        if cache_eligible:
            await explanations_repo.upsert_explanation(
                session,
                question_id=question_id,
                picked_idx=None,
                language=language,
                payload=out,
            )
        return out
    # Heuristic fallback path. Don't cache.
    out = _heuristic(stem, choices, correct_idx)
    out = _project_legacy_fields(out)
    return out
