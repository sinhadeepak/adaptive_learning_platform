"""POST /admin/exam-builder/subjects/topics — synchronous single-subject gen."""
from __future__ import annotations

import time
from collections.abc import Iterator
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from learning.content.config import settings
from learning.exam_builder import routes as eb_routes
from learning.main import app

PREFIX = "/admin/exam-builder"


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    async def _enabled(_session):
        return [{"kind": "claude_code", "model": "sonnet"}]
    monkeypatch.setattr(eb_routes, "_list_enabled", _enabled)
    with TestClient(app) as c:
        yield c


def _auth(role: str) -> dict[str, str]:
    tok = jwt.encode(
        {"sub": str(uuid4()), "role": role, "token_type": "access", "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret, algorithm="HS256",
    )
    return {"authorization": f"Bearer {tok}"}


def _body() -> dict:
    return {
        "code": "TEST_EXAM", "name": "Test Exam", "level": "other",
        "subject": {"code": "SUB_A", "name": "Subject A"}, "existing": [],
    }


def _mock_topics(payload):
    async def _fake(_session, *, system, user, schema_name, schema):
        return payload
    return _fake


def test_requires_admin(client: TestClient) -> None:
    r = client.post(f"{PREFIX}/subjects/topics", headers=_auth("STUDENT"), json=_body())
    assert r.status_code == 403


def test_returns_topics(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(eb_routes, "call_structured", _mock_topics(
        {"topics": [{"code": "T1", "title": "One", "description": None}]}))
    r = client.post(f"{PREFIX}/subjects/topics", headers=_auth("PLATFORM_ADMIN"), json=_body())
    assert r.status_code == 200
    assert [t["code"] for t in r.json()["topics"]] == ["T1"]


def test_503_when_no_provider(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def _none(_session):
        return []
    monkeypatch.setattr(eb_routes, "_list_enabled", _none)
    r = client.post(f"{PREFIX}/subjects/topics", headers=_auth("PLATFORM_ADMIN"), json=_body())
    assert r.status_code == 503
