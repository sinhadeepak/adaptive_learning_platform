"""Refund flow — booking refund + course-purchase refund."""

from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta, timezone

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


def _provision_completed_booking(tutor_id: str, student_id: str, admin_token: str) -> str:
    """Drive a booking to COMPLETED. Returns booking_id."""
    tutor_token = _token(tutor_id, role="TEACHER")
    student_token = _token(student_id, role="STUDENT")
    body = {
        "displayName": "T", "headline": "H", "bio": "",
        "hourlyRatePaise": 50000, "qualifications": [],
        "availability": [{"dayOfWeek": d, "startMinute": 0, "endMinute": 1440} for d in range(7)],
        "topicIds": [],
    }
    with TestClient(app) as client:
        client.post("/marketplace/tutors/apply", json=body, headers={"Authorization": f"Bearer {tutor_token}"})
        client.post("/marketplace/tutors/me/kyc/start", headers={"Authorization": f"Bearer {tutor_token}"})
        client.post("/marketplace/tutors/me/kyc/poll", headers={"Authorization": f"Bearer {tutor_token}"})
        client.post(f"/marketplace/admin/tutors/{tutor_id}/approve", headers={"Authorization": f"Bearer {admin_token}"})
        client.post("/marketplace/tutors/me/activate", headers={"Authorization": f"Bearer {tutor_token}"})
        slot = (datetime.now(timezone.utc) + timedelta(hours=48)).replace(minute=0, second=0, microsecond=0)
        r = client.post(
            "/marketplace/bookings",
            json={"tutorUserId": tutor_id, "slotStart": slot.isoformat(), "slotEnd": (slot + timedelta(hours=1)).isoformat()},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        booking_id = r.json()["id"]
        client.post(f"/marketplace/bookings/{booking_id}/confirm-payment", json={}, headers={"Authorization": f"Bearer {student_token}"})
        client.post(f"/marketplace/bookings/{booking_id}/start", headers={"Authorization": f"Bearer {tutor_token}"})
        client.post(f"/marketplace/bookings/{booking_id}/complete", headers={"Authorization": f"Bearer {tutor_token}"})
    return booking_id


def test_admin_refunds_completed_booking() -> None:
    tutor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    booking_id = _provision_completed_booking(tutor_id, student_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/admin/bookings/{booking_id}/refund",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "REFUNDED_BY_ADMIN"

        # Booking now shows REFUNDED in get
        r = client.get(
            f"/marketplace/bookings/{booking_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.json()["status"] == "REFUNDED_BY_ADMIN"


def test_cannot_refund_pending_booking() -> None:
    tutor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    student_token = _token(student_id, role="STUDENT")
    tutor_token = _token(tutor_id, role="TEACHER")

    with TestClient(app) as client:
        body = {
            "displayName": "T", "headline": "H", "bio": "",
            "hourlyRatePaise": 50000, "qualifications": [],
            "availability": [{"dayOfWeek": d, "startMinute": 0, "endMinute": 1440} for d in range(7)],
            "topicIds": [],
        }
        client.post("/marketplace/tutors/apply", json=body, headers={"Authorization": f"Bearer {tutor_token}"})
        client.post("/marketplace/tutors/me/kyc/start", headers={"Authorization": f"Bearer {tutor_token}"})
        client.post("/marketplace/tutors/me/kyc/poll", headers={"Authorization": f"Bearer {tutor_token}"})
        client.post(f"/marketplace/admin/tutors/{tutor_id}/approve", headers={"Authorization": f"Bearer {admin_token}"})
        client.post("/marketplace/tutors/me/activate", headers={"Authorization": f"Bearer {tutor_token}"})
        slot = (datetime.now(timezone.utc) + timedelta(hours=48)).replace(minute=0, second=0, microsecond=0)
        r = client.post(
            "/marketplace/bookings",
            json={"tutorUserId": tutor_id, "slotStart": slot.isoformat(), "slotEnd": (slot + timedelta(hours=1)).isoformat()},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        booking_id = r.json()["id"]
        # Don't confirm — booking is PENDING_PAYMENT
        r = client.post(
            f"/marketplace/admin/bookings/{booking_id}/refund",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 409


def test_admin_refunds_paid_course_purchase() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())
    admin_token = _token(admin_id, role="PLATFORM_ADMIN")
    creator_token = _token(creator_id, role="TEACHER")
    student_token = _token(student_id, role="STUDENT")

    with TestClient(app) as client:
        client.post("/marketplace/creators/apply", json={"displayName": "X", "headline": "Y", "bio": ""}, headers={"Authorization": f"Bearer {creator_token}"})
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
        # Refund
        r = client.post(
            f"/marketplace/admin/courses/{course_id}/purchases/{purchase_id}/refund",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "REFUNDED"


def test_refund_fails_when_stripe_fails() -> None:
    tutor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    booking_id = _provision_completed_booking(tutor_id, student_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/admin/bookings/{booking_id}/refund?forceFailure=true",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 502
        # Booking state unchanged
        r = client.get(
            f"/marketplace/bookings/{booking_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.json()["status"] == "COMPLETED"
