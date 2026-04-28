"""HTTP integration tests for /irt/ability and /irt/select-next.

Uses FastAPI's TestClient — no external services required.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from learning.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_ability_empty_returns_prior(client: TestClient) -> None:
    r = client.post("/irt/ability", json={"responses": []})
    assert r.status_code == 200
    body = r.json()
    assert body["n"] == 0
    assert abs(body["theta"]) < 1e-3
    assert 0.95 < body["se"] < 1.05


def test_ability_with_correct_responses_increases_theta(client: TestClient) -> None:
    payload = {
        "responses": [
            {"a": 1.5, "b": 0.0, "c": 0.1, "is_correct": True},
            {"a": 1.5, "b": 0.0, "c": 0.1, "is_correct": True},
            {"a": 1.5, "b": 0.0, "c": 0.1, "is_correct": True},
        ]
    }
    r = client.post("/irt/ability", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["n"] == 3
    assert body["theta"] > 0.3


def test_select_next_picks_highest_info(client: TestClient) -> None:
    payload = {
        "theta": 0.0,
        "candidates": [
            {"id": "easy", "a": 0.5, "b": 0.0, "c": 0.0},
            {"id": "sharp", "a": 2.5, "b": 0.0, "c": 0.0},
            {"id": "medium", "a": 1.0, "b": 0.0, "c": 0.0},
        ],
    }
    r = client.post("/irt/select-next", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["item_id"] == "sharp"
    assert body["fisher_info"] > 0
    assert body["theta_used"] == 0.0


def test_select_next_excludes_served(client: TestClient) -> None:
    payload = {
        "theta": 0.0,
        "candidates": [
            {"id": "sharp", "a": 2.5, "b": 0.0, "c": 0.0},
            {"id": "medium", "a": 1.0, "b": 0.0, "c": 0.0},
        ],
        "exclude": ["sharp"],
    }
    r = client.post("/irt/select-next", json=payload)
    assert r.status_code == 200
    assert r.json()["item_id"] == "medium"


def test_select_next_returns_none_when_all_excluded(client: TestClient) -> None:
    payload = {
        "theta": 0.0,
        "candidates": [{"id": "x", "a": 1.0, "b": 0.0, "c": 0.0}],
        "exclude": ["x"],
    }
    r = client.post("/irt/select-next", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["item_id"] is None
    assert body["fisher_info"] == 0.0


def test_select_next_validates_a_must_be_positive(client: TestClient) -> None:
    payload = {
        "theta": 0.0,
        "candidates": [{"id": "x", "a": 0.0, "b": 0.0, "c": 0.0}],
    }
    r = client.post("/irt/select-next", json=payload)
    # pydantic schema rejects a <= 0
    assert r.status_code == 422
