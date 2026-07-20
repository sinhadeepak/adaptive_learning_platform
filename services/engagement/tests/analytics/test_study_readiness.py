"""Fused study-readiness — revision_queue + mastery + watch-summary.

No SM-2 math change: this endpoint only reads and fuses the three existing
signals into a per-topic revisionNeed for the Study Materials hub.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from engagement.analytics import db, learning_client, routes as analytics_routes

from engagement.analytics.config import settings as _settings
# Internal-service token: these tests exercise endpoint LOGIC, so they
# authenticate as a trusted peer service (post-IDOR-sweep the personal
# /analytics/{user_id} endpoints require a bearer or this token).
_ITOK = {"x-internal-token": _settings.internal_service_token}

UTC = timezone.utc

EXAM = "11111111-1111-1111-1111-111111111111"


async def _seed_due(user_id, topic_id, days_overdue):
    when = datetime.now(tz=UTC) - timedelta(days=days_overdue)
    async with db.sessionmaker()() as s:
        await s.execute(
            text(
                "INSERT INTO analytics_schema.revision_queue "
                "(user_id, topic_id, last_attempt_at, due_at, interval_days, ease_factor, attempts) "
                "VALUES (CAST(:u AS uuid), CAST(:t AS uuid), :la, :due, 6, 2.3, 4) "
                "ON CONFLICT (user_id, topic_id) DO UPDATE SET due_at=EXCLUDED.due_at"
            ),
            {"u": user_id, "t": topic_id, "la": when, "due": when},
        )
        await s.commit()


async def _seed_mastery(user_id, rows):
    async with db.sessionmaker()() as s:
        for tid, ewa, n in rows:
            await s.execute(
                text(
                    "INSERT INTO analytics_schema.mastery (user_id, topic_id, ewa, n) "
                    "VALUES (CAST(:u AS uuid), CAST(:t AS uuid), :e, :n) "
                    "ON CONFLICT (user_id, topic_id) DO UPDATE SET ewa=EXCLUDED.ewa"
                ),
                {"u": user_id, "t": tid, "e": ewa, "n": n},
            )
        await s.commit()


@pytest.mark.asyncio
async def test_study_readiness_fuses_three_signals(client, monkeypatch):
    user = str(uuid.uuid4())
    weak_overdue = str(uuid.uuid4())
    strong_watched = str(uuid.uuid4())

    await _seed_due(user, weak_overdue, days_overdue=10)  # very overdue
    await _seed_mastery(user, [(weak_overdue, 0.25, 6), (strong_watched, 0.85, 8)])

    async def fake_resolve(exam_id, *, clock=None):
        return {weak_overdue, strong_watched}

    async def fake_watch(user_id, exam_id):
        return {
            strong_watched: {
                "minutesWatched": 42,
                "resourcesWatched": 3,
                "resourcesCompleted": 2,
                "documentsCompleted": 1,
            }
        }

    monkeypatch.setattr(analytics_routes, "resolve_exam_topic_ids", fake_resolve)
    monkeypatch.setattr(learning_client, "fetch_watch_summary", fake_watch)

    r = await client.get(f"/analytics/study-readiness/{user}?exam_id={EXAM}", headers=_ITOK)
    assert r.status_code == 200, r.text
    body = r.json()
    topics = {t["topicId"]: t for t in body["topics"]}
    assert set(topics) == {weak_overdue, strong_watched}

    wk = topics[weak_overdue]
    assert wk["overdueDays"] >= 7
    assert wk["ewa"] == pytest.approx(0.25)
    assert wk["revisionNeed"] == "HIGH"  # very overdue + weak

    st = topics[strong_watched]
    assert st["minutesWatched"] == 42
    assert st["resourcesCompleted"] == 2
    assert st["revisionNeed"] == "LOW"  # strong + not due

    # Most-urgent first.
    assert body["topics"][0]["topicId"] == weak_overdue


@pytest.mark.asyncio
async def test_study_readiness_degrades_without_watch(client, monkeypatch):
    user = str(uuid.uuid4())
    topic = str(uuid.uuid4())
    await _seed_mastery(user, [(topic, 0.3, 2)])

    async def fake_resolve(exam_id, *, clock=None):
        return {topic}

    async def failing_watch(user_id, exam_id):
        return {}  # learning_client returns {} on HTTP error

    monkeypatch.setattr(analytics_routes, "resolve_exam_topic_ids", fake_resolve)
    monkeypatch.setattr(learning_client, "fetch_watch_summary", failing_watch)

    r = await client.get(f"/analytics/study-readiness/{user}?exam_id={EXAM}", headers=_ITOK)
    assert r.status_code == 200, r.text
    topics = r.json()["topics"]
    assert len(topics) == 1
    assert topics[0]["minutesWatched"] == 0
    assert topics[0]["revisionNeed"] == "MEDIUM"  # weak mastery, not due
