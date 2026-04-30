"""Phase 5 (P5-S49) — persistence writers for evaluation, calibration,
translation drafts, and AI Gateway audit log.

These writers wrap raw SQL; we test parameter binding via a fake
AsyncSession that captures the (sql, params) calls. DB-backed
integration runs through the docker-compose smoke (postgres present).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from learning.evaluation.repositories import (
    count_evaluation_records,
    insert_calibration_sample,
    insert_evaluation_record,
    update_calibration_human_score,
)
from learning.localisation.repositories import (
    approve_translation,
    reject_translation,
    upsert_translation_draft,
)
from learning.types.base import (
    EvaluatorMetadata,
    Resolution,
)
from datetime import UTC, datetime


def _run(coro):
    return asyncio.run(coro)


# ── Fake AsyncSession (captures execute calls) ───────────────────────────────


class _FakeResult:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def mappings(self) -> "_FakeResult":
        return self

    def all(self) -> list[dict[str, Any]]:
        return self._rows


class _FakeSession:
    def __init__(self, fake_rows: list[dict[str, Any]] | None = None):
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._rows = fake_rows or []

    async def execute(self, sql, params: dict[str, Any] | None = None):  # noqa: ANN001
        text_str = str(sql)
        self.calls.append((text_str, params or {}))
        return _FakeResult(self._rows)

    async def commit(self) -> None:
        self.calls.append(("__commit__", {}))


# ── evaluation_records ───────────────────────────────────────────────────────


def _sample_resolution() -> Resolution:
    return Resolution(
        question_id="q1",
        type_id="ESSAY",
        status="CORRECT",
        matched_count=2,
        total_count=2,
        per_part=[],
        evaluation_mode="HYBRID",
        evaluator_metadata=EvaluatorMetadata(
            model="openai:gpt-4o",
            rubric_version=3,
            prompt_version="essay@1.0.0",
            evaluated_at=datetime.now(tz=UTC),
            human_review_required=False,
        ),
    )


def test_insert_evaluation_record_binds_resolution_jsonb() -> None:
    s = _FakeSession()
    rid = _run(insert_evaluation_record(
        s, response_id="resp-1", resolution=_sample_resolution(),
        evaluator_kind="AI", evaluator_id="openai:gpt-4o",
        confidence=0.97,
    ))
    assert rid  # uuid string
    assert len(s.calls) == 1
    sql, params = s.calls[0]
    assert "INSERT INTO content_schema.evaluation_records" in sql
    assert params["rid"] == "resp-1"
    assert params["kind"] == "AI"
    assert params["conf"] == 0.97
    assert params["pv"] == "essay@1.0.0"
    assert params["rv"] == 3
    # resolution serialised as JSON.
    parsed = json.loads(params["resolution"])
    assert parsed["status"] == "CORRECT"


def test_count_evaluation_records_returns_int() -> None:
    s = _FakeSession(fake_rows=[{"n": 7}])
    n = _run(count_evaluation_records(s, response_id="r1"))
    assert n == 7


def test_count_evaluation_records_zero_when_no_rows() -> None:
    s = _FakeSession(fake_rows=[])
    assert _run(count_evaluation_records(s, response_id="r1")) == 0


# ── calibration_samples ──────────────────────────────────────────────────────


def test_insert_calibration_sample_serialises_resolution() -> None:
    s = _FakeSession()
    rid = _run(insert_calibration_sample(
        s,
        response_id="r1",
        criterion="c1",
        ai_score=0.5,
        ai_resolution={"status": "PARTIAL_CORRECT", "matched_count": 1},
    ))
    assert rid
    sql, params = s.calls[0]
    assert "INSERT INTO content_schema.calibration_samples" in sql
    assert params["cri"] == "c1"
    assert params["s"] == 0.5
    assert json.loads(params["res"])["status"] == "PARTIAL_CORRECT"


def test_update_calibration_human_score_binds_score_and_resolution() -> None:
    s = _FakeSession()
    _run(update_calibration_human_score(
        s,
        sample_id="s-1",
        human_score=1.0,
        human_resolution={"status": "CORRECT"},
    ))
    sql, params = s.calls[0]
    assert "UPDATE content_schema.calibration_samples" in sql
    assert params["id"] == "s-1"
    assert params["hs"] == 1.0


# ── translation drafts ───────────────────────────────────────────────────────


def test_upsert_translation_draft_returns_version_from_db() -> None:
    s = _FakeSession(fake_rows=[{"version": 2}])
    v = _run(upsert_translation_draft(
        s,
        artifact_id="art-1",
        target_lang="hi",
        payload_translation={"stem": "अनुवादित"},
        ai_confidence=0.9,
    ))
    assert v == 2
    sql, params = s.calls[0]
    assert "ON CONFLICT (artifact_id, language)" in sql
    assert params["aid"] == "art-1"
    assert params["lang"] == "hi"
    assert json.loads(params["payload"])["stem"] == "अनुवादित"


def test_upsert_translation_draft_defaults_to_version_one_when_db_silent() -> None:
    s = _FakeSession(fake_rows=[])
    v = _run(upsert_translation_draft(
        s,
        artifact_id="art-1",
        target_lang="hi",
        payload_translation={"stem": "x"},
        ai_confidence=0.5,
    ))
    assert v == 1


def test_approve_translation_writes_published_status() -> None:
    s = _FakeSession()
    _run(approve_translation(
        s, artifact_id="a", target_lang="hi", reviewer_id="r",
    ))
    sql, params = s.calls[0]
    assert "status      = 'PUBLISHED'" in sql
    assert params["rid"] == "r"


def test_reject_translation_writes_rejected_status() -> None:
    s = _FakeSession()
    _run(reject_translation(
        s, artifact_id="a", target_lang="hi", reviewer_id="r",
    ))
    sql, params = s.calls[0]
    assert "status      = 'REJECTED'" in sql


# ── audit log ────────────────────────────────────────────────────────────────


def test_audit_log_module_imports_cleanly() -> None:
    """Smoke: the lazy-import in gateway.py succeeds in this env."""
    from learning.ai_gateway.audit_log import (
        purge_older_than_days,
        write_audit_row,
    )
    assert callable(write_audit_row)
    assert callable(purge_older_than_days)


def test_audit_log_purge_returns_zero_without_session() -> None:
    """purge_older_than_days returns rows-deleted; the test verifies
    the SQL builds + binds without a real DB."""
    s = _FakeSession(fake_rows=[])
    from learning.ai_gateway.audit_log import purge_older_than_days
    n = _run(purge_older_than_days(s, days=90))
    assert n == 0
    sql, params = s.calls[0]
    assert "DELETE FROM content_schema.ai_generation_jobs" in sql
    assert params["days"] == 90


# ── grade_subjective persist=False short-circuits writer ─────────────────────


def test_grade_subjective_with_persist_false_does_not_touch_db() -> None:
    """The S42 tests pass persist=True implicitly; verify the off-path
    runs without raising when no DB session can be opened."""
    import asyncio as _asyncio

    from learning.ai_gateway import AIGateway, PromptRegistry
    from learning.ai_gateway.prompt_registry import PromptTemplate
    from learning.ai_gateway.providers.stub_provider import StubProvider
    from learning.ai_gateway.routing import default_stub_config
    from learning.evaluation.subjective import grade_subjective

    reg = PromptRegistry()
    reg._templates[("subjective_essay_grade", "1.0.0")] = PromptTemplate(
        id="subjective_essay_grade", version="1.0.0", touchpoint="evaluation",
        system="stem={stem} model_answer={model_answer} "
               "student_text={student_text} rubric_block={rubric_block}",
        output_schema="SubjectiveEvaluationReport",
    )
    stub = StubProvider()
    stub.register_stub_response(
        "SubjectiveEvaluationReport",
        {
            "overall_confidence": 0.97,
            "criteria": [
                {"criterion_id": "c1", "satisfied": 1.0, "feedback": ""},
            ],
        },
    )
    gw = AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": stub})

    # persist=False bypasses the DB writer entirely.
    res = _asyncio.run(grade_subjective(
        gw,
        question_id="q1",
        type_id="ESSAY",
        response_id="r1",
        stem="What is photosynthesis?",
        model_answer="Photosynthesis converts light into chemical energy.",
        student_text="Plants use sunlight to make sugar.",
        rubric_criteria=[{"id": "c1", "text": "states photosynthesis", "weight": 100}],
        rubric_version=1,
        persist=False,
    ))
    assert res.status == "CORRECT"
