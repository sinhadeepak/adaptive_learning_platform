"""Per-exam student notebook — owner-scoped CRUD + caps."""
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


def _auth(user_id: str, role: str = "STUDENT") -> dict[str, str]:
    tok = jwt.encode(
        {"sub": user_id, "role": role, "token_type": "access", "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret, algorithm="HS256",
    )
    return {"authorization": f"Bearer {tok}"}


def _create(client: TestClient, uid: str, exam_id: str, title: str = "My note") -> dict:
    r = client.post("/content/notes", headers=_auth(uid), json={"exam_id": exam_id, "title": title})
    assert r.status_code == 201, r.text
    return r.json()


def test_create_get_update_delete_happy_path(client: TestClient) -> None:
    uid, exam = str(uuid4()), str(uuid4())
    note = _create(client, uid, exam)
    nid = note["id"]
    assert note["title"] == "My note"
    assert note["exam_id"] == exam

    got = client.get(f"/content/notes/{nid}", headers=_auth(uid))
    assert got.status_code == 200
    assert got.json()["id"] == nid

    body = {"type": "doc", "content": [{"type": "paragraph"}]}
    upd = client.put(f"/content/notes/{nid}", headers=_auth(uid),
                     json={"title": "Renamed", "body": body})
    assert upd.status_code == 200
    assert upd.json()["title"] == "Renamed"
    assert upd.json()["body"] == body

    dl = client.delete(f"/content/notes/{nid}", headers=_auth(uid))
    assert dl.status_code == 204
    assert client.get(f"/content/notes/{nid}", headers=_auth(uid)).status_code == 404


def test_list_is_scoped_to_user_and_exam(client: TestClient) -> None:
    uid, other = str(uuid4()), str(uuid4())
    exam_a, exam_b = str(uuid4()), str(uuid4())
    _create(client, uid, exam_a, "A1")
    _create(client, uid, exam_a, "A2")
    _create(client, uid, exam_b, "B1")
    _create(client, other, exam_a, "OTHER")

    listing = client.get(f"/content/notes?exam_id={exam_a}", headers=_auth(uid))
    assert listing.status_code == 200
    titles = {n["title"] for n in listing.json()}
    assert titles == {"A1", "A2"}  # not exam_b, not other-user's


def test_cannot_access_others_note(client: TestClient) -> None:
    owner, attacker = str(uuid4()), str(uuid4())
    nid = _create(client, owner, str(uuid4()))["id"]
    assert client.get(f"/content/notes/{nid}", headers=_auth(attacker)).status_code == 404
    assert client.put(f"/content/notes/{nid}", headers=_auth(attacker),
                      json={"title": "hax"}).status_code == 404
    assert client.delete(f"/content/notes/{nid}", headers=_auth(attacker)).status_code == 404


def test_unknown_note_404(client: TestClient) -> None:
    assert client.get(f"/content/notes/{uuid4()}", headers=_auth(str(uuid4()))).status_code == 404


def test_title_too_long_422(client: TestClient) -> None:
    uid = str(uuid4())
    nid = _create(client, uid, str(uuid4()))["id"]
    r = client.put(f"/content/notes/{nid}", headers=_auth(uid), json={"title": "x" * 201})
    assert r.status_code == 422


def test_body_too_large_422(client: TestClient) -> None:
    uid = str(uuid4())
    nid = _create(client, uid, str(uuid4()))["id"]
    big = {"type": "doc", "content": [{"type": "paragraph",
            "content": [{"type": "text", "text": "x" * 300_000}]}]}
    r = client.put(f"/content/notes/{nid}", headers=_auth(uid), json={"body": big})
    assert r.status_code == 422


def test_note_cap_per_exam_409(client: TestClient) -> None:
    uid, exam = str(uuid4()), str(uuid4())
    for i in range(100):
        _create(client, uid, exam, f"n{i}")
    r = client.post("/content/notes", headers=_auth(uid), json={"exam_id": exam, "title": "over"})
    assert r.status_code == 409
