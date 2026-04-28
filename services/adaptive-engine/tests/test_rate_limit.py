"""Sprint 8 R-4 — photo-doubt rate limiter unit tests.

Pure-logic only here. The integration with Redis (INCR + EXPIRE) is
exercised live in compose; the deterministic pieces — limit-by-role and
daily-key partitioning — are pinned by these tests so the contract can't
silently drift when we adjust the cap.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from adaptive_engine.rate_limit import (
    FREE_TIER_DAILY_LIMIT,
    daily_key,
    limit_for_role,
)


# ─────────────────────────────────────────────────────────────────────────
# limit_for_role — role policy
# ─────────────────────────────────────────────────────────────────────────


def test_student_role_uses_free_tier_cap() -> None:
    assert limit_for_role("STUDENT") == FREE_TIER_DAILY_LIMIT


def test_anonymous_uses_free_tier_cap() -> None:
    """Defensive: a missing role (no JWT) should default to the free
    cap so we don't accidentally let unauthenticated traffic bypass."""
    assert limit_for_role(None) == FREE_TIER_DAILY_LIMIT
    assert limit_for_role("") == FREE_TIER_DAILY_LIMIT


@pytest.mark.parametrize(
    "role",
    [
        "STUDENT_PREMIUM",
        "TEACHER",
        "EXPERT",
        "MODERATOR",
        "INSTITUTION_ADMIN",
        "PLATFORM_ADMIN",
    ],
)
def test_premium_and_staff_have_no_cap(role: str) -> None:
    """Paying users + internal staff get unlimited photo-doubt — that's
    the whole value prop the marketing page promises."""
    assert limit_for_role(role) is None


# ─────────────────────────────────────────────────────────────────────────
# daily_key — UTC-day partitioning
# ─────────────────────────────────────────────────────────────────────────


def test_daily_key_includes_user_and_date() -> None:
    n = datetime(2026, 4, 28, 10, 0, 0, tzinfo=timezone.utc)
    key = daily_key("user-abc", n)
    assert key == "photo_doubt:rl:20260428:user-abc"


def test_daily_key_advances_at_midnight_utc() -> None:
    """The cap window must roll over at 00:00 UTC, not at the user's
    local midnight — that's the contract the docstring promises and the
    one Indian power users will test by retrying at midnight IST."""
    end_of_day = datetime(2026, 4, 28, 23, 59, 59, tzinfo=timezone.utc)
    next_day = datetime(2026, 4, 29, 0, 0, 1, tzinfo=timezone.utc)
    assert daily_key("u", end_of_day) != daily_key("u", next_day)


def test_daily_key_isolates_users() -> None:
    n = datetime(2026, 4, 28, 12, 0, tzinfo=timezone.utc)
    assert daily_key("user-1", n) != daily_key("user-2", n)


def test_free_tier_cap_is_three() -> None:
    """Pin the constant — UI copy on the paywall references "3 free per
    day". A change here must be coordinated with marketing."""
    assert FREE_TIER_DAILY_LIMIT == 3
