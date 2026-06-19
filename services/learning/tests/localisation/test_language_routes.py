"""Tests for language CRUD routes (Task 3 — registry-backed validation)."""

import pytest
from unittest.mock import MagicMock
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
async def test_languages_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/localisation/languages")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_add_and_disable_language(admin_headers, content_session):
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

    # Cleanup: remove the test row so it doesn't pollute the shared DB
    from sqlalchemy import text
    await content_session.execute(
        text("DELETE FROM content_schema.supported_languages WHERE code='gu'")
    )
    await content_session.commit()


@pytest.mark.asyncio
async def test_request_translation_lang_gated_by_registry(admin_headers, content_session):
    """Verify that POST /content/questions/{id}/translations/{lang}/request
    uses the language registry (not the hardcoded SUPPORTED_LANGS list) to
    validate the target language.

    Steps:
    1. Disable bn via PATCH /localisation/languages/bn.
    2. POST /content/questions/<nonexistent>/translations/bn/request
       → 400 unsupported_language (lang gate fires before question lookup).
    3. POST /content/questions/<nonexistent>/translations/hi/request
       → 404 question_not_found (passes lang gate; hi is enabled).
    4. Re-enable bn so the shared test DB is left clean.
    """
    from sqlalchemy import text

    # A UUID that does not exist in content_schema.questions.
    ghost_id = "ffffffff-ffff-ffff-ffff-ffffffffffff"

    # Set a stub gateway so _gateway() dependency resolves rather than 503ing.
    stub_gw = MagicMock()
    app.state.ai_gateway = stub_gw
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://t") as c:
            # Step 1: disable bn via the PATCH route.
            patch_r = await c.patch(
                "/localisation/languages/bn",
                headers=admin_headers,
                json={"enabled": False},
            )
            assert patch_r.status_code == 200, patch_r.text

            # Step 2: bn now disabled → lang gate should reject with 400.
            r_bn = await c.post(
                f"/content/questions/{ghost_id}/translations/bn/request",
                headers=admin_headers,
                json={"sourceLang": "en"},
            )
            assert r_bn.status_code == 400, r_bn.text
            body = r_bn.json()
            detail = body.get("detail", body)
            assert detail.get("code") == "unsupported_language"

            # Step 3: hi is still enabled → lang gate passes; question absent → 404.
            r_hi = await c.post(
                f"/content/questions/{ghost_id}/translations/hi/request",
                headers=admin_headers,
                json={"sourceLang": "en"},
            )
            assert r_hi.status_code == 404, r_hi.text

            # Step 4: re-enable bn so we leave the shared DB clean.
            restore_r = await c.patch(
                "/localisation/languages/bn",
                headers=admin_headers,
                json={"enabled": True},
            )
            assert restore_r.status_code == 200, restore_r.text
    finally:
        # Always ensure bn is restored even if an assertion failed mid-test.
        app.state.ai_gateway = None
        from learning.localisation.language_registry import set_enabled
        await set_enabled(content_session, code="bn", enabled=True)
        await content_session.commit()
