"""Integration test for the booking flow + admin moderation queue.

Full flow: provision an ACTIVE tutor (re-using the apply→KYC→approve→
activate sequence from S16), create a booking as a student, confirm
payment via stub, tutor starts + completes, listing reflects state.

Also covers admin moderation queue + audit history.

Marker: integration. Default `pytest` skips.
"""

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


def _provision_active_tutor(tutor_id: str, admin_token: str) -> None:
    tutor_token = _token(tutor_id, role="TEACHER")
    body = {
        "displayName": "Test Tutor",
        "headline": "Smoke",
        "bio": "",
        "hourlyRatePaise": 50000,  # ₹500/hr
        "qualifications": [],
        # 9am-6pm everyday so any slot lands inside availability
        "availability": [
            {"dayOfWeek": d, "startMinute": 540, "endMinute": 1080}
            for d in range(7)
        ],
        "topicIds": [],
    }
    with TestClient(app) as client:
        r = client.post(
            "/marketplace/tutors/apply",
            json=body,
            headers={"Authorization": f"Bearer {tutor_token}"},
        )
        assert r.status_code == 201, r.text
        client.post(
            "/marketplace/tutors/me/kyc/start",
            headers={"Authorization": f"Bearer {tutor_token}"},
        )
        client.post(
            "/marketplace/tutors/me/kyc/poll",
            headers={"Authorization": f"Bearer {tutor_token}"},
        )
        r = client.post(
            f"/marketplace/admin/tutors/{tutor_id}/approve",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        client.post(
            "/marketplace/tutors/me/activate",
            headers={"Authorization": f"Bearer {tutor_token}"},
        )


def _slot(hours_from_now: int = 48, duration_min: int = 60) -> tuple[str, str]:
    start = datetime.now(timezone.utc) + timedelta(hours=hours_from_now)
    return start.isoformat(), (start + timedelta(minutes=duration_min)).isoformat()


def test_full_booking_flow() -> None:
    tutor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())

    admin_token = _token(admin_id, role="PLATFORM_ADMIN")
    _provision_active_tutor(tutor_id, admin_token)

    student_token = _token(student_id, role="STUDENT")
    tutor_token = _token(tutor_id, role="TEACHER")

    slot_start, slot_end = _slot()

    with TestClient(app) as client:
        # 1. Student creates booking
        r = client.post(
            "/marketplace/bookings",
            json={"tutorUserId": tutor_id, "slotStart": slot_start, "slotEnd": slot_end},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 201, r.text
        booking = r.json()
        booking_id = booking["id"]
        assert booking["status"] == "PENDING_PAYMENT"
        assert booking["pricePaise"] == 50000  # 1 hour * ₹500
        assert booking["commissionPaise"] == 7500  # 15%
        assert booking["stripePaymentIntentId"].startswith("pi_test_")

        # 2. Confirm payment (stub returns succeeded)
        r = client.post(
            f"/marketplace/bookings/{booking_id}/confirm-payment",
            json={},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "CONFIRMED"
        assert r.json()["dailyRoomUrl"].startswith("https://example.daily.co/")

        # 3. Tutor starts session
        r = client.post(
            f"/marketplace/bookings/{booking_id}/start",
            headers={"Authorization": f"Bearer {tutor_token}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "IN_PROGRESS"

        # 4. Tutor completes
        r = client.post(
            f"/marketplace/bookings/{booking_id}/complete",
            headers={"Authorization": f"Bearer {tutor_token}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "COMPLETED"

        # 5. Student "my bookings" includes it
        r = client.get(
            "/marketplace/bookings/me",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        items = r.json()["items"]
        assert any(b["id"] == booking_id and b["status"] == "COMPLETED" for b in items)

        # 6. Tutor "my bookings as tutor" includes it
        r = client.get(
            "/marketplace/bookings/me?role=tutor",
            headers={"Authorization": f"Bearer {tutor_token}"},
        )
        items = r.json()["items"]
        assert any(b["id"] == booking_id for b in items)


def test_self_booking_rejected() -> None:
    tutor_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    _provision_active_tutor(tutor_id, admin_token)

    tutor_token = _token(tutor_id, role="TEACHER")
    slot_start, slot_end = _slot()
    with TestClient(app) as client:
        r = client.post(
            "/marketplace/bookings",
            json={"tutorUserId": tutor_id, "slotStart": slot_start, "slotEnd": slot_end},
            headers={"Authorization": f"Bearer {tutor_token}"},
        )
        assert r.status_code == 422
        assert r.json()["detail"]["code"] == "self_booking"


def test_payment_failure_path() -> None:
    tutor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    _provision_active_tutor(tutor_id, admin_token)

    student_token = _token(student_id, role="STUDENT")
    slot_start, slot_end = _slot()
    with TestClient(app) as client:
        r = client.post(
            "/marketplace/bookings",
            json={"tutorUserId": tutor_id, "slotStart": slot_start, "slotEnd": slot_end},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        booking_id = r.json()["id"]
        r = client.post(
            f"/marketplace/bookings/{booking_id}/confirm-payment",
            json={"forceFailure": True},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "CANCELLED_BY_STUDENT"


def test_24h_cancel_rule_for_student() -> None:
    tutor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    _provision_active_tutor(tutor_id, admin_token)

    student_token = _token(student_id, role="STUDENT")
    # Slot 2h from now → student cancellation should be rejected.
    slot_start, slot_end = _slot(hours_from_now=2)
    with TestClient(app) as client:
        r = client.post(
            "/marketplace/bookings",
            json={"tutorUserId": tutor_id, "slotStart": slot_start, "slotEnd": slot_end},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        booking_id = r.json()["id"]
        client.post(
            f"/marketplace/bookings/{booking_id}/confirm-payment",
            json={},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        r = client.post(
            f"/marketplace/bookings/{booking_id}/cancel",
            json={"reason": "changed my mind"},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "cancel_window_closed"


def test_admin_queue_returns_kyc_verified_only() -> None:
    """Two tutors: one fully approved, one stuck at KYC_VERIFIED. Queue
    returns only the second."""
    approved_id = str(uuid.uuid4())
    pending_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")

    # Fully approved + active
    _provision_active_tutor(approved_id, admin_token)

    # Stop at KYC_VERIFIED for the second
    pending_token = _token(pending_id, role="TEACHER")
    with TestClient(app) as client:
        client.post(
            "/marketplace/tutors/apply",
            json={
                "displayName": "Pending Tutor",
                "headline": "Awaiting approval",
                "bio": "",
                "hourlyRatePaise": 30000,
                "qualifications": [],
                "availability": [],
                "topicIds": [],
            },
            headers={"Authorization": f"Bearer {pending_token}"},
        )
        client.post(
            "/marketplace/tutors/me/kyc/start",
            headers={"Authorization": f"Bearer {pending_token}"},
        )
        client.post(
            "/marketplace/tutors/me/kyc/poll",
            headers={"Authorization": f"Bearer {pending_token}"},
        )
        # No admin approve.

        r = client.get(
            "/marketplace/admin/tutors/queue",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        ids = [it["userId"] for it in r.json()["items"]]
        assert pending_id in ids
        assert approved_id not in ids


def test_admin_action_audit_recorded_on_approve_and_reject() -> None:
    tutor_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())
    admin_token = _token(admin_id, role="PLATFORM_ADMIN")

    # Approve flow
    _provision_active_tutor(tutor_id, admin_token)

    with TestClient(app) as client:
        r = client.get(
            f"/marketplace/admin/tutors/{tutor_id}/actions",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        actions = r.json()["items"]
        assert any(
            a["action"] == "APPROVE" and a["adminUserId"] == admin_id for a in actions
        )

    # Reject path on a different tutor
    rejected_id = str(uuid.uuid4())
    rej_token = _token(rejected_id, role="TEACHER")
    with TestClient(app) as client:
        client.post(
            "/marketplace/tutors/apply",
            json={
                "displayName": "Reject Test",
                "headline": "Reject",
                "bio": "",
                "hourlyRatePaise": 30000,
                "qualifications": [],
                "availability": [],
                "topicIds": [],
            },
            headers={"Authorization": f"Bearer {rej_token}"},
        )
        client.post(
            "/marketplace/tutors/me/kyc/start",
            headers={"Authorization": f"Bearer {rej_token}"},
        )
        client.post(
            "/marketplace/tutors/me/kyc/poll",
            headers={"Authorization": f"Bearer {rej_token}"},
        )
        client.post(
            f"/marketplace/admin/tutors/{rejected_id}/reject",
            json={"reason": "Insufficient subject expertise."},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        r = client.get(
            f"/marketplace/admin/tutors/{rejected_id}/actions",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        actions = r.json()["items"]
        assert any(
            a["action"] == "REJECT" and a["reason"] == "Insufficient subject expertise."
            for a in actions
        )


def test_availability_subtracts_bookings() -> None:
    tutor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    _provision_active_tutor(tutor_id, admin_token)

    student_token = _token(student_id, role="STUDENT")

    target = datetime.now(timezone.utc) + timedelta(days=2)
    target = target.replace(hour=0, minute=0, second=0, microsecond=0)
    slot_start = target + timedelta(hours=10)  # 10am
    slot_end = slot_start + timedelta(hours=1)
    date_str = target.strftime("%Y-%m-%d")

    with TestClient(app) as client:
        # Available pre-booking — should include 9am-6pm window
        r = client.get(f"/marketplace/tutors/{tutor_id}/availability?date={date_str}")
        slots_before = r.json()["slots"]
        assert len(slots_before) >= 1

        # Create + confirm a booking
        r = client.post(
            "/marketplace/bookings",
            json={
                "tutorUserId": tutor_id,
                "slotStart": slot_start.isoformat(),
                "slotEnd": slot_end.isoformat(),
            },
            headers={"Authorization": f"Bearer {student_token}"},
        )
        booking_id = r.json()["id"]
        client.post(
            f"/marketplace/bookings/{booking_id}/confirm-payment",
            json={},
            headers={"Authorization": f"Bearer {student_token}"},
        )

        # Availability now should have 9-10am and 11am-6pm — booking carved out
        r = client.get(f"/marketplace/tutors/{tutor_id}/availability?date={date_str}")
        slots_after = r.json()["slots"]
        # The 10-11am hour should not appear in any slot's range.
        for s in slots_after:
            ss = datetime.fromisoformat(s["slotStart"])
            ee = datetime.fromisoformat(s["slotEnd"])
            assert not (ss <= slot_start < ee), f"Booked slot still appears: {s}"
