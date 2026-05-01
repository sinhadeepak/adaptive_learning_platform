"""Phase 5 (P5-S63) — operations: audit retention task + Rekognition
moderator + reviewer staffing tracker.

Pure-function + fake-session tests. The Rekognition path doesn't
exercise boto3 directly (test boundary) but covers the label-mapping
helper that translates Rekognition's parent/child taxonomy to our
3-category bucket.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest


def _run(coro):
    return asyncio.run(coro)


# ── _RKG_LABEL_MAP coverage ──────────────────────────────────────────────────


def test_rekognition_module_imports_when_boto3_absent() -> None:
    """boto3 is an optional dep; the module must load without it
    (RekognitionModerator construction surfaces the error, not the
    module import)."""
    from learning.content import rekognition_moderator
    assert rekognition_moderator._RKG_LABEL_MAP


def test_rekognition_label_to_category_explicit_nudity() -> None:
    from learning.content.rekognition_moderator import _RKG_LABEL_MAP
    assert _RKG_LABEL_MAP["Explicit Nudity"] == "nsfw"
    assert _RKG_LABEL_MAP["Violence"] == "violence"
    assert _RKG_LABEL_MAP["Weapons"] == "violence"


def test_rekognition_labels_to_scores() -> None:
    """Stub the static method directly to avoid boto3 import path."""
    from learning.content.rekognition_moderator import RekognitionModerator

    raw = [
        {"Name": "Explicit Nudity", "ParentName": "", "Confidence": 92.5},
        {"Name": "Violence", "ParentName": "", "Confidence": 88.0},
        {"Name": "Drugs", "ParentName": "", "Confidence": 70.0},  # unmapped
    ]
    scores = RekognitionModerator._labels_to_scores(raw)
    by_cat = {s.category: s for s in scores}
    assert "nsfw" in by_cat
    assert by_cat["nsfw"].confidence == pytest.approx(0.925)
    assert "violence" in by_cat
    assert by_cat["violence"].confidence == pytest.approx(0.88)
    # "Drugs" was not mapped — stays out.
    assert "drugs" not in by_cat


def test_rekognition_collapses_overlapping_labels_to_max() -> None:
    """Rekognition can return Violence + Weapons together; our bucket
    map sends both to 'violence', so the higher confidence wins."""
    from learning.content.rekognition_moderator import RekognitionModerator

    raw = [
        {"Name": "Violence", "ParentName": "", "Confidence": 60.0},
        {"Name": "Weapons", "ParentName": "", "Confidence": 95.0},
    ]
    scores = RekognitionModerator._labels_to_scores(raw)
    assert len(scores) == 1
    assert scores[0].category == "violence"
    assert scores[0].confidence == pytest.approx(0.95)
    assert scores[0].label == "Weapons"


# ── audit_retention_task ────────────────────────────────────────────────────


def test_audit_retention_module_imports() -> None:
    from learning.ai_gateway.audit_retention_task import (
        DEFAULT_INTERVAL_SECONDS,
        DEFAULT_RETENTION_DAYS,
    )
    assert DEFAULT_RETENTION_DAYS == 90
    assert DEFAULT_INTERVAL_SECONDS == 7 * 24 * 3600


def test_audit_retention_purge_once_handles_missing_db() -> None:
    """Without a DB session, _purge_once swallows + returns -1 so
    the loop doesn't crash."""
    from learning.ai_gateway.audit_retention_task import _purge_once
    n = _run(_purge_once(days=90))
    assert n == -1


def test_audit_retention_task_can_be_started_and_cancelled() -> None:
    """The lifespan hook calls start_retention_task which returns an
    asyncio.Task; cancellation should be clean."""
    from learning.ai_gateway.audit_retention_task import start_retention_task

    async def run():
        task = await start_retention_task(
            retention_days=90, interval_seconds=2,
        )
        # Let the loop spawn but not fire (delay is interval/7 = ~0).
        await asyncio.sleep(0.01)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        return task.cancelled() or task.done()

    assert _run(run())


# ── Reviewer staffing routes (TestClient + fake session) ─────────────────────


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


def _staffing_app(rows: list[dict[str, Any]] | None = None):
    from fastapi import FastAPI
    from learning.localisation.staffing_routes import router

    app = FastAPI()
    app.include_router(router)

    fake = _FakeSession(rows=rows or [])

    async def _stub_session():
        yield fake

    from learning.localisation import staffing_routes
    app.dependency_overrides[staffing_routes._content_session] = _stub_session
    return app


def test_staffing_list_returns_empty_when_no_rows() -> None:
    from fastapi.testclient import TestClient
    client = TestClient(_staffing_app())
    resp = client.get("/localisation/staffing")
    assert resp.status_code == 200
    assert resp.json() == []


def test_staffing_list_returns_seeded_rows() -> None:
    from fastapi.testclient import TestClient

    fake_rows = [
        {
            "language": "hi", "reviewer_count": 6,
            "sla_first_review_hours": 24, "sla_resolution_hours": 48,
            "cultural_sla_hours": 120, "staffing_model": "internal_panel",
            "notes": None,
            "pending_review_count": 12, "cultural_pending_count": 2,
            "breach_count": 1,
        }
    ]
    client = TestClient(_staffing_app(rows=fake_rows))
    resp = client.get("/localisation/staffing")
    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["language"] == "hi"
    assert body[0]["reviewer_count"] == 6
    assert body[0]["pending_review_count"] == 12


def test_staffing_one_404_when_unknown() -> None:
    from fastapi.testclient import TestClient
    client = TestClient(_staffing_app())
    resp = client.get("/localisation/staffing/zz")
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "language_not_configured"


def test_staffing_upsert_validation() -> None:
    from fastapi.testclient import TestClient
    client = TestClient(_staffing_app())
    # Invalid staffing_model
    resp = client.post(
        "/localisation/staffing/hi",
        json={
            "reviewer_count": 6,
            "sla_first_review_hours": 24,
            "sla_resolution_hours": 48,
            "cultural_sla_hours": 120,
            "staffing_model": "magic",
        },
    )
    assert resp.status_code == 422


def test_staffing_upsert_round_trip() -> None:
    from fastapi.testclient import TestClient
    client = TestClient(_staffing_app())
    resp = client.post(
        "/localisation/staffing/hi",
        json={
            "reviewer_count": 8,
            "sla_first_review_hours": 24,
            "sla_resolution_hours": 48,
            "cultural_sla_hours": 120,
            "staffing_model": "internal_panel",
            "notes": "Added 2 reviewers post-launch surge",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "upserted"
