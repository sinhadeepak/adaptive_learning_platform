"""Subscription FSM unit tests — no I/O, pure-logic.

Covers:
- Allowed transitions move the FSM to the new state.
- Self-loops are allowed but don't fire `notify` (idempotency contract
  — webhook redeliveries must not double-publish role changes).
- Disallowed transitions raise IllegalTransition.
- `derive_target` correctly maps Stripe event types + statuses.
- `is_premium` enforces the tier-gate contract Auth + Quiz consume.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from payment.fsm import (
    IllegalTransition,
    State,
    derive_target,
    is_premium,
    transition,
)


# ─────────────────────────────────────────────────────────────────────────
# transition
# ─────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (State.INACTIVE, State.CHECKOUT_PENDING),
        (State.INACTIVE, State.ACTIVE),
        (State.CHECKOUT_PENDING, State.ACTIVE),
        (State.CHECKOUT_PENDING, State.INACTIVE),
        (State.ACTIVE, State.PAST_DUE),
        (State.ACTIVE, State.CANCELED),
        (State.PAST_DUE, State.ACTIVE),
        (State.PAST_DUE, State.CANCELED),
        (State.CANCELED, State.INACTIVE),
        (State.CANCELED, State.REACTIVATED),
        (State.REACTIVATED, State.PAST_DUE),
        (State.REACTIVATED, State.CANCELED),
    ],
)
def test_allowed_transitions_move_state_and_notify(
    current: State, target: State
) -> None:
    out = transition(current=current, target=target)
    assert out.to_state is target
    # Real edges always notify so Auth/Quiz/Adaptive can re-cache.
    assert out.notify is True


@pytest.mark.parametrize(
    "state",
    [State.ACTIVE, State.CANCELED, State.PAST_DUE, State.INACTIVE, State.REACTIVATED],
)
def test_self_loops_are_idempotent_no_notify(state: State) -> None:
    """Re-applying the same webhook (Stripe retries up to 3 days) must not
    re-publish a role-change event — that's how Auth's NATS subscriber
    avoids double-bouncing the user's JWT."""
    out = transition(current=state, target=state)
    assert out.to_state is state
    assert out.notify is False


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (State.ACTIVE, State.INACTIVE),  # Cancel must precede inactive
        (State.ACTIVE, State.REACTIVATED),  # Already active
        (State.CANCELED, State.ACTIVE),  # Must use REACTIVATED
        (State.PAST_DUE, State.INACTIVE),  # Must cancel first
        (State.PAST_DUE, State.CHECKOUT_PENDING),  # Re-checkout must use REACTIVATED
    ],
)
def test_illegal_transitions_raise(current: State, target: State) -> None:
    with pytest.raises(IllegalTransition):
        transition(current=current, target=target)


# ─────────────────────────────────────────────────────────────────────────
# derive_target
# ─────────────────────────────────────────────────────────────────────────


def test_derive_target_checkout_session_completed() -> None:
    assert derive_target("checkout.session.completed") is State.ACTIVE


def test_derive_target_subscription_created_is_active() -> None:
    assert derive_target("customer.subscription.created") is State.ACTIVE


def test_derive_target_subscription_deleted_is_canceled() -> None:
    assert derive_target("customer.subscription.deleted") is State.CANCELED


def test_derive_target_invoice_failed_is_past_due() -> None:
    assert derive_target("invoice.payment_failed") is State.PAST_DUE


def test_derive_target_invoice_succeeded_is_active() -> None:
    assert derive_target("invoice.payment_succeeded") is State.ACTIVE


@pytest.mark.parametrize(
    ("stripe_status", "expected"),
    [
        ("active", State.ACTIVE),
        ("trialing", State.ACTIVE),
        ("past_due", State.PAST_DUE),
        ("canceled", State.CANCELED),
        ("unpaid", State.PAST_DUE),
        ("incomplete", State.CHECKOUT_PENDING),
        ("incomplete_expired", State.INACTIVE),
        ("paused", State.PAST_DUE),
    ],
)
def test_derive_target_subscription_updated_uses_status(
    stripe_status: str, expected: State
) -> None:
    """`customer.subscription.updated` is Stripe's catch-all — the FSM
    derives the target purely from the embedded subscription.status."""
    got = derive_target("customer.subscription.updated", stripe_status=stripe_status)
    assert got is expected


def test_derive_target_unknown_event_returns_none() -> None:
    assert derive_target("invoice.upcoming") is None
    assert derive_target("price.created") is None


def test_derive_target_subscription_updated_without_status_returns_none() -> None:
    """Defensive: an updated event with no status payload falls through
    rather than picking an arbitrary state."""
    assert derive_target("customer.subscription.updated") is None


# ─────────────────────────────────────────────────────────────────────────
# is_premium
# ─────────────────────────────────────────────────────────────────────────


def test_active_state_is_premium() -> None:
    now = datetime.now(tz=UTC)
    assert is_premium(State.ACTIVE, now + timedelta(days=10), now) is True
    # Active without a known period_end (rare; partial Stripe payload) — premium.
    assert is_premium(State.ACTIVE, None, now) is True


def test_past_due_keeps_premium_during_retry() -> None:
    """PAST_DUE means Stripe is retrying the charge. We don't kick the user
    off mid-cycle — they keep PREMIUM until the retry window closes and
    Stripe sends customer.subscription.deleted."""
    now = datetime.now(tz=UTC)
    assert is_premium(State.PAST_DUE, now + timedelta(days=1), now) is True


def test_reactivated_is_premium() -> None:
    now = datetime.now(tz=UTC)
    assert is_premium(State.REACTIVATED, now + timedelta(days=30), now) is True


def test_canceled_is_premium_until_period_end() -> None:
    """User canceled but paid through end of cycle — keep premium until then."""
    now = datetime.now(tz=UTC)
    assert is_premium(State.CANCELED, now + timedelta(days=5), now) is True
    # Past period_end → no longer premium.
    assert is_premium(State.CANCELED, now - timedelta(days=1), now) is False
    # Canceled with no period_end → not premium.
    assert is_premium(State.CANCELED, None, now) is False


def test_inactive_and_pending_are_not_premium() -> None:
    now = datetime.now(tz=UTC)
    assert is_premium(State.INACTIVE, None, now) is False
    assert is_premium(State.CHECKOUT_PENDING, None, now) is False
