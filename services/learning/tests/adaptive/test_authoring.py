"""POST /adaptive/authoring/generate-questions — stub path (LLM disabled).

The real generation path is exercised live with OPENAI_API_KEY set; this suite
asserts the stub shape, validation, and topic-resolution behaviour.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from learning.adaptive import authoring
from learning.main import app

pytestmark = pytest.mark.asyncio


async def _llm_off() -> bool:
    return False


async def _llm_on() -> bool:
    return True


@pytest_asyncio.fixture
async def client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    # authoring gates on is_enabled_async (admin provider chain), not the
    # legacy sync is_enabled.
    monkeypatch.setattr("learning.adaptive.llm.is_enabled_async", _llm_off)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_authoring_stub_when_llm_off(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/authoring/generate-questions",
        json={
            "topicId": "00000000-0000-0000-0000-000000000001",
            "count": 5,
            "language": "en",
            "difficulty": "mixed",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "stub"
    assert body["questions"] == []
    assert "OPENAI_API_KEY" in body["message"]


async def test_authoring_rejects_count_out_of_range(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/authoring/generate-questions",
        json={"topicId": "x", "count": 0, "language": "en", "difficulty": "mixed"},
    )
    assert r.status_code == 422
    r = await client.post(
        "/adaptive/authoring/generate-questions",
        json={"topicId": "x", "count": 101, "language": "en", "difficulty": "mixed"},
    )
    assert r.status_code == 422


async def test_authoring_rejects_invalid_difficulty(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/authoring/generate-questions",
        json={"topicId": "x", "count": 5, "language": "en", "difficulty": "extreme"},
    )
    assert r.status_code == 422


async def test_authoring_rejects_invalid_language(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/authoring/generate-questions",
        json={"topicId": "x", "count": 5, "language": "fr", "difficulty": "mixed"},
    )
    assert r.status_code == 422


async def test_authoring_module_validates_count_when_llm_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the LLM is enabled but count is out-of-range at the module level
    (defensive — Pydantic already filtered), we still get a stub message."""
    monkeypatch.setattr("learning.adaptive.llm.is_enabled_async", _llm_on)

    out = await authoring.generate_questions(topic_id="x", count=0, language="en")
    assert out["source"] == "stub"
    assert "between 1 and 100" in out["message"]


async def test_authoring_handles_missing_topic(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("learning.adaptive.llm.is_enabled_async", _llm_on)

    async def _no_topic(_topic_id: str) -> dict[str, Any] | None:
        return None

    monkeypatch.setattr("learning.adaptive.authoring._fetch_topic", _no_topic)
    out = await authoring.generate_questions(topic_id="missing", count=3)
    assert out["source"] == "stub"
    assert "catalog" in out["message"].lower()
