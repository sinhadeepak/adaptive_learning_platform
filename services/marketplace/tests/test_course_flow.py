"""Integration test: creator apply → KYC → admin approve → activate →
create course → submit for review → admin approve → student purchase
→ confirm payment → student rates the course.

Marker: integration. Default `pytest` skips."""

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
            "iat": now,
            "exp": now + 3600,
            "token_type": "access",
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def _provision_active_creator(creator_id: str, admin_token: str) -> None:
    token = _token(creator_id, role="TEACHER")
    with TestClient(app) as client:
        client.post(
            "/marketplace/creators/apply",
            json={
                "displayName": "Test Creator",
                "headline": "Smoke",
                "bio": "",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        client.post(
            "/marketplace/creators/me/kyc/start",
            headers={"Authorization": f"Bearer {token}"},
        )
        client.post(
            "/marketplace/creators/me/kyc/poll",
            headers={"Authorization": f"Bearer {token}"},
        )
        client.post(
            f"/marketplace/admin/creators/{creator_id}/approve",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        client.post(
            "/marketplace/creators/me/activate",
            headers={"Authorization": f"Bearer {token}"},
        )


def test_creator_full_flow() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())

    creator_token = _token(creator_id, role="TEACHER")
    student_token = _token(student_id, role="STUDENT")
    admin_token = _token(admin_id, role="PLATFORM_ADMIN")

    _provision_active_creator(creator_id, admin_token)

    with TestClient(app) as client:
        # 1. Creator drafts a course
        r = client.post(
            "/marketplace/courses",
            json={
                "title": "Mastering JEE Mechanics",
                "description": "8-week deep dive on Newtonian dynamics",
                "contentMd": "# Lesson 1\nBegin with first principles...",
                "pricePaise": 49900,
                "tier": "STANDARD",
                "topicIds": [],
            },
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.status_code == 201, r.text
        course = r.json()
        course_id = course["id"]
        assert course["status"] == "DRAFT"

        # 2. Submit for review
        r = client.post(
            f"/marketplace/courses/{course_id}/submit-for-review",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.json()["status"] == "PENDING_REVIEW"

        # 3. Admin approves
        r = client.post(
            f"/marketplace/admin/courses/{course_id}/approve",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.json()["status"] == "PUBLISHED"
        assert r.json()["publishedAt"] is not None

        # 4. Student lists & buys
        r = client.get("/marketplace/courses")
        assert any(c["id"] == course_id for c in r.json()["items"])

        r = client.post(
            f"/marketplace/courses/{course_id}/purchase",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 201
        purchase = r.json()
        assert purchase["status"] == "PENDING_PAYMENT"
        assert purchase["pricePaise"] == 49900
        assert purchase["commissionPaise"] == 7485  # 15%
        purchase_id = purchase["id"]

        # 5. Confirm payment via stub
        r = client.post(
            f"/marketplace/courses/{course_id}/purchase/{purchase_id}/confirm-payment",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "PAID"

        # 6. Student can now access full course content
        r = client.get(
            f"/marketplace/purchases/me/{course_id}/access",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 200
        assert r.json()["contentMd"].startswith("# Lesson 1")

        # 7. Student rates the course
        r = client.post(
            f"/marketplace/courses/{course_id}/rating",
            json={"purchaseId": purchase_id, "stars": 5, "comment": "Excellent"},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 201

        # 8. Public ratings aggregate
        r = client.get(f"/marketplace/courses/{course_id}/ratings")
        assert r.json()["averageStars"] == 5.0
        assert r.json()["count"] == 1

        # 9. Cannot rate twice
        r = client.post(
            f"/marketplace/courses/{course_id}/rating",
            json={"purchaseId": purchase_id, "stars": 4},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 409


def test_double_purchase_blocked() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    creator_token = _token(creator_id, role="TEACHER")
    student_token = _token(student_id, role="STUDENT")
    _provision_active_creator(creator_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            "/marketplace/courses",
            json={
                "title": "Test", "description": "", "contentMd": "x",
                "pricePaise": 9900, "tier": "STANDARD", "topicIds": [],
            },
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        course_id = r.json()["id"]
        client.post(
            f"/marketplace/courses/{course_id}/submit-for-review",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        client.post(
            f"/marketplace/admin/courses/{course_id}/approve",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        # First purchase
        r = client.post(
            f"/marketplace/courses/{course_id}/purchase",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        purchase_id = r.json()["id"]
        client.post(
            f"/marketplace/courses/{course_id}/purchase/{purchase_id}/confirm-payment",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        # Second purchase attempt
        r = client.post(
            f"/marketplace/courses/{course_id}/purchase",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "already_purchased"


def test_self_purchase_blocked() -> None:
    creator_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    creator_token = _token(creator_id, role="TEACHER")
    _provision_active_creator(creator_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            "/marketplace/courses",
            json={
                "title": "Test", "description": "", "contentMd": "x",
                "pricePaise": 9900, "tier": "STANDARD", "topicIds": [],
            },
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        course_id = r.json()["id"]
        client.post(
            f"/marketplace/courses/{course_id}/submit-for-review",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        client.post(
            f"/marketplace/admin/courses/{course_id}/approve",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        # Creator tries to buy own course
        r = client.post(
            f"/marketplace/courses/{course_id}/purchase",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.status_code == 422
        assert r.json()["detail"]["code"] == "self_purchase"


def test_draft_course_invisible_to_non_creator() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    creator_token = _token(creator_id, role="TEACHER")
    student_token = _token(student_id, role="STUDENT")
    _provision_active_creator(creator_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            "/marketplace/courses",
            json={
                "title": "Draft", "description": "", "contentMd": "secret",
                "pricePaise": 9900, "tier": "STANDARD", "topicIds": [],
            },
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        course_id = r.json()["id"]
        # Public listing doesn't include drafts
        r = client.get("/marketplace/courses")
        assert all(c["id"] != course_id for c in r.json()["items"])
        # Student fetching it directly → 404
        r = client.get(
            f"/marketplace/courses/{course_id}",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 404
        # Creator can fetch own draft
        r = client.get(
            f"/marketplace/courses/{course_id}",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "DRAFT"


def test_cannot_purchase_unpublished() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    creator_token = _token(creator_id, role="TEACHER")
    student_token = _token(student_id, role="STUDENT")
    _provision_active_creator(creator_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            "/marketplace/courses",
            json={
                "title": "Draft", "description": "", "contentMd": "x",
                "pricePaise": 9900, "tier": "STANDARD", "topicIds": [],
            },
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        course_id = r.json()["id"]
        # Try to buy a DRAFT course
        r = client.post(
            f"/marketplace/courses/{course_id}/purchase",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 404
        assert r.json()["detail"]["code"] == "not_purchasable"


def test_cannot_create_course_until_active() -> None:
    """An applied-but-not-approved creator can't create courses."""
    creator_id = str(uuid.uuid4())
    creator_token = _token(creator_id, role="TEACHER")
    with TestClient(app) as client:
        client.post(
            "/marketplace/creators/apply",
            json={"displayName": "x", "headline": "y", "bio": ""},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        r = client.post(
            "/marketplace/courses",
            json={
                "title": "Test", "description": "", "contentMd": "x",
                "pricePaise": 9900, "tier": "STANDARD", "topicIds": [],
            },
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.status_code == 403
        assert r.json()["detail"]["code"] == "creator_not_active"


def test_admin_reject_returns_to_draft() -> None:
    creator_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    creator_token = _token(creator_id, role="TEACHER")
    _provision_active_creator(creator_id, admin_token)
    with TestClient(app) as client:
        r = client.post(
            "/marketplace/courses",
            json={
                "title": "Test", "description": "", "contentMd": "x",
                "pricePaise": 9900, "tier": "STANDARD", "topicIds": [],
            },
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        course_id = r.json()["id"]
        client.post(
            f"/marketplace/courses/{course_id}/submit-for-review",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        r = client.post(
            f"/marketplace/admin/courses/{course_id}/reject",
            json={"reason": "Plagiarised content"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.json()["status"] == "DRAFT"


def test_tutor_session_rating_requires_completed_booking() -> None:
    """Can't rate a booking that isn't COMPLETED."""
    student_id = str(uuid.uuid4())
    student_token = _token(student_id, role="STUDENT")
    fake_booking_id = str(uuid.uuid4())
    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/bookings/{fake_booking_id}/rating",
            json={"stars": 5, "comment": ""},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        # 404 (booking doesn't exist) or 409 — both surface via the FSM
        assert r.status_code in (404, 409)
