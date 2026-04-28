"""Integration tests: drive the NATS handler directly with a fake Msg, then
read back via the HTTP API. Exercises EWA, readiness, idempotency, multi-topic.

Uses httpx AsyncClient + ASGITransport so the FastAPI app runs in the same
event loop as the asyncpg engine — avoids the cross-loop futures errors
TestClient provokes when test fixtures bind a pool to one loop and
TestClient's worker thread creates another.

Skipped if Postgres at ANALYTICS_DATABASE_URL is unreachable.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from engagement.analytics.events import _on_session_completed
from engagement.main import app


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class FakeMsg:
    """Mimics enough of nats.aio.msg.Msg for the JetStream handler to
    drive ack/term/nak without a real subscription. Records the terminal
    action so tests can assert which path the handler took."""

    def __init__(self, payload: dict) -> None:
        self.data = json.dumps(payload).encode("utf-8")
        self.action: str | None = None  # "ack" | "term" | "nak"

    async def ack(self) -> None:
        self.action = "ack"

    async def term(self) -> None:
        self.action = "term"

    async def nak(self, *, delay: int | None = None) -> None:
        self.action = "nak"


def _payload(*, user_id: str, topic_id: str, score: float, session_id: str | None = None) -> dict:
    return {
        "session_id": session_id or str(uuid4()),
        "user_id": user_id,
        "topic_id": topic_id,
        "mode": "PRACTICE",
        "strategy": "binary_search",
        "served_count": 5,
        "correct_count": round(score * 5),
        "ability_estimate": 0.0,
        "score": score,
        "submitted_at": datetime.now(tz=UTC).isoformat(),
        "ts": datetime.now(tz=UTC).isoformat(),
    }


@pytest.mark.asyncio
async def test_first_session_seeds_mastery_and_readiness(client: AsyncClient) -> None:
    user = str(uuid4())
    topic = str(uuid4())
    await _on_session_completed(FakeMsg(_payload(user_id=user, topic_id=topic, score=0.8)))

    m = await client.get(f"/analytics/mastery/{user}/{topic}")
    assert m.status_code == 200
    body = m.json()
    assert body["ewa"] == pytest.approx(0.8)
    assert body["n"] == 1

    r = await client.get(f"/analytics/readiness/{user}")
    assert r.status_code == 200
    rb = r.json()
    assert rb["score"] == pytest.approx(0.8)
    assert rb["nTopics"] == 1


@pytest.mark.asyncio
async def test_second_session_blends_via_ewa(client: AsyncClient) -> None:
    user = str(uuid4())
    topic = str(uuid4())
    await _on_session_completed(FakeMsg(_payload(user_id=user, topic_id=topic, score=0.8)))
    await _on_session_completed(FakeMsg(_payload(user_id=user, topic_id=topic, score=0.4)))

    body = (await client.get(f"/analytics/mastery/{user}/{topic}")).json()
    # alpha=0.4 → ewa = 0.4*0.4 + 0.6*0.8 = 0.64
    assert body["ewa"] == pytest.approx(0.64, abs=1e-3)
    assert body["n"] == 2


@pytest.mark.asyncio
async def test_idempotent_replay(client: AsyncClient) -> None:
    user = str(uuid4())
    topic = str(uuid4())
    sid = str(uuid4())
    p = _payload(user_id=user, topic_id=topic, score=0.6, session_id=sid)
    await _on_session_completed(FakeMsg(p))
    await _on_session_completed(FakeMsg(p))  # redelivery
    await _on_session_completed(FakeMsg(p))  # redelivery

    body = (await client.get(f"/analytics/mastery/{user}/{topic}")).json()
    # Only counted once: n=1, ewa=0.6 (cold-start single observation)
    assert body["n"] == 1
    assert body["ewa"] == pytest.approx(0.6)


@pytest.mark.asyncio
async def test_multi_topic_readiness_is_average(client: AsyncClient) -> None:
    user = str(uuid4())
    topic_a = str(uuid4())
    topic_b = str(uuid4())
    await _on_session_completed(FakeMsg(_payload(user_id=user, topic_id=topic_a, score=0.9)))
    await _on_session_completed(FakeMsg(_payload(user_id=user, topic_id=topic_b, score=0.5)))

    rb = (await client.get(f"/analytics/readiness/{user}")).json()
    assert rb["score"] == pytest.approx(0.7)
    assert rb["nTopics"] == 2

    listing = (await client.get(f"/analytics/mastery/{user}")).json()
    assert {t["topicId"] for t in listing["topics"]} == {topic_a, topic_b}


@pytest.mark.asyncio
async def test_unknown_user_readiness_is_zero(client: AsyncClient) -> None:
    r = await client.get(f"/analytics/readiness/{uuid4()}")
    assert r.status_code == 200
    body = r.json()
    assert body["score"] == 0.0
    assert body["nTopics"] == 0


@pytest.mark.asyncio
async def test_unknown_topic_mastery_is_404(client: AsyncClient) -> None:
    r = await client.get(f"/analytics/mastery/{uuid4()}/{uuid4()}")
    assert r.status_code == 404
