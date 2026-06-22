import uuid
import pytest
from sqlalchemy import text

from engagement.analytics import db, routes as analytics_routes


async def _seed(user_id, rows):
    async with db.sessionmaker()() as s:
        for topic_id, ewa, n in rows:
            await s.execute(text(
                "INSERT INTO analytics_schema.mastery (user_id, topic_id, ewa, n) "
                "VALUES (CAST(:u AS uuid), CAST(:t AS uuid), :e, :n) "
                "ON CONFLICT (user_id, topic_id) DO UPDATE SET ewa=EXCLUDED.ewa, n=EXCLUDED.n"
            ), {"u": user_id, "t": topic_id, "e": ewa, "n": n})
        await s.commit()


@pytest.mark.asyncio
async def test_readiness_scoped_average(client, monkeypatch):
    user = str(uuid.uuid4())
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    await _seed(user, [(a, 0.8, 3), (b, 0.0, 1)])  # global avg 0.4; exam-a avg 0.8

    async def fake_resolve(exam_id, *, clock=None):
        return {a}
    monkeypatch.setattr(analytics_routes, "resolve_exam_topic_ids", fake_resolve)

    r = await client.get(f"/analytics/readiness-band/{user}?exam_id=11111111-1111-1111-1111-111111111111")
    assert r.json()["readiness_score"] == pytest.approx(0.8, abs=1e-3)

    r2 = await client.get(f"/analytics/readiness-band/{user}")
    assert r2.json()["readiness_score"] == pytest.approx(0.4, abs=1e-3)
