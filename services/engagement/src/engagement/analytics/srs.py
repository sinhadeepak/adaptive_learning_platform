"""Sprint 27 (P4-S27) — pure-function SM-2 scheduler with EWA tie-in.

Per ADR-0014. The math is fully separated from DB/HTTP so it can be
unit-tested in isolation; orchestration (read prior state, apply, write)
lives in revision.py.

SM-2 standard:
  quality = round(5 * accuracy)        # accuracy in [0, 1] -> quality in {0..5}

  if quality < 3:
    interval_days = 1
    ease_factor = max(1.3, ef - 0.2)
  else:
    if attempts == 1: interval_days = 1
    elif attempts == 2: interval_days = 6
    else: interval_days = round(prev_interval * ef)
    ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    ef = max(1.3, ef)

EWA tie-in:
  When mastery.ewa < 0.4 AND due_at > now + 7 days, clamp due_at to now + 3 days.
  Rationale: SM-2 alone over-extends intervals on topics the EWA flags as weak;
  the clamp ensures revision happens before EWA decays further.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import NamedTuple

EASE_FACTOR_FLOOR = 1.3
DEFAULT_EASE_FACTOR = 2.5
EWA_WEAK_THRESHOLD = 0.4
EWA_CLAMP_TRIGGER_DAYS = 7
EWA_CLAMP_TARGET_DAYS = 3


class SMResult(NamedTuple):
    interval_days: int
    ease_factor: float


def _quality_from_accuracy(accuracy: float) -> int:
    """Map accuracy in [0, 1] to SM-2 quality in {0..5}. Out-of-range
    inputs are clamped — defensive against bad data from upstream."""
    if accuracy <= 0.0:
        return 0
    if accuracy >= 1.0:
        return 5
    return round(5 * accuracy)


def compute_next_due(
    *,
    prev_interval_days: int,
    prev_ease_factor: float,
    prev_attempts: int,
    accuracy: float,
) -> SMResult:
    """SM-2 (modified) — given prior schedule + this attempt's accuracy,
    return the next interval + ease factor.

    `prev_attempts` is the count of attempts *before* this one — so a
    fresh seed call passes 0; the first real attempt produces attempts=1
    on the upsert that follows.
    """
    quality = _quality_from_accuracy(accuracy)
    attempts_after = prev_attempts + 1
    ease = max(EASE_FACTOR_FLOOR, prev_ease_factor)
    if quality < 3:
        # Fail path: reset interval to 1 day; nudge ease factor down.
        return SMResult(
            interval_days=1,
            ease_factor=max(EASE_FACTOR_FLOOR, ease - 0.2),
        )
    # Success path
    if attempts_after == 1:
        next_interval = 1
    elif attempts_after == 2:
        next_interval = 6
    else:
        next_interval = max(1, round(prev_interval_days * ease))
    # SM-2 ease-factor adjustment
    delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    next_ef = max(EASE_FACTOR_FLOOR, ease + delta)
    return SMResult(interval_days=next_interval, ease_factor=next_ef)


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
        due_at = due_at.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return due_at <= now


def overdue_days(due_at: datetime, *, now: datetime) -> int:
    """Whole days the row is overdue. Zero when not yet due or due today."""
    if due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    delta = now - due_at
    if delta.total_seconds() <= 0:
        return 0
    return int(delta.total_seconds() // 86400)
