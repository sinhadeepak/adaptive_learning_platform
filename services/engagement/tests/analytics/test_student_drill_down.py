"""Sprint 13 S13-C — student drill-down aggregator tests.

The DB + Quiz-DB I/O is exercised live in compose; the deterministic
shape-assembly is what matters for the educator UI contract.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from engagement.analytics.student_drill_down import (
    _shape_readiness,
    _shape_session,
    _shape_streak,
    aggregate_student_drilldown,
)


def test_aggregate_with_no_signal_returns_zeroed_shape() -> None:
    """A brand-new student with zero quiz history must still produce a
    well-formed payload — the educator UI depends on every key being
    present."""
    out = aggregate_student_drilldown(
        user_id="u-fresh",
        cohort_id="c-1",
        readiness_row=None,
        mastery_rows=[],
        streak_row=None,
        recent_sessions=[],
    )
    assert out["userId"] == "u-fresh"
    assert out["cohortId"] == "c-1"
    assert out["readiness"]["score"] == 0.0
    assert out["readiness"]["nTopics"] == 0
    assert out["readiness"]["updatedAt"] is None
    assert out["topicMastery"] == []
    assert out["streak"]["current"] == 0
    assert out["streak"]["longest"] == 0
    assert out["recentSessions"] == []


def test_shape_readiness_extracts_isoformat_when_present() -> None:
    row = {
        "score": 0.83,
        "n_topics": 5,
        "updated_at": datetime(2026, 4, 28, 10, 0, tzinfo=timezone.utc),
    }
    out = _shape_readiness(row)
    assert out["score"] == 0.83
    assert out["nTopics"] == 5
    assert out["updatedAt"].startswith("2026-04-28T10:00")


def test_shape_streak_handles_none() -> None:
    out = _shape_streak(None)
    assert out == {"current": 0, "longest": 0, "lastActiveDate": None}


def test_shape_streak_propagates_fields() -> None:
    row = SimpleNamespace(
        current_streak=7,
        longest_streak=21,
        last_active_date=datetime(2026, 4, 27, tzinfo=timezone.utc),
    )
    out = _shape_streak(row)
    assert out["current"] == 7
    assert out["longest"] == 21
    assert out["lastActiveDate"].startswith("2026-04-27")


def test_shape_session_computes_accuracy() -> None:
    submitted = datetime(2026, 4, 28, 9, 30, tzinfo=timezone.utc)
    row = {
        "id": "s-1",
        "topic_id": "t-mech",
        "mode": "PRACTICE",
        "served_count": 5,
        "correct_count": 4,
        "submitted_at": submitted,
    }
    out = _shape_session(row)
    assert out["sessionId"] == "s-1"
    assert out["accuracyPct"] == 80
    assert out["mode"] == "PRACTICE"
    assert out["submittedAt"].startswith("2026-04-28")


def test_shape_session_zero_served_yields_zero_accuracy() -> None:
    """Defensive: an EXPIRED session with served_count=0 shouldn't
    divide-by-zero. Educator UI shows 0% (which is honest — they didn't
    actually answer anything)."""
    row = {
        "id": "s-empty",
        "topic_id": None,
        "mode": "PRACTICE",
        "served_count": 0,
        "correct_count": 0,
        "submitted_at": None,
    }
    out = _shape_session(row)
    assert out["accuracyPct"] == 0
    assert out["topicId"] is None


def test_aggregate_orders_recent_sessions_as_provided() -> None:
    """The repo returns them DESC by submitted_at; the aggregator must
    preserve that order so the UI shows newest-first without re-sorting."""
    sessions = [
        {
            "id": f"s-{i}",
            "topic_id": "t",
            "mode": "PRACTICE",
            "served_count": 5,
            "correct_count": 5 - i,
            "submitted_at": datetime(2026, 4, 28 - i, tzinfo=timezone.utc),
        }
        for i in range(3)
    ]
    out = aggregate_student_drilldown(
        user_id="u",
        cohort_id="c",
        readiness_row=None,
        mastery_rows=[],
        streak_row=None,
        recent_sessions=sessions,
    )
    assert [s["sessionId"] for s in out["recentSessions"]] == ["s-0", "s-1", "s-2"]


def test_aggregate_propagates_topic_mastery() -> None:
    mastery = [
        SimpleNamespace(topic_id="t-a", ewa=0.85, n=4),
        SimpleNamespace(topic_id="t-b", ewa=0.40, n=2),
    ]
    out = aggregate_student_drilldown(
        user_id="u",
        cohort_id="c",
        readiness_row=None,
        mastery_rows=mastery,
        streak_row=None,
        recent_sessions=[],
    )
    assert out["topicMastery"] == [
        {"topicId": "t-a", "ewa": 0.85, "n": 4},
        {"topicId": "t-b", "ewa": 0.40, "n": 2},
    ]
