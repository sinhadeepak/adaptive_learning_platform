"""GET /adaptive/rank-projection/{user_id}?exam=… — heuristic path (LLM disabled)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from learning.adaptive import rank
from learning.main import app

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    async def _readiness(_user_id: str) -> dict[str, Any]:
        return {"score": 0.78, "nTopics": 6}

    async def _mastery(_user_id: str) -> list[dict[str, Any]]:
        return [
            {"topicId": "t-1", "ewa": 0.85, "n": 25},
            {"topicId": "t-2", "ewa": 0.62, "n": 20},
            {"topicId": "t-3", "ewa": 0.30, "n": 12},
        ]

    monkeypatch.setattr("learning.adaptive.rank.fetch_readiness", _readiness)
    monkeypatch.setattr("learning.adaptive.rank.fetch_mastery", _mastery)

    async def _llm_off() -> bool:
        return False

    monkeypatch.setattr("learning.adaptive.llm.is_enabled_async", _llm_off)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def test_readiness_to_percentile_monotonic() -> None:
    last = -1.0
    for r in [0.0, 0.1, 0.3, 0.5, 0.7, 0.85, 0.95, 1.0]:
        p = rank.readiness_to_percentile(r)
        assert 0.0 <= p <= 100.0
        assert p > last  # strictly increasing
        last = p


def test_readiness_clamps_outside_range() -> None:
    assert rank.readiness_to_percentile(-1.0) == rank.readiness_to_percentile(0.0)
    assert rank.readiness_to_percentile(2.0) == rank.readiness_to_percentile(1.0)


def test_percentile_to_rank_inversely_proportional() -> None:
    # 99th percentile in 1M cohort → ~10k rank
    assert rank.percentile_to_rank(99.0, 1_000_000) == 10_000
    assert rank.percentile_to_rank(50.0, 1_000_000) == 500_000
    assert rank.percentile_to_rank(100.0, 1_000_000) == 1
    # 0th percentile → bottom rank, never zero
    assert rank.percentile_to_rank(0.0, 1_000_000) == 1_000_000


def test_confidence_widens_for_low_attempts() -> None:
    low_label, low_w = rank.confidence_from_attempts(5)
    med_label, med_w = rank.confidence_from_attempts(30)
    high_label, high_w = rank.confidence_from_attempts(100)
    assert low_label == "low"
    assert med_label == "medium"
    assert high_label == "high"
    assert low_w > med_w > high_w


async def test_rank_projection_neet_default(client: AsyncClient) -> None:
    r = await client.get("/adaptive/rank-projection/u-1")
    assert r.status_code == 200
    body = r.json()
    assert body["examCode"] == "NEET"
    assert body["examName"].startswith("NEET")
    assert body["readiness"] == pytest.approx(0.78, abs=0.001)
    # readiness 0.78 sits between 0.70 and 0.80 → percentile somewhere ~85-93
    assert 80.0 <= body["projectedPercentile"] <= 95.0
    assert body["rankLow"] < body["projectedRank"] < body["rankHigh"]
    assert body["source"] == "heuristic"
    assert body["commentary"]["headline"]
    assert body["commentary"]["next_action"]


async def test_rank_projection_supports_jee(client: AsyncClient) -> None:
    r = await client.get("/adaptive/rank-projection/u-1?exam=JEE")
    assert r.status_code == 200
    body = r.json()
    assert body["examCode"] == "JEE"
    # JEE Main candidate pool is ~14L vs NEET ~24L, so JEE projected rank should be tighter.
    assert body["totalCandidates"] == 1_400_000


async def test_rank_projection_unknown_exam_returns_error_payload(client: AsyncClient) -> None:
    r = await client.get("/adaptive/rank-projection/u-1?exam=GATE")
    assert r.status_code == 200
    body = r.json()
    assert body.get("error") == "unsupported_exam"


async def test_rank_projection_cold_start_user(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """A user with zero attempts should get low confidence + a 'too early' message."""

    async def _empty_readiness(_user_id: str) -> dict[str, Any]:
        return {"score": 0.0, "nTopics": 0}

    async def _empty_mastery(_user_id: str) -> list[dict[str, Any]]:
        return []

    monkeypatch.setattr("learning.adaptive.rank.fetch_readiness", _empty_readiness)
    monkeypatch.setattr("learning.adaptive.rank.fetch_mastery", _empty_mastery)

    r = await client.get("/adaptive/rank-projection/cold")
    assert r.status_code == 200
    body = r.json()
    assert body["nAttempts"] == 0
    assert body["confidence"] == "low"
    assert "early" in body["commentary"]["headline"].lower() or body["projectedPercentile"] < 20
