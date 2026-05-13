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
    from engagement.analytics.cohort_summary import summarise_cohort

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
        user_ids = [r["userId"] for r in rows]
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
    when omitted, returns the full history capped at 1000 rows.

    Phase 5 (P5-S37.5): topic titles HTTP-merged via learning_client
    in place of the previous cross-DB JOIN.
    """
    async with sessionmaker()() as session:
        rows = await _error_repo.list_classifications_for_user(
            session, user_id, since_iso=since
        )
    # HTTP-merge topic titles in bulk
    topic_ids = list({r["topicId"] for r in rows})
    titles = await _learning_client.fetch_topics_bulk(topic_ids)
    for r in rows:
        info = titles.get(r["topicId"])
        if info:
            r["topicTitle"] = info.get("title", "")
    rollup = _error_repo.aggregate_patterns(rows)
    return {"userId": user_id, "since": since, **rollup}


@router.get("/analytics/revision/{user_id}")
async def revision_due(user_id: str, limit: int = 10) -> dict:
    """Top-N topics due today for the user, ordered most-overdue-first.

    Per ADR-0014. Each row carries the SM-2 state (interval, ease factor,
    attempt count) plus a derived `overdueDays` for UI sorting.

    Phase 5 (P5-S37.5): topic titles HTTP-merged via learning_client
    in place of the previous cross-DB JOIN.
    """
    now = datetime.now(tz=UTC)
    limit = max(1, min(limit, 50))
    async with sessionmaker()() as session:
        rows = await _revision_repo.list_due(
            session, user_id, now=now, limit=limit
        )
    # HTTP-merge topic titles in bulk
    topic_ids = list({r["topicId"] for r in rows})
    titles = await _learning_client.fetch_topics_bulk(topic_ids)
    for r in rows:
        info = titles.get(r["topicId"])
        if info:
            r["topicTitle"] = info.get("title", "")
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


# ── Phase 5 (P5-S39) — multi-parameter mastery surface ────────────────────────

@router.get("/analytics/concept-mastery/{user_id}")
async def concept_mastery_route(user_id: str) -> dict:
    """Per-concept EWA mastery list. Per ADR-0017 dim 1.

    Returns rows ordered by EWA ascending (weakest concepts first), so
    the UI can highlight where the student needs work without sorting
    client-side. Each row includes `n` so the honest-signalling pattern
    holds — small n = "early days, take this with salt".
    """
    from engagement.analytics import concept_mastery as _cm

    async with sessionmaker()() as s:
        rows = await _cm.list_for_user(s, user_id)
    return {"userId": user_id, "concepts": rows}


@router.get("/analytics/student/{user_id}/multi-profile")
async def multi_profile_route(user_id: str, since: str | None = None) -> dict:
    """The 9-dimension assessment substrate per ADR-0017.

    Returns concept-mastery + bloom-matrix + fluency + confidence
    Brier in one shape. The UI radar chart consumes this directly.

    `since` is an ISO timestamp filtering the confidence Brier window;
    when omitted, returns the full history capped at 1000 rows.
    """
    from engagement.analytics import bloom_mastery as _bm
    from engagement.analytics import concept_mastery as _cm
    from engagement.analytics import confidence as _conf
    from engagement.analytics import fluency_model as _flu

    async with sessionmaker()() as s:
        concepts = await _cm.list_for_user(s, user_id)
        bloom_matrix = await _bm.list_matrix_for_user(s, user_id)
        fluency = await _flu.list_for_user(s, user_id)
        brier = await _conf.get_brier_for_user(s, user_id, since_iso=since)

    return {
        "userId": user_id,
        "since": since,
        "concepts": concepts,
        "bloomMatrix": bloom_matrix,
        "fluency": fluency,
        "confidenceBrier": brier,
    }


# ── Phase 5 (P5-S41) — transfer-ability metric ────────────────────────────────


@router.get("/analytics/transfer/{user_id}")
async def transfer_route(
    user_id: str, min_n_per_bucket: int = 3,
) -> dict:
    """Per-concept transfer-ability score per ADR-0017 dim 7.

    Score is null when either single-tag or multi-tag attempts are
    below `min_n_per_bucket` — honest signalling, not theatre numbers.
    Empty list when user has no per-item outcomes recorded yet
    (pre-S39 sessions or pre-S45 multi-tagged content).
    """
    from engagement.analytics import transfer as _transfer

    async with sessionmaker()() as s:
        rows = await _transfer.get_transfer_for_user(
            s, user_id=user_id, min_n_per_bucket=min_n_per_bucket,
        )
    return {"userId": user_id, "transfer": rows, "minNPerBucket": min_n_per_bucket}


# ─────────────────────────────────────────────────────────────────────────
# Phase 6 (S49) — UX-34 instrumentation
# ─────────────────────────────────────────────────────────────────────────

from datetime import datetime, timedelta, date as _date
from fastapi import Header
from pydantic import BaseModel, Field
from engagement.analytics import ux_events as _ux_events


class UxEventIn(BaseModel):
    event_name: str = Field(min_length=3, max_length=80)
    properties: dict | None = None
    session_id: str | None = None
    route: str | None = Field(default=None, max_length=200)
    variant: str | None = Field(default=None, max_length=40)
    network_kind: str | None = Field(default=None, max_length=20)


class UxEventBatch(BaseModel):
    events: list[UxEventIn] = Field(min_length=1, max_length=100)
    user_id: str | None = None    # set explicitly for guest screening events


@router.post("/analytics/ux-events", status_code=204)
async def post_ux_events(
    body: UxEventBatch,
    user_agent: str | None = Header(default=None, alias="User-Agent"),
):
    """Append-only UX telemetry. Drops malformed events with a warning."""
    async with sessionmaker()() as s:
        await _ux_events.insert_events(
            s,
            events=[ev.model_dump() for ev in body.events],
            user_id=body.user_id,
            user_agent=user_agent,
        )
        await s.commit()
    return None


@router.get("/analytics/ux-kpis")
async def get_ux_kpis(
    days: int = Query(default=30, ge=1, le=365),
    kpi_name: str | None = None,
):
    """Pre-aggregated daily KPIs for the /admin/ux-health dashboard."""
    today = datetime.utcnow()
    df = today - timedelta(days=days)
    async with sessionmaker()() as s:
        rows = await _ux_events.kpis_daily(
            s, date_from=df, date_to=today, kpi_name=kpi_name,
        )
    return {"items": rows, "days": days}


@router.post("/analytics/ux-kpis/rollup", status_code=200)
async def post_ux_kpis_rollup(target_date: str | None = None):
    """Trigger daily rollup. Idempotent (ON CONFLICT DO UPDATE)."""
    when = datetime.fromisoformat(target_date) if target_date else (datetime.utcnow() - timedelta(days=1))
    async with sessionmaker()() as s:
        n = await _ux_events.daily_rollup(s, target_date=when)
    return {"rolled_up": n, "for_date": when.date().isoformat()}


# ─────────────────────────────────────────────────────────────────────
# Phase 6 (S56) — Topic decay + readiness bands
# ─────────────────────────────────────────────────────────────────────

from engagement.analytics import topic_decay as _topic_decay
from engagement.analytics import readiness_bands as _bands


@router.get("/analytics/topic-decay/{user_id}")
async def get_topic_decay(user_id: str):
    """Compute decay severity per concept for the user."""
    async with sessionmaker()() as s:
        from sqlalchemy import text as _text
        res = await s.execute(
            _text(
                "SELECT concept_id, ewa, n, last_seen_at "
                "FROM analytics_schema.concept_mastery "
                "WHERE user_id = CAST(:uid AS uuid) "
                "ORDER BY last_seen_at DESC NULLS LAST"
            ),
            {"uid": user_id},
        )
        items = []
        for row in res.mappings():
            d = _topic_decay.compute_decay(
                last_attempted_at=row["last_seen_at"],
                current_ewa=float(row["ewa"]),
                n_attempts=int(row["n"]),
            )
            items.append({
                "concept_id": str(row["concept_id"]),
                "ewa": float(row["ewa"]),
                "n": int(row["n"]),
                "decay_days": d.decay_days,
                "decay_severity": d.decay_severity,
            })
    return {"user_id": user_id, "items": items}


@router.get("/analytics/insights/{user_id}/snapshot")
async def get_insights_snapshot(user_id: str):
    """Phase 6 S52 — single batched call backing the Insights hub.

    Returns the aggregate (My State / What This Means / What To Do)
    so the hub renders in one round-trip rather than 6.
    """
    from sqlalchemy import text as _t

    out: dict = {
        "user_id": user_id,
        "my_state": {
            "concept_mastery": [],
            "topic_decay": [],
            "readiness": None,
        },
        "what_this_means": {
            "weak_concepts": [],
            "decay_alerts": [],
        },
        "what_to_do": {
            "missions_today_pending": False,
            "revision_due_today": 0,
        },
    }
    async with sessionmaker()() as s:
        # Concept mastery
        try:
            r = await s.execute(
                _t(
                    "SELECT concept_id, ewa, n, last_seen_at "
                    "FROM analytics_schema.concept_mastery "
                    "WHERE user_id = CAST(:uid AS uuid) "
                    "ORDER BY last_seen_at DESC NULLS LAST LIMIT 10"
                ),
                {"uid": user_id},
            )
            for row in r.mappings():
                d = _topic_decay.compute_decay(
                    last_attempted_at=row["last_seen_at"],
                    current_ewa=float(row["ewa"]),
                    n_attempts=int(row["n"]),
                )
                entry = {
                    "concept_id": str(row["concept_id"]),
                    "ewa": float(row["ewa"]),
                    "n": int(row["n"]),
                    "decay_severity": d.decay_severity,
                    "decay_days": d.decay_days,
                }
                out["my_state"]["concept_mastery"].append(entry)
                if d.decay_severity in ("stale", "critical"):
                    out["my_state"]["topic_decay"].append(entry)
                    out["what_this_means"]["decay_alerts"].append(entry)
                if float(row["ewa"]) < 0.4 and int(row["n"]) >= 2:
                    out["what_this_means"]["weak_concepts"].append(entry)
        except Exception:  # noqa: BLE001
            pass

        # Readiness mean
        try:
            r = await s.execute(
                _t(
                    "SELECT COALESCE(AVG(ewa),0)::float AS r "
                    "FROM analytics_schema.mastery WHERE user_id = CAST(:uid AS uuid)"
                ),
                {"uid": user_id},
            )
            row = r.mappings().first()
            readiness = float(row["r"]) if row else 0.0
            out["my_state"]["readiness"] = {
                "score": round(readiness, 3),
                "band": _bands.readiness_band(
                    readiness_score=readiness, days_to_exam=90, target_score=0.7,
                ),
            }
        except Exception:  # noqa: BLE001
            pass

    return out


@router.get("/analytics/readiness-band/{user_id}")
async def get_readiness_band(
    user_id: str,
    target_score: float = 0.7,
    days_to_exam: int = 90,
):
    """Compute the user's current readiness band + suggested actions."""
    # Readiness score = mean of per-topic EWAs (existing pattern)
    async with sessionmaker()() as s:
        from sqlalchemy import text as _text
        res = await s.execute(
            _text(
                "SELECT COALESCE(AVG(ewa), 0)::float AS readiness_score "
                "FROM analytics_schema.mastery "
                "WHERE user_id = CAST(:uid AS uuid)"
            ),
            {"uid": user_id},
        )
        row = res.mappings().first()
        readiness = float(row["readiness_score"]) if row else 0.0
    band = _bands.readiness_band(
        readiness_score=readiness,
        days_to_exam=days_to_exam,
        target_score=target_score,
    )
    actions = _bands.BAND_ACTIONS.get(band, [])
    return {
        "user_id": user_id,
        "readiness_score": round(readiness, 3),
        "target_score": target_score,
        "days_to_exam": days_to_exam,
        "band": band,
        "actions": actions,
    }


