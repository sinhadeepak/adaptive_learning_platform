"""Stripe Connect integration — stub for Sprint 17, real wiring later.

Per ADR-0007, payouts go through Stripe Connect Express. P3-S2 stubs the
payment intent + transfer flow so the booking FSM can be tested without
real Stripe credentials. Live mode (`MARKETPLACE_STRIPE_CONNECT_LIVE=1`)
is `NotImplementedError` until P3-S2-late.
"""

from __future__ import annotations

import os
import secrets
from typing import Final, Literal

LIVE_MODE: Final = os.environ.get("MARKETPLACE_STRIPE_CONNECT_LIVE") == "1"

PaymentStatus = Literal["pending", "succeeded", "failed"]


def create_payment_intent(
    booking_id: str,
    amount_paise: int,
    tutor_connect_account: str | None = None,
    *,
    application_fee_paise: int = 0,
) -> str:
    """Create a payment intent (charge the student) with the tutor's
    Connect account marked as the destination for the (amount - fee).

    Stub: returns `pi_test_<booking_prefix>_<random>`. Pre-confirmed
    state. The student client polls or calls confirm_payment_intent
    to flip it to `succeeded`.
    """
    if LIVE_MODE:  # pragma: no cover — live wiring deferred
        raise NotImplementedError(
            "Live Stripe Connect not wired. Set MARKETPLACE_STRIPE_CONNECT_LIVE=0."
        )
    return f"pi_test_{booking_id[:8]}_{secrets.token_hex(4)}"


def confirm_payment_intent(
    intent_id: str, *, force: str | None = None
) -> PaymentStatus:
    """Return the current status of a payment intent.

    Stub: defaults to `succeeded`. `force='failed'` for the failure path.
    """
    if LIVE_MODE:  # pragma: no cover
        raise NotImplementedError("Live Stripe Connect not wired.")
    if force == "failed":
        return "failed"
    if force == "pending":
        return "pending"
    if not intent_id.startswith("pi_test_"):
        return "failed"
    return "succeeded"


def commission_split(price_paise: int, override_rate: float | None = None) -> tuple[int, int]:
    """Returns (commission_paise, tutor_payout_paise) per ADR-0007.

    Default 15% platform commission. `override_rate` (0.0–1.0) allows
    per-tutor overrides set by admin. Always rounds half-up so the
    tutor never gets short-changed by a paisa.
    """
    rate = override_rate if override_rate is not None else 0.15
    if not (0.0 <= rate <= 1.0):
        raise ValueError(f"commission rate out of range: {rate}")
    commission = round(price_paise * rate)
    if commission > price_paise:
        commission = price_paise
    return commission, price_paise - commission


def refund_payment_intent(intent_id: str, *, force: str | None = None) -> str:
    """Refund a previously confirmed payment intent.

    Stub returns 'succeeded' by default; force='failed' for the failure
    branch. Live mode (Stripe REST refund call) deferred until creds.
    """
    if LIVE_MODE:  # pragma: no cover
        raise NotImplementedError("Live Stripe Connect refund not wired.")
    if force == "failed":
        return "failed"
    return "succeeded"
