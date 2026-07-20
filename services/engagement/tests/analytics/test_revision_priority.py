"""Phase 3.2 — pure-function tests for yield-weighted revision ranking."""

from __future__ import annotations

from engagement.analytics.revision_priority import (
    TopicSignals,
    priority_reason,
    priority_score,
    rank,
)


def _sig(tid="t", overdue=0, ewa=0.5, errors=0):
    return TopicSignals(topic_id=tid, overdue_days=overdue, ewa=ewa, error_count=errors)


def test_weaker_topic_outranks_stronger_when_equally_overdue() -> None:
    weak = priority_score(_sig(overdue=2, ewa=0.2))
    strong = priority_score(_sig(overdue=2, ewa=0.9))
    assert weak > strong


def test_error_prone_topic_gets_a_boost() -> None:
    with_errors = priority_score(_sig(overdue=1, ewa=0.6, errors=5))
    clean = priority_score(_sig(overdue=1, ewa=0.6, errors=0))
    assert with_errors > clean


def test_high_yield_weak_beats_low_yield_overdue_when_tuned() -> None:
    # A very weak, error-prone topic due 3 days should outrank a comfortable
    # topic that's merely more overdue.
    weak_errorful = priority_score(_sig(overdue=3, ewa=0.15, errors=5))
    comfortable_overdue = priority_score(_sig(overdue=8, ewa=0.85, errors=0))
    assert weak_errorful > comfortable_overdue


def test_unknown_mastery_treated_as_moderately_weak() -> None:
    unknown = priority_score(_sig(overdue=1, ewa=None))
    strong = priority_score(_sig(overdue=1, ewa=0.9))
    assert unknown > strong  # None -> 0.5 weakness beats 0.9 mastery


def test_reason_names_dominant_factor() -> None:
    assert priority_reason(_sig(overdue=14, ewa=0.8, errors=0)) == "14d overdue"
    assert priority_reason(_sig(overdue=0, ewa=0.1, errors=0)) == "Weak mastery here"
    assert priority_reason(_sig(overdue=0, ewa=0.9, errors=5)) == "You keep missing this"
    assert priority_reason(_sig(overdue=0, ewa=1.0, errors=0)) == "Scheduled review"


def test_rank_sorts_and_enriches() -> None:
    items = [
        {"topicId": "a", "overdueDays": 1},
        {"topicId": "b", "overdueDays": 1},
    ]
    signals = {
        "a": _sig("a", overdue=1, ewa=0.9, errors=0),   # comfortable
        "b": _sig("b", overdue=1, ewa=0.1, errors=4),   # weak + errorful
    }
    out = rank(items, signals)
    assert out[0]["topicId"] == "b"  # weak+errorful first
    assert "priority" in out[0] and "priorityReason" in out[0]
    assert out[0]["errorCount"] == 4


def test_rank_tolerates_missing_signals() -> None:
    items = [{"topicId": "x", "overdueDays": 3}]
    out = rank(items, {})  # no signal for x
    assert out[0]["topicId"] == "x"
    assert out[0]["priorityReason"]  # falls back gracefully