# ─────────────────────────────────────────────────────────────────────
# Track 2 Sprint A1 / A7 — real-exam outcome opt-in
# ─────────────────────────────────────────────────────────────────────


class RealExamOutcomeIn(BaseModel):
    """Self-reported real-exam result. All fields are optional except
    exam_code; a student may share just rank, just score, just admit
    info, or any combination. Drives the mock-vs-real outcome
    correlation chart on the platform-admin dashboard (Sprint A7)."""

    exam_code: str = Field(min_length=2, max_length=20)
    real_score: float | None = None
    real_rank: int | None = Field(default=None, ge=1)
    admitted_to: str | None = Field(default=None, max_length=200)


@router.post("/analytics/real-exam-outcomes/{user_id}", status_code=200)
async def post_real_exam_outcome(user_id: str, body: RealExamOutcomeIn):
    """Upsert a student's self-reported real-exam outcome. Idempotent
    on (user_id, exam_code) — re-submitting overwrites the previous
    row (the student may have heard a more accurate result later).
    """
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        await s.execute(
            _t(
                """
                INSERT INTO analytics_schema.real_exam_outcomes
                    (user_id, exam_code, real_score, real_rank,
                     admitted_to, reported_at)
                VALUES
                    (CAST(:uid AS uuid), :exam, :score, :rank,
                     :admit, NOW())
                ON CONFLICT (user_id, exam_code) DO UPDATE SET
                    real_score  = EXCLUDED.real_score,
                    real_rank   = EXCLUDED.real_rank,
                    admitted_to = EXCLUDED.admitted_to,
                    reported_at = EXCLUDED.reported_at
                """
            ),
            {
                "uid": user_id,
                "exam": body.exam_code,
                "score": body.real_score,
                "rank": body.real_rank,
                "admit": body.admitted_to,
            },
        )
        await s.commit()
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────
# Track 2 Sprint A4 — manual interventions (teacher → student)
# ─────────────────────────────────────────────────────────────────────


class ManualInterventionIn(BaseModel):
    student_id: str
    educator_id: str
    cohort_id: str
    topic_id: str
    action: str = Field(pattern=r"^(REVISE|DIAGNOSE|PRACTICE)$")
    reason: str | None = Field(default=None, max_length=500)


@router.post("/analytics/manual-interventions", status_code=201)
async def create_manual_intervention(body: ManualInterventionIn):
    """A teacher flags a (student, topic, action). Adds a row that the
    recommender prepends to the student's Guided Next Steps with a
    "from {educator_name}" badge until the student fulfils it.

    NOTE: this endpoint is intentionally permissive — the gateway
    authorises that the caller is a LEAD_TEACHER assigned to the
    cohort. Service-level role check is deferred to the next sprint
    (when the require-teacher-scope dependency lands).
    """
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        res = await s.execute(
            _t(
                """
                INSERT INTO analytics_schema.manual_interventions
                    (student_id, educator_id, cohort_id, topic_id,
                     action, reason, created_at)
                VALUES
                    (CAST(:sid AS uuid), CAST(:eid AS uuid),
                     CAST(:cid AS uuid), CAST(:tid AS uuid),
                     :act, :reason, NOW())
                RETURNING id, created_at
                """
            ),
            {
                "sid": body.student_id,
                "eid": body.educator_id,
                "cid": body.cohort_id,
                "tid": body.topic_id,
                "act": body.action,
                "reason": body.reason,
            },
        )
        row = res.mappings().first()
        await s.commit()
    return {
        "id": str(row["id"]),
        "created_at": row["created_at"].isoformat(),
        "student_id": body.student_id,
        "topic_id": body.topic_id,
        "action": body.action,
    }


