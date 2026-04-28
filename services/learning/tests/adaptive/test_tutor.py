"""POST /adaptive/tutor/chat — streaming heuristic path (LLM disabled).

The LLM-enabled path is exercised live with OPENAI_API_KEY set; this suite asserts
the SSE shape, history trimming, and graceful-degrade behaviour.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from learning.adaptive import tutor
from learning.main import app

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    async def _topic(_topic_id: str) -> dict[str, Any]:
        return {"title": "Mechanics", "subjectName": "Physics", "examName": "NEET"}

    async def _mastery(_user_id: str | None, _topic_id: str) -> float | None:
        return 0.42

    monkeypatch.setattr("learning.adaptive.tutor._fetch_topic", _topic)
    monkeypatch.setattr("learning.adaptive.tutor._resolve_mastery", _mastery)
    # Force LLM disabled — stream_chat will yield its canned offline message.
    monkeypatch.setattr("learning.adaptive.llm.is_enabled", lambda: False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_tutor_chat_streams_sse_frames(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/tutor/chat",
        json={
            "topicId": "00000000-0000-0000-0000-000000000001",
            "messages": [{"role": "user", "content": "Why is force = ma?"}],
            "userId": "00000000-0000-0000-0000-000000000099",
        },
    )
    assert r.status_code == 200
    assert "text/event-stream" in r.headers.get("content-type", "")
    body = r.text
    assert "data: " in body
    assert "[DONE]" in body
    # Heuristic offline message includes a hint about OPENAI_API_KEY.
    assert "OPENAI_API_KEY" in body or "unavailable" in body.lower()


async def test_tutor_chat_rejects_empty_messages(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/tutor/chat",
        json={
            "topicId": "00000000-0000-0000-0000-000000000001",
            "messages": [],
        },
    )
    assert r.status_code == 422


def test_history_trim_keeps_last_user_message_first() -> None:
    history = [
        {"role": "user", "content": "Q1"},
        {"role": "assistant", "content": "A1"},
        {"role": "user", "content": "Q2"},
        {"role": "assistant", "content": "A2"},
        {"role": "user", "content": "Q3"},
    ]
    trimmed = tutor._trim_history(history)
    # Must start with `user` for chat-completion shape correctness
    assert trimmed[0]["role"] == "user"
    assert trimmed[-1]["content"] == "Q3"


def test_history_trim_caps_to_max() -> None:
    long_history = [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"}
        for i in range(40)
    ]
    trimmed = tutor._trim_history(long_history)
    assert len(trimmed) <= tutor.MAX_HISTORY_MESSAGES
    assert trimmed[0]["role"] == "user"


def test_build_system_branches_on_mastery() -> None:
    weak = tutor._build_system({"title": "Mechanics", "subjectName": "Physics", "examName": "NEET"}, 0.2)
    mid = tutor._build_system({"title": "Mechanics", "subjectName": "Physics", "examName": "NEET"}, 0.55)
    strong = tutor._build_system({"title": "Mechanics", "subjectName": "Physics", "examName": "NEET"}, 0.85)
    cold = tutor._build_system({"title": "Mechanics", "subjectName": "Physics", "examName": "NEET"}, None)

    assert "struggling" in weak
    assert "developing" in mid
    assert "confident" in strong
    assert "beginner" in cold
