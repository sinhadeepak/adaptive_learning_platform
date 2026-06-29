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
# 2.1.0 — longer, seasoned-teacher depth on all fields. Cache rows
# carrying 2.0.0 are not served; new generation runs the next time a
# student expands the card. See ADR-0026 follow-up + UX-feedback log.
PROMPT_TEMPLATE_VERSION = "2.2.0"

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
                "1-sentence answer the student reads first (≤140 chars). "
                "Direct, no preamble. State the correct answer and the "
                "principle it rests on. Example: 'Action and reaction "
                "forces always act on DIFFERENT bodies — Newton''s third "
                "law forbids them from acting on the same object.'"
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
                "A teacher-style explanation of why the correct answer is "
                "right — 4-6 sentences (120-200 words). Open with the "
                "principle, then walk through how it applies to THIS "
                "question's specific wording. Name the formula / law / "
                "rule by name. If a qualifier in the stem is doing the "
                "work, call it out explicitly ('the word \"always\" is "
                "what rules out option B'). Plain English; assume the "
                "student is bright but hasn't seen the concept in a few "
                "weeks. End with one sentence that the student could "
                "repeat back to confirm understanding."
            ),
        },
        "options": {
            "type": "array",
            "description": (
                "One row per choice in the question, in input order. "
                "is_correct flags the right answer; verdict is a "
                "teacher's walkthrough (2-3 sentences each, 40-70 words) "
                "of why each option is right or wrong. For wrong "
                "options, name the SPECIFIC misconception that makes the "
                "distractor tempting, show where the reasoning breaks "
                "down, and give the student the one sentence they should "
                "remember to never pick it again. Each wrong verdict "
                "must name a DIFFERENT misconception."
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
                            "2-3 sentences per option (40-70 words). For "
                            "the correct option: cite the principle and "
                            "show why this option satisfies it. For wrong "
                            "options: (1) name the specific misconception "
                            "that makes the distractor look right, (2) "
                            "show exactly where the reasoning fails, "
                            "(3) give a one-line takeaway the student "
                            "should remember. Different misconception "
                            "per wrong option."
                        ),
                    },
                },
            },
        },
        "common_pitfall": {
            "type": "string",
            "description": (
                "3-4 sentences (80-130 words) naming the SINGLE most "
                "common mistake students make on items like this. Be "
                "concrete: which qualifier they skip, which sign they "
                "flip, which unit they confuse, which rule they "
                "over-apply. Explain WHY the trap works — what about the "
                "human brain or the question structure makes students "
                "fall for it. End with the heuristic they should apply "
                "next time they see this pattern."
            ),
        },
        "worked_example": {
            "type": "string",
            "description": (
                "Step-by-step walkthrough or analogy that drives the "
                "concept home. 150-280 words. Use clear steps: 'Step 1: "
                "identify the principle. Step 2: …'. For factual recall "
                "questions, give a memory-hook story or analogy instead. "
                "May be empty string only when truly impossible — prefer "
                "a worked example whenever the question rests on a "
                "principle, rule, or calculation."
            ),
        },
        "next_steps": {
            "type": "array",
            "minItems": 2,
            "maxItems": 3,
            "items": {
                "type": "string",
                "description": (
                    "Imperative — 'drill 5 X items', 'review the "
                    "prerequisite Y', 'watch the pinned clip on Z'. "
                    "Concrete, not 'keep practising'. Each action "
                    "should be doable in under 20 minutes."
                ),
            },
        },
    },
}


SYSTEM_PROMPT = """You are a panel of seasoned teachers writing the canonical
teaching note for a multiple-choice question on Indian competitive exams
(JEE, NEET, UPSC, CBSE, CAT). A student got this question wrong and is now
sitting in front of the answer screen — your note is the moment that turns a
mistake into mastery. Write like a patient classroom teacher debriefing
a student one-on-one, not like a textbook footnote.

The same note is served to every student who sees this question regardless of
which wrong distractor they picked, so address ALL distractors — not just one.

Output a structured note per the schema. Aim for depth, not breadth:

  - **headline** — one direct sentence stating the correct answer and the
    principle. No preamble.
  - **key_concept** — the single concept being tested.
  - **why_correct** — 4-6 sentences (120-200 words). Open with the principle,
    walk through how it applies to the EXACT wording of this question, name
    the formula/law/rule explicitly, and call out which qualifier in the stem
    is doing the work. End with the one-line takeaway.
  - **options[]** — for EACH option in input order: 2-3 sentences (40-70
    words). For correct: cite the principle and show why this option
    satisfies it. For wrong: (1) name the specific misconception that makes
    the distractor tempting, (2) show exactly where the reasoning breaks
    down, (3) give the one-line takeaway. Each wrong verdict must name a
    DIFFERENT misconception — students learn most when each distractor
    teaches them something new.
  - **common_pitfall** — 3-4 sentences (80-130 words). Name the SINGLE most
    common mistake, explain WHY the trap works (human-brain or
    question-structure level), and give the heuristic to apply next time.
  - **worked_example** — 150-280 words. Step-by-step walkthrough ('Step 1: …
    Step 2: …') for principle / rule / calc questions. For factual recall,
    a vivid memory-hook story or analogy. Only leave empty when truly
    impossible.
  - **next_steps[]** — 2-3 concrete actions, each doable in under 20 minutes.

Formatting (the note is rendered as Markdown + LaTeX — use it):
- Use **bold** for the key term, law, or final answer in each field, and
  *italics* for the subtle qualifier or contrast that students miss.
- Wrap EVERY formula, variable, unit-bearing quantity, and symbol in LaTeX:
  inline as $...$ (e.g. $KE = h\\nu - \\phi$, $\\eta = 1 - T_2/T_1$) and use
  proper LaTeX ($\\frac{a}{b}$, subscripts $T_2$, superscripts $x^2$, Greek
  $\\nu, \\phi, \\eta$). Never write formulae as plain text like "T_1" or
  "hv".
- In **worked_example**, put each step on its OWN line as a Markdown numbered
  list ("1. …", "2. …") — never run steps together in one paragraph.
- In **common_pitfall**, lead with the bolded mistake, then the why, then the
  heuristic; use a short Markdown list when you name more than one trap.
- Keep each **next_steps[]** entry to one concrete imperative line.

Hard rules:
- BE CONCRETE. Cite specific concepts, formulae, dates, units, signs, edge
  cases. Generic "review the textbook" is failure.
- No "Great question!", no "Let's dive in!", no apologies.
- The wrong-option verdicts must name the SPECIFIC failure mode for THAT
  distractor — never "this is wrong because the correct answer is X".
- Plain English. Total ~600-900 words across all fields. If a field's
  upper bound is reached, that's fine — students learn from the depth.
- Never reference an individual student's pick — the note is canonical.
- For Hindi/regional-language questions, write the note in the same
  language as the question, preserving the same depth and structure."""