@router.get("/analytics/manual-interventions/{student_id}/open")
async def list_open_interventions(student_id: str, limit: int = 5):
    """Returns up-to-N unfulfilled flags for a student, most recent
    first. Used by the recommender to prepend teacher nudges to the
    Guided Next Steps response."""
    from sqlalchemy import text as _t

    limit = max(1, min(limit, 20))
    async with sessionmaker()() as s:
        res = await s.execute(
            _t(
                """
                SELECT id::text AS id,
                       student_id::text AS student_id,
                       educator_id::text AS educator_id,
                       topic_id::text AS topic_id,
                       action,
                       reason,
                       created_at
                  FROM analytics_schema.manual_interventions
                 WHERE student_id = CAST(:sid AS uuid)
                   AND fulfilled_at IS NULL
                 ORDER BY created_at DESC
                 LIMIT :lim
                """
            ),
            {"sid": student_id, "lim": limit},
        )
        rows = res.mappings().all()
    return {
        "student_id": student_id,
        "items": [
            {
                "id": r["id"],
                "educator_id": r["educator_id"],
                "topic_id": r["topic_id"],
                "action": r["action"],
                "reason": r["reason"],
                "created_at": r["created_at"].isoformat(),
            }
            for r in rows
        ],
    }


# ─────────────────────────────────────────────────────────────────────
# Track 2 follow-ups — Sprint A3 (Teacher dashboards)
# ─────────────────────────────────────────────────────────────────────
#
# These endpoints all read from the per-cohort aggregates already
# computed by the existing cohort_summary / cohort_leaderboard
# modules, plus the new institution_aggregates / teacher_aggregates
# tables. Role gating happens at the gateway: caller must be
# LEAD_TEACHER assigned to the cohort, or PLATFORM_ADMIN.


@router.get("/analytics/teacher/{teacher_id}/dashboard")
async def teacher_dashboard(teacher_id: str):
    """Composite overview of every cohort the teacher is assigned to.
    Uses educator_assignments → cohort joins (currently coarse: until
    those joins land, returns the teacher's recent_aggregates from the
    teacher_aggregates table).
    """
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t(
                    """
                    SELECT cohort_id::text AS cohort_id,
                           snapshot_date,
                           n_students,
                           avg_readiness,
                           delta_readiness_7d,
                           delta_readiness_30d,
                           n_at_risk,
                           n_top_quartile
                      FROM analytics_schema.teacher_aggregates
                     WHERE educator_id = CAST(:eid AS uuid)
                       AND snapshot_date = (
                           SELECT MAX(snapshot_date)
                             FROM analytics_schema.teacher_aggregates
                            WHERE educator_id = CAST(:eid AS uuid)
                       )
                     ORDER BY n_students DESC
                    """
                ),
                {"eid": teacher_id},
            )
        ).mappings().all()
    return {
        "teacherId": teacher_id,
        "cohorts": [
            {
                "cohortId": r["cohort_id"],
                "snapshotDate": r["snapshot_date"].isoformat() if r["snapshot_date"] else None,
                "nStudents": int(r["n_students"]),
                "avgReadiness": round(float(r["avg_readiness"]), 4),
                "deltaReadiness7d": round(float(r["delta_readiness_7d"]), 4),
                "deltaReadiness30d": round(float(r["delta_readiness_30d"]), 4),
                "nAtRisk": int(r["n_at_risk"]),
                "nTopQuartile": int(r["n_top_quartile"]),
            }
            for r in rows
        ],
    }


@router.get("/analytics/cohorts/{cohort_id}/topic-heatmap")
async def cohort_topic_heatmap(cohort_id: str, limit: int = 25):
    """Per-topic class average mastery + n_students. Sorted weakest
    first. AP-01: cohort members fetched via HTTP from institution,
    then aggregated against `mastery` locally — no cross-DB join.
    """
    from sqlalchemy import text as _t

    limit = max(1, min(limit, 100))
    members = await fetch_cohort_members(cohort_id)
    user_ids = [m["userId"] for m in members if m.get("role") == "STUDENT"]
    if not user_ids:
        return {"cohortId": cohort_id, "topics": []}

    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t(
                    """
                    SELECT topic_id::text AS topic_id,
                           AVG(ewa)        AS avg_ewa,
                           COUNT(*)        AS n_students
                      FROM analytics_schema.mastery
                     WHERE user_id = ANY(CAST(:uids AS uuid[]))
                     GROUP BY topic_id
                     ORDER BY avg_ewa ASC
                     LIMIT :lim
                    """
                ),
                {"uids": user_ids, "lim": limit},
            )
        ).mappings().all()
        topic_ids = [r["topic_id"] for r in rows]
    titles = await _learning_client.fetch_topics_bulk(topic_ids)
    return {
        "cohortId": cohort_id,
        "topics": [
            {
                "topicId": r["topic_id"],
                "topicTitle": titles.get(r["topic_id"], {}).get("title", ""),
                "avgEwa": round(float(r["avg_ewa"]), 4),
                "nStudents": int(r["n_students"]),
            }
            for r in rows
        ],
    }


@router.get("/analytics/cohorts/{cohort_id}/trend")
async def cohort_trend(cohort_id: str, days: int = Query(default=30, ge=7, le=180)):
    """Cohort daily-activity trend over the requested window.

    AP-01: cohort members fetched via HTTP, then aggregated against
    `daily_activity`. Per day: avg questions/student, avg minutes,
    active-student count. Replaces the historical `institution_aggregates`
    snapshot table that was never built (the snapshot job is a Phase 2
    follow-up). Daily activity is the most honest signal we have today.
    """
    from sqlalchemy import text as _t

    members = await fetch_cohort_members(cohort_id)
    user_ids = [m["userId"] for m in members if m.get("role") == "STUDENT"]
    if not user_ids:
        return {"cohortId": cohort_id, "days": days, "nMembers": 0, "points": []}

    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t(
                    """
                    SELECT activity_date::text AS d,
                           AVG(questions_answered)::real AS avg_questions,
                           AVG(study_minutes)::real      AS avg_minutes,
                           COUNT(DISTINCT user_id)::int  AS active_students
                      FROM analytics_schema.daily_activity
                     WHERE user_id = ANY(CAST(:uids AS uuid[]))
                       AND activity_date >= CURRENT_DATE - (CAST(:days AS int) * INTERVAL '1 day')
                     GROUP BY activity_date
                     ORDER BY activity_date ASC
                    """
                ),
                {"uids": user_ids, "days": days},
            )
        ).mappings().all()

    return {
        "cohortId": cohort_id,
        "days": days,
        "nMembers": len(user_ids),
        "points": [
            {
                "date": r["d"],
                "avgQuestions": round(float(r["avg_questions"] or 0.0), 2),
                "avgMinutes": round(float(r["avg_minutes"] or 0.0), 2),
                "activeStudents": int(r["active_students"]),
                "engagementPct": round(int(r["active_students"]) / len(user_ids), 4),
            }
            for r in rows
        ],
    }


