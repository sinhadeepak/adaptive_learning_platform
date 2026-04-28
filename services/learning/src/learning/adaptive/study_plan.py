"""Personalised Study Plan + Guided Next Steps composer.

Two surfaces:
- build_study_plan(user_id, exam_code): full 7-day schedule + topic priorities. Heavier output.
- build_guided_next_steps(user_id, exam_code): 3 immediate actions for the home dashboard.

Both follow the same shape:
  1. Pull mastery + readiness + topic catalog.
  2. Try the LLM (OpenAI) for a personalised, narrative-rich plan.
  3. If the LLM is disabled or errors, fall back to a heuristic — so the feature
     always renders, just with less prose.

The heuristic mirrors the LLM's intent: prioritise topics with the lowest EWA + most
remaining content, allocate the week's days proportional to weakness.
"""

from __future__ import annotations

from typing import Any

import structlog

from learning.adaptive import llm
from learning.adaptive.clients import (
    fetch_mastery,
    fetch_readiness,
    fetch_topic_catalog,
)

log = structlog.get_logger(__name__)


# --- JSON Schemas (OpenAI strict mode requires every property in `required`) -------

STUDY_PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["headline", "diagnosis", "topicPriorities", "weeklySchedule", "encouragement"],
    "properties": {
        "headline": {
            "type": "string",
            "description": "One-line summary of the plan, 60–120 chars.",
        },
        "diagnosis": {
            "type": "string",
            "description": "2–3 sentence read of the learner's current state, citing strongest + weakest topics by name.",
        },
        "topicPriorities": {
            "type": "array",
            "minItems": 1,
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["topicId", "title", "rank", "rationale", "targetMastery"],
                "properties": {
                    "topicId": {"type": "string"},
                    "title": {"type": "string"},
                    "rank": {"type": "integer", "description": "1 = highest priority."},
                    "rationale": {
                        "type": "string",
                        "description": "Why this topic is ranked here. 1–2 sentences.",
                    },
                    "targetMastery": {
                        "type": "number",
                        "description": "EWA goal in [0, 1] for the week.",
                    },
                },
            },
        },
        "weeklySchedule": {
            "type": "array",
            "minItems": 7,
            "maxItems": 7,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["day", "focus", "actions"],
                "properties": {
                    "day": {
                        "type": "string",
                        "enum": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                    },
                    "focus": {"type": "string", "description": "Topic name to centre the day on."},
                    "actions": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 4,
                        "items": {"type": "string"},
                    },
                },
            },
        },
        "encouragement": {
            "type": "string",
            "description": "One sentence of motivating context. Plainspoken, not saccharine.",
        },
    },
}


GUIDED_NEXT_STEPS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["headline", "steps"],
    "properties": {
        "headline": {
            "type": "string",
            "description": "Short, specific. e.g. 'Shore up Thermodynamics before the next mock'.",
        },
        "steps": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["action", "topicId", "topicTitle", "why", "estMinutes"],
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["REVISE", "PRACTICE", "DIAGNOSE", "MOCK_SLICE"],
                    },
                    "topicId": {"type": "string"},
                    "topicTitle": {"type": "string"},
                    "why": {
                        "type": "string",
                        "description": "1 sentence — why this is the right next move for this learner.",
                    },
                    "estMinutes": {"type": "integer", "minimum": 5, "maximum": 90},
                },
            },
        },
    },
}


SYSTEM_PROMPT_STUDY_PLAN = """You are an expert exam-prep coach for Indian competitive exams (NEET, JEE, UPSC, CBSE).
You read a learner's mastery vector (per-topic EWA in [0, 1]) plus their readiness score, and produce a focused 7-day study plan.

Hard rules:
- Use the topicId values verbatim from the catalog you are given. Do not invent topic IDs or titles.
- Prioritise weakest-mastery topics with content available (questionCount > 0).
- Each day's focus must come from the topicPriorities list; do not introduce extras.
- Keep prose tight and concrete. No filler ("Embark on your journey…"). Speak like a coach who's seen 1000 students."""


SYSTEM_PROMPT_GUIDED_STEPS = """You are an exam-prep coach. The learner has just opened their dashboard.
Pick 3 immediate next actions — what should they do right now, in the next hour?

Hard rules:
- Use the topicId values verbatim from the catalog. Do not invent topics.
- Mix REVISE / PRACTICE / DIAGNOSE / MOCK_SLICE actions to balance learning modes.
- Estimated minutes must be realistic: REVISE 10–20, DIAGNOSE 15–30, PRACTICE 20–40, MOCK_SLICE 30–60.
- Keep "why" to one short sentence, learner-specific (cite their EWA gap or recent activity)."""


# --- Public composers ----------------------------------------------------------------


async def build_study_plan(user_id: str, exam_code: str | None = None) -> dict[str, Any]:
    mastery = await fetch_mastery(user_id)
    readiness = await fetch_readiness(user_id)
    topics = await fetch_topic_catalog(exam_code)
    enriched = _enrich_topics_with_mastery(topics, mastery)

    user_payload = _format_user_context(
        user_id=user_id,
        readiness=readiness,
        topics=enriched,
        ask="full_study_plan",
    )

    plan = await llm.call_structured(
        system=SYSTEM_PROMPT_STUDY_PLAN,
        user=user_payload,
        schema_name="study_plan",
        schema=STUDY_PLAN_SCHEMA,
    )
    if plan is not None:
        plan["source"] = "ai"
        return plan

    return _heuristic_study_plan(enriched, readiness)


