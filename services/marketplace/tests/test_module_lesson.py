"""Module + lesson CRUD + course-structure access gating."""

from __future__ import annotations

import os
import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient

from marketplace.main import app

pytestmark = pytest.mark.integration

JWT_SECRET = os.environ.get(
    "MARKETPLACE_JWT_SECRET",
    "dev-only-change-me-in-staging-at-least-32-bytes-long",
)


def _token(user_id: str, *, role: str = "TEACHER") -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": user_id,
            "role": role,
            "admin_access_level": "PLATFORM" if role == "PLATFORM_ADMIN" else "NONE",
            "tenant_id": None,
            "iat": now, "exp": now + 3600, "token_type": "access",
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def _provision_published_course(creator_id: str, admin_token: str) -> str:
    creator_token = _token(creator_id, role="TEACHER")
    with TestClient(app) as client:
        client.post(
            "/marketplace/creators/apply",
            json={"displayName": "X", "headline": "Y", "bio": ""},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        client.post("/marketplace/creators/me/kyc/start", headers={"Authorization": f"Bearer {creator_token}"})
        client.post("/marketplace/creators/me/kyc/poll", headers={"Authorization": f"Bearer {creator_token}"})
        client.post(f"/marketplace/admin/creators/{creator_id}/approve", headers={"Authorization": f"Bearer {admin_token}"})
        client.post("/marketplace/creators/me/activate", headers={"Authorization": f"Bearer {creator_token}"})
        r = client.post(
            "/marketplace/courses",
            json={"title": "T", "description": "", "contentMd": "x", "pricePaise": 9900, "tier": "STANDARD", "topicIds": []},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        course_id = r.json()["id"]
        client.post(f"/marketplace/courses/{course_id}/submit-for-review", headers={"Authorization": f"Bearer {creator_token}"})
        client.post(f"/marketplace/admin/courses/{course_id}/approve", headers={"Authorization": f"Bearer {admin_token}"})
    return course_id


def test_module_lesson_crud() -> None:
    creator_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    creator_token = _token(creator_id, role="TEACHER")
    course_id = _provision_published_course(creator_id, admin_token)

    with TestClient(app) as client:
        # Create module
        r = client.post(
            f"/marketplace/courses/{course_id}/modules",
            json={"title": "Module 1", "description": "Intro"},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.status_code == 201
        m = r.json()
        assert m["position"] == 1
        module_id = m["id"]

        # Create lesson
        r = client.post(
            f"/marketplace/courses/{course_id}/modules/{module_id}/lessons",
            json={"title": "Lesson 1.1", "contentMd": "# Hello", "durationSeconds": 600},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.status_code == 201
        lesson_id = r.json()["id"]
        assert r.json()["position"] == 1

        # Patch lesson
        r = client.patch(
            f"/marketplace/courses/{course_id}/modules/{module_id}/lessons/{lesson_id}",
            json={"contentMd": "# Updated"},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.json()["contentMd"] == "# Updated"

        # Add second module + lesson; verify auto-position
        r = client.post(
            f"/marketplace/courses/{course_id}/modules",
            json={"title": "Module 2"},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.json()["position"] == 2


def test_structure_redacts_content_for_non_buyers() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    creator_token = _token(creator_id, role="TEACHER")
    student_token = _token(student_id, role="STUDENT")
    course_id = _provision_published_course(creator_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/courses/{course_id}/modules",
            json={"title": "M1"},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        module_id = r.json()["id"]
        client.post(
            f"/marketplace/courses/{course_id}/modules/{module_id}/lessons",
            json={"title": "L1", "contentMd": "SECRET CONTENT"},
            headers={"Authorization": f"Bearer {creator_token}"},
        )

        # Non-buyer student → content redacted
        r = client.get(
            f"/marketplace/courses/{course_id}/structure",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 200
        assert r.json()["contentVisible"] is False
        for item in r.json()["items"]:
            for le in item["lessons"]:
                assert le["contentMd"] == ""

        # Creator → content visible
        r = client.get(
            f"/marketplace/courses/{course_id}/structure",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.json()["contentVisible"] is True
        assert any(
            le["contentMd"] == "SECRET CONTENT"
            for it in r.json()["items"]
            for le in it["lessons"]
        )


def test_structure_visible_after_purchase() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    creator_token = _token(creator_id, role="TEACHER")
    student_token = _token(student_id, role="STUDENT")
    course_id = _provision_published_course(creator_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/courses/{course_id}/modules",
            json={"title": "M1"},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        module_id = r.json()["id"]
        client.post(
            f"/marketplace/courses/{course_id}/modules/{module_id}/lessons",
            json={"title": "L1", "contentMd": "REAL"},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        # Purchase
        r = client.post(
            f"/marketplace/courses/{course_id}/purchase",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        purchase_id = r.json()["id"]
        client.post(
            f"/marketplace/courses/{course_id}/purchase/{purchase_id}/confirm-payment",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        # Now content visible
        r = client.get(
            f"/marketplace/courses/{course_id}/structure",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.json()["contentVisible"] is True
        assert any(
            le["contentMd"] == "REAL"
            for it in r.json()["items"]
            for le in it["lessons"]
        )


def test_only_creator_can_modify_modules() -> None:
    creator_id = str(uuid.uuid4())
    other_user = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    course_id = _provision_published_course(creator_id, admin_token)

    other_token = _token(other_user, role="TEACHER")
    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/courses/{course_id}/modules",
            json={"title": "Hijack"},
            headers={"Authorization": f"Bearer {other_token}"},
        )
        assert r.status_code == 403


def test_module_delete_cascades_lessons() -> None:
    creator_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    creator_token = _token(creator_id, role="TEACHER")
    course_id = _provision_published_course(creator_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/courses/{course_id}/modules",
            json={"title": "M"},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        module_id = r.json()["id"]
        client.post(
            f"/marketplace/courses/{course_id}/modules/{module_id}/lessons",
            json={"title": "L", "contentMd": "x"},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        r = client.delete(
            f"/marketplace/courses/{course_id}/modules/{module_id}",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.status_code == 204

        # Structure now empty
        r = client.get(
            f"/marketplace/courses/{course_id}/structure",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.json()["items"] == []


def test_lesson_position_auto_increments() -> None:
    creator_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    creator_token = _token(creator_id, role="TEACHER")
    course_id = _provision_published_course(creator_id, admin_token)

    with TestClient(app) as client:
        m = client.post(
            f"/marketplace/courses/{course_id}/modules",
            json={"title": "M"},
            headers={"Authorization": f"Bearer {creator_token}"},
        ).json()
        positions = []
        for i in range(3):
            r = client.post(
                f"/marketplace/courses/{course_id}/modules/{m['id']}/lessons",
                json={"title": f"L{i}", "contentMd": "x"},
                headers={"Authorization": f"Bearer {creator_token}"},
            )
            positions.append(r.json()["position"])
        assert positions == [1, 2, 3]