@router.get("/analytics/cohorts/{cohort_id}/engagement")
async def cohort_engagement(cohort_id: str):
    """Per-student engagement: last_active + sessions_30d. Drives the
    teacher's "who's barely active" view."""
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t(
                    """
                    SELECT cm.user_id::text     AS user_id,
                           ps.last_active,
                           COALESCE(ps.sessions_30d, 0) AS sessions_30d
                      FROM identity_schema.cohort_members cm
                      LEFT JOIN (
                            SELECT user_id,
                                   MAX(processed_at) AS last_active,
                                   COUNT(*) FILTER (
                                     WHERE processed_at >= NOW() - INTERVAL '30 days'
                                   ) AS sessions_30d
                              FROM analytics_schema.processed_sessions
                             GROUP BY user_id
                      ) ps ON ps.user_id = cm.user_id
                     WHERE cm.cohort_id = CAST(:cid AS uuid)
                     ORDER BY ps.last_active DESC NULLS LAST
                    """
                ),
                {"cid": cohort_id},
            )
        ).mappings().all()
    return {
        "cohortId": cohort_id,
        "students": [
            {
                "userId": r["user_id"],
                "lastActive": r["last_active"].isoformat() if r["last_active"] else None,
                "sessions30d": int(r["sessions_30d"]),
            }
            for r in rows
        ],
    }


@router.get("/analytics/cohorts/{cohort_id}/assignment-compliance")
async def cohort_assignment_compliance(cohort_id: str):
    """Per-assignment completion summary across the cohort. Joins
    learning_schema.assignments (HTTP) with engagement-side
    progress events. v1 returns a coarse summary; per-student
    breakdown lands in a follow-up sprint.
    """
    # v1 placeholder shape — backend joins with assignment service
    # remain a follow-up. Returning the structural envelope so the
    # web-portal page can render an empty-state when there are no
    # assignments yet.
    return {
        "cohortId": cohort_id,
        "assignments": [],
        "note": (
            "Full assignment-compliance backfill ships with the "
            "engagement→learning join in a follow-up migration."
        ),
    }


# ─────────────────────────────────────────────────────────────────────
# Track 2 follow-ups — Sprint A5 (Institute admin)
# ─────────────────────────────────────────────────────────────────────


@router.get("/analytics/institution/{tenant_id}/overview")
async def institution_overview(tenant_id: str):
    """Headline stats for an institute: total students, total active,
    avg readiness, top weak subjects (by count of <40% mastery rows).
    Reads the latest snapshot from institution_aggregates."""
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        head = (
            await s.execute(
                _t(
                    """
                    SELECT n_students, n_active_7d, avg_readiness,
                           median_readiness
                      FROM analytics_schema.institution_aggregates
                     WHERE tenant_id = CAST(:tid AS uuid)
                       AND exam_id IS NULL
                       AND cohort_id IS NULL
                     ORDER BY snapshot_date DESC
                     LIMIT 1
                    """
                ),
                {"tid": tenant_id},
            )
        ).mappings().first()
    return {
        "tenantId": tenant_id,
        "nStudents": int(head["n_students"]) if head else 0,
        "nActive7d": int(head["n_active_7d"]) if head else 0,
        "avgReadiness": round(float(head["avg_readiness"]), 4) if head else 0,
        "medianReadiness": round(float(head["median_readiness"]), 4) if head else 0,
    }


@router.get("/analytics/institution/{tenant_id}/cohorts")
async def institution_cohorts(tenant_id: str):
    """Per-cohort summary stats for an institute."""
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t(
                    """
                    SELECT cohort_id::text AS cohort_id,
                           snapshot_date,
                           avg_readiness,
                           n_students,
                           n_active_7d
                      FROM analytics_schema.institution_aggregates
                     WHERE tenant_id = CAST(:tid AS uuid)
                       AND cohort_id IS NOT NULL
                       AND snapshot_date = (
                           SELECT MAX(snapshot_date)
                             FROM analytics_schema.institution_aggregates
                            WHERE tenant_id = CAST(:tid AS uuid)
                       )
                     ORDER BY n_students DESC
                    """
                ),
                {"tid": tenant_id},
            )
        ).mappings().all()
    return {
        "tenantId": tenant_id,
        "cohorts": [
            {
                "cohortId": r["cohort_id"],
                "snapshotDate": r["snapshot_date"].isoformat() if r["snapshot_date"] else None,
                "avgReadiness": round(float(r["avg_readiness"]), 4),
                "nStudents": int(r["n_students"]),
                "nActive7d": int(r["n_active_7d"]),
            }
            for r in rows
        ],
    }


@router.get("/analytics/institution/{tenant_id}/teacher-effectiveness")
async def institution_teacher_effectiveness(tenant_id: str):
    """Teacher-effectiveness ranking with attribution caveats. v1
    returns net delta_readiness_7d per teacher. The web-admin page
    surfaces this with a prominent caveats banner."""
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t(
                    """
                    SELECT educator_id::text AS educator_id,
                           SUM(n_students)              AS n_students,
                           AVG(avg_readiness)           AS avg_readiness,
                           AVG(delta_readiness_7d)      AS delta_7d,
                           AVG(delta_readiness_30d)     AS delta_30d
                      FROM analytics_schema.teacher_aggregates ta
                     INNER JOIN identity_schema.users u
                             ON u.id = ta.educator_id
                            AND u.tenant_id = CAST(:tid AS uuid)
                     WHERE snapshot_date = (
                          SELECT MAX(snapshot_date)
                            FROM analytics_schema.teacher_aggregates
                     )
                     GROUP BY ta.educator_id
                     ORDER BY delta_7d DESC NULLS LAST
                    """
                ),
                {"tid": tenant_id},
            )
        ).mappings().all()
    return {
        "tenantId": tenant_id,
        "teachers": [
            {
                "educatorId": r["educator_id"],
                "nStudents": int(r["n_students"] or 0),
                "avgReadiness": round(float(r["avg_readiness"] or 0), 4),
                "delta7d": round(float(r["delta_7d"] or 0), 4),
                "delta30d": round(float(r["delta_30d"] or 0), 4),
            }
            for r in rows
        ],
    }


@router.get("/analytics/institution/{tenant_id}/subject-gaps")
async def institution_subject_gaps(tenant_id: str):
    """Subject-area weakness rollup across the institute. Reads
    mastery rows in the tenant, groups by topic.subject_id (HTTP-
    fetched from learning), returns the lowest-mastery subjects
    first."""
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t(
                    """
                    SELECT topic_id::text AS topic_id,
                           AVG(ewa)       AS avg_ewa,
                           COUNT(*)       AS n_rows
                      FROM analytics_schema.mastery
                     WHERE tenant_id = CAST(:tid AS uuid)
                     GROUP BY topic_id
                     ORDER BY avg_ewa ASC
                     LIMIT 50
                    """
                ),
                {"tid": tenant_id},
            )
        ).mappings().all()
    return {
        "tenantId": tenant_id,
        "topics": [
            {
                "topicId": r["topic_id"],
                "avgEwa": round(float(r["avg_ewa"]), 4),
                "nRows": int(r["n_rows"]),
            }
            for r in rows
        ],
    }


