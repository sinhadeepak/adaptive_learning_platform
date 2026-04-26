"""Integration tests for /flags/* — ADR-0001."""

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

from institution.config import settings
from institution.main import app

os.environ.setdefault(
    "INSTITUTION_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/institution",
)

pytestmark = pytest.mark.asyncio

STUDENT_ID = "00000000-0000-0000-0000-0000000000aa"
ADMIN_ID = "00000000-0000-0000-0000-0000000000bb"
TENANT_ID = "11110000-0000-0000-0000-000000000001"


def _token(user_id: str, admin_level: str = "NONE", role: str = "STUDENT") -> str:
    now = datetime.now(tz=timezone.utc)
    return jwt.encode(
        {
            "sub": user_id,
            "role": role,
            "admin_access_level": admin_level,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=15)).timestamp()),
            "jti": secrets.token_urlsafe(12),
            "token_type": "access",
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


def _hdr(tok: str) -> dict[str, str]:
    return {"authorization": f"Bearer {tok}"}


@pytest_asyncio.fixture
async def reset_overrides() -> AsyncIterator[None]:
    # We DO NOT reset feature_flags — the seed is authoritative.
    # We DO reset overrides + audit so each test starts fresh.
    engine = create_async_engine(os.environ["INSTITUTION_DATABASE_URL"])
    try:
        async with engine.begin() as conn:
            await conn.execute(text("TRUNCATE institution_schema.feature_flag_audit"))
            await conn.execute(text("TRUNCATE institution_schema.feature_flag_overrides"))
            # Reset default values to seed state (only for flags we mutate in tests).
            await conn.execute(text(
                "UPDATE institution_schema.feature_flags SET default_value = FALSE "
                "WHERE name IN ('irt_model_enabled','premium_tier_enforcement','checkout_enabled','assignments_enabled')"
            ))
            await conn.execute(text(
                "UPDATE institution_schema.feature_flags SET default_value = TRUE "
                "WHERE name IN ('push_channel_enabled','sms_channel_enabled','email_channel_enabled')"
            ))
    finally:
        await engine.dispose()
    yield


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_list_flags_returns_seven_phase1_flags(client: AsyncClient, reset_overrides: None) -> None:
    r = await client.get("/flags", headers=_hdr(_token(STUDENT_ID)))
    assert r.status_code == 200
    flags = r.json()
    names = sorted(f["name"] for f in flags)
    assert names == [
        "assignments_enabled",
        "checkout_enabled",
        "email_channel_enabled",
        "irt_model_enabled",
        "premium_tier_enforcement",
        "push_channel_enabled",
        "sms_channel_enabled",
    ]


async def test_get_flag_detail(client: AsyncClient, reset_overrides: None) -> None:
    r = await client.get("/flags/irt_model_enabled", headers=_hdr(_token(STUDENT_ID)))
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "irt_model_enabled"
    assert body["defaultValue"] is False
    assert body["dangerCritical"] is True
    assert body["overrides"] == []
    assert body["audit"] == []


