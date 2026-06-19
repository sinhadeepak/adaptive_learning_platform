import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from learning.content import events
from learning.content.db import sessionmaker as content_sessionmaker
from learning.main import app


class _FakeJS:
    def __init__(self): self.calls = []
    async def publish(self, subject, data):
        import json
        self.calls.append((subject, json.loads(data.decode())))


@pytest.mark.asyncio
async def test_backfill_emits_for_published(admin_headers, monkeypatch):
    qid = "00000000-0000-0000-0000-0000000f0001"
    async with content_sessionmaker()() as s:
        await s.execute(text("""
            INSERT INTO content_schema.questions
              (id, topic_id, stem, choices, correct_idx, language, status, created_by, question_type)
            VALUES (:id,:id,'S','["a"]'::jsonb,0,'en','PUBLISHED',:id,'MCQ_SINGLE')
            ON CONFLICT (id) DO NOTHING
        """), {"id": qid})
        await s.execute(text("""
            INSERT INTO content_schema.content_artifact_translations
              (artifact_id, language, payload_translation, status, version)
            VALUES (:id,'hi','{"stem":"HI"}'::jsonb,'PUBLISHED',1)
            ON CONFLICT (artifact_id, language) DO UPDATE SET status='PUBLISHED'
        """), {"id": qid})
        await s.commit()
    fake = _FakeJS()
    monkeypatch.setattr(events, "_js", fake)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/localisation/translations/backfill", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["emitted"] >= 1
    assert any(p["question_id"] == qid and p["language"] == "hi" for _, p in fake.calls)


@pytest.mark.asyncio
async def test_backfill_requires_admin():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/localisation/translations/backfill")
    assert r.status_code in (401, 403)
