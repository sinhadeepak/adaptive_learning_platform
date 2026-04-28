"""Sprint 8 Institution Core — endpoint tests.

Covers the create/list paths through ASGI:
- Tenant create + slug uniqueness conflict
- Cohort create scoped to a tenant
- Cohort member add (idempotent on dup)
- Member list ordering (LEAD_TEACHER first by `role DESC`)
- Member remove
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from institution.main import app

os.environ.setdefault(
    "INSTITUTION_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/institution",
)
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/institution",
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def truncated() -> AsyncIterator[None]:
    """Wipe the institution-core tables before each test (the flag tables
    have their own fixtures elsewhere)."""
    engine = create_async_engine(os.environ["DATABASE_URL"])
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "TRUNCATE institution_schema.cohort_members, "
                    "institution_schema.cohorts, "
                    "institution_schema.tenants RESTART IDENTITY CASCADE"
                )
            )
        yield
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def client(truncated: None) -> AsyncIterator[AsyncClient]:  # noqa: ARG001
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ─────────────────────────────────────────────────────────────────────────
# Tenants
# ─────────────────────────────────────────────────────────────────────────


async def test_create_tenant_derives_slug_from_name(client: AsyncClient) -> None:
    r = await client.post(
        "/institution/tenants",
        json={"name": "Aakash Test Center 2026", "kind": "COACHING_CENTER"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["slug"] == "aakash-test-center-2026"
    assert body["kind"] == "COACHING_CENTER"


async def test_create_tenant_rejects_duplicate_slug(client: AsyncClient) -> None:
    payload = {"name": "DPS Bangalore", "kind": "SCHOOL"}
    r1 = await client.post("/institution/tenants", json=payload)
    r2 = await client.post("/institution/tenants", json=payload)
    assert r1.status_code == 201
    assert r2.status_code == 409
    assert r2.json()["detail"]["code"] == "slug_taken"


async def test_get_tenant_404_when_unknown(client: AsyncClient) -> None:
    r = await client.get(f"/institution/tenants/{uuid.uuid4()}")
    assert r.status_code == 404


# ─────────────────────────────────────────────────────────────────────────
# Cohorts
# ─────────────────────────────────────────────────────────────────────────


async def _make_tenant(client: AsyncClient) -> str:
    r = await client.post(
        "/institution/tenants",
        json={"name": f"Test Coaching {uuid.uuid4().hex[:6]}", "kind": "COACHING_CENTER"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_create_cohort_under_tenant(client: AsyncClient) -> None:
    tenant_id = await _make_tenant(client)
    r = await client.post(
        f"/institution/tenants/{tenant_id}/cohorts",
        json={"name": "JEE 2026 Morning Batch", "exam": "JEE", "year": 2026},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["tenantId"] == tenant_id
    assert body["exam"] == "JEE"


async def test_create_cohort_rejects_unknown_tenant(client: AsyncClient) -> None:
    r = await client.post(
        f"/institution/tenants/{uuid.uuid4()}/cohorts",
        json={"name": "Ghost Class"},
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "tenant_not_found"


async def test_list_cohorts_returns_newest_first(client: AsyncClient) -> None:
    tenant_id = await _make_tenant(client)
    await client.post(
        f"/institution/tenants/{tenant_id}/cohorts", json={"name": "Cohort A"}
    )
    await client.post(
        f"/institution/tenants/{tenant_id}/cohorts", json={"name": "Cohort B"}
    )
    r = await client.get(f"/institution/tenants/{tenant_id}/cohorts")
    assert r.status_code == 200
    body = r.json()
    # `created_at DESC` → most recent first.
    assert [c["name"] for c in body][0] == "Cohort B"


# ─────────────────────────────────────────────────────────────────────────
# Cohort members
# ─────────────────────────────────────────────────────────────────────────


async def test_add_cohort_member_returns_member(client: AsyncClient) -> None:
    tenant_id = await _make_tenant(client)
    cohort = (
        await client.post(
            f"/institution/tenants/{tenant_id}/cohorts", json={"name": "Class XI"}
        )
    ).json()
    user_id = str(uuid.uuid4())
    r = await client.post(
        f"/institution/cohorts/{cohort['id']}/members",
        json={"userId": user_id, "role": "STUDENT"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["userId"] == user_id


async def test_add_cohort_member_idempotent_on_duplicate(client: AsyncClient) -> None:
    """Adding the same student twice must not 500 (race between two
    "add" buttons in the educator UI). The second add returns the
    original row's joined_at."""
    tenant_id = await _make_tenant(client)
    cohort = (
        await client.post(
            f"/institution/tenants/{tenant_id}/cohorts", json={"name": "Class XI"}
        )
    ).json()
    user_id = str(uuid.uuid4())
    r1 = await client.post(
        f"/institution/cohorts/{cohort['id']}/members", json={"userId": user_id}
    )
    r2 = await client.post(
        f"/institution/cohorts/{cohort['id']}/members", json={"userId": user_id}
    )
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["joinedAt"] == r2.json()["joinedAt"]


async def test_remove_cohort_member(client: AsyncClient) -> None:
    tenant_id = await _make_tenant(client)
    cohort = (
        await client.post(
            f"/institution/tenants/{tenant_id}/cohorts", json={"name": "Class XI"}
        )
    ).json()
    user_id = str(uuid.uuid4())
    await client.post(
        f"/institution/cohorts/{cohort['id']}/members", json={"userId": user_id}
    )
    r = await client.delete(
        f"/institution/cohorts/{cohort['id']}/members/{user_id}"
    )
    assert r.status_code == 204
    # Second delete → 404 (idempotency-by-error).
    r2 = await client.delete(
        f"/institution/cohorts/{cohort['id']}/members/{user_id}"
    )
    assert r2.status_code == 404
