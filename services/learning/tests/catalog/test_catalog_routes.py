"""Integration tests for /catalog/* against running Postgres (with seeded data)."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from learning.main import app

# Dedicated test DB (catalog seeds come from its migrations). Root
# tests/conftest.py provisions it; this is a standalone-run fallback.
os.environ.setdefault(
    "CATALOG_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/learning_test",
)

pytestmark = pytest.mark.asyncio

JEE_EXAM_ID = "11111111-0000-0000-0000-000000000001"
JEE_PHYSICS_ID = "22222222-0000-0000-0000-000000000001"
JEE_MATHS_ID = "22222222-0000-0000-0000-000000000003"
ROTATIONAL_TOPIC_ID = "33333333-0000-0000-0000-000000000001"
CALCULUS_TOPIC_ID = "33333333-0000-0000-0000-000000000006"  # marked PREMIUM in migration 003


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_list_exams_includes_core_seeded(client: AsyncClient) -> None:
    r = await client.get("/catalog/exams")
    assert r.status_code == 200
    exams = r.json()
    codes = {e["code"] for e in exams}
    # The 4 original competitive exams must be present. Post-ADR-0005 the
    # consolidated DB also carries the CBSE-board exams seeded by the content
    # migrations, so assert a subset rather than exact equality.
    assert {"CAT", "JEE_MAIN", "NEET", "UPSC_CSE"} <= codes
    assert all({"id", "code", "name"} <= set(e.keys()) for e in exams)


async def test_subjects_under_jee_main(client: AsyncClient) -> None:
    r = await client.get(f"/catalog/exams/{JEE_EXAM_ID}/subjects")
    assert r.status_code == 200
    subjects = r.json()
    names = [s["name"] for s in subjects]
    assert names == ["Physics", "Chemistry", "Mathematics"]
    # Physics carries the full JEE syllabus: the 3 original sample topics
    # (Mechanics, Thermodynamics, Electrostatics) plus the chapter-level
    # expansion from migration 027.
    physics = next(s for s in subjects if s["name"] == "Physics")
    assert physics["topicCount"] >= 20


async def test_topics_under_physics(client: AsyncClient) -> None:
    r = await client.get(f"/catalog/subjects/{JEE_PHYSICS_ID}/topics")
    assert r.status_code == 200
    topics = r.json()
    titles = [t["title"] for t in topics]
    # The original sample topics stay first (sort_order 1-3); the full
    # chapter list (migration 027) follows.
    assert titles[:3] == ["Mechanics", "Thermodynamics", "Electrostatics"]
    assert len(titles) >= 20
    assert "Ray Optics" in titles
    # Tier defaults to FREE
    assert all(t["tier"] == "FREE" for t in topics)


async def test_topic_detail(client: AsyncClient) -> None:
    r = await client.get(f"/catalog/topics/{ROTATIONAL_TOPIC_ID}")
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Mechanics"
    # Description carries the Hinglish alias appended by migration 004 so
    # cross-script queries hit via Search's English analyzer.
    assert body["description"].startswith("Motion, forces, and energy.")
    assert "yantriki" in body["description"]
    assert body["titleHi"] == "यांत्रिकी"
    assert body["questionCount"] == 48
    assert body["objectives"] == []


async def test_topic_detail_not_found(client: AsyncClient) -> None:
    r = await client.get("/catalog/topics/99999999-9999-9999-9999-999999999999")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "not_found"


async def test_empty_subjects_when_bogus_exam(client: AsyncClient) -> None:
    # No 404 for an unknown exam — it's just an empty subject list for now.
    # Aligns with openapi (no 404 response declared on /catalog/exams/:id/subjects).
    r = await client.get("/catalog/exams/99999999-9999-9999-9999-999999999999/subjects")
    assert r.status_code == 200
    assert r.json() == []


# ---------- GAP-16: premium_tier_enforcement gate ----------


async def _premium_topic_via_list(client: AsyncClient) -> dict:
    r = await client.get(f"/catalog/subjects/{JEE_MATHS_ID}/topics")
    assert r.status_code == 200
    topics = r.json()
    return next(t for t in topics if t["title"] == "Calculus")


async def test_premium_topic_returns_FREE_when_flag_off(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sprint 1 closed beta default: paywall OFF → stored PREMIUM topic served as FREE."""

    async def _stub(_tenant_id: str | None = None) -> bool:
        return False

    monkeypatch.setattr("learning.catalog.routes.premium_enforced", _stub)

    calculus_list = await _premium_topic_via_list(client)
    assert calculus_list["tier"] == "FREE"

    detail = await client.get(f"/catalog/topics/{CALCULUS_TOPIC_ID}")
    assert detail.json()["tier"] == "FREE"


async def test_premium_topic_returns_PREMIUM_when_flag_on(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sprint 3+ launch: paywall ON → stored PREMIUM topic served as PREMIUM."""

    async def _stub(_tenant_id: str | None = None) -> bool:
        return True

    monkeypatch.setattr("learning.catalog.routes.premium_enforced", _stub)

    calculus_list = await _premium_topic_via_list(client)
    assert calculus_list["tier"] == "PREMIUM"

    detail = await client.get(f"/catalog/topics/{CALCULUS_TOPIC_ID}")
    assert detail.json()["tier"] == "PREMIUM"
