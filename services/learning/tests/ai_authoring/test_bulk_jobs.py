"""Async + chunked bulk question generation — enqueue, chunked worker, poll.

POST /content/ai/bulk-draft-job enqueues and returns 202 + jobId; a
BackgroundTask generates the drafts in chunks (draft_question mocked here);
the author polls GET /content/ai/bulk-draft-job/{id} and /bulk-draft-jobs.
Under TestClient the background task runs synchronously after the response.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Iterator
from uuid import uuid4

import asyncpg
import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from learning.ai_authoring import routes as aa_routes
from learning.ai_authoring.routes import router as ai_authoring_router
from learning.content.config import settings

PREFIX = "/content/ai"


async def _truncate_jobs() -> None:
    conn = await asyncpg.connect(
        host="localhost", port=35432, user="postgres",
        password="postgres", database="learning_test",  # noqa: S106
    )
    try:
        await conn.execute("TRUNCATE content_schema.ai_generation_jobs")
    finally:
        await conn.close()


@pytest.fixture(autouse=True)
def _clean_jobs() -> Iterator[None]:
    # Reset the cached content DB engine so each test's TestClient builds its
    # own on its own event loop (asyncpg is not cross-loop safe).
    from learning.content import db as content_db

    asyncio.run(_truncate_jobs())
    content_db._engine = None
    content_db._sessionmaker = None
    yield
    content_db._engine = None
    content_db._sessionmaker = None


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    # Mock the per-item generation so we exercise the job/chunking, not the
    # gateway. Each call returns a tiny draft + no marker.
    async def _fake_draft_question(_gateway, *, request, creator_id, engine):  # noqa: ANN001, ANN002, ARG001
        return ({"stem": f"Q about {request.topic}"}, None)

    monkeypatch.setattr(aa_routes, "draft_question", _fake_draft_question)

    app = FastAPI()
    app.include_router(ai_authoring_router)
    app.state.ai_gateway = object()  # non-None so get_gateway doesn't 503
    with TestClient(app) as c:
        yield c


def _token(user_id: str, role: str = "TEACHER") -> str:
    return jwt.encode(
        {"sub": user_id, "role": role, "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret, algorithm="HS256",
    )


def _auth(user_id: str) -> dict[str, str]:
    return {"authorization": f"Bearer {_token(user_id)}"}


def _body(count: int = 30) -> dict:
    return {"type_id": "MCQ_SINGLE", "topic": "Newton's Laws", "count": count,
            "difficulty": "MEDIUM", "exam": "JEE-MAIN"}


def test_bulk_job_enqueues_and_returns_job_id(client: TestClient) -> None:
    resp = client.post(f"{PREFIX}/bulk-draft-job", headers=_auth(str(uuid4())), json=_body(30))
    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "pending"
    assert data["jobId"]


def test_bulk_job_generates_all_items_across_chunks(client: TestClient) -> None:
    """30 drafts span multiple 12-item chunks — all 30 must land in output."""
    admin = str(uuid4())
    job_id = client.post(
        f"{PREFIX}/bulk-draft-job", headers=_auth(admin), json=_body(30)
    ).json()["jobId"]

    got = client.get(f"{PREFIX}/bulk-draft-job/{job_id}", headers=_auth(admin))
    assert got.status_code == 200
    data = got.json()
    assert data["status"] == "succeeded"
    result = data["result"]
    assert result["requested"] == 30
    assert result["succeeded"] == 30
    assert len(result["items"]) == 30


def test_bulk_job_serializes_marker_datetime(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Real drafts carry an AIDraftMarker with a datetime — the job output
    must JSON-serialize it instead of failing."""
    from datetime import datetime, timezone

    from learning.ai_authoring.draft import AIDraftMarker

    async def _with_marker(_gw, *, request, creator_id, engine):  # noqa: ANN001, ANN002, ARG001
        marker = AIDraftMarker(
            original_payload={"stem": "x"},
            prompt_template_id="mcq_single_draft",
            prompt_template_version="1.0.0",
            model="stub",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        return ({"stem": f"Q {request.topic}"}, marker)

    monkeypatch.setattr(aa_routes, "draft_question", _with_marker)
    admin = str(uuid4())
    job_id = client.post(
        f"{PREFIX}/bulk-draft-job", headers=_auth(admin), json=_body(3)
    ).json()["jobId"]
    data = client.get(f"{PREFIX}/bulk-draft-job/{job_id}", headers=_auth(admin)).json()
    assert data["status"] == "succeeded"
    assert len(data["result"]["items"]) == 3
    assert data["result"]["items"][0]["marker"]["model"] == "stub"


def test_bulk_job_retries_transient_item_failure(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A transient draft failure is retried, not recorded as a dead item."""
    calls = {"n": 0}

    async def _flaky(_gw, *, request, creator_id, engine):  # noqa: ANN001, ANN002, ARG001
        calls["n"] += 1
        if calls["n"] == 1:  # first item's first attempt fails, retry succeeds
            raise RuntimeError("transient blip")
        return ({"stem": f"Q {request.topic}"}, None)

    monkeypatch.setattr(aa_routes, "draft_question", _flaky)
    admin = str(uuid4())
    job_id = client.post(
        f"{PREFIX}/bulk-draft-job", headers=_auth(admin), json=_body(3)
    ).json()["jobId"]
    data = client.get(f"{PREFIX}/bulk-draft-job/{job_id}", headers=_auth(admin)).json()
    assert data["status"] == "succeeded"
    assert data["result"]["succeeded"] == 3  # the retried item counts as success


async def _insert_pending(
    job_id: str, requested_by: str, *, created_min_ago: int, heartbeat_min_ago: int | None
) -> None:
    import json as _json

    conn = await asyncpg.connect(
        host="localhost", port=35432, user="postgres",
        password="postgres", database="learning_test",  # noqa: S106
    )
    try:
        output = None
        if heartbeat_min_ago is not None:
            import datetime as _dt

            hb = (
                _dt.datetime.now(tz=_dt.timezone.utc) - _dt.timedelta(minutes=heartbeat_min_ago)
            ).isoformat()
            output = _json.dumps(
                {"items": [], "requested": 50, "succeeded": 0,
                 "progress": {"done": 12, "total": 50}, "heartbeat": hb}
            )
        await conn.execute(
            """
            INSERT INTO content_schema.ai_generation_jobs
              (id, prompt_template_id, prompt_version, model, status,
               requested_by, request_input, output, created_at)
            VALUES ($1,'bulk_questions','1.0.0','pending','pending',$2,
                    '{"topic":"X","count":50}'::jsonb,
                    $3::jsonb, now() - make_interval(mins => $4))
            """,
            job_id, requested_by, output, created_min_ago,
        )
    finally:
        await conn.close()


def test_progressing_job_is_not_falsely_timed_out(client: TestClient) -> None:
    """Old job (created 60m ago) but heart-beating now → still pending, not
    timed out. Progress-based liveness."""
    admin = str(uuid4())
    job_id = str(uuid4())
    asyncio.run(_insert_pending(job_id, admin, created_min_ago=60, heartbeat_min_ago=1))
    data = client.get(f"{PREFIX}/bulk-draft-job/{job_id}", headers=_auth(admin)).json()
    assert data["status"] == "pending"
    assert data["progress"]["done"] == 12


def test_stalled_job_is_marked_failed(client: TestClient) -> None:
    """No progress (heartbeat) for longer than the cutoff → failed."""
    admin = str(uuid4())
    job_id = str(uuid4())
    asyncio.run(_insert_pending(job_id, admin, created_min_ago=60, heartbeat_min_ago=40))
    data = client.get(f"{PREFIX}/bulk-draft-job/{job_id}", headers=_auth(admin)).json()
    assert data["status"] == "failed"


def test_bulk_job_count_capped_at_300(client: TestClient) -> None:
    resp = client.post(f"{PREFIX}/bulk-draft-job", headers=_auth(str(uuid4())), json=_body(5000))
    assert resp.status_code == 422  # validation rejects > 300


def test_bulk_job_scoped_to_requester(client: TestClient) -> None:
    owner, other = str(uuid4()), str(uuid4())
    job_id = client.post(
        f"{PREFIX}/bulk-draft-job", headers=_auth(owner), json=_body(12)
    ).json()["jobId"]
    resp = client.get(f"{PREFIX}/bulk-draft-job/{job_id}", headers=_auth(other))
    assert resp.status_code == 404


def test_list_bulk_jobs_returns_only_mine(client: TestClient) -> None:
    me, other = str(uuid4()), str(uuid4())
    client.post(f"{PREFIX}/bulk-draft-job", headers=_auth(me), json=_body(12))
    client.post(f"{PREFIX}/bulk-draft-job", headers=_auth(other), json=_body(12))
    listing = client.get(f"{PREFIX}/bulk-draft-jobs", headers=_auth(me)).json()
    assert len(listing["jobs"]) == 1
    assert listing["jobs"][0]["topic"] == "Newton's Laws"
    assert listing["jobs"][0]["count"] == 12
