"""Sprint 24 (P4-S24) — pure-function tests for the PYQ chapter-frequency
aggregator + the ingest CLI row validator."""

from __future__ import annotations

import sys
from pathlib import Path

# Make the scripts/ dir importable for the ingest CLI's pure functions.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from learning.pyq.repositories import aggregate_chapter_frequency
from scripts.ingest_pyq import validate_row


def test_aggregator_groups_by_topic_and_year() -> None:
    rows = [
        {"topic_id": "t-mech", "topic_title": "Mechanics", "exam_year": 2024, "n": 3},
        {"topic_id": "t-mech", "topic_title": "Mechanics", "exam_year": 2023, "n": 2},
        {"topic_id": "t-thermo", "topic_title": "Thermodynamics", "exam_year": 2024, "n": 1},
    ]
    out = aggregate_chapter_frequency(rows)
    by_topic = {b["topicId"]: b for b in out}
    assert by_topic["t-mech"]["yearCounts"] == {2023: 2, 2024: 3}
    assert by_topic["t-mech"]["total"] == 5
    assert by_topic["t-thermo"]["yearCounts"] == {2024: 1}
    assert by_topic["t-thermo"]["total"] == 1


def test_aggregator_sorts_by_total_descending() -> None:
    rows = [
        {"topic_id": "small", "topic_title": "Small", "exam_year": 2024, "n": 1},
        {"topic_id": "big", "topic_title": "Big", "exam_year": 2024, "n": 5},
    ]
    out = aggregate_chapter_frequency(rows)
    assert [b["topicId"] for b in out] == ["big", "small"]


def test_aggregator_handles_missing_year() -> None:
    """Rows with a NULL exam_year still count toward total but skip
    the per-year breakdown — defensive against legacy PYQ rows that
    were ingested before exam_year was reliable."""
    rows = [
        {"topic_id": "t1", "topic_title": "T1", "exam_year": None, "n": 2},
        {"topic_id": "t1", "topic_title": "T1", "exam_year": 2024, "n": 1},
    ]
    out = aggregate_chapter_frequency(rows)
    assert out[0]["total"] == 3
    assert out[0]["yearCounts"] == {2024: 1}


def test_validate_row_happy_path() -> None:
    row = {
        "stem": "What is 2 + 2?",
        "choices": ["3", "4"],
        "correct_idx": 1,
        "topic_id": "33333333-0000-0000-0000-000000000001",
    }
    ok, reason = validate_row(row)
    assert ok is True
    assert reason == ""


def test_validate_row_rejects_missing_topic_id() -> None:
    row = {
        "stem": "What is 2 + 2?",
        "choices": ["3", "4"],
        "correct_idx": 1,
    }
    ok, reason = validate_row(row)
    assert ok is False
    assert "topic_id" in reason


def test_validate_row_rejects_correct_idx_out_of_range() -> None:
    row = {
        "stem": "What is 2 + 2?",
        "choices": ["3", "4"],
        "correct_idx": 5,
        "topic_id": "33333333-0000-0000-0000-000000000001",
    }
    ok, reason = validate_row(row)
    assert ok is False
    assert "correct_idx" in reason


def test_validate_row_rejects_single_choice() -> None:
    row = {
        "stem": "stem",
        "choices": ["only-one"],
        "correct_idx": 0,
        "topic_id": "t1",
    }
    ok, reason = validate_row(row)
    assert ok is False
    assert "choices" in reason