@router.get("/analytics/institution/{tenant_id}/trend")
async def institution_trend(
    tenant_id: str, days: int = Query(default=90, ge=7, le=365)
):
    """Institute-wide readiness time series."""
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t(
                    f"""
                    SELECT snapshot_date,
                           avg_readiness, median_readiness,
                           n_students, n_active_7d
                      FROM analytics_schema.institution_aggregates
                     WHERE tenant_id = CAST(:tid AS uuid)
                       AND exam_id IS NULL
                       AND cohort_id IS NULL
                       AND snapshot_date >= CURRENT_DATE - INTERVAL '{int(days)} days'
                     ORDER BY snapshot_date ASC
                    """
                ),
                {"tid": tenant_id},
            )
        ).mappings().all()
    return {
        "tenantId": tenant_id,
        "days": days,
        "points": [
            {
                "date": r["snapshot_date"].isoformat(),
                "avgReadiness": round(float(r["avg_readiness"]), 4),
                "medianReadiness": round(float(r["median_readiness"]), 4),
                "nStudents": int(r["n_students"]),
                "nActive7d": int(r["n_active_7d"]),
            }
            for r in rows
        ],
    }


@router.get("/analytics/institution/{tenant_id}/marketplace-roi")
async def institution_marketplace_roi(tenant_id: str):
    """Course/tutor purchase counts vs mastery delta of buyers.
    v1 returns aggregate purchase counts only (delta correlation
    needs a heavier join with payment+mastery; lands in a follow-up).
    """
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        # Cross-DB query via dblink could be heavy; for v1 we return
        # a structural envelope with placeholder zeros so the UI has
        # a safe target.
        head = (
            await s.execute(
                _t(
                    """
                    SELECT 0::int AS course_purchases,
                           0::int AS tutor_sessions,
                           NULL::real AS avg_buyer_readiness,
                           NULL::real AS avg_non_buyer_readiness
                    """
                )
            )
        ).mappings().first()
    return {
        "tenantId": tenant_id,
        "coursePurchases": int(head["course_purchases"]),
        "tutorSessions": int(head["tutor_sessions"]),
        "avgBuyerReadiness": float(head["avg_buyer_readiness"] or 0),
        "avgNonBuyerReadiness": float(head["avg_non_buyer_readiness"] or 0),
        "note": (
            "Buyer/non-buyer mastery correlation requires "
            "a payment→mastery join that lands in the next sprint."
        ),
    }


@router.get("/analytics/institution/{tenant_id}/benchmark")
async def institution_benchmark(tenant_id: str):
    """Anonymized comparison vs similar institutes. k-anonymity floor
    of 5; if fewer institutes match, returns hidden=true."""
    from sqlalchemy import text as _t

    K_FLOOR = 5
    async with sessionmaker()() as s:
        # "Similar" = same-size band ±20% (using n_students). v1 uses
        # the simplest peer-set definition; fancy weighting is a
        # follow-up.
        own = (
            await s.execute(
                _t(
                    """
                    SELECT n_students, avg_readiness
                      FROM analytics_schema.institution_aggregates
                     WHERE tenant_id = CAST(:tid AS uuid)
                       AND exam_id IS NULL AND cohort_id IS NULL
                     ORDER BY snapshot_date DESC
                     LIMIT 1
                    """
                ),
                {"tid": tenant_id},
            )
        ).mappings().first()
        if own is None:
            return {"tenantId": tenant_id, "hidden": True, "reason": "no_data"}
        n = int(own["n_students"])
        peers = (
            await s.execute(
                _t(
                    """
                    SELECT AVG(avg_readiness) AS peer_avg,
                           COUNT(*) AS peer_count
                      FROM analytics_schema.institution_aggregates
                     WHERE tenant_id <> CAST(:tid AS uuid)
                       AND exam_id IS NULL AND cohort_id IS NULL
                       AND snapshot_date = (
                           SELECT MAX(snapshot_date)
                             FROM analytics_schema.institution_aggregates
                       )
                       AND n_students BETWEEN :low AND :high
                    """
                ),
                {
                    "tid": tenant_id,
                    "low": int(n * 0.8),
                    "high": int(n * 1.2),
                },
            )
        ).mappings().first()
        peer_count = int(peers["peer_count"] or 0)
        if peer_count < K_FLOOR:
            return {
                "tenantId": tenant_id,
                "hidden": True,
                "reason": "k_anonymity_floor",
                "kRequired": K_FLOOR,
                "peerCount": peer_count,
            }
        return {
            "tenantId": tenant_id,
            "hidden": False,
            "ownAvgReadiness": round(float(own["avg_readiness"]), 4),
            "peerAvgReadiness": round(float(peers["peer_avg"]), 4),
            "peerCount": peer_count,
        }


# ─────────────────────────────────────────────────────────────────────
# Track 2 follow-ups — Sprint A6 (Platform admin business analytics)
# ─────────────────────────────────────────────────────────────────────


@router.get("/analytics/platform/funnels")
async def platform_funnels(days: int = Query(default=30, ge=7, le=365)):
    """Signup → exam_picked → first_session → first_mock → premium
    funnel counts over the window."""
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t(
                    f"""
                    SELECT event,
                           COUNT(DISTINCT user_id) AS user_count
                      FROM analytics_schema.platform_funnels
                     WHERE occurred_at >= NOW() - INTERVAL '{int(days)} days'
                     GROUP BY event
                    """
                )
            )
        ).mappings().all()
    counts = {r["event"]: int(r["user_count"]) for r in rows}
    chain = ["signup", "exam_picked", "first_session", "first_mock", "premium_purchased"]
    return {
        "days": days,
        "steps": [
            {"event": ev, "userCount": counts.get(ev, 0)}
            for ev in chain
        ],
    }


@router.get("/analytics/platform/dau-mau")
async def platform_dau_mau():
    """Daily / weekly / monthly active users. Computed from
    `daily_activity` — a user counts as active on day X iff they have a
    daily_activity row for that day. (`processed_sessions` was the v1
    source but doesn't carry user_id in current schema.)"""
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        row = (
            await s.execute(
                _t(
                    """
                    SELECT
                      COUNT(DISTINCT user_id) FILTER (
                        WHERE activity_date >= CURRENT_DATE - INTERVAL '1 day'
                      ) AS dau,
                      COUNT(DISTINCT user_id) FILTER (
                        WHERE activity_date >= CURRENT_DATE - INTERVAL '7 days'
                      ) AS wau,
                      COUNT(DISTINCT user_id) FILTER (
                        WHERE activity_date >= CURRENT_DATE - INTERVAL '30 days'
                      ) AS mau
                      FROM analytics_schema.daily_activity
                    """
                )
            )
        ).mappings().first()
    dau = int(row["dau"] or 0)
    mau = int(row["mau"] or 0)
    stickiness = round(dau / mau, 4) if mau > 0 else 0.0
    return {
        "dau": dau,
        "wau": int(row["wau"] or 0),
        "mau": mau,
        "stickiness": stickiness,
    }


@router.get("/analytics/platform/retention")
async def platform_retention(weeks: int = Query(default=8, ge=2, le=26)):
    """Cohort retention curves keyed by first-activity week (proxy for
    signup week when platform_funnels is empty). For each cohort:
    cohortSize and week-1 retained = active in days 7..14 after first.
    Source: `daily_activity` (per-user first-active date + return-week
    presence), so we don't depend on the funnel-events table being
    populated.
    """
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t(
                    f"""
                    WITH first_active AS (
                        SELECT user_id,
                               MIN(activity_date) AS first_date
                          FROM analytics_schema.daily_activity
                         GROUP BY user_id
                    ), cohort AS (
                        SELECT user_id,
                               date_trunc('week', first_date) AS week
                          FROM first_active
                         WHERE first_date >= CURRENT_DATE - INTERVAL '{int(weeks)} weeks'
                    )
                    SELECT
                      week,
                      COUNT(*) AS cohort_size,
                      COUNT(*) FILTER (
                        WHERE EXISTS (
                          SELECT 1 FROM analytics_schema.daily_activity da
                           WHERE da.user_id = cohort.user_id
                             AND da.activity_date BETWEEN (week + INTERVAL '7 days')::date
                                                      AND (week + INTERVAL '14 days')::date
                        )
                      ) AS week1_retained
                      FROM cohort
                     GROUP BY week
                     ORDER BY week DESC
                    """
                )
            )
        ).mappings().all()
    return {
        "weeks": weeks,
        "cohorts": [
            {
                "week": r["week"].date().isoformat() if r["week"] else None,
                "cohortSize": int(r["cohort_size"]),
                "week1Retained": int(r["week1_retained"]),
                "week1Retention": (
                    round(int(r["week1_retained"]) / int(r["cohort_size"]), 4)
                    if int(r["cohort_size"]) > 0 else 0
                ),
            }
            for r in rows
        ],
    }


