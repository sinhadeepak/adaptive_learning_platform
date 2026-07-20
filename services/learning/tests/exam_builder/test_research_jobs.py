"""Async exam-builder research — enqueue + poll + per-admin scoping.

The research flow is a background job: POST enqueues and returns 202 with a
jobId; a BackgroundTask runs the chunked generation (mocked here); the admin
polls GET /research/{jobId} and GET /research/jobs. Under TestClient the
background task runs synchronously after the response, so a job is already
'succeeded' by the time .post() returns.
"""

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


# ── Fixtures ─────────────────────────────────────────────────────────


async def _truncate_jobs() -> None:
    conn = await asyncpg.connect(
        host="localhost",
        port=35432,
        user="postgres",
        password="postgres",
        database="learning_test",
    )
    try:
        await conn.execute("TRUNCATE content_schema.ai_generation_jobs")
    finally:
        await conn.close()


@pytest.fixture(autouse=True)
def _clean_jobs() -> Iterator[None]:
    asyncio.run(_truncate_jobs())
    yield


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    # A provider is "enabled" so POST doesn't 503.
    async def _enabled(_session) -> list[dict]:
        return [{"kind": "claude_code", "model": "sonnet"}]

    monkeypatch.setattr(eb_routes, "_list_enabled", _enabled)
    with TestClient(app) as c:
        yield c


def _mock_call_structured(*, skeleton: dict | None, topics: dict | None):
    """Return a fake provider chain that answers skeleton vs topics calls
    by schema_name. None simulates total provider failure."""

    async def _fake(_session, *, system, user, schema_name, schema):
        if schema_name == "exam_skeleton":
            return skeleton
        if schema_name == "subject_topics":
            return topics
        return None

    return _fake


def _two_subject_skeleton() -> dict:
    return {
        "code": "TEST_EXAM",
        "name": "Test Exam",
        "subtitle": None,
        "pools": [],
        "subjects": [
            {
                "code": "SUB_A",
                "name": "Subject A",
                "description": None,
                "is_mandatory": True,
                "pool_code": None,
            },
            {
                "code": "SUB_B",
                "name": "Subject B",
                "description": None,
                "is_mandatory": True,
                "pool_code": None,
            },
        ],
        "notes": None,
    }


def _topics() -> dict:
    return {
        "topics": [
            {"code": "T1", "title": "Topic One", "description": None},
            {"code": "T2", "title": "Topic Two", "description": None},
        ]
    }


def _token(user_id: str, role: str) -> str:
    return jwt.encode(
        {"sub": user_id, "role": role, "token_type": "access", "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret,
        algorithm="HS256",
    )


def _auth(user_id: str, role: str) -> dict[str, str]:
    return {"authorization": f"Bearer {_token(user_id, role)}"}


def _body() -> dict:
    return {"code": "TEST_EXAM", "name": "Test Exam", "level": "other"}


# ── Tests ────────────────────────────────────────────────────────────


def test_research_requires_admin(client: TestClient) -> None:
    resp = client.post(f"{PREFIX}/research", headers=_auth(str(uuid4()), "STUDENT"), json=_body())
    assert resp.status_code == 403


def test_research_enqueues_and_returns_job_id(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        eb_routes,
        "call_structured",
        _mock_call_structured(skeleton=_two_subject_skeleton(), topics=_topics()),
    )
    resp = client.post(
        f"{PREFIX}/research", headers=_auth(str(uuid4()), "PLATFORM_ADMIN"), json=_body()
    )
    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "pending"
    assert data["jobId"]


def test_research_job_succeeds_with_full_proposal(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        eb_routes,
        "call_structured",
        _mock_call_structured(skeleton=_two_subject_skeleton(), topics=_topics()),
    )
    admin = str(uuid4())
    job_id = client.post(
        f"{PREFIX}/research", headers=_auth(admin, "PLATFORM_ADMIN"), json=_body()
    ).json()["jobId"]

    # Background task has run by now (TestClient).
    got = client.get(f"{PREFIX}/research/{job_id}", headers=_auth(admin, "PLATFORM_ADMIN"))
    assert got.status_code == 200
    data = got.json()
    assert data["status"] == "succeeded"
    proposal = data["result"]
    assert proposal["code"] == "TEST_EXAM"
    assert len(proposal["subjects"]) == 2
    assert all(len(s["topics"]) == 2 for s in proposal["subjects"])


def test_research_job_fails_when_provider_returns_nothing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        eb_routes,
        "call_structured",
        _mock_call_structured(skeleton=None, topics=None),
    )
    admin = str(uuid4())
    job_id = client.post(
        f"{PREFIX}/research", headers=_auth(admin, "PLATFORM_ADMIN"), json=_body()
    ).json()["jobId"]

    data = client.get(f"{PREFIX}/research/{job_id}", headers=_auth(admin, "PLATFORM_ADMIN")).json()
    assert data["status"] == "failed"
    assert data["error"]


