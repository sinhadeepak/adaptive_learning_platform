"""Pydantic schemas for IGS responses + payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


ActionKind = Literal[
    "practice_concept",
    "revise_concept",
    "take_mock",
    "watch_video",
    "crash_drill",
    "take_break",
    "reflection",
]


class IGSAction(BaseModel):
    """One candidate action the IGS evaluated. The selected one rises
    to the top with rank=1; alternatives carry rank≥2."""

    action_kind: ActionKind
    concept_id: str | None = None
    blueprint_id: str | None = None
    question_count: int | None = None
    expected_minutes: int = Field(ge=1, le=180)
    score: float
    rank: int = Field(ge=1)
    rationale: list[str] = Field(default_factory=list)
    expected_marks_gained: float = 0.0
    p_durable_mastery: float = 0.0
    time_efficiency: float = 0.0
    emotional_fit: float = 0.0
    cost: float = 0.0


class NextActionResponse(BaseModel):
    """`GET /igs/{user_id}/next-action` body."""

    user_id: str
    exam_id: str
    chosen: IGSAction
    alternatives: list[IGSAction] = Field(default_factory=list, max_length=3)
    confidence: float = Field(ge=0.0, le=1.0)
    generated_at: datetime


class TodayPlanResponse(BaseModel):
    """`GET /igs/{user_id}/today-plan` body — 3–5 ordered actions."""

    user_id: str
    exam_id: str
    plan: list[IGSAction]
    total_minutes: int
    target_minutes: int | None = None
    generated_at: datetime


class WeekPlanDay(BaseModel):
    day: int  # 0 = today, 6 = day-six-out
    actions: list[IGSAction]
    total_minutes: int


class WeekPlanResponse(BaseModel):
    user_id: str
    exam_id: str
    days: list[WeekPlanDay]
    projected_percentile_end_of_week: float
    projected_percentile_today: float


class IGSOverride(BaseModel):
    """`POST /igs/{user_id}/override` body — the student picked a
    different action. The body trains the IGS reward model."""

    chosen_action_kind: ActionKind
    concept_id: str | None = None
    rejected_top_action_id: str | None = None
    reason: str | None = Field(default=None, max_length=400)


class IGSExplain(BaseModel):
    """Deep-dive explainability — `GET /igs/{user_id}/explainability/{action_id}`."""

    action: IGSAction
    inputs: dict[str, Any]
    score_breakdown: dict[str, float]
    counterfactuals: list[dict[str, Any]] = Field(default_factory=list)


# ── WebSocket envelope (mirrors alp-battle's protocol shape) ──────


class IGSEnvelope(BaseModel):
    """All WS messages on the IGS channel use this envelope.

    Server → client `t` values:
      `igs.next-action.updated` — next recommendation changed
      `igs.plan.updated`        — today's plan changed
      `igs.recommendation.expired` — current rec no longer valid
      `igs.heartbeat`            — server liveness ping (every 30s)
      `igs.error`                — structured error

    Client → server `t` values:
      `igs.subscribe`            — server-acks with snapshot
      `igs.ack`                  — client confirms a server message
    """

    t: str
    p: dict[str, Any] | None = None
