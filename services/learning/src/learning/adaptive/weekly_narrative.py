"""Weekly narrative generator — Phase 6 S53 / ADR-0021.

Produces a structured 5-section narrative per (user, week) using the
AI Gateway with structured-output enforcement. Falls back to a
deterministic heuristic when OPENAI_API_KEY is unset.

Cache key: (user_id, week_start, prompt_template_version). Same as the
explanations cache pattern from ADR-0021.
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.adaptive import llm

log = logging.getLogger(__name__)
SCHEMA = "content_schema"

PROMPT_TEMPLATE_ID = "weekly_narrative"
PROMPT_TEMPLATE_VERSION = "1.0.0"

NARRATIVE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["improved", "slipping", "hidden_pattern", "forecast", "week_ahead"],
    "properties": {
        "improved": {
            "type": "object",
            "additionalProperties": False,
            "required": ["text"],
            "properties": {
                "text": {"type": "string", "description": "1 sentence on the week's biggest improvement."},
                "data_link": {"type": "string", "description": "Compact citation, e.g. 'concept_mastery_delta:newton-3:0.58→0.71'"},
            },
        },
        "slipping": {
            "type": "object",
            "additionalProperties": False,
            "required": ["text"],
            "properties": {
                "text": {"type": "string", "description": "1 sentence on what's decayed or weakened."},
                "data_link": {"type": "string", "description": "Compact citation, e.g. 'concept_mastery_delta:newton-3:0.58→0.71'"},
            },
        },
        "hidden_pattern": {
            "type": "object",
            "additionalProperties": False,
            "required": ["text"],
            "properties": {
                "text": {"type": "string", "description": "1 sentence naming a behaviour pattern."},
                "data_link": {"type": "string", "description": "Compact citation, e.g. 'concept_mastery_delta:newton-3:0.58→0.71'"},
            },
        },
        "forecast": {
            "type": "object",
            "additionalProperties": False,
            "required": ["text"],
            "properties": {
                "text": {"type": "string", "description": "1 sentence projecting readiness."},
                "data_link": {"type": "string", "description": "Compact citation, e.g. 'concept_mastery_delta:newton-3:0.58→0.71'"},
            },
        },
        "week_ahead": {
            "type": "object",
            "additionalProperties": False,
            "required": ["text", "actions"],
            "properties": {
                "text": {"type": "string", "description": "1 sentence framing the week."},
                "actions": {
                    "type": "array",
                    "minItems": 1, "maxItems": 4,
                    "items": {"type": "string", "description": "Imperative — 'Drill Newton 3', 'Take a 30-min mock', etc."},
                },
            },
        },
    },
}


SYSTEM_PROMPT = """You are an expert tutor writing a 90-second weekly learning
narrative for an Indian competitive-exam student (JEE / NEET / UPSC / CBSE / CAT).
The student already saw their numbers; your job is to interpret them.

Produce exactly five sections per the schema. Each section is one or two
sentences. The 'week_ahead' has up to 4 imperative bullets.

Hard rules:
- Cite specific concepts and concrete numbers from the signals.
- Don't repeat the score; explain what *changed*.
- 'hidden_pattern' should name a behaviour insight (time-of-day,
  mock-vs-practice gap, careless rate) not a vague "you can do better".
