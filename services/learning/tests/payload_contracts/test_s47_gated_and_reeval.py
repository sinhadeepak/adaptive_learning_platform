"""Phase 5 (P5-S47) — Gated families + re-evaluation eligibility +
calibration dashboard helpers.

The DB-backed routes (re-evaluate, calibration dashboard) require
postgres + content_schema; this file tests the pure-function pieces
+ handler stubs end-to-end.
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
    GATED_FLAG as AV_FLAG,
    ListeningCompHandler,
    VideoQuestionHandler,
)
from learning.types.base import PROTOCOL_ATTRS, PROTOCOL_METHODS
from learning.types.interactive.handlers import (
    GATED_FLAG as INT_FLAG,
    AdaptiveDifficultyHandler,
    KBCLifelineHandler,
    TimedRevealHandler,
)


def _run(coro):
    return asyncio.run(coro)


# ── Gated handler stubs ──────────────────────────────────────────────────────


def test_listening_comp_returns_pending_human_review() -> None:
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
    assert res.status == "PENDING_HUMAN_REVIEW"
    assert res.evaluation_mode == "HYBRID"
    assert res.evaluator_metadata.human_review_required is True
    assert AV_FLAG in res.evaluator_metadata.prompt_version
    # Total reflects the child count so the moderator queue shows scope.
    assert res.total_count == 2


def test_video_question_returns_pending_human_review() -> None:
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
    assert res.status == "PENDING_HUMAN_REVIEW"
    assert AV_FLAG in res.evaluator_metadata.prompt_version


def test_kbc_lifeline_gated() -> None:
    h = KBCLifelineHandler()
    payload = {
        "inner_question_id": "inner-1",
        "available_lifelines": ["50_50", "audience_poll"],
        "audience_poll_distribution": {"A": 60.0, "B": 30.0, "C": 5.0, "D": 5.0},
    }
    res = _run(h.evaluate(payload, {
        "question_id": "q1",
        "inner_response_payload": {"selected_id": "A"},
        "lifelines_used": [],
    }, "en"))
    assert res.status == "PENDING_HUMAN_REVIEW"
    assert INT_FLAG in res.evaluator_metadata.prompt_version


def test_timed_reveal_gated() -> None:
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
    assert res.status == "PENDING_HUMAN_REVIEW"


def test_adaptive_difficulty_gated() -> None:
    h = AdaptiveDifficultyHandler()
    payload = {
        "variants": [
            {"question_id": "q-easy", "difficulty_level": 1},
            {"question_id": "q-med", "difficulty_level": 2},
            {"question_id": "q-hard", "difficulty_level": 4},
        ],
        "starting_difficulty": 2,
    }
    res = _run(h.evaluate(payload, {
        "question_id": "q1",
        "served_question_id": "q-med",
        "inner_response_payload": {"selected_id": "A"},
    }, "en"))
    assert res.status == "PENDING_HUMAN_REVIEW"


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
