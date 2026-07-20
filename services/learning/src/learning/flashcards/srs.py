"""Card-level SM-2 review state.

Thin adapter over the shared canonical SM-2 core (`alp_srs`) — this file
adds the `due_at` bookkeeping the flashcard tables need; the scheduling math
itself is shared with the topic-level revision queue so the two can't drift.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from alp_srs import sm2_step


@dataclass
class ReviewState:
    ease_factor: float
    interval_days: int
    repetitions: int
    due_at: datetime


def sm2_update(
    state: ReviewState,
    quality: int,                 # 0..5 (Anki-style: 0=blackout, 5=perfect)
    *,
    now: datetime | None = None,
) -> ReviewState:
    """Apply one review with `quality` to produce the next state."""
    if now is None:
        now = datetime.now(UTC)
    step = sm2_step(
        prev_interval_days=state.interval_days,
        prev_ease_factor=state.ease_factor,
        prev_repetitions=state.repetitions,
        quality=quality,
    )
    return ReviewState(
        ease_factor=step.ease_factor,
        interval_days=step.interval_days,
        repetitions=step.repetitions,
        due_at=now + timedelta(days=step.interval_days),
    )