- No "Great job!" preamble; no encouraging fluff.
- Total ~120 words across all 5 sections."""


def _heuristic_fallback(signals: dict[str, Any]) -> dict[str, Any]:
    correct = signals.get("correct_count", 0)
    total = signals.get("total_count", 0)
    pct = round((correct / total) * 100) if total else 0
    return {
        "improved": {"text": f"You completed {total} questions this week with {pct}% accuracy."},
        "slipping": {"text": "Your decay signal is thin — keep up the practice streak."},
        "hidden_pattern": {"text": "Pattern signal needs more sessions; check back next week."},
        "forecast": {"text": "Trajectory holds at current pace — mocks help calibrate."},
        "week_ahead": {
            "text": "Next 7 days: keep the rhythm.",
            "actions": [
                "Continue daily missions",
                "One 30-minute mock segment",
                "Review one weak concept",
            ],
        },
    }


async def generate_weekly_narrative(
    *,
    user_id: str,
    week_start: date,
    signals: dict[str, Any],
    session: AsyncSession,
    is_delta: bool = False,
    delta_trigger: str | None = None,
) -> dict[str, Any]:
    """Generate or read-through-cache a weekly narrative."""
    if not is_delta:
        cached = await _get_cached(session, user_id=user_id, week_start=week_start)
        if cached is not None:
            return cached

    user_lines = [
        f"Student week: {week_start.isoformat()} to {(week_start + timedelta(days=6)).isoformat()}",
        f"Sessions this week: {signals.get('sessions_count', 0)}",
        f"Questions answered: {signals.get('total_count', 0)}",
        f"Correct: {signals.get('correct_count', 0)}",
        f"Topics touched: {signals.get('topics_touched', [])}",
    ]
    if signals.get("decay_concepts"):
        user_lines.append(f"Decay flags: {signals['decay_concepts']}")
    if signals.get("readiness_delta"):
        user_lines.append(f"Readiness change: {signals['readiness_delta']:+.1%}")
    if signals.get("mock_results"):
        user_lines.append(f"Mocks: {signals['mock_results']}")
    user_lines.append("")
    user_lines.append("Task: produce the 5-section narrative per the schema.")

    out = await llm.call_structured(
        system=SYSTEM_PROMPT,
        user="\n".join(user_lines),
        schema_name=PROMPT_TEMPLATE_ID,
        schema=NARRATIVE_SCHEMA,
    )
    if out is None:
        out = _heuristic_fallback(signals)
        source = "heuristic_fallback"
        model = None
    else:
        source = "ai"
        model = "openai-default"

    # Persist
    nid = str(uuid4())
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.weekly_narratives
              (id, user_id, week_start, narrative, signals_snapshot,
               source, model, prompt_template_id, prompt_template_version,
               is_delta, delta_trigger)
            VALUES
              (CAST(:id AS uuid), CAST(:uid AS uuid), :ws,
               CAST(:nar AS jsonb), CAST(:sig AS jsonb),
               :src, :mdl, :tid, :tver, :delta, :dtrig)
            ON CONFLICT (user_id, week_start, prompt_template_version)
              WHERE is_delta = FALSE
              DO NOTHING
            """
        ),
        {
            "id": nid,
            "uid": user_id,
            "ws": week_start,
            "nar": json.dumps(out),
            "sig": json.dumps(signals),
            "src": source,
            "mdl": model,
            "tid": PROMPT_TEMPLATE_ID,
            "tver": PROMPT_TEMPLATE_VERSION,
            "delta": is_delta,
            "dtrig": delta_trigger,
        },
    )
    await session.commit()

    return {
        "id": nid,
        "user_id": user_id,
        "week_start": week_start.isoformat(),
        "narrative": out,
        "source": source,
        "model": model,
        "prompt_template_id": PROMPT_TEMPLATE_ID,
        "prompt_template_version": PROMPT_TEMPLATE_VERSION,
        "is_delta": is_delta,
        "delta_trigger": delta_trigger,
    }


async def _get_cached(
    session: AsyncSession, *, user_id: str, week_start: date,
) -> dict[str, Any] | None:
    res = await session.execute(
        text(
            f"""
            SELECT id, user_id, week_start, narrative,
                   source, model, prompt_template_id, prompt_template_version,
                   is_delta, delta_trigger, generated_at
              FROM {SCHEMA}.weekly_narratives
             WHERE user_id = CAST(:uid AS uuid)
               AND week_start = :ws
               AND prompt_template_version = :tver
               AND is_delta = FALSE
             LIMIT 1
            """
        ),
        {"uid": user_id, "ws": week_start, "tver": PROMPT_TEMPLATE_VERSION},
    )
    row = res.mappings().first()
    if row is None:
        return None
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "week_start": row["week_start"].isoformat(),
        "narrative": row["narrative"],
        "source": row["source"],
        "model": row["model"],
        "prompt_template_id": row["prompt_template_id"],
        "prompt_template_version": row["prompt_template_version"],
        "is_delta": row["is_delta"],
        "delta_trigger": row["delta_trigger"],
        "cache": "hit",
    }


async def get_current_week(
    session: AsyncSession, *, user_id: str, today: date | None = None,
) -> dict[str, Any] | None:
    """Reads the most recent full narrative for the user's current week."""
    today = today or date.today()
    monday = today - timedelta(days=today.weekday())
    return await _get_cached(session, user_id=user_id, week_start=monday)
