"""Pydantic payload + response contracts for the 3 Interactive types (GATED)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


# ── KBC_LIFELINE ─────────────────────────────────────────────────────────────


LifelineKind = Literal["50_50", "audience_poll", "phone_a_friend"]


class KBCLifelinePayload(BaseModel):
    """Wraps an MCQ_SINGLE with KBC-style lifeline metadata.

    The underlying question is referenced by `inner_question_id`; this
    payload only carries the gamification wrapper.
    """

    inner_question_id: str
    available_lifelines: list[LifelineKind] = Field(min_length=0, max_length=3)
    audience_poll_distribution: dict[str, float] | None = None  # option_id → weight
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _audience_poll_consistency(self) -> "KBCLifelinePayload":
        if "audience_poll" in self.available_lifelines and not self.audience_poll_distribution:
            raise ValueError(
                "audience_poll lifeline requires audience_poll_distribution"
            )
        if self.audience_poll_distribution is not None:
            total = sum(self.audience_poll_distribution.values())
            if abs(total - 100.0) > 0.5:
                raise ValueError(
                    f"audience_poll_distribution weights must sum to ~100; got {total}"
                )
        return self


class KBCLifelineResponse(BaseModel):
    """Records what the inner-question response was + which lifelines used."""

    inner_response_payload: dict[str, object]
    lifelines_used: list[LifelineKind] = Field(default_factory=list)


# ── TIMED_REVEAL ─────────────────────────────────────────────────────────────


class RevealStep(BaseModel):
    at_seconds: float = Field(ge=0)
    additional_info: str = Field(min_length=1, max_length=2000)  # translatable


class TimedRevealPayload(BaseModel):
    """Question reveals additional information at preset intervals."""

    inner_question_id: str
    initial_stem: str = Field(min_length=8, max_length=2000)
    reveal_schedule: list[RevealStep] = Field(min_length=1, max_length=5)
    # If True, correct answer becomes harder over time; if False, easier.
    reveals_make_easier: bool = True
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _reveal_times_strictly_increasing(self) -> "TimedRevealPayload":
        times = [r.at_seconds for r in self.reveal_schedule]
        if sorted(times) != times:
            raise ValueError("reveal_schedule at_seconds must be strictly increasing")
        if len(set(times)) != len(times):
            raise ValueError("reveal_schedule at_seconds must be unique")
        return self


class TimedRevealResponse(BaseModel):
    inner_response_payload: dict[str, object]
    answered_at_seconds: float = Field(ge=0)


# ── ADAPTIVE_DIFFICULTY ──────────────────────────────────────────────────────


class DifficultyVariant(BaseModel):
    question_id: str
    difficulty_level: int = Field(ge=1, le=5)


class AdaptiveDifficultyPayload(BaseModel):
    """Pool of variants of the same concept at increasing difficulty.

    The engine picks which variant the student sees based on prior
    response in the session.
    """

    variants: list[DifficultyVariant] = Field(min_length=2, max_length=5)
    starting_difficulty: int = Field(default=2, ge=1, le=5)
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _variants_consistency(self) -> "AdaptiveDifficultyPayload":
        levels = [v.difficulty_level for v in self.variants]
        if len(set(levels)) != len(levels):
            raise ValueError("variants must have distinct difficulty_levels")
        if self.starting_difficulty not in levels:
            raise ValueError(
                f"starting_difficulty {self.starting_difficulty} not in variants {sorted(levels)}"
            )
        return self


class AdaptiveDifficultyResponse(BaseModel):
    served_question_id: str  # which variant the engine actually served
    inner_response_payload: dict[str, object]
