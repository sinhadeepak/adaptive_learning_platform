"""Sprint 8 R-1/R-2 — premium tier elevation tests.

Pure-logic tests only (no DB). Covers:
- `effective_role` — STUDENT with future premium_until → STUDENT_PREMIUM
- `effective_role` — non-STUDENT roles never get elevated
- `effective_role` — expired premium_until is ignored
- `derive_premium_until` — the `payment.subscription.changed` payload
  → premium_until contract the NATS subscriber pins.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from identity.auth.payment_subscriber import derive_premium_until
from identity.auth.security import effective_role


# ─────────────────────────────────────────────────────────────────────────
# effective_role
# ─────────────────────────────────────────────────────────────────────────


def test_student_with_future_premium_is_elevated() -> None:
    now = datetime.now(tz=timezone.utc)
    future = now + timedelta(days=10)
    assert effective_role("STUDENT", future, now) == "STUDENT_PREMIUM"


def test_student_with_no_premium_stays_student() -> None:
    assert effective_role("STUDENT", None) == "STUDENT"


def test_student_with_expired_premium_stays_student() -> None:
    """User canceled and the period_end has passed — they're back to free."""
    now = datetime.now(tz=timezone.utc)
    past = now - timedelta(days=1)
    assert effective_role("STUDENT", past, now) == "STUDENT"


@pytest.mark.parametrize(
    "role",
    ["TEACHER", "EXPERT", "MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN"],
)
def test_non_student_roles_pass_through(role: str) -> None:
    """Tier elevation only applies to STUDENT — TEACHER/EXPERT/ADMIN are
    role-based not subscription-based, so an active Stripe sub on a
    teacher account does NOT change their JWT role."""
    now = datetime.now(tz=timezone.utc)
    future = now + timedelta(days=30)
    assert effective_role(role, future, now) == role


# ─────────────────────────────────────────────────────────────────────────
# derive_premium_until — NATS subscriber contract
# ─────────────────────────────────────────────────────────────────────────


def test_active_state_uses_period_end() -> None:
    pe = datetime.now(tz=timezone.utc) + timedelta(days=30)
    assert derive_premium_until("ACTIVE", pe) == pe


def test_reactivated_state_uses_period_end() -> None:
    pe = datetime.now(tz=timezone.utc) + timedelta(days=30)
    assert derive_premium_until("REACTIVATED", pe) == pe


def test_past_due_keeps_premium_during_retry_window() -> None:
    """Stripe is retrying the charge — don't kick the user out mid-cycle."""
    pe = datetime.now(tz=timezone.utc) + timedelta(days=2)
    assert derive_premium_until("PAST_DUE", pe) == pe


def test_canceled_with_future_period_end_keeps_premium() -> None:
    """User canceled but paid through end of cycle — keep premium until then."""
    pe = datetime.now(tz=timezone.utc) + timedelta(days=5)
    assert derive_premium_until("CANCELED", pe) == pe


def test_canceled_with_past_period_end_clears_premium() -> None:
    """The end-of-cycle scheduled cleanup webhook fires `customer.subscription.deleted`
    with a past period_end — premium is gone."""
    pe = datetime.now(tz=timezone.utc) - timedelta(days=1)
    assert derive_premium_until("CANCELED", pe) is None


def test_canceled_without_period_end_clears_premium() -> None:
    assert derive_premium_until("CANCELED", None) is None


def test_inactive_clears_premium() -> None:
    assert derive_premium_until("INACTIVE", None) is None


def test_unknown_state_clears_premium_defensively() -> None:
    """Forward-compat: a future Stripe webhook type Auth doesn't yet
    understand → clear premium rather than guess the wrong way."""
    assert derive_premium_until("FUTURE_STATE_XYZ", None) is None
