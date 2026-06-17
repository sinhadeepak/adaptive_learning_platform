"""Creator earnings dashboard."""

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
            "sub": user_id, "role": role,
            "admin_access_level": "PLATFORM" if role == "PLATFORM_ADMIN" else "NONE",
            "tenant_id": None, "iat": now, "exp": now + 3600, "token_type": "access",
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def _provision_published_course(creator_id: str, admin_token: str, price_paise: int = 9900) -> str:
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
            json={"title": "T", "description": "", "contentMd": "x", "pricePaise": price_paise, "tier": "STANDARD", "topicIds": []},
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        course_id = r.json()["id"]
        client.post(f"/marketplace/courses/{course_id}/submit-for-review", headers={"Authorization": f"Bearer {creator_token}"})
        client.post(f"/marketplace/admin/courses/{course_id}/approve", headers={"Authorization": f"Bearer {admin_token}"})
    return course_id


def test_zero_earnings_when_no_purchases() -> None:
    creator_id = str(uuid.uuid4())
    creator_token = _token(creator_id, role="TEACHER")
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    _provision_published_course(creator_id, admin_token)

    with TestClient(app) as client:
        r = client.get(
            "/marketplace/creators/me/earnings",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["courseRevenuePaise"] == 0
        assert d["sessionRevenuePaise"] == 0
        assert d["totalNetPaise"] == 0


def test_course_revenue_aggregates() -> None:
    creator_id = str(uuid.uuid4())
    creator_token = _token(creator_id, role="TEACHER")
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    course_id = _provision_published_course(creator_id, admin_token, price_paise=49900)

    # Two students buy
    for _ in range(2):
        student_id = str(uuid.uuid4())
        student_token = _token(student_id, role="STUDENT")
        with TestClient(app) as client:
            r = client.post(
                f"/marketplace/courses/{course_id}/purchase",
                headers={"Authorization": f"Bearer {student_token}"},
            )
            purchase_id = r.json()["id"]
            client.post(
                f"/marketplace/courses/{course_id}/purchase/{purchase_id}/confirm-payment",
                headers={"Authorization": f"Bearer {student_token}"},
            )

    with TestClient(app) as client:
        r = client.get(
            "/marketplace/creators/me/earnings",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        d = r.json()
        assert d["courseRevenuePaise"] == 99800  # 2 * 49900
        assert d["courseCommissionPaise"] == 14970  # 2 * 7485 (15%)
        assert d["courseNetPaise"] == 84830
        assert d["courseCount"] == 2
        assert d["totalNetPaise"] == 84830  # no sessions


def test_other_creators_revenue_excluded() -> None:
    """Each creator only sees their own revenue."""
    me_id = str(uuid.uuid4())
    other_id = str(uuid.uuid4())
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    _provision_published_course(me_id, admin_token, price_paise=9900)
    other_course = _provision_published_course(other_id, admin_token, price_paise=49900)

    # Student buys the OTHER creator's course
    student_id = str(uuid.uuid4())
    student_token = _token(student_id, role="STUDENT")
    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/courses/{other_course}/purchase",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        purchase_id = r.json()["id"]
        client.post(
            f"/marketplace/courses/{other_course}/purchase/{purchase_id}/confirm-payment",
            headers={"Authorization": f"Bearer {student_token}"},
        )

    me_token = _token(me_id, role="TEACHER")
    with TestClient(app) as client:
        r = client.get(
            "/marketplace/creators/me/earnings",
            headers={"Authorization": f"Bearer {me_token}"},
        )
        d = r.json()
        assert d["courseRevenuePaise"] == 0  # other creator's revenue not visible


def test_period_filter_excludes_outside_window() -> None:
    creator_id = str(uuid.uuid4())
    creator_token = _token(creator_id, role="TEACHER")
    admin_token = _token(str(uuid.uuid4()), role="PLATFORM_ADMIN")
    course_id = _provision_published_course(creator_id, admin_token, price_paise=9900)

    student_id = str(uuid.uuid4())
    student_token = _token(student_id, role="STUDENT")
    with TestClient(app) as client:
        r = client.post(
            f"/marketplace/courses/{course_id}/purchase",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        purchase_id = r.json()["id"]
        client.post(
            f"/marketplace/courses/{course_id}/purchase/{purchase_id}/confirm-payment",
            headers={"Authorization": f"Bearer {student_token}"},
        )

        # Window is 2 years ago — should exclude
        r = client.get(
            "/marketplace/creators/me/earnings?since=2024-01-01&until=2024-01-31",
            headers={"Authorization": f"Bearer {creator_token}"},
        )
        d = r.json()
        assert d["courseRevenuePaise"] == 0
