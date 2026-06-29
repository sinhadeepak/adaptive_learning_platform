"""study-material upload kind — object key shape + presign/finalize/sign.

boto3 presigning is a pure-crypto operation (no network), so the presign and
sign endpoints are exercised directly. finalize's head_object hits MinIO, so
it is monkeypatched here.
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
from learning.storage import object_key


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def _auth(user_id: str, role: str) -> dict[str, str]:
    tok = jwt.encode(
        {"sub": user_id, "role": role, "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret,
        algorithm="HS256",
    )
    return {"authorization": f"Bearer {tok}"}


def test_object_key_study_material_shape() -> None:
    key = object_key(
        "study-material", extension="pdf", tenant_id="t1", topic_id="topic-9"
    )
    assert key.startswith("study-materials/t1/topic-9/")
    assert key.endswith(".pdf")


def test_object_key_study_material_requires_scope() -> None:
    with pytest.raises(ValueError):
        object_key("study-material", extension="pdf", tenant_id="t1")


def test_presign_study_material_pdf(client: TestClient) -> None:
    r = client.post(
        "/uploads/presign",
        headers=_auth(str(uuid4()), "STUDENT"),
        json={
            "kind": "study-material",
            "content_type": "application/pdf",
            "topic_id": str(uuid4()),
            "original_name": "formula-sheet.pdf",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["object_key"].startswith("study-materials/")
    assert body["object_key"].endswith(".pdf")
    assert body["method"] == "PUT"
    assert body["url"].startswith("http")


def test_presign_rejects_unsupported_mime(client: TestClient) -> None:
    r = client.post(
        "/uploads/presign",
        headers=_auth(str(uuid4()), "STUDENT"),
        json={
            "kind": "study-material",
            "content_type": "application/x-msdownload",
            "topic_id": str(uuid4()),
        },
    )
    assert r.status_code == 415


def test_presign_missing_topic_id(client: TestClient) -> None:
    r = client.post(
        "/uploads/presign",
        headers=_auth(str(uuid4()), "STUDENT"),
        json={"kind": "study-material", "content_type": "application/pdf"},
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "missing_parent_id"


def test_sign_get_study_material(client: TestClient) -> None:
    key = f"study-materials/default/{uuid4()}/{uuid4().hex}.pdf"
    r = client.get(
        f"/uploads/sign?key={key}", headers=_auth(str(uuid4()), "STUDENT")
    )
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("http")


def test_finalize_study_material(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    key = f"study-materials/default/{uuid4()}/{uuid4().hex}.pdf"
    monkeypatch.setattr(
        "learning.storage.routes.head_object",
        lambda k: {
            "size": 100_000,
            "content_type": "application/pdf",
            "original_name": "sheet.pdf",
            "etag": "abc",
        },
    )
    r = client.post(
        "/uploads/finalize",
        headers=_auth(str(uuid4()), "STUDENT"),
        json={"object_key": key},
    )
    assert r.status_code == 200, r.text
    assert r.json()["size"] == 100_000
