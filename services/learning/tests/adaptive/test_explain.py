"""POST /adaptive/explain — heuristic path (LLM disabled).

The LLM-enabled path is exercised live during smoke tests with OPENAI_API_KEY set.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from learning.main import app

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    monkeypatch.setattr("learning.adaptive.llm.is_enabled", lambda: False)

    async def _no_llm(**_: object) -> None:
        return None

    monkeypatch.setattr("learning.adaptive.explain.llm.call_structured", _no_llm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_explain_correct_answer(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/explain",
        json={
            "stem": "What is 2 + 2?",
            "choices": ["3", "4", "5", "22"],
            "correctIdx": 1,
            "pickedIdx": 1,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "heuristic"
    assert "4" in body["explanation"]
    assert body["key_concept"]
    assert body["common_pitfall"]


async def test_explain_wrong_answer_is_canonical(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/explain",
        json={
            "stem": "What is 2 + 2?",
            "choices": ["3", "4", "5", "22"],
            "correctIdx": 1,
            "pickedIdx": 3,
        },
    )
    assert r.status_code == 200
    body = r.json()
    # Explanations are canonical per question — picked_idx is not part of
    # the cache key and is never referenced (see explain.py). The heuristic
    # still returns a substantive, non-empty pitfall.
    assert body["source"] == "heuristic"
    assert body["common_pitfall"]


async def test_explain_unanswered(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/explain",
        json={
            "stem": "What is the capital of France?",
            "choices": ["Berlin", "Paris", "Madrid"],
            "correctIdx": 1,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "heuristic"
