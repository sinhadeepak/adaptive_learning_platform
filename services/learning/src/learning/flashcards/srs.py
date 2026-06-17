"""SM-2 algorithm — same constants as analytics_schema.revision_queue."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


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
        now = datetime.now(timezone.utc)
    q = max(0, min(5, quality))
    if q < 3:
        # Failed — reset interval, keep ease floor
        return ReviewState(
            ease_factor=max(1.3, state.ease_factor - 0.20),
            interval_days=1,
            repetitions=0,
            due_at=now + timedelta(days=1),
        )
    new_ef = state.ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    new_ef = max(1.3, new_ef)
    if state.repetitions == 0:
        new_interval = 1
    elif state.repetitions == 1:
        new_interval = 6
    else:
        new_interval = max(1, round(state.interval_days * new_ef))
    return ReviewState(
        ease_factor=new_ef,
        interval_days=new_interval,
        repetitions=state.repetitions + 1,
        due_at=now + timedelta(days=new_interval),
    )
