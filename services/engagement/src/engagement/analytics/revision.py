"""Sprint 27 (P4-S27) — orchestrator for the revision queue.

`update_revision_queue` is called by `process_session` after the EWA +
readiness updates. Pure orchestration — math lives in `srs.py`, DB writes
in `revision_queue_repo.py`.

Per ADR-0014.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from engagement.analytics import revision_queue_repo as _repo
from engagement.analytics.srs import (
    DEFAULT_EASE_FACTOR,
    apply_ewa_clamp,
    compute_next_due,
)


async def update_revision_queue(
    session: AsyncSession,
    *,
    user_id: str,
    topic_id: str,
    accuracy: float,
    mastery_ewa: float,
    now: datetime,
    exam_id: str | None = None,
) -> None:
    """Apply SM-2 + EWA-clamp to the (user, topic) row.

    Idempotency: caller's `process_session` short-circuits on
    `is_session_processed`, so this runs at most once per submitted
    session.
    """
    prior = await _repo.get_state(session, user_id, topic_id)
    if prior is None:
        prev_interval = 0
        prev_ef = DEFAULT_EASE_FACTOR
        prev_attempts = 0
    else:
        prev_interval = prior.interval_days
        prev_ef = prior.ease_factor
        prev_attempts = prior.attempts

    sched = compute_next_due(
        prev_interval_days=prev_interval,
        prev_ease_factor=prev_ef,
        prev_attempts=prev_attempts,
        accuracy=accuracy,
    )
    candidate_due = now + timedelta(days=sched.interval_days)
    final_due = apply_ewa_clamp(candidate_due, mastery_ewa, now=now)

    await _repo.upsert(
        session,
        user_id=user_id,
        topic_id=topic_id,
        exam_id=exam_id,
        last_attempt_at=now,
        due_at=final_due,
        interval_days=sched.interval_days,
        ease_factor=sched.ease_factor,
        attempts=prev_attempts + 1,
    )
