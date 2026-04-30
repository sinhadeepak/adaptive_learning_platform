"""Analytics HTTP read-side surface."""

from __future__ import annotations

import asyncio
import hashlib
import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from engagement.analytics.cohort_leaderboard import (
    batch_readiness,
    fetch_cohort_members,
    rank_leaderboard,
)
from engagement.analytics import realtime
from engagement.analytics.db import sessionmaker
from engagement.analytics.student_drill_down import build_drilldown
from engagement.analytics.repositories import (
    get_mastery,
    get_readiness,
    get_streak,
    list_daily_activity,
    list_user_mastery,
)

router = APIRouter()


@router.get("/analytics/mastery/{user_id}")
async def list_mastery(user_id: str) -> dict:
    async with sessionmaker()() as session:
        rows = await list_user_mastery(session, user_id)
    return {
        "userId": user_id,
        "topics": [{"topicId": r.topic_id, "ewa": r.ewa, "n": r.n} for r in rows],
    }


@router.get("/analytics/mastery/{user_id}/{topic_id}")
async def get_mastery_for_topic(user_id: str, topic_id: str) -> dict:
    async with sessionmaker()() as session:
        row = await get_mastery(session, user_id, topic_id)
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    return {"userId": row.user_id, "topicId": row.topic_id, "ewa": row.ewa, "n": row.n}


@router.get("/analytics/readiness/{user_id}")
async def readiness(user_id: str, scope: str = "GLOBAL") -> dict:
    async with sessionmaker()() as session:
        row = await get_readiness(session, user_id, scope)
    if row is None:
        # No session yet — return a synthesized zero so the UI can render the
        # empty state instead of a 404 on a normal cold-start path.
        return {"userId": user_id, "scope": scope, "score": 0.0, "nTopics": 0, "updatedAt": None}
    return {
        "userId": row["user_id"],
        "scope": row["scope"],
        "score": row["score"],
        "nTopics": row["n_topics"],
        "updatedAt": row["updated_at"],
    }


@router.get("/analytics/daily-activity/{user_id}")
async def daily_activity(
    user_id: str,
    days: int = Query(default=30, ge=1, le=180),
) -> dict:
    """Per-day study activity for the trailing `days` days. Days with no
    activity are absent from the response; UI fills zeros across the
    full window."""
    async with sessionmaker()() as session:
        rows = await list_daily_activity(session, user_id, days=days)
    return {
        "userId": user_id,
        "days": days,
        "activity": [
            {
                "date": r["date"].isoformat(),
                "sessions": r["sessions"],
                "questions": r["questions"],
                "minutes": r["minutes"],
            }
            for r in rows
        ],
    }


@router.get("/analytics/streak/{user_id}")
async def streak(user_id: str) -> dict:
    """Current + longest streak in consecutive UTC days. Returns zeros for a
    user that's never submitted — UI renders the empty 'start your streak'
    state instead of needing to handle a 404."""
    async with sessionmaker()() as session:
        row = await get_streak(session, user_id)
    if row is None:
        return {
            "userId": user_id,
            "currentStreak": 0,
            "longestStreak": 0,
            "lastActiveDate": None,
        }
    return {
        "userId": row.user_id,
        "currentStreak": row.current_streak,
        "longestStreak": row.longest_streak,
        "lastActiveDate": row.last_active_date.isoformat(),
    }


async def _build_leaderboard(
    cohort_id: str, include_teachers: bool
) -> list[dict]:
    members = await fetch_cohort_members(cohort_id)
    if not members:
        return []
    user_ids = [m["userId"] for m in members]
    async with sessionmaker()() as session:
        readiness_by_user = await batch_readiness(session, user_ids)
    return rank_leaderboard(
        members, readiness_by_user, include_teachers=include_teachers
    )


@router.get("/analytics/cohorts/{cohort_id}/leaderboard")
async def cohort_leaderboard(
    cohort_id: str,
    include_teachers: bool = Query(default=False, alias="includeTeachers"),
) -> dict:
    """Sprint 9 L-1 — class leaderboard.

    Joins Institution's cohort-members → Analytics's readiness via the
    HTTP-then-batch-DB pattern (AP-01 keeps schemas service-owned).
    Members without a readiness row render as `started: false` so the
    educator UI can show "not started" badges."""
    rows = await _build_leaderboard(cohort_id, include_teachers)
    return {"cohortId": cohort_id, "leaderboard": rows}


