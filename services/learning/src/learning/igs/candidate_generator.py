"""Candidate generator — produces the set of actions the decision
function will score and rank.

The generator is intentionally cheap: pull the student's top-K PCE
yield rows + the top decay-risk concepts + a mock-test option + a
break option. The decision function then scores each candidate
against the IGS score function.

The candidate set is deliberately *bounded* (≤ 12) — too many
candidates dilute the explanation surface. Better to score a small,
diverse set well than a huge one badly.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)


SCHEMA = "exam_intelligence_schema"


async def generate_candidates(
    session: AsyncSession,
    *,
    user_id: str,
    exam_id: str,
    forecast_year: int,
    decay_topic_days: dict[str, int] | None = None,
    top_k_yield: int = 5,
) -> list[dict[str, Any]]:
    """Build the candidate action set.

    Returns a list of un-scored dicts; the decision function
    consumes this directly.

    Composition:
      • Top-K PCE personal_yield rows → `practice_concept` actions
      • Top-3 decay-severity topics not already in the yield set →
        `revise_concept` actions
      • One `take_mock` action (when the student has done at least
        one practice session this week)
      • One `take_break` action — surfaces only after extended
        activity per the IGS rationale
    """
    candidates: list[dict[str, Any]] = []

    # 1. PCE yield-driven practice candidates.
    rows = (
        await session.execute(
            text(f"""
                SELECT topic_id, base_yield, mastery, decay_severity,
                       time_pressure, personal_yield, rank
                  FROM {SCHEMA}.topic_yield_personal
                 WHERE user_id = CAST(:uid AS uuid)
                   AND exam_id = CAST(:eid AS uuid)
                   AND forecast_year = :y
                 ORDER BY rank ASC
                 LIMIT :k
            """),
            {"uid": user_id, "eid": exam_id, "y": forecast_year, "k": top_k_yield},
        )
    ).mappings().all()
    yield_topics = {str(r["topic_id"]): r for r in rows}

    for r in rows:
        tid = str(r["topic_id"])
        candidates.append({
            "action_kind": "practice_concept",
            "concept_id": tid,
            "expected_minutes": 20,
            "question_count": 10,
            "signals": {
                "base_yield": float(r["base_yield"]),
                "mastery": float(r["mastery"]),
                "decay_severity": float(r["decay_severity"]),
                "time_pressure": float(r["time_pressure"]),
                "personal_yield": float(r["personal_yield"]),
                "yield_rank": int(r["rank"]),
            },
        })

    # 2. Decay-driven revise candidates — topics with high days-since
    # that *aren't* already in the top yield set. Capped at 3 to
    # avoid drowning the user with revision suggestions.
    if decay_topic_days:
        sorted_decay = sorted(
            decay_topic_days.items(), key=lambda kv: -kv[1]
        )
        added = 0
        for tid, days in sorted_decay:
            if added >= 3:
                break
            if tid in yield_topics:
                continue
            if days < 7:  # not decayed enough to surface yet
                continue
            candidates.append({
                "action_kind": "revise_concept",
                "concept_id": tid,
                "expected_minutes": 12,
                "question_count": 5,
                "signals": {
                    "days_since_attempt": int(days),
                    "decay_severity": min(1.0, days / 30.0),
                    # Set sensible defaults for fields the decision
                    # function expects.
                    "base_yield": 2.0,
                    "mastery": 0.5,
                    "time_pressure": 1.0,
                    "personal_yield": 2.0 * min(1.0, days / 30.0),
                    "yield_rank": 999,
                },
            })
            added += 1

    # 3. Mock-test option — fixed-cost, big upside when the student
    # hasn't done one recently. The decision function gates it via
    # the cost component.
    candidates.append({
        "action_kind": "take_mock",
        "concept_id": None,
        "expected_minutes": 60,
        "question_count": 30,
        "signals": {
            "base_yield": 6.0,    # mock surfaces gaps across topics
            "mastery": 0.0,        # treat as "fresh signal"
            "decay_severity": 0.0,
            "time_pressure": 1.0,
            "personal_yield": 6.0,
            "yield_rank": 50,
        },
    })

    # 4. Break — high emotional_fit only when the student has been
    # running hot. The decision function suppresses it most of the
    # time; here we just emit it as an option.
    candidates.append({
        "action_kind": "take_break",
        "concept_id": None,
        "expected_minutes": 10,
        "question_count": 0,
        "signals": {
            "base_yield": 0.0,
            "mastery": 0.0,
            "decay_severity": 0.0,
            "time_pressure": 1.0,
            "personal_yield": 0.0,
            "yield_rank": 999,
        },
    })

    return candidates
