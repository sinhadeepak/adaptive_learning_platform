"""LLM-backed session insights for the QuizResult page.

Replaces the basic-arithmetic "AI UPDATE" section with real
analysis: given the items the student answered (stem, correct,
picked) plus topic + score context, produce a misconception
diagnosis, 2-3 specific concepts to drill next, and one concrete
next-step action.

When OPENAI_API_KEY is unset (default in dev) we fall back to a
deterministic heuristic so the UI keeps working without bills.
The `source` field on the output tells the caller which path ran.

Mirrors the explain.py pattern so the AI plumbing is consistent
with ADR-0019 (structured output, prompt-version pinning, no
free-form completions in production paths).
"""

from __future__ import annotations

from typing import Any

from learning.adaptive import llm

PROMPT_TEMPLATE_ID = "session_insights"
PROMPT_TEMPLATE_VERSION = "1.0.0"

INSIGHTS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["diagnosis", "weak_concepts", "next_step", "confidence_note"],
    "properties": {
        "diagnosis": {
            "type": "string",
            "description": (
                "1-2 sentences naming the SPECIFIC misconception or skill "
                "gap visible in the wrong answers. Reference the concept, "
                "not the score. Example: 'You consistently confuse the "
                "direction of the Cp/Cv ratio when the gas is monatomic — "
                "the questions you missed all hinge on γ = 5/3, not 7/5.' "
                "If the student got everything right, name the strongest "
                "skill on display instead."
            ),
        },
        "weak_concepts": {
            "type": "array",
            "minItems": 1,
            "maxItems": 3,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["concept", "why"],
                "properties": {
                    "concept": {
                        "type": "string",
                        "description": "The specific concept to drill (≤60 chars).",
                    },
                    "why": {
                        "type": "string",
                        "description": (
                            "1 sentence on which question(s) this maps to "
                            "and what about the student's answer suggests "
                            "they don't have it locked yet."
                        ),
                    },
                },
            },
        },
        "next_step": {
            "type": "string",
            "description": (
                "ONE concrete action the student should take next, "
                "phrased as an imperative. Be specific about what to do "
                "(read this, drill this, redo this), not generic "
                "(\"keep practising\")."
            ),
        },
        "confidence_note": {
            "type": "string",
            "description": (
                "1 sentence calibrating confidence. If accuracy is high "
                "but you only saw N items, say so. If accuracy is low, "
                "say whether one focused round will likely close it."
            ),
        },
    },
}


SYSTEM_PROMPT = """You are a domain tutor for Indian competitive exams (JEE, NEET, UPSC, CBSE, CAT).
A student has just finished a 10-question practice round. You will see the items
they got wrong with the picked vs correct answer, and the items they got right.

Your job: analyse the *pattern* of mistakes — not just count them — and produce
a diagnosis a tutor would write after observing the session. You're not a
cheerleader and you're not a calculator: you're identifying the underlying
concept gap.

Hard rules:
- Be concrete. Cite specific concepts and questions, not generic categories.
- Misconceptions are about *direction* (Cp/Cv vs Cv/Cp), *unit* (J vs kJ),
  *sign* (work done by vs on the system), *boundary* (open vs closed),
  *order* (chronological vs causal). Look for these.
- If only 1-2 items missed, name the skill that's still shaky, not "you got
  most right".
- If accuracy is 100% on a small N, the diagnosis should call out that the
  signal is thin — don't oversell mastery.
- Plain English. No "Great job!", no "Let's dive in!".
- Total ~120 words across all four fields combined."""


