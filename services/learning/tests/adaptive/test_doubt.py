"""POST /adaptive/doubt/photo — stub path (LLM disabled).

The vision-enabled path is exercised live with OPENAI_API_KEY set; this suite
asserts the stub shape, route validation, and topic-matching behaviour.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from learning.adaptive import doubt
from learning.main import app

pytestmark = pytest.mark.asyncio

_TINY_PNG = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
)


@pytest_asyncio.fixture
async def client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    monkeypatch.setattr("learning.adaptive.llm.is_enabled", lambda: False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_doubt_stub_when_llm_off(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/doubt/photo", json={"imageDataUrl": _TINY_PNG}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "stub"
    assert body["confidence"] == "low"
    assert body["similar_problems"] == []
    assert "OPENAI_API_KEY" in " ".join(body["solution_steps"])


async def test_doubt_rejects_too_short(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/doubt/photo", json={"imageDataUrl": "x"}
    )
    assert r.status_code == 422


def test_normalize_strips_punctuation_and_case() -> None:
    assert doubt._normalize("Cell Biology") == "cellbiology"
    assert doubt._normalize("Mechanics & Waves") == "mechanicswaves"


async def test_match_topic_id_exact_then_substring(monkeypatch: pytest.MonkeyPatch) -> None:
    catalog = [
        {"topicId": "t-1", "title": "Mechanics"},
        {"topicId": "t-2", "title": "Differential Calculus"},
        {"topicId": "t-3", "title": "Cell Biology"},
    ]

    async def _stub(_exam_code: str | None = None) -> list[dict[str, Any]]:
        return catalog

    monkeypatch.setattr("learning.adaptive.doubt.fetch_topic_catalog", _stub)
    assert await doubt._match_topic_id("Mechanics") == "t-1"  # exact
    assert await doubt._match_topic_id("calculus") == "t-2"  # substring
    assert await doubt._match_topic_id("Quantum Mechanics") is None or await doubt._match_topic_id("Quantum Mechanics") == "t-1"
    assert await doubt._match_topic_id("Astrophysics") is None


async def test_match_topic_id_returns_none_for_empty() -> None:
    assert await doubt._match_topic_id("") is None
