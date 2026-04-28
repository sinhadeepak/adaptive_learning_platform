"""GET /adaptive/weakness-diagnosis/{user_id} — heuristic + thin-evidence paths."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from learning.main import app

pytestmark = pytest.mark.asyncio


def _items(n_correct: int, n_wrong: int, topics: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i in range(n_correct):
        out.append(
            {
                "topicId": topics[i % len(topics)],
                "stem": f"Correct stem #{i}",
                "isCorrect": True,
            }
        )
    for i in range(n_wrong):
        out.append(
            {
                "topicId": topics[i % len(topics)],
                "stem": f"Wrong stem #{i} — what is the dimensional formula of force?",
                "isCorrect": False,
            }
        )
    return out


_CATALOG = [
    {"topicId": "t-mech", "title": "Mechanics", "subjectName": "Physics", "examName": "NEET", "examCode": "NEET", "questionCount": 20},
    {"topicId": "t-thermo", "title": "Thermodynamics", "subjectName": "Physics", "examName": "NEET", "examCode": "NEET", "questionCount": 20},
]

_MASTERY = [
    {"topicId": "t-mech", "ewa": 0.3, "n": 12},
    {"topicId": "t-thermo", "ewa": 0.45, "n": 10},
]


@pytest_asyncio.fixture
async def client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    monkeypatch.setattr("learning.adaptive.weakness.fetch_topic_catalog", _stub_catalog)
    monkeypatch.setattr("learning.adaptive.weakness.fetch_mastery", _stub_mastery)
    monkeypatch.setattr("learning.adaptive.llm.is_enabled", lambda: False)

    async def _no_llm(**_: Any) -> None:
        return None

    monkeypatch.setattr("learning.adaptive.weakness.llm.call_structured", _no_llm)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def _stub_catalog(_exam: str | None = None) -> list[dict[str, Any]]:
    return _CATALOG


async def _stub_mastery(_user: str) -> list[dict[str, Any]]:
    return _MASTERY


async def test_weakness_thin_evidence_returns_stub(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fewer than 15 items or fewer than 5 wrong → heuristic stub."""

    async def _few(_user: str, limit: int = 50) -> list[dict[str, Any]]:
        return _items(5, 2, ["t-mech", "t-thermo"])

    monkeypatch.setattr("learning.adaptive.weakness.fetch_user_answered_items", _few)
    r = await client.get("/adaptive/weakness-diagnosis/u-1")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "heuristic"
    assert body["patterns"] == []
    assert "Mechanics" in body["weakest_topics"]


async def test_weakness_no_history(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _none(_user: str, limit: int = 50) -> list[dict[str, Any]]:
        return []

    monkeypatch.setattr("learning.adaptive.weakness.fetch_user_answered_items", _none)
    r = await client.get("/adaptive/weakness-diagnosis/cold")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "heuristic"
    assert body["n_attempts_analyzed"] == 0


async def test_weakness_enough_evidence_but_llm_off(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """LLM off + sufficient evidence → still heuristic (with key-missing message)."""

    async def _enough(_user: str, limit: int = 50) -> list[dict[str, Any]]:
        return _items(20, 10, ["t-mech", "t-thermo"])

    monkeypatch.setattr("learning.adaptive.weakness.fetch_user_answered_items", _enough)
    r = await client.get("/adaptive/weakness-diagnosis/u-1")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "heuristic"
    assert "OPENAI_API_KEY" in body["message"]
    assert body["weakest_topics"]


async def test_weakness_uses_llm_when_enabled(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _enough(_user: str, limit: int = 50) -> list[dict[str, Any]]:
        return _items(20, 10, ["t-mech", "t-thermo"])

    async def _fake_llm(**_: Any) -> dict[str, Any]:
        return {
            "overall_assessment": "Pattern across mechanics and thermo on dimensional analysis.",
            "patterns": [
                {
                    "name": "Dimensional Analysis",
                    "description": "Failing to convert units before applying formulas.",
                    "subjects_affected": ["Mechanics", "Thermodynamics"],
                    "severity": "high",
                    "evidence_count": 6,
                    "prescription": "Drill 10 dimensional-analysis problems mixing both topics.",
                }
            ],
        }

    monkeypatch.setattr("learning.adaptive.weakness.fetch_user_answered_items", _enough)
    monkeypatch.setattr("learning.adaptive.llm.is_enabled", lambda: True)
    monkeypatch.setattr("learning.adaptive.weakness.llm.call_structured", _fake_llm)

    r = await client.get("/adaptive/weakness-diagnosis/u-1")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "ai"
    assert len(body["patterns"]) == 1
    assert body["patterns"][0]["name"] == "Dimensional Analysis"
    assert body["n_attempts_analyzed"] == 30
    assert body["n_wrong"] == 10