@router.get("/analytics/platform/question-quality")
async def platform_question_quality(limit: int = Query(default=50, ge=10, le=500)):
    """IRT psychometrics rollup: per-question exposure, accuracy, and
    a synthetic discrimination score (correlation with ability est).
    v1 returns exposure + accuracy; full discrimination requires the
    item-response matrix join, follow-up."""
    from sqlalchemy import text as _t

    limit = max(10, min(limit, 500))
    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t(
                    """
                    SELECT question_id::text AS question_id,
                           COUNT(*)          AS exposure,
                           AVG(CASE WHEN is_correct THEN 1.0 ELSE 0.0 END) AS accuracy
                      FROM analytics_schema.session_item_outcomes
                     GROUP BY question_id
                     ORDER BY exposure DESC
                     LIMIT :lim
                    """
                ),
                {"lim": limit},
            )
        ).mappings().all()
    return {
        "items": [
            {
                "questionId": r["question_id"],
                "exposure": int(r["exposure"]),
                "accuracy": round(float(r["accuracy"]), 4),
            }
            for r in rows
        ],
    }


@router.get("/analytics/platform/mock-distributions/{exam_code}")
async def platform_mock_distributions(exam_code: str):
    """Mock-test score distribution. Pulls per-user mock-summary from
    quiz via the existing batch endpoint (AP-01) — covers all opted-in
    students implicitly. `exam_code` reserved for future per-exam
    scoping (quiz_sessions don't yet carry exam_code; today every mock
    contributes to one global histogram)."""
    import httpx

    # We don't have a way to enumerate all users without identity, so
    # use the platform-funnels signup roster if populated, else fall
    # back to all readiness-row users (good enough proxy for "students
    # active on the platform").
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t("SELECT DISTINCT user_id::text AS uid FROM analytics_schema.daily_activity")
            )
        ).all()
    user_ids = [r[0] for r in rows]
    if not user_ids:
        return {"examCode": exam_code, "buckets": []}

    from engagement.analytics.config import settings as _settings
    base = _settings.quiz_base_url.rstrip("/")
    summaries: list[float] = []
    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            r = await c.post(
                f"{base}/quiz/internal/users/mock-summaries",
                json={"userIds": user_ids},
            )
            if r.status_code == 200:
                for row in r.json().get("items", []):
                    pct = float(row.get("avgScorePct") or 0.0)
                    if pct > 0:
                        summaries.append(pct)
    except httpx.HTTPError:
        pass

    # Bucket into 10-point bins.
    buckets: dict[int, int] = {}
    for pct in summaries:
        b = int((pct // 10) * 10)
        buckets[b] = buckets.get(b, 0) + 1
    out = sorted(buckets.items())
    return {
        "examCode": exam_code,
        "buckets": [{"bucket": b, "n": n} for b, n in out],
    }


@router.get("/analytics/platform/subscription-health")
async def platform_subscription_health():
    """MRR / ARR / churn-rate / upgrade-rate. v1 returns counts;
    monetary aggregates require the payment service join (next
    sprint)."""
    return {
        "activeSubscriptions": 0,
        "premiumThisMonth": 0,
        "churnLast30d": 0,
        "upgradeRateLast30d": 0.0,
        "note": "Monetary aggregates land with the payment-service join.",
    }


@router.get("/analytics/platform/tutor-marketplace")
async def platform_tutor_marketplace():
    """Tutor sessions completed + avg rating + revenue split.
    Placeholder shape until the marketplace event consumer lands."""
    return {
        "sessionsLast30d": 0,
        "avgRating": 0.0,
        "totalRevenuePaise": 0,
        "note": "Marketplace event-consumer rollup is a follow-up.",
    }


@router.get("/analytics/platform/cost-per-student")
async def platform_cost_per_student():
    """LLM + infra spend / DAU. DAU from `daily_activity`; LLM/infra
    cost figures are placeholders until the ai_call_logs spend stream
    is exposed to engagement (Phase 2 follow-up)."""
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        dau_row = (
            await s.execute(
                _t(
                    """
                    SELECT COUNT(DISTINCT user_id) AS dau
                      FROM analytics_schema.daily_activity
                     WHERE activity_date >= CURRENT_DATE - INTERVAL '1 day'
                    """
                )
            )
        ).mappings().first()
    dau = int(dau_row["dau"] or 0)
    return {
        "dau": dau,
        "estLlmCostUsdMonthly": 0.0,
        "estInfraCostUsdMonthly": 0.0,
        "costPerStudentUsd": 0.0,
        "note": (
            "Wire this to /admin/ai-cost rollup + infra spend feed "
            "when the spend stream is exposed to engagement service."
        ),
    }


# ─────────────────────────────────────────────────────────────────────
# Track 2 follow-ups — Sprint A7 (Outcome correlation)
# ─────────────────────────────────────────────────────────────────────


@router.get("/analytics/platform/outcome-correlation/{exam_code}")
async def platform_outcome_correlation(exam_code: str):
    """Self-reported real-exam scores correlated with last-30d-pre-
    exam mastery. Returns a regression line + r² + sample size.
    """
    from sqlalchemy import text as _t

    async with sessionmaker()() as s:
        rows = (
            await s.execute(
                _t(
                    """
                    SELECT reo.user_id::text AS user_id,
                           reo.real_score,
                           AVG(m.ewa) AS pre_exam_mastery
                      FROM analytics_schema.real_exam_outcomes reo
                      JOIN analytics_schema.mastery m
                            ON m.user_id = reo.user_id
                     WHERE reo.exam_code = :ec
                       AND reo.real_score IS NOT NULL
                     GROUP BY reo.user_id, reo.real_score
                    """
                ),
                {"ec": exam_code},
            )
        ).mappings().all()

    pairs = [
        (float(r["pre_exam_mastery"]), float(r["real_score"]))
        for r in rows
        if r["pre_exam_mastery"] is not None and r["real_score"] is not None
    ]
    n = len(pairs)
    if n < 5:
        return {
            "examCode": exam_code,
            "hidden": True,
            "reason": "insufficient_data",
            "minRequired": 5,
            "n": n,
        }
    # Simple linear regression: y = a + b*x.
    sx = sum(x for x, _ in pairs)
    sy = sum(y for _, y in pairs)
    sxy = sum(x * y for x, y in pairs)
    sxx = sum(x * x for x, y in pairs)
    syy = sum(y * y for _, y in pairs)
    denom = n * sxx - sx * sx
    if denom == 0:
        return {"examCode": exam_code, "hidden": True, "reason": "degenerate", "n": n}
    b = (n * sxy - sx * sy) / denom
    a = (sy - b * sx) / n
    # r²
    mean_y = sy / n
    ss_tot = syy - n * mean_y * mean_y
    ss_res = sum((y - (a + b * x)) ** 2 for x, y in pairs)
    r2 = max(0.0, 1.0 - (ss_res / ss_tot if ss_tot > 0 else 0.0))
    return {
        "examCode": exam_code,
        "hidden": False,
        "n": n,
        "intercept": round(a, 4),
        "slope": round(b, 4),
        "r2": round(r2, 4),
        "samples": [
            {"mastery": round(x, 4), "realScore": round(y, 4)}
            for x, y in pairs[:200]  # cap payload
        ],
    }


# ── Phase 7 (P7-A1): six-level drill endpoints ────────────────────────


from typing import Annotated as _Annotated

from fastapi import Depends as _Depends

from engagement.analytics import drill as _drill
from engagement.analytics.scope import (
    Principal as _Principal,
    get_principal as _get_principal,
    resolve_scope as _resolve_scope,
)


async def _importance_map(exam_id: str) -> dict:
    """HTTP-fetch the importance map from learning service. Cached at
    learning side; round-trip is one shot per request."""
    import httpx
    from engagement.analytics.config import settings as _s

    base = _s.learning_base_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=2.0) as c:
            r = await c.get(f"{base}/catalog/topic-importance",
                            params={"examId": exam_id, "includeHidden": "true"})
            if r.status_code != 200:
                return {}
            from types import SimpleNamespace
            out = {}
            for t in r.json().get("topics", []):
                out[t["topicId"]] = SimpleNamespace(
                    weight=t["weight"],
                    source=t["source"],
                    confidence=t["confidence"],
                    hidden=t["hidden"],
                )
            return out
    except httpx.HTTPError:
        return {}


@router.get("/analytics/drill/tenants")
async def drill_tenants_route(
    principal: _Annotated[_Principal, _Depends(_get_principal)],
):
    async with sessionmaker()() as session:
        scope = await _resolve_scope(session, principal)
        rows = await _drill.drill_tenants(session, scope)
        if not rows:
            return {"tenants": [], "coldStart": True,
                    "projection": _drill.synthetic_curve()}
        return {"tenants": rows, "coldStart": False}


@router.get("/analytics/drill/tenant/{tenant_id}/exams")
async def drill_exams_route(
    tenant_id: str,
    principal: _Annotated[_Principal, _Depends(_get_principal)],
):
    async with sessionmaker()() as session:
        scope = await _resolve_scope(session, principal,
                                     target_tenant_id=tenant_id)
        rows = await _drill.drill_exams(session, tenant_id, scope)
        if not rows:
            return {"exams": [], "coldStart": True,
                    "projection": _drill.synthetic_curve()}
        return {"exams": rows, "coldStart": False}


@router.get("/analytics/drill/tenant/{tenant_id}/exam/{exam_id}/subjects")
async def drill_subjects_route(
    tenant_id: str,
    exam_id: str,
    principal: _Annotated[_Principal, _Depends(_get_principal)],
    withImportance: bool = False,
):
    async with sessionmaker()() as session:
        scope = await _resolve_scope(session, principal,
                                     target_tenant_id=tenant_id)
        imp = await _importance_map(exam_id) if withImportance else None
        rows = await _drill.drill_subjects(session, tenant_id, exam_id,
                                           scope, importance_map=imp)
        return {"subjects": rows}


@router.get("/analytics/drill/tenant/{tenant_id}/exam/{exam_id}/subject/{subject_id}/topics")
async def drill_topics_route(
    tenant_id: str,
    exam_id: str,
    subject_id: str,
    principal: _Annotated[_Principal, _Depends(_get_principal)],
    withImportance: bool = True,
):
    async with sessionmaker()() as session:
        scope = await _resolve_scope(session, principal,
                                     target_tenant_id=tenant_id)
        imp = await _importance_map(exam_id) if withImportance else None
        rows = await _drill.drill_topics(session, tenant_id, exam_id,
                                         subject_id, scope, importance_map=imp)
        return {"topics": rows}


@router.get("/analytics/drill/tenant/{tenant_id}/exam/{exam_id}/subject/{subject_id}/topic/{topic_id}/concepts")
async def drill_concepts_route(
    tenant_id: str,
    exam_id: str,
    subject_id: str,
    topic_id: str,
    principal: _Annotated[_Principal, _Depends(_get_principal)],
):
    async with sessionmaker()() as session:
        scope = await _resolve_scope(session, principal,
                                     target_tenant_id=tenant_id)
        rows = await _drill.drill_concepts(session, tenant_id, topic_id, scope)
        return {"concepts": rows}


@router.get("/analytics/drill/tenant/{tenant_id}/exam/{exam_id}/topic/{topic_id}/students")
async def drill_students_route(
    tenant_id: str,
    exam_id: str,
    topic_id: str,
    principal: _Annotated[_Principal, _Depends(_get_principal)],
    limit: int = Query(50, ge=1, le=200),
    cursorEwa: float | None = None,
    cursorUserId: str | None = None,
):
    async with sessionmaker()() as session:
        scope = await _resolve_scope(session, principal,
                                     target_tenant_id=tenant_id)
        if scope.mode == "STUDENT":
            raise HTTPException(
                status_code=403,
                detail={"code": "forbidden",
                        "message": "Use /student-self/topic/{tid} instead"},
            )
        rows = await _drill.drill_students(
            session, tenant_id, topic_id, scope,
            limit=limit, cursor_ewa=cursorEwa, cursor_user_id=cursorUserId,
        )
        return {"students": rows}


# ── Phase 1C — analytics primitives ───────────────────────────────────


from dataclasses import asdict as _asdict
from pydantic import BaseModel as _BaseModel


class _UserIdsBody(_BaseModel):
    userIds: list[str]


@router.post("/analytics/topic-mastery-aggregate")
async def topic_mastery_aggregate_route(body: _UserIdsBody):
    """Per-topic mastery aggregation across an arbitrary user-id list.
    Used by lesson-recommender (fetches cohort members from institution,
    then asks engagement to roll up mastery without a cross-DB join).
    """
    from sqlalchemy import text as _t

    if not body.userIds:
        return {"topics": []}

    async with sessionmaker()() as session:
        rows = (
            await session.execute(
                _t(
                    """
                    SELECT topic_id::text AS topic_id,
                           AVG(ewa)::real  AS avg_ewa,
                           COUNT(*)::int   AS n_students
                      FROM analytics_schema.mastery
                     WHERE user_id = ANY(CAST(:uids AS uuid[]))
                     GROUP BY topic_id
                     ORDER BY avg_ewa ASC
                    """
                ),
                {"uids": body.userIds},
            )
        ).mappings().all()
    return {
        "topics": [
            {
                "topicId": r["topic_id"],
                "avgEwa": round(float(r["avg_ewa"]), 4),
                "nStudents": int(r["n_students"]),
            }
            for r in rows
        ],
    }


from engagement.analytics import (
    common_mistakes as _cm,
    compare as _cmp,
    confidence_gap as _cg,
    intervention_efficacy as _ie,
    time_to_mastery as _ttm,
)


@router.get("/analytics/time-to-mastery/{user_id}/{topic_id}")
async def time_to_mastery_route(
    user_id: str,
    topic_id: str,
    targetEwa: float = Query(_ttm.DEFAULT_TARGET_EWA, ge=0.1, le=0.99),
):
    async with sessionmaker()() as session:
        result = await _ttm.estimate(
            session,
            user_id=user_id,
            topic_id=topic_id,
            target_ewa=targetEwa,
        )
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "no_data", "message": "No mastery data for this user/topic."},
        )
    return _asdict(result)


