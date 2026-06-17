"""Phase 5 (P5-S57) — grader queue + cultural-review queue + persisted cultural_flags.

Pure-route tests via TestClient + fake AsyncSession.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from learning.localisation.repositories import (
    cultural_review_action,
    list_cultural_pending,
    upsert_translation_draft,
)


def _run(coro):
    return asyncio.run(coro)


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows


class _FakeSession:
    def __init__(self, rows: list[dict[str, Any]] | None = None):
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._rows = rows or []

    async def execute(self, sql, params: dict[str, Any] | None = None):  # noqa: ANN001
        self.calls.append((str(sql), params or {}))
        return _FakeResult(self._rows)

    async def commit(self):
        self.calls.append(("__commit__", {}))


# ── upsert_translation_draft now persists cultural_flags ─────────────────────


def test_upsert_persists_cultural_flags() -> None:
    s = _FakeSession(rows=[{"version": 1}])
    _run(upsert_translation_draft(
        s,
        artifact_id="a-1",
        target_lang="hi",
        payload_translation={"stem": "x"},
        ai_confidence=0.9,
        cultural_flags=["ai_flagged:stem:political reference"],
    ))
    sql, params = s.calls[0]
    assert "cultural_flags" in sql
    assert "PENDING" in sql
    flags_parsed = json.loads(params["flags"])
    assert flags_parsed == ["ai_flagged:stem:political reference"]


def test_upsert_no_flags_status_null() -> None:
    s = _FakeSession(rows=[{"version": 1}])
    _run(upsert_translation_draft(
        s,
        artifact_id="a-1",
        target_lang="hi",
        payload_translation={"stem": "x"},
        ai_confidence=0.9,
    ))
    sql, params = s.calls[0]
    flags_parsed = json.loads(params["flags"])
    assert flags_parsed == []
    # SQL contains the CASE that NULLs status when no flags.
    assert "ELSE NULL END" in sql


# ── list_cultural_pending ────────────────────────────────────────────────────


def test_list_cultural_pending_filters_to_flagged() -> None:
    fake_rows = [
        {
            "artifact_id": "a-1",
            "language": "hi",
            "status": "DRAFT",
            "cultural_flags": ["ai_flagged:stem:religious reference"],
            "cultural_review_status": "PENDING",
            "ai_confidence": 0.85,
            "version": 1,
            "created_at": __import__("datetime").datetime(2026, 4, 30, tzinfo=__import__("datetime").UTC),
            "updated_at": __import__("datetime").datetime(2026, 4, 30, tzinfo=__import__("datetime").UTC),
        }
    ]
    s = _FakeSession(rows=fake_rows)
    out = _run(list_cultural_pending(s, limit=10))
    assert len(out) == 1
    assert out[0]["artifactId"] == "a-1"
    assert "religious" in out[0]["culturalFlags"][0]
    sql, params = s.calls[0]
    assert "jsonb_array_length(cultural_flags) > 0" in sql
    assert params["lim"] == 10


# ── cultural_review_action ──────────────────────────────────────────────────


def test_cultural_review_action_writes_status() -> None:
    s = _FakeSession()
    _run(cultural_review_action(
        s,
        artifact_id="a-1",
        target_lang="hi",
        action="SUBSTITUTION_SUGGESTED",
        reviewer_id="r-1",
        notes="Use सहयोग instead of सहायता",
    ))
    sql, params = s.calls[0]
    assert "cultural_review_status" in sql
    assert params["st"] == "SUBSTITUTION_SUGGESTED"
    assert params["rid"] == "r-1"
    assert "सहयोग" in params["notes"]


# ── Cultural review routes (TestClient) ──────────────────────────────────────


def _cultural_app(rows: list[dict[str, Any]] | None = None) -> FastAPI:
    """FastAPI mini-app with the cultural router + a stub session."""
    from learning.localisation.cultural_routes import router

    app = FastAPI()
    app.include_router(router)

    fake_session = _FakeSession(rows=rows or [])

    async def _stub_session():
        yield fake_session

    # Override the dependency so the route uses our fake.
    from learning.localisation import cultural_routes

    app.dependency_overrides[cultural_routes._content_session] = _stub_session
    return app


def test_cultural_queue_route_returns_pending_items() -> None:
    from datetime import UTC, datetime

    rows = [
        {
            "artifact_id": "a-1",
            "language": "hi",
            "status": "DRAFT",
            "cultural_flags": ["ai_flagged:stem:political reference"],
            "cultural_review_status": "PENDING",
            "ai_confidence": 0.85,
            "version": 1,
            "created_at": datetime(2026, 4, 30, tzinfo=UTC),
            "updated_at": datetime(2026, 4, 30, tzinfo=UTC),
        }
    ]
    client = TestClient(_cultural_app(rows=rows))
    resp = client.get("/localisation/cultural-review/queue")
    assert resp.status_code == 200
    body = resp.json()
    assert body["pendingCount"] == 1
    assert body["items"][0]["artifactId"] == "a-1"


def test_cultural_action_route_round_trip() -> None:
    client = TestClient(_cultural_app())
    resp = client.post(
        "/localisation/cultural-review/a-1/hi/action",
        json={
            "action": "APPROVED",
            "reviewerId": "r-1",
            "notes": "no concerns",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["action"] == "APPROVED"


def test_cultural_action_rejects_bad_action() -> None:
    client = TestClient(_cultural_app())
    resp = client.post(
        "/localisation/cultural-review/a-1/hi/action",
        json={
            "action": "WHATEVER",
            "reviewerId": "r-1",
        },
    )
    assert resp.status_code == 422  # Pydantic Literal


# ── Grader queue routes (TestClient) ────────────────────────────────────────


def _grader_app(rows: list[dict[str, Any]] | None = None) -> FastAPI:
    from learning.grading.queue_routes import router

    app = FastAPI()
    app.include_router(router)

    fake_session = _FakeSession(rows=rows or [])

    async def _stub_session():
        yield fake_session

    from learning.grading import queue_routes

    app.dependency_overrides[queue_routes._content_session] = _stub_session
    return app


def test_grader_queue_route_returns_empty_state() -> None:
    client = TestClient(_grader_app())
    resp = client.get("/grading/queue")
    assert resp.status_code == 200
    body = resp.json()
    assert body["pendingReviewCount"] == 0
    assert body["calibrationSampleCount"] == 0
    assert body["items"] == []


def test_grader_queue_rejects_bad_limit() -> None:
    client = TestClient(_grader_app())
    resp = client.get("/grading/queue?limit=0")
    assert resp.status_code == 400


def test_grader_calibration_set_returns_three_items() -> None:
    client = TestClient(_grader_app())
    resp = client.get("/grading/calibration-set")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 3
    assert all("rubric" in it and "gold_verdict" in it for it in body["items"])


def test_grader_submit_grade_validation() -> None:
    """Schema validation: criteria min_length=1, satisfied in [0,1]."""
    client = TestClient(_grader_app())
    # Empty criteria → 422.
    resp = client.post(
        "/grading/responses/r-1/grade",
        json={
            "grader_id": "g-1",
            "type_id": "ESSAY",
            "question_id": "q-1",
            "rubric_version": 1,
            "criteria": [],
            "final_status": "CORRECT",
        },
    )
    assert resp.status_code == 422


def test_grader_submit_grade_bad_final_status() -> None:
    client = TestClient(_grader_app())
    resp = client.post(
        "/grading/responses/r-1/grade",
        json={
            "grader_id": "g-1",
            "type_id": "ESSAY",
            "question_id": "q-1",
            "rubric_version": 1,
            "criteria": [{"criterion_id": "c1", "satisfied": 1.0, "note": ""}],
            "final_status": "WHATEVER",
        },
    )
    assert resp.status_code == 422


def test_grader_submit_grade_writes_evaluation_record() -> None:
    """End-to-end: valid submission writes evaluation record + commits."""
    client = TestClient(_grader_app())
    resp = client.post(
        "/grading/responses/r-1/grade",
        json={
            "grader_id": "g-1",
            "type_id": "ESSAY",
            "question_id": "q-1",
            "rubric_version": 1,
            "criteria": [
                {"criterion_id": "c1", "satisfied": 1.0, "note": "well done"},
                {"criterion_id": "c2", "satisfied": 0.5, "note": "missed example"},
            ],
            "final_status": "PARTIAL_CORRECT",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["response_id"] == "r-1"
    assert body["evaluation_record_id"]
    assert body["calibration_sample_updated"] is False


def test_grader_submit_grade_with_calibration_sample_id() -> None:
    """When calibration_sample_id supplied, both writes happen."""
    client = TestClient(_grader_app())
    resp = client.post(
        "/grading/responses/r-1/grade",
        json={
            "grader_id": "g-1",
            "type_id": "ESSAY",
            "question_id": "q-1",
            "rubric_version": 1,
            "criteria": [{"criterion_id": "c1", "satisfied": 1.0, "note": ""}],
            "final_status": "CORRECT",
            "calibration_sample_id": "sample-99",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["calibration_sample_updated"] is True
