"""Tests for language CRUD routes (Task 3 — registry-backed validation)."""

import pytest
from httpx import ASGITransport, AsyncClient

from learning.main import app


@pytest.mark.asyncio
async def test_list_languages_returns_seeded(admin_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/localisation/languages", headers=admin_headers)
    assert r.status_code == 200
    codes = {row["code"] for row in r.json()["languages"]}
    assert {"en", "hi", "ta"}.issubset(codes)


@pytest.mark.asyncio
async def test_add_and_disable_language(admin_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/localisation/languages", headers=admin_headers, json={
            "code": "gu", "name": "Gujarati", "nativeName": "ગુજરાતી",
            "script": "Gujarati", "enabled": True, "sortOrder": 55,
        })
        assert r.status_code == 200
        r2 = await c.patch("/localisation/languages/gu", headers=admin_headers,
                           json={"enabled": False})
        assert r2.status_code == 200
        r3 = await c.get("/localisation/languages?includeDisabled=true", headers=admin_headers)
        gu = next(x for x in r3.json()["languages"] if x["code"] == "gu")
        assert gu["enabled"] is False
