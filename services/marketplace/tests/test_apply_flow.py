"""End-to-end integration test of the tutor application FSM.

Uses TestClient against the live FastAPI app. Requires Postgres
(marketplace DB) running with migrations applied. Marked `integration`
so default `pytest` skips.
"""

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


def _token(user_id: str, *, role: str = "TEACHER", admin: str = "NONE") -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": user_id,
            "role": role,
            "admin_access_level": admin,
            "tenant_id": None,
            "iat": now,
            "exp": now + 3600,
            "token_type": "access",
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def _apply_body(rate_paise: int = 100000) -> dict:
    return {
        "displayName": "Anika Verma",
        "headline": "JEE Main Physics, 8 yrs",
        "bio": "Mechanics + thermodynamics specialist.",
        "hourlyRatePaise": rate_paise,
        "qualifications": [
            {"kind": "DEGREE", "title": "BTech IIT Bombay", "institution": "IIT Bombay", "yearCompleted": 2017},
            {"kind": "TEACHING_EXPERIENCE", "title": "FIITJEE 5 years", "institution": "FIITJEE"},
        ],
        "availability": [
            {"dayOfWeek": 1, "startMinute": 18 * 60, "endMinute": 21 * 60},
            {"dayOfWeek": 4, "startMinute": 19 * 60, "endMinute": 22 * 60},
        ],
        "topicIds": [
            "33333333-0000-0000-0000-000000000001",  # Mechanics
            "33333333-0000-0000-0000-000000000002",  # Thermodynamics
        ],
    }


def test_full_application_flow() -> None:
    user_id = str(uuid.uuid4())
    token = _token(user_id)
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN", admin="PLATFORM")

    with TestClient(app) as client:
        # 1. Apply
        r = client.post(
            "/marketplace/tutors/apply",
            json=_apply_body(),
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 201, r.text
        assert r.json()["applicationStatus"] == "APPLIED"
        assert len(r.json()["qualifications"]) == 2
        assert len(r.json()["availability"]) == 2

        # 2. Apply again → 409
        r = client.post(
            "/marketplace/tutors/apply",
            json=_apply_body(),
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 409

        # 3. Start KYC
        r = client.post(
            "/marketplace/tutors/me/kyc/start",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text
        session_id = r.json()["sessionId"]
        assert session_id.startswith("vs_test_")

        # 4. Poll KYC (stub returns verified)
        r = client.post(
            "/marketplace/tutors/me/kyc/poll",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "verified"
        assert r.json()["applicationStatus"] == "KYC_VERIFIED"

        # 5. Activate before approval → 409
        r = client.post(
            "/marketplace/tutors/me/activate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 409

        # 6. Admin approves
        r = client.post(
            f"/marketplace/admin/tutors/{user_id}/approve",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["applicationStatus"] == "APPROVED"
        assert r.json()["approvedAt"] is not None

        # 7. Tutor self-activates
        r = client.post(
            "/marketplace/tutors/me/activate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["applicationStatus"] == "ACTIVE"

        # 8. Now appears in public listing
        r = client.get("/marketplace/tutors")
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(it["userId"] == user_id for it in items)

        # 9. Public profile fetch works
        r = client.get(f"/marketplace/tutors/{user_id}")
        assert r.status_code == 200
        assert r.json()["userId"] == user_id


def test_admin_endpoints_reject_non_admin() -> None:
    user_id = str(uuid.uuid4())
    token = _token(user_id, role="TEACHER", admin="NONE")
    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/admin/tutors/{user_id}/approve",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403


def test_listing_filters_by_topic() -> None:
    """Apply two tutors with different topic sets, filter by one topic."""
    a_id = str(uuid.uuid4())
    b_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN", admin="PLATFORM")

    def _provision(uid: str, topic_ids: list[str], rate: int) -> None:
        token = _token(uid)
        body = _apply_body(rate)
        body["topicIds"] = topic_ids
        with TestClient(app) as client:
            client.post("/marketplace/tutors/apply", json=body, headers={"Authorization": f"Bearer {token}"})
            client.post("/marketplace/tutors/me/kyc/start", headers={"Authorization": f"Bearer {token}"})
            client.post("/marketplace/tutors/me/kyc/poll", headers={"Authorization": f"Bearer {token}"})
            client.post(f"/marketplace/admin/tutors/{uid}/approve", headers={"Authorization": f"Bearer {admin_token}"})
            client.post("/marketplace/tutors/me/activate", headers={"Authorization": f"Bearer {token}"})

    _provision(a_id, ["33333333-0000-0000-0000-000000000001"], 100000)
    _provision(b_id, ["33333333-0000-0000-0000-000000000002"], 200000)

    with TestClient(app) as client:
        r = client.get("/marketplace/tutors?topicId=33333333-0000-0000-0000-000000000001")
        assert r.status_code == 200
        ids = [it["userId"] for it in r.json()["items"]]
        assert a_id in ids
        assert b_id not in ids

        r = client.get("/marketplace/tutors?maxHourlyPaise=150000")
        ids = [it["userId"] for it in r.json()["items"]]
        assert a_id in ids
        assert b_id not in ids


def test_pricing_band_db_constraint() -> None:
    """The DB CHECK is the last line of defence; Pydantic catches first."""
    user_id = str(uuid.uuid4())
    token = _token(user_id)
    with TestClient(app) as client:
        r = client.post(
            "/marketplace/tutors/apply",
            json=_apply_body(rate_paise=5_000_000),  # ₹50,000 — way over ceiling
            headers={"Authorization": f"Bearer {token}"},
        )
        # Pydantic rejects with 422; never hits DB.
        assert r.status_code == 422


def test_kyc_rejected_force_path() -> None:
    user_id = str(uuid.uuid4())
    token = _token(user_id)
    with TestClient(app) as client:
        client.post("/marketplace/tutors/apply", json=_apply_body(), headers={"Authorization": f"Bearer {token}"})
        client.post("/marketplace/tutors/me/kyc/start", headers={"Authorization": f"Bearer {token}"})
        r = client.post(
            "/marketplace/tutors/me/kyc/poll?force=rejected",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "rejected"
        assert r.json()["applicationStatus"] == "REJECTED"
