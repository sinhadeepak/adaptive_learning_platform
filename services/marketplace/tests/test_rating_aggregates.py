"""Sprint 21: rating aggregate cache.

Verifies that rating_avg + rating_count on tutor_profiles + courses are
maintained correctly across insert / hide / unhide, and that the listing
endpoints serve from the cached columns.
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


def _provision_paid_course(
    creator_id: str, student_id: str, admin_token: str, *, price_paise: int = 9900
) -> tuple[str, str]:
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
            json={"title": "T", "description": "D", "contentMd": "x", "pricePaise": price_paise, "tier": "STANDARD", "topicIds": []},
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


def _provision_completed_booking(tutor_id: str, student_id: str, admin_token: str) -> str:
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


def test_course_rating_cache_increments_on_insert() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    student_token = _token(student_id, role="STUDENT")
    course_id, purchase_id = _provision_paid_course(creator_id, student_id, admin_token)

    with TestClient(app) as client:
        # Listing pre-rating: cache reads 0 / 0
        r = client.get(f"/marketplace/courses?creatorId={creator_id}")
        items = r.json()["items"]
        assert items[0]["ratingAvg"] == 0.0
        assert items[0]["ratingCount"] == 0

        # Submit a 4-star rating
        client.post(
            f"/marketplace/courses/{course_id}/rating",
            json={"purchaseId": purchase_id, "stars": 4, "comment": "ok"},
            headers={"Authorization": f"Bearer {student_token}"},
        )

        # Listing now reflects the cached aggregate
        r = client.get(f"/marketplace/courses?creatorId={creator_id}")
        items = r.json()["items"]
        assert items[0]["ratingCount"] == 1
        assert items[0]["ratingAvg"] == 4.0


def test_course_rating_cache_excludes_hidden() -> None:
    creator_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    student_token = _token(student_id, role="STUDENT")
    course_id, purchase_id = _provision_paid_course(creator_id, student_id, admin_token)

    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/courses/{course_id}/rating",
            json={"purchaseId": purchase_id, "stars": 1, "comment": "abuse"},
            headers={"Authorization": f"Bearer {student_token}"},
        )
        rating_id = r.json()["id"]

        # Hide the rating
        client.post(
            f"/marketplace/admin/ratings/course/{rating_id}/hide",
            json={"reason": "Spam"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        # Cache excludes hidden
        r = client.get(f"/marketplace/courses?creatorId={creator_id}")
        items = r.json()["items"]
        assert items[0]["ratingCount"] == 0
        assert items[0]["ratingAvg"] == 0.0

        # Unhide restores
        client.post(
            f"/marketplace/admin/ratings/course/{rating_id}/unhide",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        r = client.get(f"/marketplace/courses?creatorId={creator_id}")
        items = r.json()["items"]
        assert items[0]["ratingCount"] == 1
        assert items[0]["ratingAvg"] == 1.0


def test_tutor_rating_cache_in_listing() -> None:
    tutor_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    student_token = _token(student_id, role="STUDENT")
    booking_id = _provision_completed_booking(tutor_id, student_id, admin_token)

    with TestClient(app) as client:
        # Submit a 5-star rating against the tutor session
        client.post(
            f"/marketplace/bookings/{booking_id}/rating",
            json={"stars": 5, "comment": "great"},
            headers={"Authorization": f"Bearer {student_token}"},
        )

        # Listing endpoint reflects the cached aggregate
        r = client.get("/marketplace/tutors")
        items = [it for it in r.json()["items"] if it["userId"] == tutor_id]
        assert len(items) == 1
        assert items[0]["ratingCount"] == 1
        assert items[0]["ratingAvg"] == 5.0
