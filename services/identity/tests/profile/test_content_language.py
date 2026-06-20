"""Tests for content_language profile preference — independent of app language_pref."""

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

from identity.profile.config import settings
from identity.main import app

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


@pytest.mark.asyncio
async def test_content_language_is_independent_of_app_language(client: AsyncClient, clean_db):
    uid = "00000000-0000-0000-0000-0000000c0a01"
    # set app language hi + content language ta in one call
    r = await client.patch("/profile/preferences", headers=_auth_header(uid),
                           json={"language": "hi", "contentLanguage": "ta", "dailyGoalMinutes": 30})
    assert r.status_code == 200
    prefs = r.json()["preferences"]
    assert prefs["language"] == "hi"
    assert prefs["contentLanguage"] == "ta"
    # change ONLY content language; app language must stay hi
    r2 = await client.patch("/profile/preferences", headers=_auth_header(uid),
                            json={"contentLanguage": "en"})
    p2 = r2.json()["preferences"]
    assert p2["contentLanguage"] == "en"
    assert p2["language"] == "hi"


@pytest.mark.asyncio
async def test_invalid_content_language_rejected(client: AsyncClient, clean_db):
    uid = "00000000-0000-0000-0000-0000000c0a02"
    r = await client.patch("/profile/preferences", headers=_auth_header(uid),
                           json={"contentLanguage": "hinglish"})  # not a content language
    assert r.status_code == 422
