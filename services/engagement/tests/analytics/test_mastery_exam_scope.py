import uuid
import pytest
from sqlalchemy import text

from engagement.analytics import db, routes as analytics_routes


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
    r = await client.get(f"/analytics/mastery/{user}?exam_id=11111111-1111-1111-1111-111111111111")
    ids = {t["topicId"] for t in r.json()["topics"]}
    assert ids == {in_topic}

    # unscoped → both (back-compat)
    r2 = await client.get(f"/analytics/mastery/{user}")
    ids2 = {t["topicId"] for t in r2.json()["topics"]}
    assert ids2 == {in_topic, out_topic}