async def test_student_cannot_write(client: AsyncClient, reset_overrides: None) -> None:
    r = await client.put(
        "/flags/irt_model_enabled",
        headers=_hdr(_token(STUDENT_ID)),
        json={"value": True, "rationale": "student trying"},
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "forbidden"


async def test_admin_can_flip_default_and_audit_records(client: AsyncClient, reset_overrides: None) -> None:
    r = await client.put(
        "/flags/irt_model_enabled",
        headers=_hdr(_token(ADMIN_ID, admin_level="PLATFORM")),
        json={"value": True, "rationale": "enable ml run"},
    )
    assert r.status_code == 200
    assert r.json()["defaultValue"] is True

    # Verify audit row.
    audit = await client.get("/flags/irt_model_enabled/audit", headers=_hdr(_token(ADMIN_ID, admin_level="PLATFORM")))
    rows = audit.json()
    assert len(rows) == 1
    entry = rows[0]
    assert entry["scope"] == "GLOBAL"
    assert entry["oldValue"] is False
    assert entry["newValue"] is True
    assert entry["rationale"] == "enable ml run"
    assert entry["actorUserId"] == ADMIN_ID


async def test_admin_can_set_and_revert_tenant_override(client: AsyncClient, reset_overrides: None) -> None:
    # Set tenant override ON (while default is OFF).
    r = await client.put(
        f"/flags/irt_model_enabled/tenants/{TENANT_ID}",
        headers=_hdr(_token(ADMIN_ID, admin_level="PLATFORM")),
        json={"value": True, "rationale": "tenant pilot"},
    )
    assert r.status_code == 200

    # Detail should now show the override.
    detail = await client.get("/flags/irt_model_enabled", headers=_hdr(_token(ADMIN_ID, admin_level="PLATFORM")))
    body = detail.json()
    assert len(body["overrides"]) == 1
    ovr = body["overrides"][0]
    assert ovr["tenantId"] == TENANT_ID
    assert ovr["value"] is True

    # Flip tenant override OFF. Audit should capture the old value (TRUE) → new (FALSE).
    r2 = await client.put(
        f"/flags/irt_model_enabled/tenants/{TENANT_ID}",
        headers=_hdr(_token(ADMIN_ID, admin_level="PLATFORM")),
        json={"value": False},
    )
    assert r2.status_code == 200
    audit = (await client.get(
        "/flags/irt_model_enabled/audit",
        headers=_hdr(_token(ADMIN_ID, admin_level="PLATFORM")),
    )).json()
    # Newest first — so audit[0] = the TRUE→FALSE, audit[1] = initial NULL→TRUE.
    assert audit[0]["scope"] == "TENANT"
    assert audit[0]["oldValue"] is True
    assert audit[0]["newValue"] is False
    assert audit[1]["oldValue"] is None
    assert audit[1]["newValue"] is True


async def test_unknown_flag_returns_404(client: AsyncClient, reset_overrides: None) -> None:
    r = await client.get("/flags/does_not_exist", headers=_hdr(_token(STUDENT_ID)))
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "flag_not_found"


async def test_global_audit_endpoint_returns_rows_across_flags(
    client: AsyncClient, reset_overrides: None
) -> None:
    """GET /flags/audit returns audit rows across every flag (global view)."""
    admin_hdr = _hdr(_token(ADMIN_ID, admin_level="PLATFORM"))

    # Generate audit activity on TWO different flags so we can prove the
    # endpoint isn't filtering to one.
    await client.put(
        "/flags/irt_model_enabled", headers=admin_hdr,
        json={"value": True, "rationale": "ml run a"},
    )
    await client.put(
        "/flags/checkout_enabled", headers=admin_hdr,
        json={"value": True, "rationale": "stripe live"},
    )
    await client.put(
        f"/flags/checkout_enabled/tenants/{TENANT_ID}", headers=admin_hdr,
        json={"value": False, "rationale": "pilot rollback"},
    )

    r = await client.get("/flags/audit", headers=_hdr(_token(STUDENT_ID)))
    assert r.status_code == 200
    rows = r.json()
    # 3 audit entries: 2 GLOBAL flips + 1 TENANT override.
    assert len(rows) == 3
    # Newest first.
    flag_names = [r["flagName"] for r in rows]
    assert "checkout_enabled" in flag_names
    assert "irt_model_enabled" in flag_names
    # Scope mix.
    scopes = {r["scope"] for r in rows}
    assert scopes == {"GLOBAL", "TENANT"}


async def test_global_audit_does_not_route_to_get_flag(
    client: AsyncClient, reset_overrides: None
) -> None:
    """Regression: GET /flags/audit must not match the /flags/{name} route."""
    r = await client.get("/flags/audit", headers=_hdr(_token(STUDENT_ID)))
    assert r.status_code == 200
    body = r.json()
    # If /{name} were matching, response would be either a 404 or a single
    # FlagDetail object (a dict), not a list.
    assert isinstance(body, list)


async def test_global_audit_rejects_unauthenticated(client: AsyncClient) -> None:
    r = await client.get("/flags/audit")
    assert r.status_code == 401


async def test_put_unknown_flag_404(client: AsyncClient, reset_overrides: None) -> None:
    r = await client.put(
        "/flags/nope",
        headers=_hdr(_token(ADMIN_ID, admin_level="PLATFORM")),
        json={"value": True},
    )
    assert r.status_code == 404
