"""Study Materials hub aggregation — /by-exam tree + /watch-summary rollup.

Inserts a throwaway exam → subject → topic into catalog_schema (cleaned up in
teardown — catalog isn't truncated by the content conftest), pins resources,
records view events, and asserts the grouped tree + watch aggregation.
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
from learning.main import app


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def _auth(user_id: str, role: str) -> dict[str, str]:
    tok = jwt.encode(
        {"sub": user_id, "role": role, "token_type": "access", "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret,
        algorithm="HS256",
    )
    return {"authorization": f"Bearer {tok}"}


def _presign_doc(client: TestClient, user_id: str, role: str, topic_id: str) -> tuple[str, str]:
    r = client.post(
        "/uploads/presign",
        headers=_auth(user_id, role),
        json={"kind": "study-material", "content_type": "application/pdf", "topic_id": topic_id},
    )
    assert r.status_code == 200, r.text
    return r.json()["object_key"], r.json()["upload_claim"]


async def _insert_catalog(exam_id: str, subject_id: str, topic_id: str) -> None:
    conn = await asyncpg.connect(
        host="localhost", port=35432, user="postgres",
        password="postgres", database="learning_test",  # noqa: S106
    )
    try:
        await conn.execute(
            "INSERT INTO catalog_schema.exams (id, code, name) VALUES ($1, $2, $3)",
            exam_id, f"E-{exam_id[:8]}", "Test Exam",
        )
        await conn.execute(
            "INSERT INTO catalog_schema.subjects (id, exam_id, code, name, sort_order) "
            "VALUES ($1, $2, $3, $4, 0)",
            subject_id, exam_id, "PHY", "Physics",
        )
        await conn.execute(
            "INSERT INTO catalog_schema.topics (id, subject_id, code, title, sort_order) "
            "VALUES ($1, $2, $3, $4, 0)",
            topic_id, subject_id, "ROT", "Rotational Motion",
        )
    finally:
        await conn.close()


async def _cleanup_catalog(exam_id: str, subject_id: str, topic_id: str) -> None:
    conn = await asyncpg.connect(
        host="localhost", port=35432, user="postgres",
        password="postgres", database="learning_test",  # noqa: S106
    )
    try:
        await conn.execute("DELETE FROM catalog_schema.topics WHERE id = $1", topic_id)
        await conn.execute("DELETE FROM catalog_schema.subjects WHERE id = $1", subject_id)
        await conn.execute("DELETE FROM catalog_schema.exams WHERE id = $1", exam_id)
    finally:
        await conn.close()


@pytest.fixture()
def exam_tree() -> Iterator[tuple[str, str, str]]:
    exam_id, subject_id, topic_id = str(uuid4()), str(uuid4()), str(uuid4())
    asyncio.run(_insert_catalog(exam_id, subject_id, topic_id))
    yield exam_id, subject_id, topic_id
    asyncio.run(_cleanup_catalog(exam_id, subject_id, topic_id))


def test_by_exam_groups_subject_topic_with_counts(
    client: TestClient, exam_tree: tuple[str, str, str]
) -> None:
    exam_id, _subject_id, topic_id = exam_tree
    mod = str(uuid4())
    # A published video + a published document on the topic.
    client.post(
        "/content/resources",
        headers=_auth(mod, "MODERATOR"),
        json={
            "topic_id": topic_id,
            "resource_type": "youtube_video",
            "external_id": "abc123",
            "url": "https://youtu.be/abc123",
            "title": "Torque basics",
            "duration_seconds": 120,
        },
    )
    doc_key, doc_claim = _presign_doc(client, mod, "MODERATOR", topic_id)
    client.post(
        "/content/resources",
        headers=_auth(mod, "MODERATOR"),
        json={
            "topic_id": topic_id,
            "resource_type": "document",
            "title": "Formula sheet",
            "doc_object_key": doc_key,
            "doc_mime_type": "application/pdf",
            "upload_claim": doc_claim,
        },
    )

    r = client.get(f"/content/resources/by-exam/{exam_id}", headers=_auth(mod, "MODERATOR"))
    assert r.status_code == 200, r.text
    tree = r.json()
    assert tree["exam_id"] == exam_id
    assert len(tree["subjects"]) == 1
    subj = tree["subjects"][0]
    assert subj["subject_name"] == "Physics"
    assert len(subj["topics"]) == 1
    topic = subj["topics"][0]
    assert topic["topic_title"] == "Rotational Motion"
    assert len(topic["resources"]) == 2
    assert topic["counts"].get("video") == 1
    assert topic["counts"].get("document") == 1


def test_watch_summary_aggregates_position_and_minutes(
    client: TestClient, exam_tree: tuple[str, str, str]
) -> None:
    exam_id, _subject_id, topic_id = exam_tree
    mod = str(uuid4())
    student = str(uuid4())

    vid = client.post(
        "/content/resources",
        headers=_auth(mod, "MODERATOR"),
        json={
            "topic_id": topic_id,
            "resource_type": "youtube_video",
            "external_id": "abc123",
            "url": "https://youtu.be/abc123",
            "title": "Torque basics",
            "duration_seconds": 120,
        },
    ).json()
    rid = vid["id"]

    for etype, pos in [("started", 0), ("50pct", 60), ("completed", 120)]:
        v = client.post(
            f"/content/resources/{rid}/view",
            headers=_auth(student, "STUDENT"),
            json={"event_type": etype, "position_seconds": pos},
        )
        assert v.status_code == 204, v.text

    r = client.get(
        f"/content/resources/watch-summary?exam_id={exam_id}",
        headers=_auth(student, "STUDENT"),
    )
    assert r.status_code == 200, r.text
    summary = r.json()
    pr = summary["perResource"][rid]
    assert pr["furthestPositionSeconds"] == 120
    assert pr["resumePositionSeconds"] == 120
    assert pr["furthestPercent"] == 100
    assert pr["watched"] is True

    pt = summary["perTopic"][topic_id]
    assert pt["minutesWatched"] == 2  # 120s / 60
    assert pt["resourcesWatched"] == 1
    assert pt["resourcesCompleted"] == 1


def test_watch_summary_internal_variant(
    client: TestClient, exam_tree: tuple[str, str, str]
) -> None:
    exam_id, _subject_id, topic_id = exam_tree
    mod = str(uuid4())
    student = str(uuid4())
    vid = client.post(
        "/content/resources",
        headers=_auth(mod, "MODERATOR"),
        json={
            "topic_id": topic_id,
            "resource_type": "youtube_video",
            "external_id": "x",
            "url": "https://youtu.be/x",
            "title": "V",
            "duration_seconds": 100,
        },
    ).json()
    client.post(
        f"/content/resources/{vid['id']}/view",
        headers=_auth(student, "STUDENT"),
        json={"event_type": "completed", "position_seconds": 100},
    )
    # Internal variant takes user_id as a query param (service-to-service)
    # and requires the shared internal-service token.
    internal_hdr = {"x-internal-token": settings.internal_service_token}
    r = client.get(
        f"/content/resources/watch-summary/internal?exam_id={exam_id}&user_id={student}",
        headers=internal_hdr,
    )
    assert r.status_code == 200, r.text
    assert r.json()["perTopic"][topic_id]["resourcesCompleted"] == 1

    # Without the token the endpoint must reject (anti-IDOR).
    r401 = client.get(
        f"/content/resources/watch-summary/internal?exam_id={exam_id}&user_id={student}"
    )
    assert r401.status_code == 401
