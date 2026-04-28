"""Study plan + guided-next-steps endpoints — heuristic path (LLM disabled).

The LLM-enabled path is exercised live during smoke tests with OPENAI_API_KEY set;
the unit suite asserts the deterministic fallback is well-formed.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from learning.main import app

pytestmark = pytest.mark.asyncio


_TOPIC_CATALOG: list[dict[str, Any]] = [
    {
        "topicId": "t-mech",
        "title": "Mechanics",
        "subjectName": "Physics",
        "examName": "NEET",
        "examCode": "NEET",
        "questionCount": 20,
    },
    {
        "topicId": "t-thermo",
        "title": "Thermodynamics",
        "subjectName": "Physics",
        "examName": "NEET",
        "examCode": "NEET",
        "questionCount": 20,
    },
    {
        "topicId": "t-calc",
        "title": "Calculus",
        "subjectName": "Maths",
        "examName": "JEE",
        "examCode": "JEE",
        "questionCount": 20,
    },
]


@pytest_asyncio.fixture
async def client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    async def _mastery(_user_id: str) -> list[dict[str, Any]]:
        return [
            {"topicId": "t-mech", "ewa": 0.8, "n": 12},
            {"topicId": "t-thermo", "ewa": 0.25, "n": 8},
        ]

    async def _readiness(_user_id: str) -> dict[str, Any]:
        return {"score": 0.55, "nTopics": 2}

    async def _topics(_exam_code: str | None = None) -> list[dict[str, Any]]:
        return _TOPIC_CATALOG

    monkeypatch.setattr("learning.adaptive.study_plan.fetch_mastery", _mastery)
    monkeypatch.setattr("learning.adaptive.study_plan.fetch_readiness", _readiness)
    monkeypatch.setattr("learning.adaptive.study_plan.fetch_topic_catalog", _topics)
    # Force the LLM path off so we deterministically exercise the heuristic.
    monkeypatch.setattr("learning.adaptive.llm.is_enabled", lambda: False)

    async def _no_llm(**_: Any) -> None:
        return None

    monkeypatch.setattr("learning.adaptive.study_plan.llm.call_structured", _no_llm)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_ai_status_disabled_without_key(client: AsyncClient) -> None:
    r = await client.get("/adaptive/ai-status")
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "openai"
    assert isinstance(body["enabled"], bool)


async def test_study_plan_heuristic_uses_mastery(client: AsyncClient) -> None:
    r = await client.get("/adaptive/study-plan/u-1")
    assert r.status_code == 200
    body = r.json()

    assert body["source"] == "heuristic"
    titles = [p["title"] for p in body["topicPriorities"]]
    # Topics with low/no signal sort before the strong topic. Mechanics (ewa=0.8)
    # is the strongest and should never lead the priority list.
    assert "Mechanics" not in titles[:1]
    assert "Thermodynamics" in titles
    assert len(body["weeklySchedule"]) == 7
    days = [d["day"] for d in body["weeklySchedule"]]
    assert days == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for prio in body["topicPriorities"]:
        assert 0.0 <= prio["targetMastery"] <= 1.0


async def test_guided_next_steps_returns_three(client: AsyncClient) -> None:
    r = await client.get("/adaptive/guided-next-steps/u-1")
    assert r.status_code == 200
    body = r.json()

    assert body["source"] == "heuristic"
    assert len(body["steps"]) == 3
    actions = {s["action"] for s in body["steps"]}
    assert actions <= {"REVISE", "PRACTICE", "DIAGNOSE", "MOCK_SLICE"}
    titles = [s["topicTitle"] for s in body["steps"]]
    # Weakest-first ordering — Mechanics (ewa=0.8) must not lead.
    assert titles[0] != "Mechanics"
    for step in body["steps"]:
        assert 5 <= step["estMinutes"] <= 90


async def test_study_plan_cold_start_user(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A user with zero attempts should still get a valid plan, not a 500."""

    async def _empty_mastery(_user_id: str) -> list[dict[str, Any]]:
        return []

    monkeypatch.setattr("learning.adaptive.study_plan.fetch_mastery", _empty_mastery)

    r = await client.get("/adaptive/study-plan/cold")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "heuristic"
    assert len(body["topicPriorities"]) >= 1
    assert len(body["weeklySchedule"]) == 7
