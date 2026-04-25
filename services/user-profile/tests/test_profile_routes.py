"""Integration tests for /profile/* against running Postgres."""

from __future__ import annotations

import os
import secrets
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from user_profile.config import settings
from user_profile.main import app

os.environ.setdefault(
    "USER_PROFILE_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/user_profile",
)

pytestmark = pytest.mark.asyncio


def _access_token(user_id: str, email: str = "test@example.com") -> str:
    now = datetime.now(tz=timezone.utc)
    return jwt.encode(
        {
            "sub": user_id,
            "role": "STUDENT",
            "onboarding_state": "NEW",
            "email": email,
            "first_name": "Test",
            "last_name": "Student",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=15)).timestamp()),
            "jti": secrets.token_urlsafe(12),
            "token_type": "access",
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


@pytest_asyncio.fixture
async def clean_db() -> AsyncIterator[None]:
    engine = create_async_engine(os.environ["USER_PROFILE_DATABASE_URL"])
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text("TRUNCATE profile_schema.exam_selections, profile_schema.profiles RESTART IDENTITY CASCADE")
            )
    finally:
        await engine.dispose()
    yield


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def _auth_header(user_id: str) -> dict[str, str]:
    return {"authorization": f"Bearer {_access_token(user_id)}"}


async def test_get_me_lazy_creates_profile(client: AsyncClient, clean_db: None) -> None:
    uid = "00000000-0000-0000-0000-000000000001"
    r = await client.get("/profile/me", headers=_auth_header(uid))
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["id"] == uid
    assert body["user"]["firstName"] == "Test"
    assert body["user"]["onboardingState"] == "NEW"
    assert body["preferences"]["language"] == "en"
    assert body["exams"] == []


async def test_patch_me_updates_names(client: AsyncClient, clean_db: None) -> None:
    uid = "00000000-0000-0000-0000-000000000002"
    r = await client.patch(
        "/profile/me",
        headers=_auth_header(uid),
        json={"firstName": "Rahul", "lastName": "Sharma"},
    )
    assert r.status_code == 200
    assert r.json()["user"]["firstName"] == "Rahul"
    assert r.json()["user"]["lastName"] == "Sharma"


async def test_put_exam_advances_onboarding_to_EXAM_SELECTED(client: AsyncClient, clean_db: None) -> None:
    uid = "00000000-0000-0000-0000-000000000003"
    exam_id = "10000000-0000-0000-0000-000000000001"
    r = await client.put("/profile/exams", headers=_auth_header(uid), json={"examId": exam_id})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["onboardingState"] == "EXAM_SELECTED"
    assert len(body["exams"]) == 1
    assert body["exams"][0]["examId"] == exam_id


