"""Streak math.

Pure-function logic: given the previous streak row + today's date (UTC),
derive the new streak. Kept separate from the IO so it's trivially
unit-testable.

Rules
-----
- First-ever session for user → current=1, longest=1.
- Same UTC day as last_active_date → no change (already counted).
- Exactly the next UTC day → current += 1.
- Any later day (gap of >= 2) → reset to 1.
- longest_streak = max(longest, current).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class StreakUpdate:
    current_streak: int
    longest_streak: int
    last_active_date: date


def compute_next_streak(
    *,
    today: date,
    prev_current: int | None,
    prev_longest: int | None,
    prev_last_active: date | None,
) -> StreakUpdate:
    """Derive the new streak. None for prev_* means 'no row yet'."""
    if prev_last_active is None:
        return StreakUpdate(current_streak=1, longest_streak=1, last_active_date=today)

    if today == prev_last_active:
        # Same-day repeat — no change. Caller should still consider this a
        # write-through so updated_at advances; that's fine.
        return StreakUpdate(
            current_streak=prev_current or 0,
            longest_streak=prev_longest or 0,
            last_active_date=prev_last_active,
        )

    # Consecutive day → +1; any larger gap → reset to 1.
    new_current = (prev_current or 0) + 1 if today == prev_last_active + timedelta(days=1) else 1

    new_longest = max(prev_longest or 0, new_current)
    return StreakUpdate(
        current_streak=new_current,
        longest_streak=new_longest,
        last_active_date=today,
    )
