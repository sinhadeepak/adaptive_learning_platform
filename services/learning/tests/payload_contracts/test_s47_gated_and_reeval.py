"""Phase 5 (P5-S47, updated 2026-05-11 per ADR-0026) — Phase 2 type
evaluation semantics + re-evaluation eligibility + calibration
dashboard helpers.

After ADR-0026, the five Phase-2 types (LISTENING_COMP / VIDEO_QUESTION
/ KBC_LIFELINE / TIMED_REVEAL / ADAPTIVE_DIFFICULTY) are un-gated and
evaluate via composition over inner / child handlers. The DB-backed
routes (re-evaluate, calibration dashboard) require postgres +
content_schema; this file tests the pure-function pieces + the
composition-handler behaviour end-to-end.
"""

from __future__ import annotations

import asyncio

import pytest

from learning.evaluation.reevaluation import (
    MAX_AUTO_REEVAL_PER_RESPONSE,
    is_eligible_for_reevaluation,
)
from learning.evaluation.routes import _bucket_weekly, _to_ordinal_hist
from learning.types.audio_video.handlers import (
    ListeningCompHandler,
    VideoQuestionHandler,
)
from learning.types.base import PROTOCOL_ATTRS, PROTOCOL_METHODS
from learning.types.interactive.handlers import (
    AdaptiveDifficultyHandler,
    KBCLifelineHandler,
    TimedRevealHandler,
)


def _run(coro):
    return asyncio.run(coro)


# ── Phase 2 audio/video composite handlers (un-gated per ADR-0026) ───────────


def test_listening_comp_unattempted_when_no_children_responded() -> None:
    h = ListeningCompHandler()
    payload = {
        "audio_media_id": "media-1",
        "transcript": "x" * 30,
        "transcript_language": "en",
        "child_questions": [
            {"question_id": "ch-1", "ordinal": 1, "timestamp_seconds": 5.0},
            {"question_id": "ch-2", "ordinal": 2, "timestamp_seconds": 12.0},
        ],
    }
    res = _run(h.evaluate(
        payload, {"question_id": "q1", "children": []}, "en",
    ))
    assert res.status == "UNATTEMPTED"
    assert res.evaluation_mode == "HYBRID"
    assert res.total_count == 2
    assert res.matched_count == 0


def test_listening_comp_partial_when_some_children_attempted() -> None:
    h = ListeningCompHandler()
    payload = {
        "audio_media_id": "media-1",
        "transcript": "x" * 30,
        "transcript_language": "en",
        "child_questions": [
            {"question_id": "ch-1", "ordinal": 1},
            {"question_id": "ch-2", "ordinal": 2},
        ],
    }
    res = _run(h.evaluate(payload, {
        "question_id": "q1",
        "children": [
            {"question_id": "ch-1", "response_payload": {"selected_id": "A"}},
        ],
    }, "en"))
    assert res.status == "PARTIAL_CORRECT"
    assert res.matched_count == 1
    assert res.total_count == 2


def test_listening_comp_all_attempted_routes_to_human_for_roll_up() -> None:
    h = ListeningCompHandler()
    payload = {
        "audio_media_id": "media-1",
        "transcript": "x" * 30,
        "transcript_language": "en",
        "child_questions": [
            {"question_id": "ch-1", "ordinal": 1},
        ],
    }
    res = _run(h.evaluate(payload, {
        "question_id": "q1",
        "children": [
            {"question_id": "ch-1", "response_payload": {"selected_id": "A"}},
        ],
    }, "en"))
    assert res.status == "PENDING_HUMAN_REVIEW"
    assert res.evaluator_metadata.human_review_required is True


def test_video_question_aggregates_children_same_as_audio() -> None:
    h = VideoQuestionHandler()
    payload = {
        "video_media_id": "media-2",
        "transcript": None,
        "transcript_language": "en",
        "child_questions": [
            {"question_id": "ch-1", "ordinal": 1},
        ],
    }
    res = _run(h.evaluate(
        payload, {"question_id": "q1", "children": []}, "en",
    ))
    assert res.status == "UNATTEMPTED"
    assert res.total_count == 1


# ── Phase 2 interactive wrappers (un-gated per ADR-0026) ─────────────────────


def test_kbc_lifeline_records_lifelines_in_metadata_unattempted() -> None:
    h = KBCLifelineHandler()
    payload = {
        "inner_question_id": "inner-1",
        "available_lifelines": ["50_50", "audience_poll"],
        "audience_poll_distribution": {"A": 60.0, "B": 30.0, "C": 5.0, "D": 5.0},
    }
    # No inner_payload embedded + no inner_response_payload → UNATTEMPTED.
    res = _run(h.evaluate(payload, {
        "question_id": "q1",
        "inner_response_payload": None,
        "lifelines_used": [],
    }, "en"))
    assert res.status == "UNATTEMPTED"
    # Lifelines summary always surfaces in metadata notes.
    assert "lifelines_used:none" in res.evaluator_metadata.prompt_version


def test_kbc_lifeline_grades_inner_when_payload_embedded() -> None:
    # Bootstrap the full v1 registry so inner handler lookup works.
    # We use the full bootstrap (not just MCQ_SINGLE) to avoid leaking
    # a partially-populated registry to other tests in the same run.
    from learning.types.bootstrap import register_all_v1_handlers
    from learning.types.registry import _reset_for_tests, is_supported

    if not is_supported("MCQ_SINGLE"):
        _reset_for_tests()
        register_all_v1_handlers()

    h = KBCLifelineHandler()
    payload = {
        "inner_question_id": "inner-1",
        "available_lifelines": ["50_50"],
        "inner_payload": {
            "stem": "What is 2+2?",
            "options": [
                {"id": "A", "text": "3"},
                {"id": "B", "text": "4"},
                {"id": "C", "text": "5"},
            ],
            "correct_id": "B",
        },
    }
    res = _run(h.evaluate(payload, {
        "question_id": "q1",
        "inner_response_payload": {"selected_id": "B"},
        "lifelines_used": ["50_50"],
    }, "en"))
    assert res.status == "CORRECT"
    assert res.type_id == "KBC_LIFELINE"
    assert "lifelines_used:50_50" in res.evaluator_metadata.prompt_version


