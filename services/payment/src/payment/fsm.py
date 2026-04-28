"""Subscription state machine — pure logic, no I/O.

States:
  INACTIVE          → never had an active sub (or fully canceled past period_end)
  CHECKOUT_PENDING  → user has clicked Upgrade; Stripe Checkout session created
                       but no `customer.subscription.created` webhook yet
  ACTIVE            → Stripe says ACTIVE; period_end > now
  PAST_DUE          → payment failed; Stripe retrying. JWT still issues PREMIUM
                       until grace period expires (matches Stripe's retry window)
  CANCELED          → user canceled; sub stays usable until period_end then
                       transitions to INACTIVE on the next webhook scan
  REACTIVATED       → user re-subscribed after a CANCELED sub. Distinct from
                       ACTIVE so analytics can count churn-and-return separately

The FSM is the source of truth for "is this user premium right now". The
JWT issuance flow asks `is_premium(state, period_end, now)` and gets a bool.

Stripe webhook events map onto transitions via `transition_for_event`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class State(str, Enum):
    INACTIVE = "INACTIVE"
    CHECKOUT_PENDING = "CHECKOUT_PENDING"
    ACTIVE = "ACTIVE"
    PAST_DUE = "PAST_DUE"
    CANCELED = "CANCELED"
    REACTIVATED = "REACTIVATED"


# Edges allowed by the FSM. (from, to) pairs not in this set raise on transition.
_ALLOWED: set[tuple[State, State]] = {
    (State.INACTIVE, State.CHECKOUT_PENDING),
    # Stripe's `subscription.created` for instantly-paid plans skips the
    # `incomplete` status entirely — the first webhook we see has
    # status=active. We must allow INACTIVE → ACTIVE directly for that.
    (State.INACTIVE, State.ACTIVE),
    (State.CHECKOUT_PENDING, State.ACTIVE),
    (State.CHECKOUT_PENDING, State.INACTIVE),  # Checkout abandoned / failed
    (State.ACTIVE, State.PAST_DUE),
    (State.ACTIVE, State.CANCELED),
    (State.PAST_DUE, State.ACTIVE),
    (State.PAST_DUE, State.CANCELED),
    (State.CANCELED, State.INACTIVE),  # period expired
    (State.CANCELED, State.REACTIVATED),  # user re-subscribed
    (State.REACTIVATED, State.PAST_DUE),
    (State.REACTIVATED, State.CANCELED),
    # Idempotent self-loops (re-applying the same webhook).
    (State.ACTIVE, State.ACTIVE),
    (State.CANCELED, State.CANCELED),
    (State.PAST_DUE, State.PAST_DUE),
    (State.INACTIVE, State.INACTIVE),
    (State.REACTIVATED, State.REACTIVATED),
}


class IllegalTransition(Exception):
    """Raised when an event tries to move the FSM along an edge not in
    `_ALLOWED`. The caller (webhook handler) catches this to log + 409."""


@dataclass(frozen=True)
class Outcome:
    """Result of running the FSM. `to_state` is the new state; `notify`
    is True when the producer should publish a `payment.subscription.changed`
    NATS event so Auth + Quiz + Adaptive can re-cache."""

    to_state: State
    notify: bool


def transition(*, current: State, target: State) -> Outcome:
    """Apply a transition; raise IllegalTransition if not allowed."""
    if (current, target) not in _ALLOWED:
        raise IllegalTransition(f"{current.value} -> {target.value} not allowed")
    # Self-loop = idempotent re-apply; don't re-publish the role-change event.
    return Outcome(to_state=target, notify=current != target)


# ─────────────────────────────────────────────────────────────────────────
# Stripe event-type → target state
# ─────────────────────────────────────────────────────────────────────────

# Map Stripe webhook event types to target FSM states.
# Source: https://stripe.com/docs/api/events/types
_EVENT_TO_TARGET: dict[str, State | None] = {
    # Customer-side
    "checkout.session.completed": State.ACTIVE,
    # Subscription lifecycle
    "customer.subscription.created": State.ACTIVE,
    "customer.subscription.updated": None,  # depends on payload — see derive_target
    "customer.subscription.deleted": State.CANCELED,
    # Payment failures
    "invoice.payment_failed": State.PAST_DUE,
    "invoice.payment_succeeded": State.ACTIVE,
}


def derive_target(event_type: str, stripe_status: str | None = None) -> State | None:
    """Pick the target FSM state from an event type + the embedded Stripe
    `subscription.status`. Returns None when the event isn't one we care
    about (the webhook handler then ACKs without firing the FSM).

    `customer.subscription.updated` is the trickiest — Stripe sends one
    event for every change (status, period_end, cancel_at_period_end).
    We derive from `stripe_status` for that case."""
    if event_type == "customer.subscription.updated" and stripe_status:
        return _stripe_status_to_state(stripe_status)
    return _EVENT_TO_TARGET.get(event_type)


def _stripe_status_to_state(stripe_status: str) -> State:
    """Stripe's subscription.status values → our FSM states."""
    mapping = {
        "active": State.ACTIVE,
        "trialing": State.ACTIVE,  # treated identically for tier-gating
        "past_due": State.PAST_DUE,
        "canceled": State.CANCELED,
        "unpaid": State.PAST_DUE,
        "incomplete": State.CHECKOUT_PENDING,
        "incomplete_expired": State.INACTIVE,
        "paused": State.PAST_DUE,
    }
    return mapping.get(stripe_status, State.INACTIVE)


# ─────────────────────────────────────────────────────────────────────────
# Premium-gate check used by JWT issuance + tier-gating in other services
# ─────────────────────────────────────────────────────────────────────────


def is_premium(state: State, period_end: datetime | None, now: datetime) -> bool:
    """The single contract used by Auth (JWT role assignment) and any
    service consulting the in-app paywall: "should this user have premium
    privileges right now?"

    ACTIVE / REACTIVATED → yes
    PAST_DUE → yes (Stripe is retrying; don't kick them off mid-cycle)
    CANCELED → yes if period_end > now (paid through end of cycle), else no
    everything else → no
    """
    if state in (State.ACTIVE, State.REACTIVATED, State.PAST_DUE):
        return True
    if state == State.CANCELED and period_end is not None and period_end > now:
        return True
    return False