async def build_guided_next_steps(user_id: str, exam_code: str | None = None) -> dict[str, Any]:
    mastery = await fetch_mastery(user_id)
    readiness = await fetch_readiness(user_id)
    topics = await fetch_topic_catalog(exam_code)
    enriched = _enrich_topics_with_mastery(topics, mastery)

    user_payload = _format_user_context(
        user_id=user_id,
        readiness=readiness,
        topics=enriched,
        ask="guided_next_steps",
    )

    steps = await llm.call_structured(
        system=SYSTEM_PROMPT_GUIDED_STEPS,
        user=user_payload,
        schema_name="guided_next_steps",
        schema=GUIDED_NEXT_STEPS_SCHEMA,
    )
    if steps is not None:
        steps["source"] = "ai"
        return steps

    return _heuristic_guided_next_steps(enriched)


# --- Helpers -------------------------------------------------------------------------


def _enrich_topics_with_mastery(
    topics: list[dict[str, Any]], mastery: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Join the catalog rows with EWA from mastery, defaulting to 0.0 when never attempted."""
    by_topic = {m["topicId"]: m for m in mastery}
    out = []
    for t in topics:
        m = by_topic.get(t["topicId"], {})
        out.append(
            {
                **t,
                "ewa": float(m.get("ewa", 0.0)),
                "attempts": int(m.get("n", 0)),
            }
        )
    return out


def _format_user_context(
    *,
    user_id: str,
    readiness: dict[str, Any],
    topics: list[dict[str, Any]],
    ask: str,
) -> str:
    lines = [
        f"Learner ID: {user_id}",
        f"Overall readiness: {readiness.get('score', 0.0):.2f} across {readiness.get('nTopics', 0)} active topics.",
        "",
        "Topic catalog (topicId | title | subject | exam | EWA | attempts | questionCount):",
    ]
    # Sort by ewa ascending so the weakest topics are at the top of the list — easier
    # for the model to anchor on. Cold-start topics (ewa=0, attempts=0) sort first.
    for t in sorted(topics, key=lambda r: (r["ewa"], -r["questionCount"])):
        lines.append(
            f"- {t['topicId']} | {t['title']} | {t['subjectName']} | {t['examName']} "
            f"| ewa={t['ewa']:.2f} | n={t['attempts']} | qCount={t['questionCount']}"
        )
    lines.append("")
    lines.append(f"Task: {ask}.")
    return "\n".join(lines)


# --- Heuristic fallbacks (used when LLM unavailable) ---------------------------------


def _heuristic_study_plan(
    topics: list[dict[str, Any]], readiness: dict[str, Any]
) -> dict[str, Any]:
    candidates = [t for t in topics if t["questionCount"] > 0]
    if not candidates:
        candidates = topics
    weakest = sorted(candidates, key=lambda t: t["ewa"])[:5]

    priorities = [
        {
            "topicId": t["topicId"],
            "title": t["title"],
            "rank": i + 1,
            "rationale": (
                f"Current EWA {t['ewa']:.2f} on {t['attempts']} attempts — "
                f"largest gap to a comfortable mastery in {t['subjectName']}."
            ),
            "targetMastery": min(0.7, max(0.4, t["ewa"] + 0.2)),
        }
        for i, t in enumerate(weakest)
    ]

    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    schedule = []
    for i, day in enumerate(days):
        focus_topic = weakest[i % len(weakest)] if weakest else None
        if focus_topic is None:
            schedule.append(
                {"day": day, "focus": "Review", "actions": ["Open the topic library"]}
            )
            continue
        schedule.append(
            {
                "day": day,
                "focus": focus_topic["title"],
                "actions": [
                    f"15-minute concept refresh on {focus_topic['title']}",
                    "10-question diagnostic (adaptive)",
                    "Review wrong answers and tag the misconception",
                ],
            }
        )

    headline = (
        f"Build mastery in {weakest[0]['title']}" if weakest else "Begin building your mastery map"
    )
    diagnosis = (
        f"Readiness sits at {readiness.get('score', 0.0):.2f}. "
        f"Your weakest active topic is {weakest[0]['title']} ({weakest[0]['ewa']:.2f}); "
        f"strongest is {sorted(topics, key=lambda t: -t['ewa'])[0]['title'] if topics else 'n/a'}."
        if weakest
        else "No graded sessions yet — start with a baseline diagnostic to seed your plan."
    )

    return {
        "headline": headline,
        "diagnosis": diagnosis,
        "topicPriorities": priorities,
        "weeklySchedule": schedule,
        "encouragement": (
            "Small daily reps beat weekend marathons — consistency is what moves readiness."
        ),
        "source": "heuristic",
    }


def _heuristic_guided_next_steps(topics: list[dict[str, Any]]) -> dict[str, Any]:
    candidates = [t for t in topics if t["questionCount"] > 0]
    if not candidates:
        candidates = topics
    weakest = sorted(candidates, key=lambda t: t["ewa"])[:3]
    if not weakest:
        return {
            "headline": "Take a baseline diagnostic to start building your map",
            "steps": [
                {
                    "action": "DIAGNOSE",
                    "topicId": "",
                    "topicTitle": "Pick any topic from the catalog",
                    "why": "We need a first signal to start personalising your plan.",
                    "estMinutes": 15,
                }
                for _ in range(3)
            ],
            "source": "heuristic",
        }

    actions_pool = ["REVISE", "PRACTICE", "DIAGNOSE"]
    steps = []
    minutes = [15, 30, 20]
    for i, t in enumerate(weakest):
        action = actions_pool[i % 3]
        why = (
            f"Lowest mastery on this topic ({t['ewa']:.2f} EWA) — "
            f"closing this gap moves your readiness fastest."
        )
        steps.append(
            {
                "action": action,
                "topicId": t["topicId"],
                "topicTitle": t["title"],
                "why": why,
                "estMinutes": minutes[i % 3],
            }
        )
    return {
        "headline": f"Shore up {weakest[0]['title']} before your next mock",
        "steps": steps,
        "source": "heuristic",
    }