def test_timed_reveal_records_answered_at_seconds() -> None:
    h = TimedRevealHandler()
    payload = {
        "inner_question_id": "inner-1",
        "initial_stem": "x" * 20,
        "reveal_schedule": [
            {"at_seconds": 5.0, "additional_info": "First hint"},
            {"at_seconds": 15.0, "additional_info": "Second hint"},
        ],
    }
    res = _run(h.evaluate(payload, {
        "question_id": "q1",
        "inner_response_payload": {"selected_id": "A"},
        "answered_at_seconds": 8.0,
    }, "en"))
    # Without inner_payload embedded, falls back to PENDING_HUMAN_REVIEW
    # with the answered_at_seconds note. Still un-gated — no feature_disabled marker.
    assert res.status == "PENDING_HUMAN_REVIEW"
    assert "answered_at_seconds:8.00" in res.evaluator_metadata.prompt_version
    assert "reveals_fired:1/2" in res.evaluator_metadata.prompt_version
    assert "feature_disabled" not in (res.evaluator_metadata.prompt_version or "")


def test_adaptive_difficulty_validates_served_variant() -> None:
    h = AdaptiveDifficultyHandler()
    payload = {
        "variants": [
            {"question_id": "q-easy", "difficulty_level": 1},
            {"question_id": "q-med", "difficulty_level": 2},
            {"question_id": "q-hard", "difficulty_level": 4},
        ],
        "starting_difficulty": 2,
    }
    # Served variant not in pool → INCORRECT.
    bad = _run(h.evaluate(payload, {
        "question_id": "q1",
        "served_question_id": "q-bogus",
        "inner_response_payload": {"selected_id": "A"},
    }, "en"))
    assert bad.status == "INCORRECT"
    assert bad.evaluator_metadata.prompt_version == "invalid_variant"

    # Served variant in pool but no inner_payload embedded → fallback
    # to PENDING_HUMAN_REVIEW with served_difficulty note.
    good = _run(h.evaluate(payload, {
        "question_id": "q1",
        "served_question_id": "q-med",
        "inner_response_payload": {"selected_id": "A"},
    }, "en"))
    assert good.status == "PENDING_HUMAN_REVIEW"
    assert "served_difficulty:2/5" in good.evaluator_metadata.prompt_version


def test_gated_handlers_protocol_attrs() -> None:
    for cls in (
        ListeningCompHandler, VideoQuestionHandler,
        KBCLifelineHandler, TimedRevealHandler, AdaptiveDifficultyHandler,
    ):
        h = cls()
        for attr in PROTOCOL_ATTRS:
            assert hasattr(h, attr)
        for method in PROTOCOL_METHODS:
            assert callable(getattr(h, method))


# ── Re-evaluation eligibility ────────────────────────────────────────────────


def test_reeval_eligible_first_attempt() -> None:
    out = is_eligible_for_reevaluation(
        response_id="r1", existing_eval_count=1,
    )
    assert out.eligible is True
    assert out.reason == "ok"


def test_reeval_blocked_at_cap() -> None:
    out = is_eligible_for_reevaluation(
        response_id="r1", existing_eval_count=MAX_AUTO_REEVAL_PER_RESPONSE,
    )
    assert out.eligible is False
    assert "max_auto_reevaluations_reached" in out.reason


def test_reeval_admin_override_bypasses_cap() -> None:
    out = is_eligible_for_reevaluation(
        response_id="r1",
        existing_eval_count=MAX_AUTO_REEVAL_PER_RESPONSE + 5,
        admin_override=True,
    )
    assert out.eligible is True
    assert out.reason == "admin_override"


# ── Calibration dashboard pure helpers ───────────────────────────────────────


def test_bucket_weekly_groups_into_iso_weeks() -> None:
    from datetime import UTC, datetime

    samples = [
        {"ai_score": 1.0, "human_score": 1.0,
         "sampled_at": datetime(2026, 4, 27, 10, 0, tzinfo=UTC)},  # Mon
        {"ai_score": 0.5, "human_score": 1.0,
         "sampled_at": datetime(2026, 4, 28, 10, 0, tzinfo=UTC)},  # Tue
        {"ai_score": 1.0, "human_score": 1.0,
         "sampled_at": datetime(2026, 5, 5, 10, 0, tzinfo=UTC)},   # Tue (next wk)
    ]
    out = _bucket_weekly(samples)
    assert len(out) == 2
    week1 = out[0]
    week2 = out[1]
    assert week1["week_start"] == "2026-04-27"
    assert week1["sample_count"] == 2
    assert week2["week_start"] == "2026-05-04"
    assert week2["sample_count"] == 1


def test_to_ordinal_hist_buckets_continuous_scores() -> None:
    hist = _to_ordinal_hist([0.0, 0.1, 0.5, 0.6, 0.9, 1.0])
    assert hist == {"0.0": 2, "0.5": 2, "1.0": 2}


def test_to_ordinal_hist_empty() -> None:
    assert _to_ordinal_hist([]) == {"0.0": 0, "0.5": 0, "1.0": 0}
