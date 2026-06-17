"""Mid-quiz friction prompt heuristic — Phase 6 S54 / ADR-0022.

Pure function evaluating an in-flight session's history. Returns a
trigger when one of four heuristics fires:
  - 3 consecutive wrong answers → suggest easier
  - 3 consecutive correct answers in < 5 s → suggest harder
  - One answer with > 30 s hesitation → suggest easier
  - 2 consecutive skips → suggest easier

Constraint: caller is responsible for firing the prompt at most ONCE
per session (track via quiz_sessions.friction_fired_at_idx); this
function returns the *eligibility* decision only.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class ItemAttempt:
    item_idx: int
    is_correct: bool | None    # None = skipped
    time_spent_ms: int | None  # None when not recorded
    skipped: bool = False


@dataclass(frozen=True)
class FrictionTrigger:
    reason: Literal["repeated_wrong", "fast_correct", "long_hesitation", "repeated_skip"]
    suggested_offset: float    # ±0.2; positive = harder
    suggested_action: Literal["easier", "harder", "same"]
    message: str               # 1-line student-facing copy


def evaluate_friction(
    history: list[ItemAttempt],
    last_friction_at_idx: int | None = None,
) -> FrictionTrigger | None:
    """Returns the first triggered friction prompt, or None.

    Once a prompt has fired (last_friction_at_idx is set), returns
    None for the rest of the session — at most one prompt per session.
    """
    if last_friction_at_idx is not None:
        return None  # already fired this session
    if len(history) < 2:
        return None  # too thin a signal

    # 1. Three consecutive wrong (looking at last 3)
    if len(history) >= 3:
        last_three = history[-3:]
        if all(a.skipped is False and a.is_correct is False for a in last_three):
            return FrictionTrigger(
                reason="repeated_wrong",
                suggested_offset=-0.2,
                suggested_action="easier",
                message="The last 3 felt rough. Want to ease into the rhythm with something a little simpler?",
            )

    # 2. Three consecutive correct in <5s each (suggest harder)
    if len(history) >= 3:
        last_three = history[-3:]
        if all(
            a.is_correct is True
            and a.time_spent_ms is not None
            and a.time_spent_ms < 5000
            for a in last_three
        ):
            return FrictionTrigger(
                reason="fast_correct",
                suggested_offset=+0.2,
                suggested_action="harder",
                message="You're flying through these. Stretch yourself with something harder?",
            )

    # 3. Long hesitation on the latest answer
    if history:
        last = history[-1]
        if (
            last.time_spent_ms is not None
            and last.time_spent_ms > 30000
            and last.is_correct is False
        ):
            return FrictionTrigger(
                reason="long_hesitation",
                suggested_offset=-0.2,
                suggested_action="easier",
                message="That one took a while. Want to drop down a notch and rebuild momentum?",
            )

    # 4. Two consecutive skips
    if len(history) >= 2:
        last_two = history[-2:]
        if all(a.skipped for a in last_two):
            return FrictionTrigger(
                reason="repeated_skip",
                suggested_offset=-0.2,
                suggested_action="easier",
                message="Skipping is fine, but a slightly easier item might land better right now.",
            )

    return None