def _leaderboard_digest(rows: list[dict]) -> str:
    """Sprint 12 S12-B — compact hash so the SSE poller can decide whether
    a frame needs to be re-sent. A snapshot is identical iff the digest
    matches; we re-send only on change. Pure function for testability."""
    payload = json.dumps(
        [
            (r["userId"], r["rank"], r["score"], r["nTopics"])
            for r in rows
        ],
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# Sprint 13 S13-A — heartbeat is the only timer left in the SSE loop.
# Wakes are driven by NATS-derived ticks via analytics.realtime.
SSE_HEARTBEAT_SECONDS = 25
# How often we re-fetch cohort membership from Institution (membership
# changes when an educator adds / removes a student). Cap on staleness.
SSE_MEMBER_REFRESH_SECONDS = 60


@router.get("/analytics/cohorts/{cohort_id}/leaderboard/stream")
async def cohort_leaderboard_stream(
    cohort_id: str,
    include_teachers: bool = Query(default=False, alias="includeTeachers"),
) -> StreamingResponse:
    """Sprint 12 S12-B + Sprint 13 S13-A — push-based SSE leaderboard.

    Frames:
      - `event: snapshot` on connect with the full board
      - `event: delta`    when a quiz session lands for any cohort member
                          AND the digest actually changed
      - `: keepalive`     every 25s so proxies don't idle out

    Wake mechanism: `analytics/events.py` calls
    `realtime.publish_user_recomputed(user_id)` after every successful
    `process_session()`. This handler subscribes to its cohort's
    fan-out queue and only rebuilds the snapshot when a tick arrives
    (or every SSE_MEMBER_REFRESH_SECONDS as a membership-staleness
    safety net).
    """

    async def stream() -> "asyncio.AsyncIterator[bytes]":  # type: ignore[name-defined]
        # Initial cohort fetch + snapshot.
        members = await fetch_cohort_members(cohort_id)
        member_ids = {m["userId"] for m in members}
        sub = realtime.Subscription(cohort_id=cohort_id, members=member_ids)
        realtime.register(sub)
        try:
            rows = await _build_leaderboard(cohort_id, include_teachers)
            last_digest = _leaderboard_digest(rows)
            yield b"event: snapshot\ndata: " + json.dumps(
                {"cohortId": cohort_id, "leaderboard": rows}
            ).encode() + b"\n\n"

            last_member_refresh = asyncio.get_event_loop().time()
            while True:
                # Wait for either a tick from the publisher or the
                # heartbeat timeout. asyncio.wait_for gives us the
                # primitive — TimeoutError = heartbeat tick path.
                try:
                    await asyncio.wait_for(
                        sub.queue.get(), timeout=SSE_HEARTBEAT_SECONDS
                    )
                    woke_for_event = True
                except asyncio.TimeoutError:
                    woke_for_event = False

                # Refresh the member set occasionally — handles
                # cohort_members add/remove without forcing the
                # educator to reload the page.
                now = asyncio.get_event_loop().time()
                if now - last_member_refresh > SSE_MEMBER_REFRESH_SECONDS:
                    last_member_refresh = now
                    fresh_members = await fetch_cohort_members(cohort_id)
                    sub.update_members({m["userId"] for m in fresh_members})

                if not woke_for_event:
                    yield b": keepalive\n\n"
                    continue

                # Drain any extra ticks queued during the rebuild —
                # one snapshot covers every event up to "now".
                while True:
                    try:
                        sub.queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break

                try:
                    rows = await _build_leaderboard(cohort_id, include_teachers)
                except Exception:
                    # Transient DB blip — wait for the next tick.
                    continue
                digest = _leaderboard_digest(rows)
                if digest != last_digest:
                    last_digest = digest
                    yield b"event: delta\ndata: " + json.dumps(
                        {"cohortId": cohort_id, "leaderboard": rows}
                    ).encode() + b"\n\n"
        finally:
            realtime.unregister(sub)

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.get("/analytics/cohorts/{cohort_id}/students/{user_id}")
async def cohort_student_drill_down(cohort_id: str, user_id: str) -> dict:
    """Sprint 13 S13-C — per-student drill-down for the educator UI.

    Returns the four sources (readiness, per-topic mastery, streak,
    recent quiz sessions) in one round-trip. Membership check is the
    educator's responsibility (they got the user_id from the leaderboard
    which already filtered by cohort)."""
    return await build_drilldown(cohort_id=cohort_id, user_id=user_id)


@router.get("/analytics/cohorts/{cohort_id}/summary")
async def cohort_summary(
    cohort_id: str,
    include_teachers: bool = Query(default=False, alias="includeTeachers"),
) -> dict:
    """Sprint 13 S13-D — headline cohort stats for the leaderboard
    header. Reuses the same source rows the leaderboard consumes and
    runs a pure aggregation over them — no new DB hits beyond what the
    leaderboard already does."""
    from analytics.cohort_summary import summarise_cohort

    rows = await _build_leaderboard(cohort_id, include_teachers)
    return {"cohortId": cohort_id, "summary": summarise_cohort(rows)}


# ===========================================================================
# Sprint 20 (P3-S5) — predictive analytics + recommendations
# ===========================================================================

from engagement.analytics import predictive as _predictive
from engagement.analytics import predictive_repo as _predictive_repo


@router.get("/analytics/predictive/dropout/{user_id}")
async def predictive_dropout_get(user_id: str) -> dict:
    """Drop-out risk score per ADR-0010. Auth check (caller is user OR
    admin OR cohort educator) deferred to gateway level — this endpoint
    is internal-trusted today."""
    async with sessionmaker()() as session:
        return await _predictive.compute_or_get_dropout(session, user_id)


@router.get("/analytics/recommendations/{user_id}")
async def predictive_recommendations_get(user_id: str) -> dict:
    """Topic recommendations per ADR-0011."""
    async with sessionmaker()() as session:
        recs = await _predictive.compute_or_get_recommendations(session, user_id)
        return {
            "userId": user_id,
            "items": [
                {
                    "topicId": r.topic_id,
                    "score": r.score,
                    "reasonString": r.reason_string,
                }
                for r in recs
            ],
        }


@router.post("/analytics/predictive/recompute/{user_id}")
async def predictive_recompute(user_id: str) -> dict:
    """Force-recompute both score + recommendations (skip cache).
    Admin-only in production; gateway enforces. Returns the fresh score."""
    async with sessionmaker()() as session:
        score = await _predictive.compute_or_get_dropout(session, user_id, force=True)
        recs = await _predictive.compute_or_get_recommendations(session, user_id, force=True)
        return {
            "userId": user_id,
            "dropout": score,
            "recommendationsCount": len(recs),
        }


@router.get("/analytics/predictive/cohorts/{cohort_id}/at-risk")
async def predictive_cohort_at_risk(cohort_id: str) -> dict:
    """High-risk students in a cohort. Uses the existing leaderboard's
    member list (which already does the cohort_members lookup) so we
    don't re-fetch institution data here."""
    async with sessionmaker()() as session:
        # Reuse the leaderboard helper to get the member list
        rows = await _build_leaderboard(cohort_id, include_teachers=False)
        user_ids = [r["user_id"] for r in rows]
        items = await _predictive_repo.list_high_risk_in_cohort(session, user_ids)
        return {
            "cohortId": cohort_id,
            "items": [
                {
                    "userId": str(r["user_id"]),
                    "score": float(r["score"]),
                    "riskBand": r["risk_band"],
                    "interventionKind": r.get("intervention_kind"),
                    "computedAt": r["computed_at"].isoformat(),
                }
                for r in items
            ],
        }


# Sprint 22 (P4-S22) — per-section + per-topic time analytics. Reads from
# analytics_schema.session_section_stats which the events.py consumer
# populates from the items array on quiz.session.completed.

from engagement.analytics import section_stats as _section_stats  # noqa: E402


@router.get("/analytics/student/{user_id}/time-stats")
async def student_time_stats(user_id: str) -> dict:
    """Per-section time + accuracy aggregates for a user across all submitted
    sessions. Sections fall back to topic_id when the session was not bound
    to a blueprint (P4-S23 introduces real section ids)."""
    async with sessionmaker()() as session:
        sections = await _section_stats.load_user_time_stats(session, user_id)
        return {"userId": user_id, "sections": sections}


@router.get("/analytics/sessions/{session_id}/breakdown")
async def session_breakdown(session_id: str) -> dict:
    """Per-section breakdown for a single submitted session."""
    async with sessionmaker()() as session:
        sections = await _section_stats.load_session_breakdown(session, session_id)
        return {"sessionId": session_id, "sections": sections}


# Sprint 27 (P4-S27) — daily revision queue.
from datetime import UTC, datetime  # noqa: E402

from engagement.analytics import revision_queue_repo as _revision_repo  # noqa: E402
from engagement.analytics.srs import overdue_days  # noqa: E402

# Sprint 28 (P4-S28) — syllabus coverage.
from engagement.analytics import learning_client as _learning_client  # noqa: E402
from engagement.analytics.repositories import list_user_mastery  # noqa: E402
from engagement.analytics.syllabus_coverage import compute_coverage  # noqa: E402


@router.get("/analytics/syllabus-coverage/{user_id}")
async def syllabus_coverage_route(user_id: str, examId: str) -> dict:
    """Per-chapter coverage stats for a user against an exam syllabus.

    Joins the syllabus tree (fetched from alp-learning) with the user's
    mastery rows. Chapters with no mapped topics surface as `missing` so
    students see content gaps + their own progress in the same view.
    """
    tree = await _learning_client.fetch_syllabus_tree(examId)
    async with sessionmaker()() as session:
        mastery_rows = await list_user_mastery(session, user_id)
    mastery = {str(row.topic_id): float(row.ewa) for row in mastery_rows}
    return compute_coverage(tree, mastery)


# Sprint 29 (P4-S29) — error-pattern rollup.
from engagement.analytics import error_classifier_repo as _error_repo  # noqa: E402

# Sprint 31 (P4-S31) — cohort percentile distribution.
from engagement.analytics import cohort_percentile as _cohort  # noqa: E402

# Sprint 32 (P4-S32) — peer percentile per topic.
from engagement.analytics import peer_percentile as _peer_pct  # noqa: E402
from engagement.analytics import peer_percentile_repo as _peer_repo  # noqa: E402


@router.get("/analytics/peer-percentile/{user_id}")
async def peer_percentile_route(
    user_id: str, examId: str, topicId: str
) -> dict:
    """Per-(user, topic, exam) percentile vs cohort. Hidden when cohort
    < 30 (NFR-P4-06)."""
    async with sessionmaker()() as session:
        user_ewa = await _peer_repo.get_user_topic_ewa(
            session, user_id=user_id, topic_id=topicId
        )
        if user_ewa is None:
            return {
                "userId": user_id,
                "examId": examId,
                "topicId": topicId,
                "hidden": True,
                "reason": "user_has_no_mastery",
                "cohortSize": 0,
            }
        peers = await _peer_repo.list_peer_ewas(
            session, exam_id=examId, topic_id=topicId, exclude_user_id=user_id
        )
    summary = _peer_pct.summarise_percentile(user_ewa, peers)
    return {
        "userId": user_id,
        "examId": examId,
        "topicId": topicId,
        **summary,
    }


@router.get("/analytics/cohort-distribution")
async def cohort_distribution_route(examId: str, topicId: str | None = None) -> dict:
    """Cohort readiness/mastery distribution for an exam (optionally
    scoped to a topic). Used by alp-learning's rank.py for cohort-driven
    percentile prediction."""
    async with sessionmaker()() as session:
        rows = await _cohort.load_cohort_distribution(
            session, exam_id=examId, topic_id=topicId
        )
    total = sum(r["user_count"] for r in rows)
    computed_at = rows[0]["computed_at"] if rows else None
    return {
        "examId": examId,
        "topicId": topicId,
        "totalUsers": total,
        "computedAt": computed_at,
        "buckets": [
            {"readinessBucket": r["readiness_bucket"], "userCount": r["user_count"]}
            for r in rows
        ],
    }


@router.post("/analytics/cohort-distribution/refresh")
async def cohort_distribution_refresh(examId: str, topicId: str | None = None) -> dict:
    """Re-aggregate the cohort distribution. Idempotent. The actual
    periodic schedule defers to the staging-cutover sprint."""
    async with sessionmaker()() as session:
        written = await _cohort.aggregate_cohort_distribution(
            session, exam_id=examId, topic_id=topicId
        )
        await session.commit()
    return {"examId": examId, "topicId": topicId, "bucketsWritten": written}


@router.get("/analytics/student/{user_id}/error-patterns")
async def error_patterns_route(user_id: str, since: str | None = None) -> dict:
    """Per-classification rollup for a user. `since` is an ISO timestamp;
    when omitted, returns the full history capped at 1000 rows."""
    async with sessionmaker()() as session:
        rows = await _error_repo.list_classifications_for_user(
            session, user_id, since_iso=since
        )
    rollup = _error_repo.aggregate_patterns(rows)
    return {"userId": user_id, "since": since, **rollup}


@router.get("/analytics/revision/{user_id}")
async def revision_due(user_id: str, limit: int = 10) -> dict:
    """Top-N topics due today for the user, ordered most-overdue-first.

    Per ADR-0014. Each row carries the SM-2 state (interval, ease factor,
    attempt count) plus a derived `overdueDays` for UI sorting.
    """
    now = datetime.now(tz=UTC)
    limit = max(1, min(limit, 50))
    async with sessionmaker()() as session:
        rows = await _revision_repo.list_due(
            session, user_id, now=now, limit=limit
        )
    items = [
        {
            **r,
            "lastAttemptAt": r["lastAttemptAt"].isoformat() if r["lastAttemptAt"] else None,
            "dueAt": r["dueAt"].isoformat() if r["dueAt"] else None,
            "overdueDays": overdue_days(r["dueAt"], now=now),
        }
        for r in rows
    ]
    return {
        "userId": user_id,
        "now": now.isoformat(),
        "items": items,
    }
