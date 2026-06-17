"""L1 — guardrail system-prompt preamble (preventive layer).

Injected as a leading block on every authoring generation call so the
model writes from first principles: concepts/facts are free to test, but
the *expression* must always be original (Idea-Expression Dichotomy,
India Copyright Act 1957 §13). Per Action Plan §4.1.

Kept as a versioned constant (not a free-floating string) so the version
travels into the audit trail and any change is a reviewable code change.
The engine passes `GUARDRAIL_PREAMBLE` through the `{guardrail_preamble}`
placeholder that the authoring templates carry.
"""

from __future__ import annotations

# Bump on any wording change; recorded in GuardrailVerdict.guardrail_version
# and every ai_generation_jobs trace row (Action Plan §4.3).
GUARDRAIL_PROMPT_VERSION = "1.0.0"

GUARDRAIL_PREAMBLE = """\
ORIGINALITY RULES — apply to every question you write:

1. CONCEPT OWNERSHIP. You may freely test any concept, fact, scientific
   principle, historical event, or theorem in the syllabus. These belong
   to everyone — use them freely.
2. EXPRESSION OWNERSHIP. Every word you write must be your own original
   composition. Never reproduce or closely mirror the phrasing, sentence
   structure, distractor wording, or explanation text of any existing
   question from any exam paper, textbook, coaching material, or website.
3. THE TEST. Before writing each question ask: "Am I expressing this
   concept in my own way?" If you are recalling a specific phrasing,
   discard it and rephrase from scratch.
4. YOU MUST NEVER reproduce exact or near-exact phrasing from any source,
   copy distractor options even partially, or mirror the structure of a
   recognised question."""


def preamble_inputs() -> dict[str, str]:
    """The prompt-input fragment the engine merges into authoring inputs
    so templates can render `{guardrail_preamble}`."""
    return {"guardrail_preamble": GUARDRAIL_PREAMBLE}
