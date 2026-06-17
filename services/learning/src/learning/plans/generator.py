"""Pure-function plan generator.

Produces a 7-day plan as a list of GeneratedSession from current state.
Heuristic v1: weak concepts get is_required=true; one mock per week
also is_required; rest of the slots fill with revision and topic
practice. ROI scoring is signal-priority: weak < 0.4 first, decay
> 14 days second.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date as _date
from typing import Literal


@dataclass(frozen=True)
class WeakConceptSignal:
    concept_id: str
    topic_id: str | None
    ewa: float
    n: int


@dataclass(frozen=True)
class DecaySignal:
    concept_id: str
    topic_id: str | None
    days_since_seen: int
    ewa: float


@dataclass(frozen=True)
class GeneratedSession:
    day_offset: int
    slot: Literal["morning", "afternoon", "evening", "flex"]
    kind: Literal["practice", "revision", "mock"]
    concept_id: str | None
    topic_id: str | None
    expected_minutes: int
    expected_questions: int
    is_required: bool
    locked_reason: str | None
    position: int = 0


def generate_week(
    *,
    daily_minutes_goal: int,
    target_date: _date | None,
    weak_concepts: list[WeakConceptSignal] | None = None,
    decays: list[DecaySignal] | None = None,
    has_recent_mock: bool = False,
) -> list[GeneratedSession]:
    """Heuristic v1 — fills 7 days with high-priority work."""
    weak_concepts = weak_concepts or []
    decays = decays or []
    sessions: list[GeneratedSession] = []

    # Day 0 (Monday): Weak-concept drill — required if any weak exist
    if weak_concepts:
        w = weak_concepts[0]
        sessions.append(
            GeneratedSession(
                day_offset=0,
                slot="evening",
                kind="practice",
                concept_id=w.concept_id,
                topic_id=w.topic_id,
                expected_minutes=daily_minutes_goal,
                expected_questions=max(8, daily_minutes_goal // 3),
                is_required=True,
                locked_reason="weak_concept",
                position=0,
            )
        )

    # Day 1 (Tuesday): Revision (decay catch-up) — required if decay exists
    if decays:
        d = decays[0]
        sessions.append(
            GeneratedSession(
                day_offset=1,
                slot="evening",
                kind="revision",
                concept_id=d.concept_id,
                topic_id=d.topic_id,
                expected_minutes=20,
                expected_questions=8,
                is_required=True,
                locked_reason="decay_recovery",
                position=0,
            )
        )

    # Day 3 (Thursday): Practice topic
    if weak_concepts and len(weak_concepts) > 1:
        w = weak_concepts[1]
        sessions.append(
            GeneratedSession(
                day_offset=3,
                slot="evening",
                kind="practice",
                concept_id=w.concept_id,
                topic_id=w.topic_id,
                expected_minutes=daily_minutes_goal,
                expected_questions=max(8, daily_minutes_goal // 3),
                is_required=False,
                locked_reason=None,
                position=0,
            )
        )

    # Day 5 (Saturday): Weekly mock — required if no recent mock
    sessions.append(
        GeneratedSession(
            day_offset=5,
            slot="morning",
            kind="mock",
            concept_id=None,
            topic_id=None,
            expected_minutes=45,
            expected_questions=20,
            is_required=not has_recent_mock,
            locked_reason="weekly_mock" if not has_recent_mock else None,
            position=0,
        )
    )

    # Day 6 (Sunday): Reflection / catch-up — optional
    sessions.append(
        GeneratedSession(
            day_offset=6,
            slot="afternoon",
            kind="practice",
            concept_id=None,
            topic_id=None,
            expected_minutes=20,
            expected_questions=8,
            is_required=False,
            locked_reason=None,
            position=0,
        )
    )

    return sessions
