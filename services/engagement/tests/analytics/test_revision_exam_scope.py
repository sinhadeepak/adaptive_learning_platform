import uuid
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import text

from engagement.analytics import db, routes as analytics_routes

from engagement.analytics.config import settings as _settings
# Internal-service token: these tests exercise endpoint LOGIC, so they
# authenticate as a trusted peer service (post-IDOR-sweep the personal
# /analytics/{user_id} endpoints require a bearer or this token).
_ITOK = {"x-internal-token": _settings.internal_service_token}

UTC = timezone.utc


async def _seed_due(user_id, topic_ids):
    past = datetime.now(tz=UTC) - timedelta(days=2)
    async with db.sessionmaker()() as s:
        for t in topic_ids:
            await s.execute(text(
                "INSERT INTO analytics_schema.revision_queue "
                "(user_id, topic_id, last_attempt_at, due_at, interval_days, ease_factor, attempts) "
                "VALUES (CAST(:u AS uuid), CAST(:t AS uuid), :la, :due, 1, 2.5, 1) "
                "ON CONFLICT (user_id, topic_id) DO UPDATE SET due_at=EXCLUDED.due_at"
            ), {"u": user_id, "t": t, "la": past, "due": past})
        await s.commit()


@pytest.mark.asyncio
async def test_revision_scoped_to_exam(client, monkeypatch):
    user = str(uuid.uuid4())
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    await _seed_due(user, [a, b])

    async def fake_resolve(exam_id, *, clock=None):
        return {a}
    monkeypatch.setattr(analytics_routes, "resolve_exam_topic_ids", fake_resolve)

    r = await client.get(f"/analytics/revision/{user}?exam_id=11111111-1111-1111-1111-111111111111", headers=_ITOK)
    ids = {it["topicId"] for it in r.json()["items"]}
    assert ids == {a}

    r2 = await client.get(f"/analytics/revision/{user}", headers=_ITOK)
    ids2 = {it["topicId"] for it in r2.json()["items"]}
    assert ids2 == {a, b}
