"""Shared session-processing logic used by both:
  * events._on_session_completed (live JetStream consumer)
  * backfill.run_backfill (catch-up job for missed events)

Pulling this out of events.py lets the backfill apply byte-for-byte the same
EWA + readiness math the live handler does, with a single idempotency
check via processed_sessions. Anything that mutates analytics_schema state
in response to a Quiz submit goes through here.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from engagement.analytics.config import settings
from engagement.analytics.mastery import MasteryRow, readiness_from_mastery, update_ewa
from engagement.analytics.repositories import (
    get_mastery,
    get_streak,
    is_session_processed,
    list_user_mastery,
    mark_session_processed,
    upsert_daily_activity,
    upsert_mastery,
    upsert_readiness,
    upsert_streak,
)
from engagement.analytics.streaks import compute_next_streak

log = logging.getLogger(__name__)

# Streak thresholds we celebrate in the in-app inbox. Each crossing fires
# exactly once per session (process_session is idempotent via the dedup gate),
# so a student who hits 30 days only sees ONE 30-day notification, not three.
_STREAK_MILESTONES: tuple[int, ...] = (3, 7, 14, 30, 60, 100, 365)

# Cumulative-progress achievement thresholds. After each processed session
# we re-aggregate the totals and check whether they crossed a threshold; if
# so, we grant the badge. The user-profile UNIQUE constraint makes the
# grant idempotent so re-firing on a re-processed session is safe.
_SESSION_MILESTONES: tuple[int, ...] = (10, 50, 100, 500)
_QUESTION_MILESTONES: tuple[int, ...] = (50, 250, 1000, 5000)


async def process_session(
    session: AsyncSession,
    *,
    session_id: str,
    user_id: str,
    topic_id: str,
    score: float,
    activity_date: date | None = None,
    questions_answered: int = 0,
    study_minutes: int = 0,
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

    # Per-day activity counters — feed the Progress weekly chart + activity
    # heatmap. Each session counts once because we're past the dedup gate.
    await upsert_daily_activity(
        session,
        user_id=user_id,
        activity_date=today,
        sessions_inc=1,
        questions_inc=max(0, questions_answered),
        minutes_inc=max(0, study_minutes),
    )

    # Sprint 27 (P4-S27) — SM-2 + EWA-clamp revision queue. Best-effort: a
    # transient failure here logs but doesn't roll back the mastery update
    # above. The queue is rebuildable in principle (last attempts live on
    # processed_sessions), so a missed write is recoverable.
    try:
        from engagement.analytics.revision import update_revision_queue

        await update_revision_queue(
            session,
            user_id=user_id,
            topic_id=topic_id,
            accuracy=float(score),
            mastery_ewa=new_ewa,
            now=datetime.now(tz=UTC),
        )
    except Exception:
        log.exception("revision_queue.update_failed user=%s topic=%s", user_id, topic_id)

    await mark_session_processed(session, session_id)

    # Phase 1D-9 — streak day XP. When the streak ticks up, award XP for
    # the new day. Cap at 30 days so a year-long streak doesn't grant
    # unbounded daily XP. Best-effort.
    try:
        prev_for_xp = prev_streak.current_streak if prev_streak else 0
        if update.current_streak > prev_for_xp and update.current_streak <= 30:
            from engagement.gamification import service as _gam
            await _gam.award_xp(
                session,
                user_id=user_id,
                event_type="streak_day",
                source_id=None,
                xp_delta=_gam.XP_RULES.get("streak_day", 5),
            )
    except Exception:
        log.exception("gamification.streak_xp.failed user=%s", user_id)

    # Side-effect notifications — the in-app inbox surfaces these so the
    # student gets a celebratory ping the moment they hit a milestone. Best
    # effort: a notification post failure must never roll back the analytics
    # update, hence the wide except.
    prev_current = prev_streak.current_streak if prev_streak else 0

    # Streak-broken signal — when the student returns after a >1-day gap,
    # the streak resets to 1 and we fire `streak.broken` with the count
    # they lost. Suppressed when prev_current was 0 (first ever session,
    # or already broken streak) or 1 (they only had today's streak —
    # nothing to mourn).
    if prev_current >= 2 and update.current_streak == 1:
        try:
            await _post_inbox_notification(
                user_id=user_id,
                type_="streak.broken",
                payload={"previousStreak": prev_current},
            )
        except Exception:
            log.exception("streak.broken notification post failed")

    crossed = _streak_milestones_crossed(prev_current, update.current_streak)
    for milestone in crossed:
        try:
            await _post_inbox_notification(
                user_id=user_id,
                type_="streak.milestone",
                payload={"days": milestone, "currentStreak": update.current_streak},
            )
        except Exception:
            log.exception("streak.milestone notification post failed")
        # Award the matching badge — idempotent on (user, kind), so a
        # student who somehow re-crosses the same threshold won't get
        # duplicate achievements.
        try:
            await _grant_achievement(
                user_id=user_id,
                kind=f"streak_{milestone}",
                payload={"days": milestone},
            )
        except Exception:
            log.exception("streak achievement grant failed")

    # First-ever session badge — fires once when the dedup gate has just
    # let through this session and the previous attempt count for this
    # topic was zero (= first time the user finishes anything).
    if prev_n == 0:
        try:
            await _grant_achievement(
                user_id=user_id,
                kind="first_session",
                payload={"topicId": topic_id, "score": float(score)},
            )
        except Exception:
            log.exception("first_session achievement grant failed")

    # Cumulative-progress badges. We grant on each crossing — the
    # user-profile UNIQUE(user_id, kind) makes the call idempotent, so a
    # backfill replay or a session being processed twice (shouldn't happen
    # past the dedup gate, but defensive) won't dup-award.
    try:
        new_session_total = await _sum_user_sessions(session, user_id)
        prev_session_total = max(0, new_session_total - 1)
        for m in _SESSION_MILESTONES:
            if prev_session_total < m <= new_session_total:
                await _grant_achievement(
                    user_id=user_id,
                    kind=f"sessions_{m}",
                    payload={"sessions": new_session_total},
                )
    except Exception:
        log.exception("sessions milestone achievement check failed")

    if questions_answered > 0:
        try:
            new_q_total = await _sum_user_questions(session, user_id)
            prev_q_total = max(0, new_q_total - questions_answered)
            for m in _QUESTION_MILESTONES:
                if prev_q_total < m <= new_q_total:
                    await _grant_achievement(
                        user_id=user_id,
                        kind=f"questions_{m}",
                        payload={"questions": new_q_total},
                    )
        except Exception:
            log.exception("questions milestone achievement check failed")

    # Goal-reached: only fire when this session was the one that pushed the
    # student over their daily goal. We re-read minutes from the row we just
    # upserted so the comparison uses the post-write value.
    try:
        goal = await _fetch_daily_goal(user_id)
        if goal and study_minutes > 0:
            new_minutes = await _today_minutes(session, user_id, today)
            prev_minutes = new_minutes - study_minutes
            if prev_minutes < goal <= new_minutes:
                await _post_inbox_notification(
                    user_id=user_id,
                    type_="goal.reached",
                    payload={
                        "goalMinutes": goal,
                        "minutesToday": new_minutes,
                        "date": today.isoformat(),
                    },
                )
                # First-ever goal-hit badge — UNIQUE on (user, kind) so the
                # call is idempotent across days.
                try:
                    await _grant_achievement(
                        user_id=user_id,
                        kind="daily_goal_first",
                        payload={"goalMinutes": goal},
                    )
                except Exception:
                    log.exception("daily_goal_first achievement grant failed")
    except Exception:
        log.exception("goal.reached notification post failed")

    return True


def _streak_milestones_crossed(prev: int, current: int) -> list[int]:
    """Return milestones the student newly hit this session — the streak
    must have been below the threshold previously and be at-or-above now."""
    return [m for m in _STREAK_MILESTONES if prev < m <= current]


async def _post_inbox_notification(*, user_id: str, type_: str, payload: dict) -> None:
    base = (settings.notification_base_url or "").rstrip("/")
    if not base:
        return  # Disabled (e.g., unit-test path) — silent no-op.
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            f"{base}/notifications/inbox",
            json={"userId": user_id, "type": type_, "payload": payload},
        )


async def _grant_achievement(*, user_id: str, kind: str, payload: dict) -> None:
    base = (settings.user_profile_base_url or "").rstrip("/")
    if not base:
        return
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            f"{base}/internal/profile/achievements",
            json={"userId": user_id, "kind": kind, "payload": payload},
        )


async def _fetch_daily_goal(user_id: str) -> int | None:
    """Best-effort lookup against the user-profile internal endpoint. Returns
    None when the user has no goal set or the call fails — the caller skips
    the notification in that case."""
    base = (settings.user_profile_base_url or "").rstrip("/")
    if not base:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{base}/internal/profile/{user_id}")
            if r.status_code != 200:
                return None
            body = r.json()
            goal = body.get("dailyGoalMinutes")
            return int(goal) if goal else None
    except Exception:
        return None


async def _today_minutes(session: AsyncSession, user_id: str, today: date) -> int:
    from sqlalchemy import text

    res = await session.execute(
        text(
            "SELECT study_minutes FROM analytics_schema.daily_activity "
            "WHERE user_id = :uid AND activity_date = :d"
        ),
        {"uid": user_id, "d": today},
    )
    row = res.first()
    return int(row[0]) if row else 0


async def _sum_user_sessions(session: AsyncSession, user_id: str) -> int:
    """Sum of `n` across all topics for this user — the running total of
    sessions the analytics pipeline has booked. Sourced from the post-write
    state of `mastery` so it includes the session we just processed.

    Sprint 14 — was `user_mastery` (the schema-rename debt from a much
    earlier sprint that never got reflected here). All the other paths
    in this file already query `analytics_schema.mastery`; this raw-SQL
    branch was the last holdout. test_streaks failures + the streak
    `currentStreak` column on /home went silently stale because of it."""
    from sqlalchemy import text

    res = await session.execute(
        text(
            "SELECT COALESCE(SUM(n), 0) FROM analytics_schema.mastery "
            "WHERE user_id = :uid"
        ),
        {"uid": user_id},
    )
    row = res.first()
    return int(row[0]) if row else 0


async def _sum_user_questions(session: AsyncSession, user_id: str) -> int:
    """Sum of questions_answered across all days for this user. Sourced from
    daily_activity, which was just upserted for `today` — so the return
    value already reflects this session's contribution."""
    from sqlalchemy import text

    res = await session.execute(
        text(
            "SELECT COALESCE(SUM(questions_answered), 0) "
            "FROM analytics_schema.daily_activity WHERE user_id = :uid"
        ),
        {"uid": user_id},
    )
    row = res.first()
    return int(row[0]) if row else 0
