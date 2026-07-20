import uuid
import pytest
from sqlalchemy import text

from engagement.analytics import db, routes as analytics_routes

from engagement.analytics.config import settings as _settings
# Internal-service token: these tests exercise endpoint LOGIC, so they
# authenticate as a trusted peer service (post-IDOR-sweep the personal
# /analytics/{user_id} endpoints require a bearer or this token).
_ITOK = {"x-internal-token": _settings.internal_service_token}


async def _seed_mastery(user_id, rows):
    async with db.sessionmaker()() as s:
        for topic_id, ewa, n in rows:
            await s.execute(text(
                "INSERT INTO analytics_schema.mastery (user_id, topic_id, ewa, n) "
                "VALUES (CAST(:u AS uuid), CAST(:t AS uuid), :e, :n) "
                "ON CONFLICT (user_id, topic_id) DO UPDATE SET ewa=EXCLUDED.ewa, n=EXCLUDED.n"
            ), {"u": user_id, "t": topic_id, "e": ewa, "n": n})
        await s.commit()


@pytest.mark.asyncio
async def test_mastery_scoped_to_exam_topics(client, monkeypatch):
    user = str(uuid.uuid4())
    in_topic = str(uuid.uuid4())
    out_topic = str(uuid.uuid4())
    await _seed_mastery(user, [(in_topic, 0.7, 3), (out_topic, 0.2, 1)])

    async def fake_resolve(exam_id, *, clock=None):
        return {in_topic}
    monkeypatch.setattr(analytics_routes, "resolve_exam_topic_ids", fake_resolve)

    # scoped → only in_topic
    r = await client.get(f"/analytics/mastery/{user}?exam_id=11111111-1111-1111-1111-111111111111", headers=_ITOK)
    ids = {t["topicId"] for t in r.json()["topics"]}
    assert ids == {in_topic}

    # unscoped → both (back-compat)
    r2 = await client.get(f"/analytics/mastery/{user}", headers=_ITOK)
    ids2 = {t["topicId"] for t in r2.json()["topics"]}
    assert ids2 == {in_topic, out_topic}


@pytest.mark.asyncio
async def test_mastery_resolver_failure_returns_global_topics(client, monkeypatch):
    """When resolve_exam_topic_ids returns None (upstream failure), the mastery
    endpoint must degrade gracefully to unscoped (all topics), NOT return empty."""
    user = str(uuid.uuid4())
    topic_a = str(uuid.uuid4())
    topic_b = str(uuid.uuid4())
    await _seed_mastery(user, [(topic_a, 0.8, 5), (topic_b, 0.3, 2)])

    async def fake_resolve_fail(exam_id, *, clock=None):
        return None  # simulates catalog service down

    monkeypatch.setattr(analytics_routes, "resolve_exam_topic_ids", fake_resolve_fail)

    r = await client.get(f"/analytics/mastery/{user}?exam_id=11111111-1111-1111-1111-111111111111", headers=_ITOK)
    assert r.status_code == 200
    ids = {t["topicId"] for t in r.json()["topics"]}
    # Resolver returned None → handler must pass topic_ids=None → global (unscoped)
    assert ids == {topic_a, topic_b}, (
        "Expected all topics (global) when resolver fails, got: " + repr(ids)
    )
