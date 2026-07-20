"""Document (PDF) resource type — create, role gating, and moderation.

The Study Materials hub adds resource_type='document'. Documents reuse the
existing concept_resources lifecycle (DRAFT → IN_REVIEW → PUBLISHED), so the
submit/review/visibility handlers need no document-specific code; these tests
lock that in.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from learning.content.config import settings
from learning.main import app


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def _token(user_id: str, role: str) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "role": role,
            "token_type": "access",
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


def _auth(user_id: str, role: str) -> dict[str, str]:
    return {"authorization": f"Bearer {_token(user_id, role)}"}


def _presign_doc(client: TestClient, user_id: str, role: str, topic_id: str) -> tuple[str, str]:
    """Presign a study-material upload → (object_key, upload_claim)."""
    r = client.post(
        "/uploads/presign",
        headers=_auth(user_id, role),
        json={
            "kind": "study-material",
            "content_type": "application/pdf",
            "topic_id": topic_id,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return body["object_key"], body["upload_claim"]


def _doc_body(client: TestClient, user_id: str, role: str, **over: object) -> dict:
    topic_id = str(over.pop("topic_id", uuid4()))
    object_key, claim = _presign_doc(client, user_id, role, topic_id)
    body = {
        "topic_id": topic_id,
        "resource_type": "document",
        "title": "Rotational Motion — formula sheet",
        "doc_object_key": object_key,
        "doc_mime_type": "application/pdf",
        "doc_size_bytes": 248_000,
        "upload_claim": claim,
        "language": "en",
    }
    body.update(over)
    return body


def test_student_can_create_document_draft(client: TestClient) -> None:
    student = str(uuid4())
    r = client.post(
        "/content/resources",
        headers=_auth(student, "STUDENT"),
        json=_doc_body(client, student, "STUDENT"),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["resource_type"] == "document"
    assert body["status"] == "DRAFT"
    # url is filled from doc_object_key so list/detail projections keep working.
    assert body["url"] == body["doc_object_key"]
    assert body["doc_mime_type"] == "application/pdf"
    assert body["doc_size_bytes"] == 248_000


def test_document_rejects_missing_claim(client: TestClient) -> None:
    student = str(uuid4())
    body = _doc_body(client, student, "STUDENT")
    body.pop("upload_claim")
    r = client.post("/content/resources", headers=_auth(student, "STUDENT"), json=body)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "invalid_upload_claim"


def test_document_claim_bound_to_uploader(client: TestClient) -> None:
    # A claim minted for user A can't be redeemed by user B (IDOR guard).
    user_a = str(uuid4())
    user_b = str(uuid4())
    body = _doc_body(client, user_a, "STUDENT")  # claim is for user_a
    r = client.post("/content/resources", headers=_auth(user_b, "STUDENT"), json=body)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "invalid_upload_claim"


def test_student_cannot_create_non_document(client: TestClient) -> None:
    student = str(uuid4())
    r = client.post(
        "/content/resources",
        headers=_auth(student, "STUDENT"),
        json={
            "topic_id": str(uuid4()),
            "resource_type": "url",
            "url": "https://example.com/notes",
            "title": "Some link",
        },
    )
    assert r.status_code == 403


def test_document_requires_object_key(client: TestClient) -> None:
    teacher = str(uuid4())
    r = client.post(
        "/content/resources",
        headers=_auth(teacher, "TEACHER"),
        json=_doc_body(client, teacher, "TEACHER", doc_object_key=None),
    )
    assert r.status_code == 422  # pydantic validator rejects


def test_moderator_document_is_published_immediately(client: TestClient) -> None:
    mod = str(uuid4())
    r = client.post(
        "/content/resources",
        headers=_auth(mod, "MODERATOR"),
        json=_doc_body(client, mod, "MODERATOR"),
    )
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "PUBLISHED"


def test_document_lifecycle_draft_submit_review(client: TestClient) -> None:
    student = str(uuid4())
    mod = str(uuid4())

    create = client.post(
        "/content/resources",
        headers=_auth(student, "STUDENT"),
        json=_doc_body(client, student, "STUDENT"),
    )
    assert create.status_code == 201, create.text
    rid = create.json()["id"]

    submit = client.post(f"/content/resources/{rid}/submit", headers=_auth(student, "STUDENT"))
    assert submit.status_code == 200
    assert submit.json()["status"] == "IN_REVIEW"

    review = client.post(
        f"/content/resources/{rid}/review",
        headers=_auth(mod, "MODERATOR"),
        json={"approve": True, "notes": "Clear sheet."},
    )
    assert review.status_code == 200
    assert review.json()["status"] == "PUBLISHED"

    # Now a different student sees it via the published (student-scope) list.
    other = str(uuid4())
    topic_id = create.json()["topic_id"]
    listed = client.get(
        f"/content/resources?topic_id={topic_id}&scope=student",
        headers=_auth(other, "STUDENT"),
    )
    assert listed.status_code == 200
    ids = [it["id"] for it in listed.json()["items"]]
    assert rid in ids


def test_unpublished_document_hidden_from_other_students(client: TestClient) -> None:
    author = str(uuid4())
    create = client.post(
        "/content/resources",
        headers=_auth(author, "STUDENT"),
        json=_doc_body(client, author, "STUDENT"),
    )
    rid = create.json()["id"]
    topic_id = create.json()["topic_id"]

    other = str(uuid4())
    listed = client.get(
        f"/content/resources?topic_id={topic_id}&scope=student",
        headers=_auth(other, "STUDENT"),
    )
    assert listed.status_code == 200
    assert rid not in [it["id"] for it in listed.json()["items"]]
