"""Screening route tests — Phase 2f focuses on the /next response shape.

The next_question handler is pure async — it reads the in-memory _store
payload. We seed sessions directly via _store._inproc and call the
handler as a function, avoiding TestClient/lifespan startup (which would
conflict with the live docker-compose learning container's NATS subs).
"""

from __future__ import annotations

import asyncio
import math
import os
import time
from uuid import uuid4

os.environ.setdefault(
    "CONTENT_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/learning_test",
)
os.environ.setdefault(
    "CONTENT_JWT_SECRET",
    "dev-only-change-me-in-staging-at-least-32-bytes-long",
)

from learning.screening import store as _store
from learning.screening.routes import next_question


def _seed_session(items: list[dict], responses: list[dict]) -> str:
    token = str(uuid4())
    payload = {
        "exam_code": "JEE-MAIN",
        "language": "en",
        "items": items,
        "responses": responses,
        "started_at": "2026-05-26T00:00:00+00:00",
    }
    _store._inproc[token] = (time.time() + 1800, payload)
    return token


def _item(idx: int, b: float = 0.0) -> dict:
    return {
        "id": f"q-{idx}",
        "topic_id": "33333333-0000-0000-0000-000000000001",
        "stem": f"Question {idx}",
        "choices": ["A", "B", "C", "D"],
        "correct_idx": 0,
        "difficulty_b": b,
    }


def _call_next(token: str):
    return asyncio.run(next_question(token))


def test_next_item_1_returns_theta_zero_se_one() -> None:
    """Item-1 special case: no answers yet -> theta=0.0, SE=1.0."""
    token = _seed_session(
        items=[_item(0, b=0.3), _item(1, b=-0.1)],
        responses=[],
    )
    resp = _call_next(token)
    assert resp.theta_estimate == 0.0
    assert resp.theta_se == 1.0
    assert resp.next_q_b == 0.3


def test_next_after_correct_answer_shifts_theta_up() -> None:
    """1 correct of 1 -> score=1.0 -> theta = (1.0-0.5)*3 = 1.5 (clamped)."""
    token = _seed_session(
        items=[_item(0, b=0.3), _item(1, b=0.7)],
        responses=[
            {"item_idx": 0, "topic_id": "t1", "answer_idx": 0, "is_correct": True},
        ],
    )
    resp = _call_next(token)
    assert resp.theta_estimate == 1.5
    # theta_se = max(0.6, 1/sqrt(2)) ~= 0.707
    assert math.isclose(resp.theta_se, 1.0 / math.sqrt(2), rel_tol=1e-4)
    assert resp.next_q_b == 0.7


def test_next_after_incorrect_answer_shifts_theta_down() -> None:
    """0 correct of 1 -> score=0.0 -> theta = -1.5 (clamped)."""
    token = _seed_session(
        items=[_item(0, b=0.0), _item(1, b=0.0)],
        responses=[
            {"item_idx": 0, "topic_id": "t1", "answer_idx": 1, "is_correct": False},
        ],
    )
    resp = _call_next(token)
    assert resp.theta_estimate == -1.5


def test_next_se_floor_at_0_6() -> None:
    """After n>=3 answers, 1/sqrt(n+1) drops below 0.6 -> floor applies."""
    items = [_item(i, b=0.0) for i in range(5)]
    responses = [
        {"item_idx": i, "topic_id": "t1", "answer_idx": 0, "is_correct": True}
        for i in range(4)
    ]
    token = _seed_session(items=items, responses=responses)
    resp = _call_next(token)
    # 1/sqrt(5) ~= 0.447 < 0.6 -> floor wins
    assert resp.theta_se == 0.6


def test_next_unchanged_fields_still_present() -> None:
    """Forward-compat regression: existing item_idx/total/stem/choices unchanged."""
    token = _seed_session(items=[_item(0, b=0.0)], responses=[])
    resp = _call_next(token)
    assert resp.item_idx == 0
    assert resp.total == 1
    assert resp.stem == "Question 0"
    assert resp.choices == ["A", "B", "C", "D"]
