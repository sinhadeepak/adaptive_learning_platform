"""Stripe Identity integration — stub for Sprint 16, real wiring later.

Per ADR-0006, KYC happens via Stripe Identity (integrated with Stripe
Connect Express in P3-S2). This sprint provides a local stub so the
end-to-end application FSM can be tested without Stripe credentials.

Live mode (set MARKETPLACE_STRIPE_IDENTITY_LIVE=1) is a TODO for P3-S2.
The function signatures match the eventual real Stripe API shape.
"""

from __future__ import annotations

import os
import secrets
from typing import Final, Literal

LIVE_MODE: Final = os.environ.get("MARKETPLACE_STRIPE_IDENTITY_LIVE") == "1"

VerificationStatus = Literal["pending", "verified", "rejected"]


def start_verification(user_id: str) -> str:
    """Create a Stripe Identity verification session, return its id.

    Stub mode: returns a fake `vs_test_<random>` id. The fake session is
    later "verified" via poll_verification or "rejected" via the explicit
    poll_verification(..., force='rejected') escape hatch (admin tool).
    """
    if LIVE_MODE:  # pragma: no cover — wired in P3-S2 with real creds
        raise NotImplementedError(
            "Live Stripe Identity not yet wired. Set MARKETPLACE_STRIPE_IDENTITY_LIVE=0 for local."
        )
    # Stub: deterministic-ish id based on user_id so tests can predict it.
    return f"vs_test_{user_id[:8]}_{secrets.token_hex(4)}"


def poll_verification(session_id: str, *, force: str | None = None) -> VerificationStatus:
    """Return the current status of a verification session.

    Stub mode:
      - default: returns 'verified' (happy path; what the smoke uses).
      - force='rejected': returns 'rejected' (lets admin tooling test
        the rejection branch).

    Live mode: would call stripe.identity.VerificationSession.retrieve.
    """
    if LIVE_MODE:  # pragma: no cover
        raise NotImplementedError(
            "Live Stripe Identity not yet wired."
        )
    if force == "rejected":
        return "rejected"
    if force == "pending":
        return "pending"
    if not session_id.startswith("vs_test_"):
        return "rejected"
    return "verified"
