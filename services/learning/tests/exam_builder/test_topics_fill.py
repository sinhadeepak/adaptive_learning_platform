"""Async bulk fill-empty: 202 + poll + per-subject partial failure."""
from __future__ import annotations

import asyncio
import time
from collections.abc import Iterator
from uuid import uuid4

import asyncpg
import jwt
import pytest
from fastapi.testclient import TestClient

from learning.content.config import settings
from learning.exam_builder import routes as eb_routes
from learning.main import app

PREFIX = "/admin/exam-builder"


@pytest.fixture(autouse=True)
def _clean() -> Iterator[None]:
    async def _t() -> None:
        c = await asyncpg.connect(host="localhost", port=35432, user="postgres",
                                  password="postgres", database="learning_test")
        try:
            await c.execute("TRUNCATE content_schema.ai_generation_jobs")
        finally:
            await c.close()
    asyncio.run(_t())
    yield


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    async def _enabled(_session):
        return [{"kind": "claude_code", "model": "sonnet"}]
    monkeypatch.setattr(eb_routes, "_list_enabled", _enabled)
    with TestClient(app) as c:
        yield c


def _auth(uid: str, role: str) -> dict[str, str]:
    tok = jwt.encode(
        {"sub": uid, "role": role, "token_type": "access", "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret, algorithm="HS256")
    return {"authorization": f"Bearer {tok}"}


def _body() -> dict:
    return {
        "code": "TEST_EXAM", "name": "Test Exam", "level": "other",
        "subjects": [
            {"code": "SUB_A", "name": "Subject A", "existing": []},
            {"code": "SUB_B", "name": "Subject B", "existing": []},
        ],
    }


def test_requires_admin(client: TestClient) -> None:
    r = client.post(f"{PREFIX}/topics/fill-empty", headers=_auth(str(uuid4()), "STUDENT"), json=_body())
    assert r.status_code == 403


def test_partial_failure(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # SUB_B's call returns None → that subject records an error; SUB_A succeeds.
    async def _fake(_session, *, system, user, schema_name, schema):
        if "code SUB_B" in user:
            return None
        return {"topics": [{"code": "T1", "title": "One", "description": None}]}
    monkeypatch.setattr(eb_routes, "call_structured", _fake)
    admin = str(uuid4())
    jid = client.post(f"{PREFIX}/topics/fill-empty", headers=_auth(admin, "PLATFORM_ADMIN"), json=_body())
    assert jid.status_code == 202
    job_id = jid.json()["jobId"]
    got = client.get(f"{PREFIX}/topics/fill-empty/{job_id}", headers=_auth(admin, "PLATFORM_ADMIN")).json()
    assert got["status"] == "succeeded"
    by_code = {s["code"]: s for s in got["result"]["subjects"]}
    assert [t["code"] for t in by_code["SUB_A"]["topics"]] == ["T1"]
    assert by_code["SUB_B"]["error"]
    assert by_code["SUB_B"]["topics"] == []