def _heuristic(stem: str, choices: list[str], correct_idx: int) -> dict[str, Any]:
    """Deterministic fallback when no LLM key is configured.

    The heuristic can't write a real teacher-style explanation without a
    model, but it should at least sound like a tutor rather than a stub.
    The note tells the student exactly which qualifier to re-read, calls
    out each distractor as needing its own scrutiny, and points to the
    specific next actions a teacher would assign.
    """

    correct_text = choices[correct_idx] if 0 <= correct_idx < len(choices) else "(unknown)"
    options = []
    for i, choice in enumerate(choices):
        letter = chr(ord("A") + i)
        if i == correct_idx:
            verdict = (
                f"Correct. \"{choice}\" matches the principle being tested in "
                "this question — it stays true under the exact wording of the "
                "stem. When you re-read the stem, the qualifier (the word or "
                "phrase that narrows the scope) points squarely at this option."
            )
        else:
            verdict = (
                f"Tempting but wrong. \"{choice}\" looks reasonable in "
                "isolation, which is exactly why it was chosen as a "
                "distractor. The catch is that one of the words in the stem "
                "(a qualifier like 'only', 'always', 'except', or a specific "
                "unit) rules it out. The takeaway: never commit to an option "
                "until you have read every qualifier in the stem twice."
            )
        options.append({"id": letter, "is_correct": i == correct_idx, "verdict": verdict})

    why_correct = (
        f"The correct answer is \"{correct_text}\". This is the option that "
        "stays consistent with the principle the question is testing — read "
        "the stem again and notice which words narrow the scope. Each "
        "distractor matches the principle in some weaker, partial way, but "
        "only this option satisfies the entire stem. A useful habit: after "
        "you pick, re-read the stem once and ask whether your option would "
        "still be true if the qualifier were removed. If yes, you may have "
        "picked a distractor."
    )

    common_pitfall = (
        "The most common mistake on questions like this is rushing past a "
        "qualifier in the stem — words like 'only', 'always', 'never', "
        "'except', or a specific numeric range. Students pattern-match on "
        "the keyword and pick a distractor that would have been correct if "
        "the qualifier weren't there. The fix is to highlight every "
        "qualifier on your first read; if more than one option still seems "
        "right after that, the qualifier is doing the work and you should "
        "re-read it slowly."
    )

    worked_example = (
        "Step 1 — Identify the principle. Read the stem once for the topic, "
        "then once for the exact claim it's testing. Step 2 — Highlight the "
        "qualifiers. Underline every word that narrows scope ('only', "
        "'always', 'except', a unit, a date). Step 3 — Test each option "
        "against the qualifiers. Knock out anything that breaks under even "
        "one qualifier. Step 4 — From what's left, pick the option that "
        "matches the principle most precisely. If two options survive, the "
        "stem has a qualifier you missed — re-read it. This four-step pass "
        "takes 15-20 seconds and roughly halves careless-error rate on "
        "tricky MCQs."
    )

    return {
        "headline": f"The correct answer is \"{correct_text}\" — re-read the stem to see which qualifier rules out the rest.",
        "key_concept": "Read the qualifier; pick the option that satisfies the whole stem",
        "why_correct": why_correct,
        "options": options,
        "common_pitfall": common_pitfall,
        "worked_example": worked_example,
        "next_steps": [
            "Re-read the chapter section that introduces this concept.",
            "Practise 5 similar items, highlighting every qualifier before answering.",
            "Note this question in your error log under 'qualifier-miss'.",
        ],
        # Legacy fields kept populated for any v1 reader.
        "explanation": why_correct,
        "common_pitfall_legacy": common_pitfall,
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
