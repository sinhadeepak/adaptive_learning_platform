"""AI provider gating — active_provider() + /adaptive/ai-status honor the
admin provider chain, not just OPENAI_API_KEY.

Regression guard for the gap where the teacher/learner UI was told "AI off"
(and provider "openai") whenever no env key was set, even though an admin
provider was enabled in /admin/ai-providers.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from learning.adaptive import llm
from learning.main import app

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def _force_no_db(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make the provider-chain DB lookup raise, so active_provider() /
    is_enabled_async() exercise their env-key fallback deterministically
    regardless of whether a DB happens to be reachable in the test env."""
    def _boom() -> None:
        raise RuntimeError("no db in unit test")

    monkeypatch.setattr("learning.content.db.sessionmaker", _boom)


async def test_active_provider_env_key_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    _force_no_db(monkeypatch)
    monkeypatch.setattr(llm.settings, "openai_api_key", "sk-test")
    assert await llm.active_provider() == "OpenAI"
    assert await llm.is_enabled_async() is True


async def test_active_provider_none_when_nothing_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _force_no_db(monkeypatch)
    monkeypatch.setattr(llm.settings, "openai_api_key", "")
    assert await llm.active_provider() is None
    assert await llm.is_enabled_async() is False


async def test_ai_status_reports_admin_provider(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Even with no env key, an enabled admin provider → enabled:true and
    the provider's display name (not a hardcoded 'openai')."""

    async def _enabled() -> bool:
        return True

    async def _provider() -> str:
        return "Ollama (local)"

    monkeypatch.setattr("learning.adaptive.llm.is_enabled_async", _enabled)
    monkeypatch.setattr("learning.adaptive.llm.active_provider", _provider)

    r = await client.get("/adaptive/ai-status")
    assert r.status_code == 200
    assert r.json() == {"enabled": True, "provider": "Ollama (local)"}


async def test_ai_status_none_when_no_ai(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _disabled() -> bool:
        return False

    async def _no_provider() -> None:
        return None

    monkeypatch.setattr("learning.adaptive.llm.is_enabled_async", _disabled)
    monkeypatch.setattr("learning.adaptive.llm.active_provider", _no_provider)

    r = await client.get("/adaptive/ai-status")
    assert r.status_code == 200
    assert r.json() == {"enabled": False, "provider": "none"}
