"""note-image upload kind — presign key layout, MIME guard, owner-scoped sign."""
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
        {"sub": user_id, "role": role, "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret, algorithm="HS256",
    )
    return {"authorization": f"Bearer {tok}"}


def test_presign_note_image_returns_user_scoped_key(client: TestClient) -> None:
    uid = str(uuid4())
    r = client.post("/uploads/presign", headers=_auth(uid),
                    json={"kind": "note-image", "content_type": "image/png"})
    assert r.status_code == 200, r.text
    key = r.json()["object_key"]
    assert key.startswith(f"note-images/{uid}/")
    assert key.endswith(".png")


def test_presign_note_image_rejects_non_image(client: TestClient) -> None:
    r = client.post("/uploads/presign", headers=_auth(str(uuid4())),
                    json={"kind": "note-image", "content_type": "application/pdf"})
    assert r.status_code == 415


def test_sign_note_image_owner_only(client: TestClient) -> None:
    owner, other = str(uuid4()), str(uuid4())
    key = f"note-images/{owner}/{uuid4().hex}.png"
    # Owner may request a signed GET URL (object need not exist to be signed).
    ok = client.get(f"/uploads/sign?key={key}", headers=_auth(owner))
    assert ok.status_code == 200
    # A different user may not.
    no = client.get(f"/uploads/sign?key={key}", headers=_auth(other))
    assert no.status_code == 403


def test_sign_note_image_admin_cannot_read_others(client: TestClient) -> None:
    # note-images are private by design — even PLATFORM_ADMIN must not bypass
    # owner scoping, unlike other upload kinds where admins get a pass.
    owner, admin = str(uuid4()), str(uuid4())
    key = f"note-images/{owner}/{uuid4().hex}.png"
    r = client.get(f"/uploads/sign?key={key}", headers=_auth(admin, "PLATFORM_ADMIN"))
    assert r.status_code == 403
