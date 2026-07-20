"""Sprint 27 (P4-S27) — topic-level revision scheduler with EWA tie-in.

Per ADR-0014. The SM-2 math is the shared canonical core in `alp_srs`
(one implementation, also used by the flashcard review state, so the two
can't drift). This module keeps the engagement-specific pieces: the
accuracy→quality bridge, the EWA clamp, and the due-date helpers.

EWA tie-in:
  When mastery.ewa < 0.4 AND due_at > now + 7 days, clamp due_at to now + 3 days.
  Rationale: SM-2 alone over-extends intervals on topics the EWA flags as weak;
  the clamp ensures revision happens before EWA decays further.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import NamedTuple

from alp_srs import (
    DEFAULT_EASE_FACTOR,
    EASE_FACTOR_FLOOR,
    quality_from_accuracy,
    sm2_step,
)

__all__ = [
    "DEFAULT_EASE_FACTOR",
    "EASE_FACTOR_FLOOR",
    "SMResult",
    "apply_ewa_clamp",
    "compute_next_due",
    "due_today",
    "overdue_days",
]

EWA_WEAK_THRESHOLD = 0.4
EWA_CLAMP_TRIGGER_DAYS = 7
EWA_CLAMP_TARGET_DAYS = 3


class SMResult(NamedTuple):
    interval_days: int
    ease_factor: float


def compute_next_due(
    *,
    prev_interval_days: int,
    prev_ease_factor: float,
    prev_attempts: int,
    accuracy: float,
) -> SMResult:
    """Canonical SM-2 — given prior schedule + this attempt's accuracy,
    return the next interval + ease factor.

    `prev_attempts` is the count of attempts *before* this one — so a
    fresh seed call passes 0; the first real attempt produces attempts=1
    on the upsert that follows. (Maps to the shared core's `repetitions`.)
    """
    step = sm2_step(
        prev_interval_days=prev_interval_days,
        prev_ease_factor=prev_ease_factor,
        prev_repetitions=prev_attempts,
        quality=quality_from_accuracy(accuracy),
    )
    return SMResult(interval_days=step.interval_days, ease_factor=step.ease_factor)


def apply_ewa_clamp(
    due_at: datetime,
    mastery_ewa: float,
    *,
    now: datetime,
) -> datetime:
    """Clamp long intervals on weak-EWA topics.

    When mastery_ewa is below EWA_WEAK_THRESHOLD (0.4) AND due_at is more
    than EWA_CLAMP_TRIGGER_DAYS (7) days from now, force due_at to now +
    EWA_CLAMP_TARGET_DAYS (3) days.

    Pure: `now` is injected so tests don't depend on wall-clock.
    """
    if mastery_ewa is None or mastery_ewa >= EWA_WEAK_THRESHOLD:
        return due_at
    horizon = now + timedelta(days=EWA_CLAMP_TRIGGER_DAYS)
    if due_at <= horizon:
        return due_at
    return now + timedelta(days=EWA_CLAMP_TARGET_DAYS)


def due_today(due_at: datetime, *, now: datetime) -> bool:
    """A row is due today if its `due_at` is in the past or now (UTC)."""
    if due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    return due_at <= now


def overdue_days(due_at: datetime, *, now: datetime) -> int:
    """Whole days the row is overdue. Zero when not yet due or due today."""
    if due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    delta = now - due_at
    if delta.total_seconds() <= 0:
        return 0
    return int(delta.total_seconds() // 86400)
