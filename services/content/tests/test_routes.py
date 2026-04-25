"""End-to-end tests for /content/* — DRAFT → REVIEW → PUBLISHED lifecycle."""

from __future__ import annotations

import time
from collections.abc import Iterator
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from content.config import settings
from content.main import app


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def _token(user_id: str, role: str) -> str:
    return jwt.encode(
        {"sub": user_id, "role": role, "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret,
        algorithm="HS256",
    )


def _auth(user_id: str, role: str) -> dict[str, str]:
    return {"authorization": f"Bearer {_token(user_id, role)}"}


def _new_question_body() -> dict:
    return {
        "topicId": str(uuid4()),
        "stem": "What is 2 + 2 ?",
        "choices": ["3", "4", "5", "22"],
        "correctIdx": 1,
        "difficultyB": 0.0,
        "language": "en",
    }


def test_create_question_requires_teacher_or_above(client: TestClient) -> None:
    student = str(uuid4())
    resp = client.post(
        "/content/questions",
        headers=_auth(student, "STUDENT"),
        json=_new_question_body(),
    )
    assert resp.status_code == 403


def test_create_then_submit_then_review_happy_path(client: TestClient) -> None:
    teacher = str(uuid4())
    moderator = str(uuid4())

    create = client.post(
        "/content/questions", headers=_auth(teacher, "TEACHER"), json=_new_question_body()
    )
    assert create.status_code == 201, create.text
    qid = create.json()["id"]
    assert create.json()["status"] == "DRAFT"

    submit = client.post(f"/content/questions/{qid}/submit", headers=_auth(teacher, "TEACHER"))
    assert submit.status_code == 200
    assert submit.json()["status"] == "REVIEW"

    review = client.post(
        f"/content/questions/{qid}/review",
        headers=_auth(moderator, "MODERATOR"),
        json={"approve": True, "notes": "Looks good."},
    )
    assert review.status_code == 200
    body = review.json()
    assert body["status"] == "PUBLISHED"
    assert body["reviewedBy"] == moderator
    assert body["reviewNotes"] == "Looks good."


def test_correct_idx_out_of_range_rejected(client: TestClient) -> None:
    teacher = str(uuid4())
    body = _new_question_body()
    body["correctIdx"] = 99
    resp = client.post("/content/questions", headers=_auth(teacher, "TEACHER"), json=body)
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_correct_idx"


def test_author_cannot_review_own_question(client: TestClient) -> None:
    teacher_mod = str(uuid4())  # moderator who is also the author
    create = client.post(
        "/content/questions",
        headers=_auth(teacher_mod, "MODERATOR"),
        json=_new_question_body(),
    )
    qid = create.json()["id"]
    client.post(f"/content/questions/{qid}/submit", headers=_auth(teacher_mod, "MODERATOR"))
    review = client.post(
        f"/content/questions/{qid}/review",
        headers=_auth(teacher_mod, "MODERATOR"),
        json={"approve": True},
    )
    assert review.status_code == 403


def test_reject_path(client: TestClient) -> None:
    teacher = str(uuid4())
    moderator = str(uuid4())
    create = client.post(
        "/content/questions", headers=_auth(teacher, "TEACHER"), json=_new_question_body()
    )
    qid = create.json()["id"]
    client.post(f"/content/questions/{qid}/submit", headers=_auth(teacher, "TEACHER"))
    review = client.post(
        f"/content/questions/{qid}/review",
        headers=_auth(moderator, "MODERATOR"),
        json={"approve": False, "notes": "stem unclear"},
    )
    assert review.status_code == 200
    assert review.json()["status"] == "REJECTED"


def test_list_mine_vs_all_scope(client: TestClient) -> None:
    teacher_a = str(uuid4())
    teacher_b = str(uuid4())
    moderator = str(uuid4())

    client.post(
        "/content/questions", headers=_auth(teacher_a, "TEACHER"), json=_new_question_body()
    )
    client.post(
        "/content/questions", headers=_auth(teacher_b, "TEACHER"), json=_new_question_body()
    )

    mine = client.get("/content/questions", headers=_auth(teacher_a, "TEACHER"))
    assert mine.status_code == 200
    items = mine.json()["items"]
    assert len(items) == 1
    assert items[0]["createdBy"] == teacher_a

    forbidden = client.get("/content/questions?scope=all", headers=_auth(teacher_a, "TEACHER"))
    assert forbidden.status_code == 403

    all_for_mod = client.get("/content/questions?scope=all", headers=_auth(moderator, "MODERATOR"))
    assert all_for_mod.status_code == 200
    assert len(all_for_mod.json()["items"]) == 2


def test_get_single_visibility_rules(client: TestClient) -> None:
    teacher = str(uuid4())
    other = str(uuid4())
    moderator = str(uuid4())
    create = client.post(
        "/content/questions", headers=_auth(teacher, "TEACHER"), json=_new_question_body()
    )
    qid = create.json()["id"]

    own = client.get(f"/content/questions/{qid}", headers=_auth(teacher, "TEACHER"))
    assert own.status_code == 200

    forbidden = client.get(f"/content/questions/{qid}", headers=_auth(other, "TEACHER"))
    assert forbidden.status_code == 403

    by_mod = client.get(f"/content/questions/{qid}", headers=_auth(moderator, "MODERATOR"))
    assert by_mod.status_code == 200


def test_unauthenticated_request_rejected(client: TestClient) -> None:
    resp = client.post("/content/questions", json=_new_question_body())
    assert resp.status_code == 401
