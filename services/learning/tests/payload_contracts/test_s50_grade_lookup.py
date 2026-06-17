"""Phase 5 (P5-S50) — id-based payload lookup on /grading/grade +
audit-log retention purge endpoint.

Tests the legacy-MCQ payload synthesis path (existing 480 seeded rows
with NULL `payload` column) and the type-validation when payload is
absent.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from learning.grading.routes import (
    _fetch_payload_by_id,
    router as grading_router,
)
from learning.types.bootstrap import register_all_v1_handlers
from learning.types.registry import _reset_for_tests, is_supported


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _ensure_registered():
    """Ensure handlers are registered before each test in this module.

    Other tests may have left the registry partially populated + frozen
    (test_handlers, test_s47, etc. don't always call bootstrap). We
    reset + bootstrap fresh per test so route dispatch works."""
    if not is_supported("MCQ_SINGLE"):
        _reset_for_tests()
        register_all_v1_handlers()
    yield


# ── _fetch_payload_by_id (DB call short-circuits in unit env) ─────────────────


def test_fetch_payload_returns_none_when_db_unreachable() -> None:
    """Without docker-compose Postgres, content_sessionmaker raises;
    the helper swallows and returns None so the caller surfaces a
    clean 400 rather than 500."""
    out = _run(_fetch_payload_by_id("00000000-0000-0000-0000-000000000000"))
    assert out is None


# ── /grading/grade with id-based lookup ──────────────────────────────────────


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(grading_router)
    return app


def test_grade_route_with_payload_works_as_before() -> None:
    """Pre-S50 callers passing the full payload still grade correctly."""
    client = TestClient(_make_app())
    resp = client.post("/grading/grade", json={
        "question_id": "q1",
        "question_type": "MCQ_SINGLE",
        "payload": {
            "stem": "What is 2+2?",
            "options": [
                {"id": "A", "text": "3"},
                {"id": "B", "text": "4"},
            ],
            "correct_id": "B",
        },
        "response": {"selected_id": "B"},
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "CORRECT"


def test_grade_route_missing_payload_returns_400_when_db_unreachable() -> None:
    """When payload is absent and the DB lookup fails, the route must
    surface a structured 400 with code=payload_missing rather than
    crashing on a Pydantic validation error."""
    client = TestClient(_make_app())
    resp = client.post("/grading/grade", json={
        "question_id": "00000000-0000-0000-0000-000000000000",
        "question_type": "MCQ_SINGLE",
        "response": {"selected_id": "B"},
    })
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["code"] == "payload_missing"


def test_grade_route_unknown_question_type_400() -> None:
    client = TestClient(_make_app())
    resp = client.post("/grading/grade", json={
        "question_id": "q1",
        "question_type": "WHO_KNOWS",
        "response": {},
    })
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "unknown_question_type"


def test_grade_route_payload_optional_with_default_empty_dict() -> None:
    """`payload` is now Optional with default {}. Pre-payload callers
    serialised it as {} explicitly; that path must still work."""
    client = TestClient(_make_app())
    resp = client.post("/grading/grade", json={
        "question_id": "00000000-0000-0000-0000-000000000000",
        "question_type": "MCQ_SINGLE",
        "payload": {},
        "response": {"selected_id": "B"},
    })
    # Falls through to the id-lookup path; DB unreachable → 400.
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "payload_missing"