def _heuristic(
    *,
    correct: int,
    total: int,
    topic_title: str | None,
    items: list[dict[str, Any]],
) -> dict[str, Any]:
    pct = round((correct / total) * 100) if total else 0
    wrong_items = [it for it in items if not it.get("is_correct")]
    if pct >= 80:
        diagnosis = (
            f"You hit {pct}% on {topic_title or 'this topic'} ({correct}/{total}). "
            "On items at this difficulty band the signal is thin — one more "
            "round at higher difficulty will tell us if you've locked the concept "
            "or just nailed the easier framings."
        )
    elif wrong_items:
        sample = wrong_items[0]
        diagnosis = (
            f"You missed {len(wrong_items)} of {total}. The first miss "
            f"({sample.get('stem', '')[:80]}…) suggests the gap is in how "
            "the question is framed rather than the underlying definition — "
            "re-read the stems on the misses and look for qualifiers you skipped."
        )
    else:
        diagnosis = (
            "Mixed signal — a focused round on this same topic will sharpen the read."
        )
    weak_concepts: list[dict[str, str]] = []
    for it in wrong_items[:3]:
        weak_concepts.append(
            {
                "concept": (it.get("topic_title") or it.get("stem") or "")[:60],
                "why": (
                    f"You picked option {it.get('picked_letter') or '?'}; "
                    f"correct was {it.get('correct_letter') or '?'}."
                ),
            }
        )
    if not weak_concepts:
        weak_concepts.append(
            {
                "concept": topic_title or "Topic review",
                "why": "Run another round to widen the signal at this difficulty.",
            }
        )
    return {
        "diagnosis": diagnosis,
        "weak_concepts": weak_concepts,
        "next_step": (
            "Re-attempt the missed items below, then drill 5 more on the same "
            "topic at one notch higher difficulty."
            if wrong_items
            else "Try a 10-question mock at higher difficulty to validate."
        ),
        "confidence_note": (
            f"Based on {total} items. {pct}% accuracy "
            + ("isn't enough to claim mastery yet." if total < 12 else "is a stable signal.")
        ),
        "source": "heuristic",
        "model": None,
        "prompt_template_id": None,
        "prompt_template_version": None,
    }


async def generate_session_insights(
    *,
    correct: int,
    total: int,
    topic_title: str | None,
    items: list[dict[str, Any]],
    language: str = "en",
) -> dict[str, Any]:
    """Produce a structured insights payload for a finished practice session.

    `items` is a list of dicts with keys: stem, choices (list of strings),
    correct_idx, picked_idx, is_correct. The router builds this from the
    quiz session detail; in tests it can be passed directly.
    """
    pct = round((correct / total) * 100) if total else 0
    user_lines = [
        f"Topic: {topic_title or '(unknown)'}",
        f"Language: {language}",
        f"Score: {correct}/{total} ({pct}%)",
        f"Total items: {total}",
        "",
        "Items (newest first):",
    ]
    for i, it in enumerate(items, 1):
        choices = it.get("choices") or []
        correct_idx = int(it.get("correct_idx", -1))
        picked_idx = it.get("picked_idx")
        verdict = "✓" if it.get("is_correct") else "✗" if it.get("is_correct") is False else "-"
        stem = (it.get("stem") or "")[:200]
        user_lines.append(f"{i}. [{verdict}] {stem}")
        for j, ch in enumerate(choices):
            tags = []
            if j == correct_idx:
                tags.append("correct")
            if picked_idx is not None and j == picked_idx:
                tags.append("picked")
            tag_str = f" ← {' / '.join(tags)}" if tags else ""
            user_lines.append(f"     {chr(ord('A') + j)}. {ch}{tag_str}")
    user_lines.append("")
    user_lines.append("Task: produce session insights per the schema.")

    out = await llm.call_structured(
        system=SYSTEM_PROMPT,
        user="\n".join(user_lines),
        schema_name="session_insights",
        schema=INSIGHTS_SCHEMA,
    )
    if out is not None:
        out["source"] = "ai"
        out["model"] = "openai-default"
        out["prompt_template_id"] = PROMPT_TEMPLATE_ID
        out["prompt_template_version"] = PROMPT_TEMPLATE_VERSION
        return out
    return _heuristic(
        correct=correct, total=total, topic_title=topic_title, items=items
    )
