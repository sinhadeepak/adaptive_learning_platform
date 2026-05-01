"""Phase 5 (P5-S51) — type registry routes + content translation routes
+ catalog publish-language filter.

Pure-route tests via TestClient. DB-backed routes use the fake-session
pattern from S49 to validate parameter binding without Postgres.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from learning.content.language_filter import (
    count_visible_in_language,
    list_published_for_language,
    published_language_clause,
)
from learning.localisation.job_repo import (
    complete_translation_job,
    fail_translation_job,
    insert_translation_job,
)
from learning.types.bootstrap import register_all_v1_handlers
from learning.types.registry import _reset_for_tests, is_supported


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _ensure_registered():
    if not is_supported("MCQ_SINGLE"):
        _reset_for_tests()
        register_all_v1_handlers()
    yield


# ── /content/types ───────────────────────────────────────────────────────────


def _types_app() -> FastAPI:
    from learning.types.routes import router as types_router

    app = FastAPI()
    app.include_router(types_router)
    return app


def test_list_types_returns_all_registered() -> None:
    client = TestClient(_types_app())
    resp = client.get("/content/types")
    assert resp.status_code == 200
    body = resp.json()
    type_ids = {m["type_id"] for m in body}
    # Spot-check: full v1 catalogue + 5 gated stubs = 29
    expected_subset = {
        "MCQ_SINGLE", "ESSAY", "DIAGRAM_HOTSPOT",
        "LISTENING_COMP", "KBC_LIFELINE",
    }
    assert expected_subset.issubset(type_ids)


def test_list_types_alphabetised() -> None:
    client = TestClient(_types_app())
    body = client.get("/content/types").json()
    ids = [m["type_id"] for m in body]
    assert ids == sorted(ids)


def test_payload_schema_returns_jsonschema() -> None:
    client = TestClient(_types_app())
    resp = client.get("/content/types/MCQ_SINGLE/payload-schema")
    assert resp.status_code == 200
    body = resp.json()
    assert body["type_id"] == "MCQ_SINGLE"
    assert body["schema"]["type"] == "object"
    assert "stem" in body["schema"]["properties"]


def test_payload_schema_unknown_type_404() -> None:
    client = TestClient(_types_app())
    resp = client.get("/content/types/WHO_KNOWS/payload-schema")
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "unknown_type"


def test_translatable_fields_returns_dotted_paths() -> None:
    client = TestClient(_types_app())
    resp = client.get("/content/types/MCQ_SINGLE/translatable-fields")
    assert resp.status_code == 200
    body = resp.json()
    assert body["type_id"] == "MCQ_SINGLE"
    # MCQ_SINGLE should expose stem + options + explanation paths.
    assert "stem" in body["fields"]
    assert any("options" in f for f in body["fields"])


def test_translatable_fields_essay_includes_rubric() -> None:
    client = TestClient(_types_app())
    body = client.get("/content/types/ESSAY/translatable-fields").json()
    assert any("rubric.criteria" in f for f in body["fields"])


def test_translatable_fields_unknown_type_404() -> None:
    client = TestClient(_types_app())
    resp = client.get("/content/types/WHO_KNOWS/translatable-fields")
    assert resp.status_code == 404


# ── language_filter (pure SQL) ───────────────────────────────────────────────


def test_published_language_clause_renders_correct_sql() -> None:
    sql = published_language_clause("q")
    assert "q.language = :lang" in sql
    assert "PUBLISHED" in sql
    assert "content_artifact_translations" in sql
    # Must reference the artifact id correlation correctly.
    assert "t.artifact_id = q.id" in sql


def test_published_language_clause_alias_substitutes() -> None:
    sql = published_language_clause("artifact")
    assert "artifact.language = :lang" in sql
    assert "t.artifact_id = artifact.id" in sql


# ── language_filter (with fake session) ──────────────────────────────────────


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows
    def mappings(self): return self
    def all(self): return self._rows


class _FakeSession:
    def __init__(self, rows=None):
        self.calls: list[tuple[str, dict]] = []
        self._rows = rows or []
    async def execute(self, sql, params=None):  # noqa: ANN001
        self.calls.append((str(sql), params or {}))
        return _FakeResult(self._rows)
    async def commit(self): pass


def test_list_published_for_language_binds_lang_and_topic() -> None:
    s = _FakeSession(rows=[])
    _run(list_published_for_language(
        s, preferred_language="hi", topic_id="t-1", limit=50,
    ))
    sql, params = s.calls[0]
    assert "PUBLISHED" in sql
    assert "language = :lang" in sql
    assert params["lang"] == "hi"
    assert params["tid"] == "t-1"
    assert params["lim"] == 50


def test_list_published_for_language_returns_camel_case() -> None:
    fake_rows = [{
        "id": "abc",
        "topic_id": "t1",
        "stem": "Stem",
        "question_type": "MCQ_SINGLE",
        "language": "en",
        "difficulty_b": 0.5,
        "discrimination_a": 1.2,
        "guessing_c": 0.25,
    }]
    s = _FakeSession(rows=fake_rows)
    out = _run(list_published_for_language(s, preferred_language="hi"))
    assert out[0]["questionType"] == "MCQ_SINGLE"
    assert out[0]["topicId"] == "t1"
    assert out[0]["difficultyB"] == 0.5


def test_count_visible_returns_zero_when_no_rows() -> None:
    s = _FakeSession(rows=[])
    n = _run(count_visible_in_language(s, preferred_language="hi"))
    assert n == 0


def test_count_visible_returns_int_from_n() -> None:
    s = _FakeSession(rows=[{"n": 42}])
    n = _run(count_visible_in_language(s, preferred_language="hi", topic_id="t-1"))
    assert n == 42


# ── localisation jobs ──────────────────────────────────────────────────────


def test_insert_translation_job_returns_uuid() -> None:
    s = _FakeSession()
    job_id = _run(insert_translation_job(
        s, artifact_id="a-1", target_lang="hi", source_lang="en",
    ))
    assert job_id  # uuid string
    sql, params = s.calls[0]
    assert "INSERT INTO content_schema.ai_generation_jobs" in sql
    assert "translate_field" in sql
    assert params["aid"] == "a-1"


def test_complete_translation_job_writes_succeeded_status() -> None:
    s = _FakeSession()
    _run(complete_translation_job(
        s, job_id="j-1", output={"version": 2},
    ))
    sql, params = s.calls[0]
    assert "status       = 'succeeded'" in sql
    assert json.loads(params["out"]) == {"version": 2}
    assert params["id"] == "j-1"


def test_fail_translation_job_writes_failed_status() -> None:
    s = _FakeSession()
    _run(fail_translation_job(
        s, job_id="j-1", error="ai_gateway: down",
    ))
    sql, params = s.calls[0]
    assert "status        = 'failed'" in sql
    assert "ai_gateway: down" in params["err"]
