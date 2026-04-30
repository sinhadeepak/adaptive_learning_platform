"""Sprint 35 (P4-S35) — pure-function tests for exam-prep achievement triggers."""

from __future__ import annotations

from engagement.analytics.exam_prep_achievements import (
    KIND_MOCK_COMPLETED_5,
    KIND_MOCK_COMPLETED_25,
    KIND_MOCK_UNDER_TIME,
    KIND_PYQ_CHAPTER_CLEAN,
    KIND_REVISION_STREAK_30,
    KIND_WEAK_TOPIC_RECOVERED,
    NEW_KINDS,
    check_mock_completed,
    check_mock_under_time,
    check_pyq_chapter_clean,
    check_revision_streak,
    check_syllabus_milestone,
    check_weak_topic_recovered,
)


def test_eight_new_kinds_registered() -> None:
    # Spec calls for 8 exam-prep-tied kinds (the 4 syllabus thresholds count
    # as one family). Total NEW_KINDS = 10 because syllabus expands to 4.
    assert len(NEW_KINDS) == 10
    assert KIND_MOCK_COMPLETED_5 in NEW_KINDS
    assert KIND_REVISION_STREAK_30 in NEW_KINDS


def test_mock_completed_5_fires_on_crossing() -> None:
    assert check_mock_completed(4, 5) == KIND_MOCK_COMPLETED_5
    assert check_mock_completed(0, 1) is None
    assert check_mock_completed(5, 6) is None  # already fired


def test_mock_completed_25_fires_on_crossing() -> None:
    assert check_mock_completed(24, 25) == KIND_MOCK_COMPLETED_25
    assert check_mock_completed(20, 24) is None


def test_mock_completed_jumps_through_both_returns_25() -> None:
    # Edge: legitimately rare jump (admin re-import). Prefer the higher.
    assert check_mock_completed(0, 25) == KIND_MOCK_COMPLETED_25


def test_mock_under_time_requires_real_pattern_duration() -> None:
    # 25-min stub mock — does not count even with time remaining.
    assert check_mock_under_time(15 * 60, 25 * 60) is None


def test_mock_under_time_fires_on_real_mock_with_time_remaining() -> None:
    # 180-min mock submitted with 15 min remaining → fires.
    assert check_mock_under_time(15 * 60, 180 * 60) == KIND_MOCK_UNDER_TIME


def test_mock_under_time_does_not_fire_when_just_made_it() -> None:
    # 180-min mock submitted with 5 min remaining — under threshold.
    assert check_mock_under_time(5 * 60, 180 * 60) is None


def test_syllabus_milestone_each_threshold() -> None:
    assert check_syllabus_milestone(20, 26) == "syllabus_25_pct"
    assert check_syllabus_milestone(40, 51) == "syllabus_50_pct"
    assert check_syllabus_milestone(70, 76) == "syllabus_75_pct"
    assert check_syllabus_milestone(99, 100) == "syllabus_100_pct"


def test_syllabus_milestone_no_fire_below_threshold() -> None:
    assert check_syllabus_milestone(20, 24) is None


def test_syllabus_milestone_picks_highest_when_multiple_cross() -> None:
    # 0% → 60% jumps both 25 and 50; pick 50.
    assert check_syllabus_milestone(0, 60) == "syllabus_50_pct"


def test_pyq_chapter_clean_requires_accuracy_and_attempts() -> None:
    assert check_pyq_chapter_clean(0.85, 5) == KIND_PYQ_CHAPTER_CLEAN
    assert check_pyq_chapter_clean(0.85, 4) is None  # too few attempts
    assert check_pyq_chapter_clean(0.7, 10) is None  # below accuracy bar


def test_weak_topic_recovered_fires_on_full_traversal() -> None:
    assert check_weak_topic_recovered(0.3, 0.75) == KIND_WEAK_TOPIC_RECOVERED
    assert check_weak_topic_recovered(0.5, 0.75) is None  # didn't start weak
    assert check_weak_topic_recovered(0.3, 0.5) is None  # didn't reach recovered


def test_revision_streak_fires_at_threshold() -> None:
    assert check_revision_streak(30) == KIND_REVISION_STREAK_30
    assert check_revision_streak(29) is None
    assert check_revision_streak(45) == KIND_REVISION_STREAK_30  # later days idempotent via DB UNIQUE


def test_custom_thresholds_supported() -> None:
    assert (
        check_revision_streak(7, threshold=7) == KIND_REVISION_STREAK_30
    )  # constant kind name; threshold tunable
