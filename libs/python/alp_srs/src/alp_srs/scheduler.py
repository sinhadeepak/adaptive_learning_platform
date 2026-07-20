"""Canonical SM-2 spaced-repetition core.

One implementation, shared by:
  - the flashcard card-level review state (``services/learning`` flashcards), and
  - the topic-level revision queue (``services/engagement`` analytics).

Before this lib each service carried its own SM-2 copy and they had drifted:
the flashcard version multiplied the next interval by the *updated* ease
factor (textbook SM-2), while the engagement version multiplied by the
*pre-update* ease. This module standardises on canonical SM-2 (updated EF)
so the two can never disagree again.

Pure functions only — no I/O, no wall-clock. Callers own persistence and any
domain-specific tie-ins (e.g. engagement's EWA clamp).

SM-2 reference (Wozniak):
    EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02)),   floored at 1.3
    I(1) = 1
    I(2) = 6
    I(n) = round(I(n-1) * EF')                        for n >= 3, using EF'
    q < 3 (fail): I -> 1, EF -> max(1.3, EF - 0.2), repetition streak resets
"""

from __future__ import annotations

from typing import NamedTuple

EASE_FACTOR_FLOOR = 1.3
DEFAULT_EASE_FACTOR = 2.5


class SM2Step(NamedTuple):
    """Result of one review. ``repetitions`` is the streak of consecutive
    successful reviews *after* this one (0 after a lapse)."""

    interval_days: int
    ease_factor: float
    repetitions: int


def quality_from_accuracy(accuracy: float) -> int:
    """Map accuracy in [0, 1] to an SM-2 quality grade in {0..5}.

    Out-of-range values are clamped — defensive against bad upstream data.
    """
    if accuracy <= 0.0:
        return 0
    if accuracy >= 1.0:
        return 5
    return round(5 * accuracy)


def sm2_step(
    *,
    prev_interval_days: int,
    prev_ease_factor: float,
    prev_repetitions: int,
    quality: int,
) -> SM2Step:
    """Advance one SM-2 review.

    ``prev_repetitions`` is the count of consecutive successful reviews
    *before* this one (0 for a first review or right after a lapse).
    """
    q = max(0, min(5, quality))
    if q < 3:
        # Lapse: reset the interval + streak, nudge the ease factor down.
        return SM2Step(
            interval_days=1,
            ease_factor=max(EASE_FACTOR_FLOOR, prev_ease_factor - 0.2),
            repetitions=0,
        )

    new_ef = max(
        EASE_FACTOR_FLOOR,
        prev_ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
    )
    reps_after = prev_repetitions + 1
    if reps_after == 1:
        interval = 1
    elif reps_after == 2:
        interval = 6
    else:
        # Canonical SM-2: multiply by the UPDATED ease factor.
        interval = max(1, round(prev_interval_days * new_ef))
    return SM2Step(interval_days=interval, ease_factor=new_ef, repetitions=reps_after)
