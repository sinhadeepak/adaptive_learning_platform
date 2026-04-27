"""Cross-topic weakness diagnosis.

Per-topic mastery (EWA) hides sub-skill failures that span multiple topics.
A learner with EWA 0.6 in Mechanics and 0.6 in Thermodynamics might be
failing every "dimensional analysis" question in both — but the per-topic
view doesn't surface it.

This module:
  1. Pulls the user's recent answered items (joined with question content)
  2. Pulls per-topic EWA + topic titles from analytics + catalog
  3. Hands the wrong-answer set to an LLM with a structured-output schema
  4. The LLM identifies 2–3 cross-topic weakness patterns + a prescription
     per pattern, plus an overall assessment

Heuristic fallback when LLM is off: surfaces lowest-EWA topics with generic
advice; no fake patterns are invented.

Privacy note: this surface inherently exposes question stems + outcomes for
a user. The local stack runs without auth on these routes; in staging+ the
caller's JWT must match the path's user_id (or be a moderator+).
"""

from __future__ import annotations

from typing import Any

import structlog

from adaptive_engine import llm
from adaptive_engine.clients import (
    fetch_mastery,
    fetch_topic_catalog,
    fetch_user_answered_items,
)

log = structlog.get_logger(__name__)


WEAKNESS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["overall_assessment", "patterns"],
    "properties": {
        "overall_assessment": {
            "type": "string",
            "description": "2-3 sentences. Honest read of the learner's current state across topics. No padding.",
        },
        "patterns": {
            "type": "array",
            "minItems": 0,
            "maxItems": 3,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "name",
                    "description",
                    "subjects_affected",
                    "severity",
                    "evidence_count",
                    "prescription",
                ],
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Short label for the cross-topic weakness, e.g. 'Dimensional Analysis', 'Sign Conventions in Thermodynamics'.",
                    },
                    "description": {
                        "type": "string",
                        "description": "1-2 sentences naming what's failing concretely. Cite the principle, not just the symptom.",
                    },
                    "subjects_affected": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 1,
                        "description": "Subject or topic names where this pattern shows up.",
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                    },
                    "evidence_count": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "How many wrong answers in the supplied evidence fit this pattern.",
                    },
                    "prescription": {
                        "type": "string",
                        "description": "One concrete next action — a topic to revisit, a concept to drill, a problem type to practice. Specific, not generic.",
                    },
                },
            },
        },
    },
}


SYSTEM_PROMPT = """You are a senior tutor analyzing a student's recent quiz history for an Indian competitive exam.
You will receive: per-topic EWA scores, plus the stems + outcomes (correct/wrong) of recent items across all topics.

Your job: find CROSS-TOPIC weakness patterns. Examples of what counts as a real pattern:
- "fails dimensional-analysis questions whether the topic is Mechanics or Fluid Dynamics"
- "drops sign conventions in both Thermodynamics and Optics"
- "rushes calculation-heavy questions across all subjects"

Rules:
- Only report a pattern if you see ≥2 wrong answers across ≥2 different topics that genuinely share a sub-skill.
- Do NOT report "weak in topic X" — that's per-topic mastery, already on their dashboard. Look across topics.
- If the evidence is too thin (≤5 wrong answers, or all in one topic), return an empty patterns array and say so plainly in overall_assessment.
- Be diagnostically honest. Don't invent patterns to fill the schema."""


def _stub_response(reason: str, weakest_topics: list[str]) -> dict[str, Any]:
    if weakest_topics:
        prescription = (
            f"Run a focused practice block on {weakest_topics[0]}; that's where the largest "
            "EWA gap is. Cross-topic pattern detection needs more attempts to be useful."
        )
        assessment = (
            f"Not enough cross-topic data yet. Your weakest topic by EWA is "
            f"{weakest_topics[0]}; build attempts there first."
        )
    else:
        prescription = "Take a baseline diagnostic on any topic to start building your mastery map."
        assessment = "No quiz history yet — cross-topic patterns need at least 30+ answered items."
    return {
        "overall_assessment": assessment,
        "patterns": [],
        "weakest_topics": weakest_topics,
        "n_attempts_analyzed": 0,
        "n_wrong": 0,
        "source": "heuristic",
        "message": reason,
    }


def _format_evidence(items: list[dict[str, Any]], topic_titles: dict[str, str]) -> str:
    """Compact one-line-per-item evidence block. Caps at the first 60 items
    (LLM reads the rest as too noisy + costs tokens)."""
    lines: list[str] = []
    for it in items[:60]:
        topic_id = it.get("topicId", "")
        topic_title = topic_titles.get(topic_id, topic_id[:8])
        outcome = "✓" if it.get("isCorrect") else "✗"
        stem = (it.get("stem") or "").strip().replace("\n", " ")
        if len(stem) > 160:
            stem = stem[:157] + "…"
        lines.append(f"[{topic_title}] {outcome} {stem}")
    return "\n".join(lines)


async def diagnose_weakness(*, user_id: str) -> dict[str, Any]:
    items = await fetch_user_answered_items(user_id, limit=80)
    mastery = await fetch_mastery(user_id)
    topics = await fetch_topic_catalog()

    topic_titles = {t["topicId"]: t["title"] for t in topics}

    # Build "weakest topic titles" surface for both the heuristic and the LLM context.
    enriched_mastery = []
    for m in mastery:
        title = topic_titles.get(m.get("topicId", ""), "")
        ewa = float(m.get("ewa", 0.0))
        n = int(m.get("n", 0))
        if title:
            enriched_mastery.append({"title": title, "ewa": ewa, "n": n})
    enriched_mastery.sort(key=lambda r: r["ewa"])
    weakest_titles = [m["title"] for m in enriched_mastery if m["n"] > 0][:3]

    n_attempts = len(items)
    n_wrong = sum(1 for it in items if not it.get("isCorrect"))

    # Honest gating — don't waste a model call (or fabricate patterns) on thin data.
    if n_attempts < 15 or n_wrong < 5:
        return _stub_response(
            f"Only {n_attempts} answered items + {n_wrong} wrong so far. "
            "Cross-topic pattern detection needs ≥15 items including ≥5 wrong.",
            weakest_titles,
        )

    if not llm.is_enabled():
        return _stub_response(
            "AI weakness diagnosis requires OPENAI_API_KEY to be set in adaptive-engine.",
            weakest_titles,
        )

    user_lines = ["Per-topic mastery (EWA, attempts):"]
    for m in enriched_mastery:
        user_lines.append(f"- {m['title']}: ewa={m['ewa']:.2f} n={m['n']}")
    user_lines.append("")
    user_lines.append(f"Recent items (✓ = correct, ✗ = wrong) — {n_attempts} total, {n_wrong} wrong:")
    user_lines.append(_format_evidence(items, topic_titles))
    user_lines.append("")
    user_lines.append("Task: identify cross-topic weakness patterns per the rules.")

    parsed = await llm.call_structured(
        system=SYSTEM_PROMPT,
        user="\n".join(user_lines),
        schema_name="weakness_diagnosis",
        schema=WEAKNESS_SCHEMA,
    )
    if parsed is None:
        return _stub_response(
            "Model call failed — diagnostic falls back to per-topic ranking.",
            weakest_titles,
        )

    return {
        **parsed,
        "weakest_topics": weakest_titles,
        "n_attempts_analyzed": n_attempts,
        "n_wrong": n_wrong,
        "source": "ai",
    }