async def test_patch_exam_target_date(client: AsyncClient, clean_db: None) -> None:
    uid = "00000000-0000-0000-0000-000000000004"
    exam_id = "10000000-0000-0000-0000-000000000002"
    await client.put("/profile/exams", headers=_auth_header(uid), json={"examId": exam_id})
    r = await client.patch(
        f"/profile/exams/{exam_id}",
        headers=_auth_header(uid),
        json={"targetDate": "2027-05-15"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["exams"][0]["targetDate"] == "2027-05-15"


async def test_patch_exam_not_selected_returns_404(client: AsyncClient, clean_db: None) -> None:
    uid = "00000000-0000-0000-0000-000000000005"
    # First create the profile by calling /profile/me, then attempt to patch an unselected exam.
    await client.get("/profile/me", headers=_auth_header(uid))
    r = await client.patch(
        "/profile/exams/20000000-0000-0000-0000-000000000000",
        headers=_auth_header(uid),
        json={"targetDate": "2027-05-15"},
    )
    assert r.status_code == 404


async def test_preferences_onboarding_transitions_to_ONBOARDED(client: AsyncClient, clean_db: None) -> None:
    uid = "00000000-0000-0000-0000-000000000006"
    exam_id = "10000000-0000-0000-0000-000000000003"

    # NEW → select exam → EXAM_SELECTED
    await client.put("/profile/exams", headers=_auth_header(uid), json={"examId": exam_id})
    # EXAM_SELECTED → set daily goal → ONBOARDED
    r = await client.patch(
        "/profile/preferences",
        headers=_auth_header(uid),
        json={"language": "hi", "dailyGoalMinutes": 30},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["preferences"]["language"] == "hi"
    assert body["preferences"]["dailyGoalMinutes"] == 30
    assert body["user"]["onboardingState"] == "ONBOARDED"


async def test_unauthenticated_request_returns_401(client: AsyncClient, clean_db: None) -> None:
    r = await client.get("/profile/me")
    # No credentials provided — HTTPBearer(auto_error=True) → 401/403 depending on version.
    assert r.status_code in {401, 403}


async def test_user_created_event_handler_upserts_profile(
    client: AsyncClient,
    clean_db: None,
) -> None:
    """Profile's NATS subscriber upserts a row with real first/last from the event,
    eliminating the placeholder names that `lazy-create` would otherwise use."""
    import json
    from types import SimpleNamespace

    from user_profile.events import _on_user_created

    user_id = "00000000-0000-0000-0000-aaaaaaaaaaaa"
    payload = {
        "user_id": user_id,
        "email": "rahul-evt@example.com",
        "first_name": "Rahul",
        "last_name": "Sharma",
        "role": "STUDENT",
        "ts": "2026-04-25T08:00:00Z",
    }
    msg = SimpleNamespace(data=json.dumps(payload).encode("utf-8"))
    await _on_user_created(msg)  # type: ignore[arg-type]

    # Fetch /profile/me with a JWT bearing the matching sub — handler should NOT have
    # left placeholder names; it should be Rahul Sharma.
    r = await client.get("/profile/me", headers=_auth_header(user_id))
    assert r.status_code == 200
    user = r.json()["user"]
    assert user["firstName"] == "Rahul"
    assert user["lastName"] == "Sharma"


async def test_user_created_event_handler_is_idempotent(
    client: AsyncClient,
    clean_db: None,
) -> None:
    """Replaying the same event twice is a no-op — the handler uses UPSERT semantics."""
    import json
    from types import SimpleNamespace

    from user_profile.events import _on_user_created

    user_id = "00000000-0000-0000-0000-bbbbbbbbbbbb"
    payload_v1 = {
        "user_id": user_id,
        "email": "x@example.com",
        "first_name": "First",
        "last_name": "V1",
        "role": "STUDENT",
        "ts": "2026-04-25T08:00:00Z",
    }
    payload_v2 = {**payload_v1, "first_name": "First", "last_name": "V2"}

    await _on_user_created(SimpleNamespace(data=json.dumps(payload_v1).encode()))  # type: ignore[arg-type]
    await _on_user_created(SimpleNamespace(data=json.dumps(payload_v2).encode()))  # type: ignore[arg-type]

    r = await client.get("/profile/me", headers=_auth_header(user_id))
    assert r.status_code == 200
    user = r.json()["user"]
    # Re-receive of the event with updated last name updates the row in place.
    assert user["lastName"] == "V2"


async def test_bad_token_returns_401(client: AsyncClient, clean_db: None) -> None:
    r = await client.get("/profile/me", headers={"authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


# ---- service-to-service /internal/profile/{user_id} ----


async def test_internal_profile_lookup_returns_user(client: AsyncClient) -> None:
    """Direct DB seed avoids needing a live NATS in unit tests; mimics the
    same write the user.created subscriber does."""
    from uuid import uuid4 as _u4

    from user_profile.db import sessionmaker
    user_id = str(_u4())
    async with sessionmaker()() as session:
        await session.execute(
            text(
                "INSERT INTO profile_schema.profiles (user_id, first_name, last_name, email) "
                "VALUES (:uid, :fn, :ln, :em)"
            ),
            {"uid": user_id, "fn": "Demo", "ln": "Student", "em": "demo@example.com"},
        )
        await session.commit()

    r = await client.get(f"/internal/profile/{user_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == user_id
    assert body["firstName"] == "Demo"
    assert body["lastName"] == "Student"
    assert body["email"] == "demo@example.com"


async def test_internal_profile_lookup_404_for_unknown(client: AsyncClient) -> None:
    from uuid import uuid4 as _u4
    r = await client.get(f"/internal/profile/{_u4()}")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "profile_not_found"
