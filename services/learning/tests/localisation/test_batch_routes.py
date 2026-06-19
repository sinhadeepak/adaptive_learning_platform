"""Tests for translation batch HTTP routes (Task 6).

Gateway-in-tests note (for Task 7):
  Under ASGITransport the lifespan is NOT run, so app.state.ai_gateway is
  unset (AttributeError) or None. The _gateway() dependency raises 503 when
  it finds None. We patch app.state.ai_gateway to a sentinel object before
  each test that exercises a POST /batches happy-path so the dependency
  resolves; it is restored afterwards. The 400 (bad-lang) check fires BEFORE
  _gateway() is called (language validation is first in create_batch), so
  that sub-test never needs a real gateway.
"""

import pytest
from unittest.mock import MagicMock
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from learning.content.db import sessionmaker as content_sessionmaker
from learning.main import app


async def _seed_question(qid):
    async with content_sessionmaker()() as s:
        await s.execute(text("""
            INSERT INTO content_schema.questions
              (id, topic_id, stem, choices, correct_idx, language, status, created_by, question_type)
            VALUES (:id, :id, 'Q stem', '["a","b"]'::jsonb, 0, 'en', 'PUBLISHED', :id, 'MCQ_SINGLE')
            ON CONFLICT (id) DO NOTHING
        """), {"id": qid})
        await s.commit()


@pytest.mark.asyncio
async def test_create_batch_returns_id_and_validates_langs(admin_headers):
    q = "00000000-0000-0000-0000-0000000c0001"
    await _seed_question(q)
    # Provide a stub gateway so _gateway() doesn't 503. The test only
    # asserts on batch creation, not on actual translation output.
    stub_gateway = MagicMock()
    app.state.ai_gateway = stub_gateway
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://t") as c:
            # Unknown language rejected — fires before gateway check.
            bad = await c.post("/localisation/batches", headers=admin_headers,
                               json={"questionIds": [q], "targetLangs": ["zz"]})
            assert bad.status_code == 400
            # Valid batch accepted.
            r = await c.post("/localisation/batches", headers=admin_headers,
                             json={"questionIds": [q], "targetLangs": ["hi"]})
            assert r.status_code == 200
            bid = r.json()["batchId"]
            g = await c.get(f"/localisation/batches/{bid}", headers=admin_headers)
            assert g.status_code == 200
            assert g.json()["batch"]["totalTasks"] == 1
    finally:
        app.state.ai_gateway = None


@pytest.mark.asyncio
async def test_batch_routes_require_admin():
    """POST /localisation/batches without admin auth must return 401 or 403."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/localisation/batches",
                         json={"questionIds": ["00000000-0000-0000-0000-0000000c0001"],
                               "targetLangs": ["hi"]})
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_batches(admin_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/localisation/batches", headers=admin_headers)
    assert r.status_code == 200
    assert "batches" in r.json()


@pytest.mark.asyncio
async def test_get_batch_not_found(admin_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/localisation/batches/00000000-0000-0000-0000-000000000000",
                        headers=admin_headers)
    assert r.status_code == 404
