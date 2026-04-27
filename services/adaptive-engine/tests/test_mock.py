"""POST /adaptive/mock/plan + /score — full mock-test round trip."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from adaptive_engine import mock as mock_mod
from adaptive_engine.main import app

pytestmark = pytest.mark.asyncio


# Catalog: 4 topics across NEET's 3 sections.
_CATALOG = [
    {"topicId": "t-mech", "title": "Mechanics", "subjectName": "Physics", "examName": "NEET", "examCode": "NEET", "questionCount": 8},
    {"topicId": "t-org", "title": "Organic Chem", "subjectName": "Chemistry", "examName": "NEET", "examCode": "NEET", "questionCount": 8},
    {"topicId": "t-cell", "title": "Cell Biology", "subjectName": "Biology", "examName": "NEET", "examCode": "NEET", "questionCount": 8},
    {"topicId": "t-gen", "title": "Genetics", "subjectName": "Biology", "examName": "NEET", "examCode": "NEET", "questionCount": 8},
]


def _q(qid: str, topic: str, correct: int) -> dict[str, Any]:
    return {
        "id": qid,
        "topicId": topic,
        "stem": f"Q {qid}",
        "choices": ["a", "b", "c", "d"],
        "correctIdx": correct,
        "difficultyB": 0.0,
        "language": "en",
    }


# Per-topic question pool. Enough items per topic for the section share.
_BANK: dict[str, list[dict[str, Any]]] = {
    "t-mech": [_q(f"qm{i}", "t-mech", i % 4) for i in range(6)],
    "t-org":  [_q(f"qo{i}", "t-org", i % 4) for i in range(6)],
    "t-cell": [_q(f"qc{i}", "t-cell", i % 4) for i in range(8)],
    "t-gen":  [_q(f"qg{i}", "t-gen", i % 4) for i in range(8)],
}


@pytest_asyncio.fixture
async def client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    async def _stub_catalog(_exam: str | None = None) -> list[dict[str, Any]]:
        return _CATALOG

    async def _stub_mastery(_user: str) -> list[dict[str, Any]]:
        return [{"topicId": "t-mech", "ewa": 0.6, "n": 4}]

    async def _stub_similar(topic_id: str, limit: int = 3) -> list[dict[str, Any]]:
        return _BANK.get(topic_id, [])[:limit]

    monkeypatch.setattr("adaptive_engine.mock.fetch_topic_catalog", _stub_catalog)
    monkeypatch.setattr("adaptive_engine.mock.fetch_mastery", _stub_mastery)
    monkeypatch.setattr("adaptive_engine.mock.fetch_similar_problems", _stub_similar)
    # Reset in-memory mock store between tests so eviction logic is consistent.
    mock_mod._active_mocks.clear()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_mock_plan_returns_blueprint(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/mock/plan",
        json={"userId": "u-1", "examCode": "NEET"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["examCode"] == "NEET"
    assert body["totalQuestions"] > 0
    assert len(body["questions"]) == body["totalQuestions"]
    assert "mockId" in body
    # Sections cover the questions list.
    section_total = sum(s["questionCount"] for s in body["sections"])
    assert section_total == body["totalQuestions"]


async def test_mock_plan_does_not_leak_correct_answers(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/mock/plan",
        json={"userId": "u-1", "examCode": "NEET"},
    )
    body = r.json()
    body_str = r.text
    assert "_correctMap" not in body_str
    for q in body["questions"]:
        assert "correctIdx" not in q


async def test_mock_score_round_trip(client: AsyncClient) -> None:
    plan_r = await client.post(
        "/adaptive/mock/plan",
        json={"userId": "u-1", "examCode": "NEET"},
    )
    plan = plan_r.json()
    mock_id = plan["mockId"]
    # Build an answer map: half correct, half wrong.
    server_plan = mock_mod.get_active_mock(mock_id)
    assert server_plan is not None
    correct_map = server_plan["_correctMap"]
    answers: dict[str, int] = {}
    for i, q in enumerate(plan["questions"]):
        cidx = correct_map[q["id"]]
        if i % 2 == 0:
            answers[q["id"]] = cidx  # correct
        else:
            answers[q["id"]] = (cidx + 1) % 4  # wrong

    r = await client.post(
        "/adaptive/mock/score",
        json={"mockId": mock_id, "answers": answers},
    )
    assert r.status_code == 200
    body = r.json()
    expected_correct = (len(plan["questions"]) + 1) // 2
    assert body["nCorrect"] == expected_correct
    assert body["nWrong"] == len(plan["questions"]) // 2
    assert body["projectedRank"] > 0
    assert body["percentile"] >= 0
    assert len(body["sections"]) == len(plan["sections"])


async def test_mock_score_unknown_mock_returns_error(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/mock/score",
        json={"mockId": "mock_not_a_real_id", "answers": {}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["error"] == "mock_not_found"


async def test_mock_plan_unsupported_exam(client: AsyncClient) -> None:
    r = await client.post(
        "/adaptive/mock/plan",
        json={"userId": "u-1", "examCode": "GATE"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["error"] == "unsupported_exam"


async def test_mock_unanswered_questions_count_separately(client: AsyncClient) -> None:
    plan_r = await client.post(
        "/adaptive/mock/plan",
        json={"userId": "u-1", "examCode": "NEET"},
    )
    plan = plan_r.json()
    mock_id = plan["mockId"]
    # Submit an empty answer map → all unanswered.
    r = await client.post(
        "/adaptive/mock/score",
        json={"mockId": mock_id, "answers": {}},
    )
    body = r.json()
    assert body["nUnanswered"] == plan["totalQuestions"]
    assert body["nCorrect"] == 0
    assert body["nWrong"] == 0
    assert body["rawScore"] == 0
