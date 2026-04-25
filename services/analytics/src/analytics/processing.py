"""Shared session-processing logic used by both:
  * events._on_session_completed (live JetStream consumer)
  * backfill.run_backfill (catch-up job for missed events)

Pulling this out of events.py lets the backfill apply byte-for-byte the same
EWA + readiness math the live handler does, with a single idempotency
check via processed_sessions. Anything that mutates analytics_schema state
in response to a Quiz submit goes through here.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from analytics.mastery import MasteryRow, readiness_from_mastery, update_ewa
from analytics.repositories import (
    get_mastery,
    get_streak,
    is_session_processed,
    list_user_mastery,
    mark_session_processed,
    upsert_mastery,
    upsert_readiness,
    upsert_streak,
)
from analytics.streaks import compute_next_streak


async def process_session(
    session: AsyncSession,
    *,
    session_id: str,
    user_id: str,
    topic_id: str,
    score: float,
    activity_date: date | None = None,
) -> bool:
    """Apply mastery + readiness + streak updates for a Quiz submit.
    Idempotent — a no-op when session_id is already in processed_sessions.
    Returns True when this call did the work; False on the dedup short-circuit.

    `activity_date` is the UTC date the session counts toward for streak
    purposes. Defaults to "today" so the live consumer doesn't need to
    pass anything; the backfill passes the original `submitted_at` date
    so a recovered session credits the day it actually happened.

    Caller is responsible for `session.commit()`.
    """
    if await is_session_processed(session, session_id):
        return False

    current = await get_mastery(session, user_id, topic_id)
    prev_ewa = current.ewa if current else 0.0
    prev_n = current.n if current else 0
    new_ewa = update_ewa(prev_ewa, prev_n, float(score))

    await upsert_mastery(
        session,
        user_id=user_id,
        topic_id=topic_id,
        new_ewa=new_ewa,
        new_n=prev_n + 1,
        last_session_id=session_id,
    )

    rows = await list_user_mastery(session, user_id)
    rows = [
        MasteryRow(user_id=r.user_id, topic_id=r.topic_id, ewa=new_ewa, n=r.n)
        if r.topic_id == topic_id
        else r
        for r in rows
    ]
    score_global = readiness_from_mastery(rows)
    await upsert_readiness(
        session,
        user_id=user_id,
        scope="GLOBAL",
        score=score_global,
        n_topics=len(rows),
    )

    # Streak update — UTC date. Same-day repeat is a no-op; a one-day gap
    # increments; bigger gap resets to 1. Order matters: this runs after
    # the dedup check so JetStream redeliveries / backfill re-runs can't
    # double-count a single day's activity.
    today = activity_date or datetime.now(tz=UTC).date()
    prev_streak = await get_streak(session, user_id)
    update = compute_next_streak(
        today=today,
        prev_current=prev_streak.current_streak if prev_streak else None,
        prev_longest=prev_streak.longest_streak if prev_streak else None,
        prev_last_active=prev_streak.last_active_date if prev_streak else None,
    )
    await upsert_streak(
        session,
        user_id=user_id,
        current_streak=update.current_streak,
        longest_streak=update.longest_streak,
        last_active_date=update.last_active_date,
    )

    await mark_session_processed(session, session_id)
    return True