@router.get("/analytics/confidence-gap/{user_id}")
async def confidence_gap_route(user_id: str):
    async with sessionmaker()() as session:
        report = await _cg.compute(session, user_id=user_id)
    return _asdict(report)


@router.get("/analytics/cohorts/{cohort_id}/common-mistakes")
async def common_mistakes_route(cohort_id: str):
    async with sessionmaker()() as session:
        report = await _cm.compute(session, cohort_id=cohort_id)
    return _asdict(report)


@router.get("/analytics/institution/{tenant_id}/intervention-efficacy")
async def intervention_efficacy_route(tenant_id: str):
    async with sessionmaker()() as session:
        report = await _ie.compute(session, tenant_id=tenant_id)
    return _asdict(report)


@router.get("/analytics/compare/cohorts")
async def compare_cohorts_route(
    a: str = Query(..., description="cohort_id A"),
    b: str = Query(..., description="cohort_id B"),
):
    if a == b:
        raise HTTPException(
            status_code=400,
            detail={"code": "same_side", "message": "a and b must differ."},
        )
    async with sessionmaker()() as session:
        result = await _cmp.compare_cohorts(session, cohort_a=a, cohort_b=b)
    return _asdict(result)


@router.get("/analytics/compare/students")
async def compare_students_route(
    a: str = Query(..., description="user_id A"),
    b: str = Query(..., description="user_id B"),
):
    if a == b:
        raise HTTPException(
            status_code=400,
            detail={"code": "same_side", "message": "a and b must differ."},
        )
    async with sessionmaker()() as session:
        result = await _cmp.compare_students(session, user_a=a, user_b=b)
    return _asdict(result)


