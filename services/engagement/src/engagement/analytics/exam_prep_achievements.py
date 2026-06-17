"""Sprint 35 (P4-S35) — pure-function exam-prep achievement triggers.

The existing 17 engagement achievements (S7) measure daily-app-return
behaviour: streaks, session counts, question counts, daily-goal hits.
S35 adds 8 exam-prep-tied kinds so the catalogue measures
exam-progress behaviour: full-length mocks, syllabus coverage, PYQ
chapter mastery, weak-topic recovery, revision streaks.

All eligibility checks are pure — they take the relevant signals and
return either the kind string (when the milestone fires) or None. Live
wiring into process_session lands at staging cutover when the
cross-service aggregations stabilise (mock-attempts in quiz, syllabus
% in S28, revision streaks in S27).
"""

from __future__ import annotations

from typing import Literal

# Tag constants — keep stable; the user-profile achievements table
# de-dupes by (user_id, kind), so renaming a kind would create
# duplicates on grant.
KIND_MOCK_COMPLETED_5 = "mock_completed_5"
KIND_MOCK_COMPLETED_25 = "mock_completed_25"
KIND_MOCK_UNDER_TIME = "mock_under_time"
KIND_SYLLABUS_25 = "syllabus_25_pct"
KIND_SYLLABUS_50 = "syllabus_50_pct"
KIND_SYLLABUS_75 = "syllabus_75_pct"
KIND_SYLLABUS_100 = "syllabus_100_pct"
KIND_PYQ_CHAPTER_CLEAN = "pyq_chapter_clean"
KIND_WEAK_TOPIC_RECOVERED = "weak_topic_recovered"
KIND_REVISION_STREAK_30 = "revision_streak_30"

NEW_KINDS = (
    KIND_MOCK_COMPLETED_5,
    KIND_MOCK_COMPLETED_25,
    KIND_MOCK_UNDER_TIME,
    KIND_SYLLABUS_25,
    KIND_SYLLABUS_50,
    KIND_SYLLABUS_75,
    KIND_SYLLABUS_100,
    KIND_PYQ_CHAPTER_CLEAN,
    KIND_WEAK_TOPIC_RECOVERED,
    KIND_REVISION_STREAK_30,
)

# Thresholds
MOCK_5_THRESHOLD = 5
MOCK_25_THRESHOLD = 25
MOCK_UNDER_TIME_REMAINING_MIN = 10
MOCK_UNDER_TIME_MIN_DURATION_MIN = 90  # only counts for real-pattern mocks
SYLLABUS_THRESHOLDS = (25, 50, 75, 100)
PYQ_CLEAN_ACCURACY = 0.8
PYQ_CLEAN_MIN_ATTEMPTS = 5
WEAK_THRESHOLD = 0.4
RECOVERED_THRESHOLD = 0.7
REVISION_STREAK_THRESHOLD = 30


def check_mock_completed(prev_count: int, new_count: int) -> str | None:
    """Fires when full-length mock attempts cross 5 or 25. Both can fire
    on the same call if the count jumped (unlikely but defensible)."""
    if prev_count < MOCK_5_THRESHOLD <= new_count:
        # When crossing both thresholds in a single call, prefer the higher
        # — the lower would already have fired previously in normal flow.
        if new_count >= MOCK_25_THRESHOLD:
            return KIND_MOCK_COMPLETED_25
        return KIND_MOCK_COMPLETED_5
    if prev_count < MOCK_25_THRESHOLD <= new_count:
        return KIND_MOCK_COMPLETED_25
    return None


def check_mock_under_time(
    remaining_seconds: int,
    total_seconds: int,
    *,
    threshold_remaining_min: int = MOCK_UNDER_TIME_REMAINING_MIN,
    min_duration_min: int = MOCK_UNDER_TIME_MIN_DURATION_MIN,
) -> str | None:
    """Fires when a *real-pattern* mock (>= 90 min total) is submitted
    with more than `threshold_remaining_min` minutes remaining."""
    if total_seconds < min_duration_min * 60:
        return None
    if remaining_seconds <= 0:
        return None
    if remaining_seconds >= threshold_remaining_min * 60:
        return KIND_MOCK_UNDER_TIME
    return None


def check_syllabus_milestone(prev_pct: float, new_pct: float) -> str | None:
    """Fires on threshold-crossing for 25/50/75/100. Higher threshold wins
    if multiple cross in a single update (rare; cohort-aggregation lag
    can produce a jump)."""
    crossed: list[int] = []
    for t in SYLLABUS_THRESHOLDS:
        if prev_pct < t <= new_pct:
            crossed.append(t)
    if not crossed:
        return None
    highest = max(crossed)
    return f"syllabus_{highest}_pct"


def check_pyq_chapter_clean(
    accuracy: float, n_attempted: int
) -> str | None:
    """Fires when accuracy >= 80% on a PYQ chapter with >= 5 attempts."""
    if n_attempted < PYQ_CLEAN_MIN_ATTEMPTS:
        return None
    if accuracy >= PYQ_CLEAN_ACCURACY:
        return KIND_PYQ_CHAPTER_CLEAN
    return None


def check_weak_topic_recovered(
    prev_ewa: float,
    new_ewa: float,
    *,
    weak: float = WEAK_THRESHOLD,
    recovered: float = RECOVERED_THRESHOLD,
) -> str | None:
    """Fires when a topic crosses from below `weak` to above `recovered`
    in a single recompute. Idempotent in caller via achievement de-dupe
    on (user_id, kind, topic_id)."""
    if prev_ewa < weak and new_ewa >= recovered:
        return KIND_WEAK_TOPIC_RECOVERED
    return None


def check_revision_streak(
    consecutive_days: int,
    *,
    threshold: int = REVISION_STREAK_THRESHOLD,
) -> str | None:
    """Fires at exactly `threshold` consecutive days. Re-firing on
    subsequent days is suppressed by user_profile's UNIQUE (user, kind)
    constraint."""
    if consecutive_days >= threshold:
        return KIND_REVISION_STREAK_30
    return None
