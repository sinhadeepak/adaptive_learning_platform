"""Integration tests for /auth/* against the running Postgres container.

Requires alp-local stack up (`make dev`) and the auth migration applied:
  DATABASE_URL=... alembic upgrade head
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from auth.db import sessionmaker
from auth.main import app
from auth.security import hash_otp

os.environ.setdefault(
    "AUTH_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/auth",
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def clean_db() -> AsyncIterator[None]:
    """Truncate user-scoped tables between tests so each test starts fresh."""
    engine = create_async_engine(os.environ["AUTH_DATABASE_URL"])
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "TRUNCATE auth_schema.password_reset_tokens, auth_schema.refresh_tokens, "
                    "auth_schema.otp_tokens, auth_schema.user_exam_selections, "
                    "auth_schema.users RESTART IDENTITY CASCADE"
                )
            )
    finally:
        await engine.dispose()
    yield


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    # Connect lockout to local Redis (best-effort; tests that don't need it still pass).
    from auth import lockout

    await lockout.connect()
    if lockout.client() is not None:
        # Clear any auth:fail / auth:lock / auth:rl keys from prior test runs.
        c = lockout.client()
        assert c is not None
        keys = await c.keys("auth:fail:*")
        keys += await c.keys("auth:lock:*")
        keys += await c.keys("auth:rl:*")
        if keys:
            await c.delete(*keys)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        await lockout.close()


async def _peek_otp_hash(email: str) -> str:
    """Pull the active OTP hash directly from DB (we don't read Mailpit in tests)."""
    async with sessionmaker()() as s:
        row = (
            await s.execute(
                text(
                    "SELECT otp_hash FROM auth_schema.otp_tokens WHERE contact = :e "
                    "AND used_at IS NULL ORDER BY created_at DESC LIMIT 1"
                ),
                {"e": email.lower()},
            )
        ).mappings().first()
        assert row is not None, f"no active OTP found for {email}"
        return str(row["otp_hash"])


async def _verified_session(client: AsyncClient, email: str, password: str = "SuperSecret123!") -> dict[str, Any]:
    # Register + verify + return Session dict.
    r = await client.post(
        "/auth/register",
        json={"firstName": "Test", "lastName": "User", "email": email, "password": password},
    )
    assert r.status_code == 200, r.text
    user_id = r.json()["userId"]

    # Brute-check all 6-digit codes until hash matches (fast enough in dev).
    expected_hash = await _peek_otp_hash(email)
    for i in range(1_000_000):
        code = f"{i:06d}"
        if hash_otp(code) == expected_hash:
            otp_code = code
            break
    else:  # pragma: no cover
        raise AssertionError("OTP brute-force failed — should be impossible")

    v = await client.post(
        "/auth/otp/verify",
        json={"userId": user_id, "code": otp_code, "channel": "email"},
    )
    assert v.status_code == 200, v.text
    return v.json()


async def test_register_creates_pending_user_and_otp(client: AsyncClient, clean_db: None) -> None:
    r = await client.post(
        "/auth/register",
        json={
            "firstName": "Rahul",
            "lastName": "Sharma",
            "email": "rahul1@example.com",
            "password": "SuperSecret123!",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["otpChannel"] == "email"
    assert body["userId"]

    # Conflict on duplicate
    r2 = await client.post(
        "/auth/register",
        json={
            "firstName": "Rahul",
            "lastName": "Sharma",
            "email": "rahul1@example.com",
            "password": "SuperSecret123!",
        },
    )
    assert r2.status_code == 409


async def test_verify_otp_publishes_user_created_event(
    client: AsyncClient,
    clean_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """On successful OTP verify, Auth emits `user.created` so Profile (and any other
    downstream consumer) can seed its projection."""
    captured: list[dict[str, str]] = []

    async def _capture(**kwargs: str) -> None:
        captured.append(kwargs)

    monkeypatch.setattr("auth.routes.publish_user_created", _capture)

    await _verified_session(client, "rahul-event@example.com")

    assert len(captured) == 1
    event = captured[0]
    assert event["email"] == "rahul-event@example.com"
    assert event["first_name"] == "Test"
    assert event["last_name"] == "User"
    assert event["role"] == "STUDENT"
    assert event["user_id"]


async def test_verify_otp_activates_user_and_issues_session(client: AsyncClient, clean_db: None) -> None:
    sess = await _verified_session(client, "rahul2@example.com")
    assert sess["user"]["email"] == "rahul2@example.com"
    assert sess["user"]["onboardingState"] == "NEW"
    assert sess["tokens"]["accessToken"]
    assert sess["tokens"]["refreshToken"]
    assert sess["tokens"]["expiresAt"] > 0


async def test_login_happy_path(client: AsyncClient, clean_db: None) -> None:
    await _verified_session(client, "rahul3@example.com")
    r = await client.post(
        "/auth/login",
        json={"email": "rahul3@example.com", "password": "SuperSecret123!"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["email"] == "rahul3@example.com"
    assert body["tokens"]["accessToken"]


async def test_login_wrong_password(client: AsyncClient, clean_db: None) -> None:
    await _verified_session(client, "rahul4@example.com")
    r = await client.post(
        "/auth/login",
        json={"email": "rahul4@example.com", "password": "wrong-password"},
    )
    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "invalid_credentials"


async def test_login_before_verify_fails(client: AsyncClient, clean_db: None) -> None:
    r = await client.post(
        "/auth/register",
        json={
            "firstName": "T",
            "lastName": "U",
            "email": "rahul5@example.com",
            "password": "SuperSecret123!",
        },
    )
    assert r.status_code == 200
    r2 = await client.post(
        "/auth/login",
        json={"email": "rahul5@example.com", "password": "SuperSecret123!"},
    )
    assert r2.status_code == 401
    assert r2.json()["detail"]["code"] == "not_verified"


async def test_refresh_rotates_token(client: AsyncClient, clean_db: None) -> None:
    sess = await _verified_session(client, "rahul6@example.com")
    old_refresh = sess["tokens"]["refreshToken"]

    r = await client.post("/auth/refresh", json={"refreshToken": old_refresh})
    assert r.status_code == 200
    new_tokens = r.json()
    assert new_tokens["refreshToken"] != old_refresh
    assert new_tokens["accessToken"] != sess["tokens"]["accessToken"]

    # Old refresh token is now revoked.
    r2 = await client.post("/auth/refresh", json={"refreshToken": old_refresh})
    assert r2.status_code == 401


async def test_email_channel_disabled_skips_smtp_but_otp_row_persists(
    client: AsyncClient,
    clean_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GAP-16 wire-up: when `email_channel_enabled` is OFF, SMTP send is skipped
    but the OTP row is still created so /auth/otp/verify keeps working."""
    sent: list[str] = []

    async def _no_send(*, to: str, otp: str) -> None:
        sent.append(to)

    monkeypatch.setattr("auth.routes.send_otp_email", _no_send)

    # Stub the flag client to return False for email_channel_enabled.
    class _StubClient:
        async def evaluate(self, name: str, *, tenant_id: str | None = None) -> bool:
            return False if name == "email_channel_enabled" else True

    monkeypatch.setattr("auth.routes.flags_client", lambda: _StubClient())

    r = await client.post(
        "/auth/register",
        json={
            "firstName": "Flag",
            "lastName": "Off",
            "email": "flagoff@example.com",
            "password": "SuperSecret123!",
        },
    )
    assert r.status_code == 200

    # No SMTP attempt was made.
    assert sent == []

    # OTP row exists in DB so /auth/otp/verify still works for ops paths.
    async with sessionmaker()() as s:
        row = (
            await s.execute(
                text(
                    "SELECT 1 FROM auth_schema.otp_tokens WHERE contact = 'flagoff@example.com' "
                    "AND used_at IS NULL"
                )
            )
        ).first()
        assert row is not None


async def test_logout_revokes_refresh(client: AsyncClient, clean_db: None) -> None:
    sess = await _verified_session(client, "rahul7@example.com")
    rt = sess["tokens"]["refreshToken"]

    r = await client.post("/auth/logout", json={"refreshToken": rt})
    assert r.status_code == 204

    r2 = await client.post("/auth/refresh", json={"refreshToken": rt})
    assert r2.status_code == 401


async def test_forgot_password_always_204_even_for_unknown_email(client: AsyncClient, clean_db: None) -> None:
    """Enumeration-safe: never reveal whether the email is registered."""
    r = await client.post("/auth/password/forgot", json={"email": "nobody@example.com"})
    assert r.status_code == 204


async def test_forgot_password_creates_reset_token_for_known_user(
    client: AsyncClient,
    clean_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[tuple[str, str]] = []

    async def _capture(*, to: str, reset_url: str) -> None:
        sent.append((to, reset_url))

    monkeypatch.setattr("auth.routes.send_password_reset_email", _capture)

    await _verified_session(client, "rahul-pwreset@example.com")
    r = await client.post(
        "/auth/password/forgot",
        json={"email": "rahul-pwreset@example.com"},
    )
    assert r.status_code == 204
    assert len(sent) == 1
    to, url = sent[0]
    assert to == "rahul-pwreset@example.com"
    assert "token=" in url

    async with sessionmaker()() as s:
        row = (
            await s.execute(
                text(
                    "SELECT used_at FROM auth_schema.password_reset_tokens prt "
                    "JOIN auth_schema.users u ON u.id = prt.user_id "
                    "WHERE u.email = 'rahul-pwreset@example.com'"
                )
            )
        ).first()
        assert row is not None
        assert row[0] is None


async def test_reset_password_with_valid_token(
    client: AsyncClient,
    clean_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[str] = []

    async def _capture(*, to: str, reset_url: str) -> None:
        from urllib.parse import urlparse, parse_qs
        token = parse_qs(urlparse(reset_url).query)["token"][0]
        captured.append(token)

    monkeypatch.setattr("auth.routes.send_password_reset_email", _capture)

    email = "rahul-reset@example.com"
    await _verified_session(client, email)
    await client.post("/auth/password/forgot", json={"email": email})
    assert len(captured) == 1
    raw_token = captured[0]

    r = await client.post(
        "/auth/password/reset",
        json={"token": raw_token, "newPassword": "NewSuperSecret456!"},
    )
    assert r.status_code == 204

    # Old password fails.
    r1 = await client.post(
        "/auth/login", json={"email": email, "password": "SuperSecret123!"}
    )
    assert r1.status_code == 401

    # New password succeeds.
    r2 = await client.post(
        "/auth/login", json={"email": email, "password": "NewSuperSecret456!"}
    )
    assert r2.status_code == 200

    # Token cannot be reused.
    r3 = await client.post(
        "/auth/password/reset",
        json={"token": raw_token, "newPassword": "Another987Pass!"},
    )
    assert r3.status_code == 410
    assert r3.json()["detail"]["code"] == "token_invalid_or_expired"


async def test_lockout_after_threshold_blocks_even_correct_password(
    client: AsyncClient,
    clean_db: None,
) -> None:
    """STU-REQ-10 — 5 wrong-password attempts within 15 min triggers a 30-min lockout."""
    from auth import lockout
    if lockout.client() is None:
        pytest.skip("Redis unavailable — lockout test requires it")

    email = "rahul-lockout@example.com"
    await _verified_session(client, email)

    # 5 failures.
    for _ in range(5):
        r = await client.post(
            "/auth/login",
            json={"email": email, "password": "WrongPassword123!"},
        )
        assert r.status_code == 401

    # 6th attempt — even the correct password gets 423.
    r = await client.post(
        "/auth/login",
        json={"email": email, "password": "SuperSecret123!"},
    )
    assert r.status_code == 423
    assert r.json()["detail"]["code"] == "account_locked"


async def test_lockout_resets_on_successful_login(
    client: AsyncClient,
    clean_db: None,
) -> None:
    from auth import lockout
    if lockout.client() is None:
        pytest.skip("Redis unavailable")

    email = "rahul-resetlockout@example.com"
    await _verified_session(client, email)

    # 3 failures (under threshold).
    for _ in range(3):
        await client.post(
            "/auth/login",
            json={"email": email, "password": "WrongPassword123!"},
        )

    # Successful login resets the counter.
    ok = await client.post(
        "/auth/login",
        json={"email": email, "password": "SuperSecret123!"},
    )
    assert ok.status_code == 200

    # Now 5 more failures should NOT lock out (since counter was reset).
    for _ in range(4):
        r = await client.post(
            "/auth/login",
            json={"email": email, "password": "WrongPassword123!"},
        )
        assert r.status_code == 401  # still 401, not 423


async def test_rate_limit_blocks_4th_register_within_window(
    client: AsyncClient,
    clean_db: None,
) -> None:
    """REGISTER limit = 3 per 60s per IP. The 4th attempt within the window returns 429."""
    from auth import lockout
    if lockout.client() is None:
        pytest.skip("Redis unavailable — rate limit test requires it")

    for i in range(3):
        r = await client.post(
            "/auth/register",
            json={
                "firstName": "RL",
                "lastName": "Tester",
                "email": f"rl-burst-{i}@example.com",
                "password": "SuperSecret123!",
            },
        )
        # Each is a distinct email so no 409. Just want to consume the rate-limit budget.
        assert r.status_code == 200, r.text

    r = await client.post(
        "/auth/register",
        json={
            "firstName": "RL",
            "lastName": "Tester",
            "email": "rl-burst-99@example.com",
            "password": "SuperSecret123!",
        },
    )
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "rate_limited"
    assert r.headers.get("retry-after") is not None


async def test_reset_password_with_invalid_token(client: AsyncClient, clean_db: None) -> None:
    r = await client.post(
        "/auth/password/reset",
        json={"token": "obviously-not-a-real-token-but-long-enough", "newPassword": "WhateverPass789!"},
    )
    assert r.status_code == 410