def test_research_no_provider_enabled_returns_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _none(_session) -> list[dict]:
        return []

    monkeypatch.setattr(eb_routes, "_list_enabled", _none)
    resp = client.post(
        f"{PREFIX}/research", headers=_auth(str(uuid4()), "PLATFORM_ADMIN"), json=_body()
    )
    assert resp.status_code == 503


def test_get_job_is_scoped_to_requesting_admin(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        eb_routes,
        "call_structured",
        _mock_call_structured(skeleton=_two_subject_skeleton(), topics=_topics()),
    )
    owner, other = str(uuid4()), str(uuid4())
    job_id = client.post(
        f"{PREFIX}/research", headers=_auth(owner, "PLATFORM_ADMIN"), json=_body()
    ).json()["jobId"]

    # A different admin cannot read someone else's research job.
    resp = client.get(f"{PREFIX}/research/{job_id}", headers=_auth(other, "PLATFORM_ADMIN"))
    assert resp.status_code == 404


def test_list_jobs_returns_only_my_jobs(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        eb_routes,
        "call_structured",
        _mock_call_structured(skeleton=_two_subject_skeleton(), topics=_topics()),
    )
    me, other = str(uuid4()), str(uuid4())
    client.post(f"{PREFIX}/research", headers=_auth(me, "PLATFORM_ADMIN"), json=_body())
    client.post(f"{PREFIX}/research", headers=_auth(other, "PLATFORM_ADMIN"), json=_body())

    listing = client.get(f"{PREFIX}/research/jobs", headers=_auth(me, "PLATFORM_ADMIN")).json()
    jobs = listing["jobs"]
    assert len(jobs) == 1
    assert jobs[0]["examCode"] == "TEST_EXAM"
    assert jobs[0]["status"] == "succeeded"


def test_optional_subject_without_pool_is_coerced_not_failed(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An AI skeleton with an optional subject that has no pool shouldn't nuke
    the whole job — coerce it to mandatory so the admin can re-pool in review."""
    skeleton = {
        "code": "TEST_EXAM",
        "name": "Test Exam",
        "subtitle": None,
        "pools": [],
        "subjects": [
            {"code": "SUB_A", "name": "Subject A", "description": None,
             "is_mandatory": True, "pool_code": None},
            {"code": "SUB_OPT", "name": "Orphan Optional", "description": None,
             "is_mandatory": False, "pool_code": None},
        ],
        "notes": None,
    }
    monkeypatch.setattr(
        eb_routes, "call_structured",
        _mock_call_structured(skeleton=skeleton, topics=_topics()),
    )
    admin = str(uuid4())
    job_id = client.post(
        f"{PREFIX}/research", headers=_auth(admin, "PLATFORM_ADMIN"), json=_body()
    ).json()["jobId"]
    data = client.get(f"{PREFIX}/research/{job_id}", headers=_auth(admin, "PLATFORM_ADMIN")).json()
    assert data["status"] == "succeeded"
    opt = next(s for s in data["result"]["subjects"] if s["code"] == "SUB_OPT")
    assert opt["is_mandatory"] is True
    assert opt["pool_code"] is None


def test_reanalyze_delta_feeds_existing_structure_into_prompts(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When `existing` is supplied, the skeleton prompt carries the current
    subject codes and each matching subject's topics prompt carries its
    current topic codes — so the AI preserves codes and the diff is clean."""
    calls: list[tuple[str, str]] = []

    async def _rec(_session, *, system, user, schema_name, schema):  # noqa: ANN001, ANN002, ARG001
        calls.append((schema_name, user))
        return _two_subject_skeleton() if schema_name == "exam_skeleton" else _topics()

    monkeypatch.setattr(eb_routes, "call_structured", _rec)
    body = {
        "code": "TEST_EXAM",
        "name": "Test Exam",
        "level": "other",
        "existing": {
            "subjects": [
                {
                    "code": "SUB_A",
                    "name": "Subject A",
                    "topics": [{"code": "OLD_TOPIC", "title": "Old Topic"}],
                }
            ]
        },
    }
    resp = client.post(f"{PREFIX}/research", headers=_auth(str(uuid4()), "PLATFORM_ADMIN"), json=body)
    assert resp.status_code == 202

    skeleton_prompt = next(u for (sn, u) in calls if sn == "exam_skeleton")
    assert "SUB_A" in skeleton_prompt  # current subject seeded into skeleton

    sub_a_topic_prompts = [u for (sn, u) in calls if sn == "subject_topics" and "SUB_A" in u]
    assert sub_a_topic_prompts, "expected a topics call for SUB_A"
    assert any("OLD_TOPIC" in u for u in sub_a_topic_prompts)  # current topics seeded
