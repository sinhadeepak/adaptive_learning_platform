"""Rating moderation: admin can hide / unhide; aggregates exclude hidden."""

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


def _token(user_id: str, *, role: str = "STUDENT") -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": user_id, "role": role,
            "admin_access_level": "PLATFORM" if role == "PLATFORM_ADMIN" else "NONE",
            "tenant_id": None, "iat": now, "exp": now + 3600, "token_type": "access",
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def _provision_paid_course(creator_id: str, student_id: str, admin_token: str) -> tuple[str, str]:
    """Returns (course_id, purchase_id)."""
    creator_token = _token(creator_id, role="TEACHER")
    student_token = _token(student_id, role="STUDENT")
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
        r = client.post(
            f"/marketplace/courses/{course_id}/purchase",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        purchase_id = r.json()["id"]
        client.post(
            f"/marketplace/courses/{course_id}/purchase/{purchase_id}/confirm-payment",
            headers={"Authorization": f"Bearer {student_token}"},
        )
    return course_id, purchase_id


def test_hidden_course_rating_excluded_from_aggregate() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())
    admin_token = _token(admin_id, role="PLATFORM_ADMIN")
    student_token = _token(student_id, role="STUDENT")
    course_id, purchase_id = _provision_paid_course(creator_id, student_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/courses/{course_id}/rating",
            json={"purchaseId": purchase_id, "stars": 1, "comment": "ABUSE"},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        rating_id = r.json()["id"]

        # Aggregate before hide: count=1
        r = client.get(f"/marketplace/courses/{course_id}/ratings")
        assert r.json()["count"] == 1
        assert r.json()["averageStars"] == 1.0

        # Admin hides it
        r = client.post(
            f"/marketplace/admin/ratings/course/{rating_id}/hide",
            json={"reason": "Spam"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 204

        # Aggregate excludes hidden
        r = client.get(f"/marketplace/courses/{course_id}/ratings")
        assert r.json()["count"] == 0
        assert r.json()["averageStars"] == 0.0


def test_unhide_restores_rating() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    student_token = _token(student_id, role="STUDENT")
    course_id, purchase_id = _provision_paid_course(creator_id, student_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/courses/{course_id}/rating",
            json={"purchaseId": purchase_id, "stars": 5, "comment": "wrongly hidden"},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        rating_id = r.json()["id"]
        client.post(
            f"/marketplace/admin/ratings/course/{rating_id}/hide",
            json={"reason": "false positive"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        r = client.post(
            f"/marketplace/admin/ratings/course/{rating_id}/unhide",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 204
        r = client.get(f"/marketplace/courses/{course_id}/ratings")
        assert r.json()["count"] == 1


def test_non_admin_cannot_hide() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    student_token = _token(student_id, role="STUDENT")
    course_id, purchase_id = _provision_paid_course(creator_id, student_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/courses/{course_id}/rating",
            json={"purchaseId": purchase_id, "stars": 3},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        rating_id = r.json()["id"]
        # Student tries to hide
        r = client.post(
            f"/marketplace/admin/ratings/course/{rating_id}/hide",
            json={"reason": "self-edit"},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 403


def test_hide_logged_in_audit() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())
    admin_token = _token(admin_id, role="PLATFORM_ADMIN")
    student_token = _token(student_id, role="STUDENT")
    course_id, purchase_id = _provision_paid_course(creator_id, student_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/courses/{course_id}/rating",
            json={"purchaseId": purchase_id, "stars": 2, "comment": "test"},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        rating_id = r.json()["id"]
        client.post(
            f"/marketplace/admin/ratings/course/{rating_id}/hide",
            json={"reason": "Inappropriate"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # Audit history for the course should now contain the action
        r = client.get(
            f"/marketplace/admin/tutors/{course_id}/actions",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        actions = r.json()["items"]
        assert any(
            a["action"] == "RATING_HIDE" and a["reason"] == "Inappropriate"
            for a in actions
        )