from fastapi.responses import Response as _FastResponse

from engagement.analytics import outcomes_pdf as _outcomes_pdf
from engagement.analytics import (
    career_outcomes as _career,
    rank_trajectory as _trajectory,
)


# ── Phase 1D-4 — Career outcome correlation ──────────────────────────


@router.get("/analytics/career-outcomes")
async def career_outcomes_route(
    examCode: str = Query(...),
    readiness: float = Query(..., ge=0.0, le=1.0),
    band: float = Query(0.05, ge=0.01, le=0.30),
):
    async with sessionmaker()() as session:
        report = await _career.compute(
            session, exam_code=examCode, readiness=readiness, band=band,
        )
    return _asdict(report)


# ── Phase 1D-4 — Real-exam self-report ingestion ─────────────────────


from pydantic import BaseModel as _PdBaseModel, Field as _PdField


class _RealExamOutcomeIn(_PdBaseModel):
    examCode: str = _PdField(..., max_length=20)
    realScore: float | None = _PdField(default=None)
    realRank: int | None = _PdField(default=None, ge=1)
    admittedTo: str | None = _PdField(default=None, max_length=200)


@router.put("/analytics/real-exam-outcomes/{user_id}")
async def upsert_real_exam_outcome(user_id: str, body: _RealExamOutcomeIn):
    """Self-report a real-exam outcome. Upsert on (user_id, exam_code)."""
    from sqlalchemy import text as _t

    async with sessionmaker()() as session:
        await session.execute(
            _t(
                """
                INSERT INTO analytics_schema.real_exam_outcomes
                  (user_id, exam_code, real_score, real_rank, admitted_to, reported_at)
                VALUES
                  (CAST(:uid AS uuid), :ec, :rs, :rk, :ad, NOW())
                ON CONFLICT (user_id, exam_code) DO UPDATE
                   SET real_score  = EXCLUDED.real_score,
                       real_rank   = EXCLUDED.real_rank,
                       admitted_to = EXCLUDED.admitted_to,
                       reported_at = EXCLUDED.reported_at
                """
            ),
            {
                "uid": user_id,
                "ec": body.examCode,
                "rs": body.realScore,
                "rk": body.realRank,
                "ad": body.admittedTo,
            },
        )
        await session.commit()
    return {"userId": user_id, "examCode": body.examCode, "saved": True}


@router.get("/analytics/real-exam-outcomes/{user_id}")
async def list_real_exam_outcomes(user_id: str):
    from sqlalchemy import text as _t

    async with sessionmaker()() as session:
        rows = (
            await session.execute(
                _t(
                    """
                    SELECT exam_code, real_score, real_rank,
                           admitted_to, reported_at::text AS reported_at
                      FROM analytics_schema.real_exam_outcomes
                     WHERE user_id = CAST(:uid AS uuid)
                     ORDER BY reported_at DESC
                    """
                ),
                {"uid": user_id},
            )
        ).mappings().all()
    return {
        "userId": user_id,
        "items": [
            {
                "examCode": r["exam_code"],
                "realScore": float(r["real_score"]) if r["real_score"] is not None else None,
                "realRank": int(r["real_rank"]) if r["real_rank"] is not None else None,
                "admittedTo": r["admitted_to"],
                "reportedAt": r["reported_at"],
            }
            for r in rows
        ],
    }


@router.delete("/analytics/real-exam-outcomes/{user_id}/{exam_code}", status_code=204)
async def delete_real_exam_outcome(user_id: str, exam_code: str):
    from sqlalchemy import text as _t

    async with sessionmaker()() as session:
        await session.execute(
            _t(
                """
                DELETE FROM analytics_schema.real_exam_outcomes
                 WHERE user_id = CAST(:uid AS uuid)
                   AND exam_code = :ec
                """
            ),
            {"uid": user_id, "ec": exam_code},
        )
        await session.commit()


# ── Phase 1D-5 — Rank trajectory ────────────────────────────────────


@router.get("/analytics/mock/{exam_code}/trajectory/{user_id}")
async def rank_trajectory_route(exam_code: str, user_id: str):
    report = await _trajectory.compute(user_id=user_id, exam_code=exam_code)
    return _asdict(report)


# ── Phase 1D-7 — National rank leaderboard ──────────────────────────


from engagement.analytics import national_rank as _natrank


@router.get("/analytics/mock/{exam_code}/national-leaderboard")
async def national_leaderboard_route(
    exam_code: str,
    limit: int = Query(50, ge=1, le=200),
):
    res = await _natrank.leaderboard(exam_code=exam_code, limit=limit)
    return _asdict(res)


@router.get("/analytics/mock/{exam_code}/national-rank/{user_id}")
async def national_rank_route(exam_code: str, user_id: str):
    res = await _natrank.user_rank(user_id=user_id, exam_code=exam_code)
    return _asdict(res)


@router.get("/analytics/institution/{tenant_id}/outcomes-report")
async def outcomes_report_route(
    tenant_id: str,
    format: str = Query("pdf", pattern="^(pdf|html)$"),
):
    """Printable institute outcomes report. ?format=pdf (default) or
    ?format=html (fallback when weasyprint isn't installed).
    """
    async with sessionmaker()() as session:
        if format == "pdf":
            try:
                pdf_bytes, fname = await _outcomes_pdf.render(session, tenant_id)
            except _outcomes_pdf.PdfRenderUnavailable:
                html, fname = await _outcomes_pdf.render_html_fallback(session, tenant_id)
                return _FastResponse(
                    content=html,
                    media_type="text/html",
                    headers={
                        "Content-Disposition": f'inline; filename="{fname}"',
                        "X-PDF-Fallback": "weasyprint-unavailable",
                    },
                )
            return _FastResponse(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{fname}"'},
            )
        html, fname = await _outcomes_pdf.render_html_fallback(session, tenant_id)
        return _FastResponse(
            content=html,
            media_type="text/html",
            headers={"Content-Disposition": f'inline; filename="{fname}"'},
        )

