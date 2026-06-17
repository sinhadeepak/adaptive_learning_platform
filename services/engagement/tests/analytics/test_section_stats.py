"""Sprint 22 (P4-S22) — pure-function tests for the per-section aggregator."""

from __future__ import annotations

from engagement.analytics.section_stats import aggregate_items_by_section


def test_groups_by_section_id_when_present() -> None:
    items = [
        {"item_idx": 0, "topic_id": "t-mech", "section_id": "physics", "is_correct": True, "time_spent_ms": 4000},
        {"item_idx": 1, "topic_id": "t-mech", "section_id": "physics", "is_correct": False, "time_spent_ms": 6000},
        {"item_idx": 2, "topic_id": "t-stoich", "section_id": "chem", "is_correct": True, "time_spent_ms": 3000},
    ]
    out = aggregate_items_by_section(items)
    assert out == {
        "physics": {"correct_count": 1, "served_count": 2, "total_time_ms": 10000},
        "chem": {"correct_count": 1, "served_count": 1, "total_time_ms": 3000},
    }


def test_falls_back_to_topic_id_when_no_section_id() -> None:
    """Sessions without a blueprint don't carry section_id; aggregator
    falls back to topic_id so practice sessions still produce per-topic
    rollups (which becomes the "section" key in storage)."""
    items = [
        {"item_idx": 0, "topic_id": "t-mech", "is_correct": True, "time_spent_ms": 5000},
        {"item_idx": 1, "topic_id": "t-mech", "is_correct": True, "time_spent_ms": 4000},
        {"item_idx": 2, "topic_id": "t-thermo", "is_correct": False, "time_spent_ms": 8000},
    ]
    out = aggregate_items_by_section(items)
    assert set(out.keys()) == {"t-mech", "t-thermo"}
    assert out["t-mech"]["correct_count"] == 2
    assert out["t-mech"]["served_count"] == 2
    assert out["t-thermo"]["served_count"] == 1


def test_empty_items_returns_empty() -> None:
    assert aggregate_items_by_section([]) == {}


def test_zero_time_spent_handled() -> None:
    """Unanswered items have time_spent_ms == 0 (or missing); they contribute
    to served_count only."""
    items = [
        {"item_idx": 0, "topic_id": "t-mech", "is_correct": False, "time_spent_ms": 0},
        {"item_idx": 1, "topic_id": "t-mech", "is_correct": True},  # missing key
    ]
    out = aggregate_items_by_section(items)
    assert out["t-mech"]["served_count"] == 2
    assert out["t-mech"]["total_time_ms"] == 0
    assert out["t-mech"]["correct_count"] == 1


def test_skips_items_with_no_section_or_topic() -> None:
    items = [
        {"item_idx": 0, "is_correct": True, "time_spent_ms": 1000},  # no key
        {"item_idx": 1, "topic_id": "t-mech", "is_correct": True, "time_spent_ms": 2000},
    ]
    out = aggregate_items_by_section(items)
    assert list(out.keys()) == ["t-mech"]
    assert out["t-mech"]["served_count"] == 1


def test_section_id_preferred_over_topic_id_when_both_present() -> None:
    """When the session is bound to a blueprint, section_id wins. The
    aggregator must not double-count by accidentally splitting on topic."""
    items = [
        {"topic_id": "t-mech", "section_id": "physics", "is_correct": True, "time_spent_ms": 1000},
        {"topic_id": "t-thermo", "section_id": "physics", "is_correct": False, "time_spent_ms": 2000},
    ]
    out = aggregate_items_by_section(items)
    assert list(out.keys()) == ["physics"]
    assert out["physics"]["served_count"] == 2
