"""Tutor application FSM.

Pure-function state machine, no DB. Caller persists transitions
explicitly. The transitions table is the single source of truth for
"which state can move where, on which action".
"""

from __future__ import annotations

from typing import Final

# All possible states.
APPLIED: Final = "APPLIED"
KYC_PENDING: Final = "KYC_PENDING"
KYC_VERIFIED: Final = "KYC_VERIFIED"
APPROVED: Final = "APPROVED"
ACTIVE: Final = "ACTIVE"
REJECTED: Final = "REJECTED"
SUSPENDED: Final = "SUSPENDED"

# Actions (verbs the system or admin invokes).
START_KYC: Final = "start_kyc"
KYC_VERIFIED_ACTION: Final = "kyc_verified"
KYC_REJECTED_ACTION: Final = "kyc_rejected"
ADMIN_APPROVE: Final = "admin_approve"
ADMIN_REJECT: Final = "admin_reject"
ACTIVATE: Final = "activate"
SUSPEND: Final = "suspend"
REACTIVATE: Final = "reactivate"

# (current_state, action) -> new_state
_TRANSITIONS: dict[tuple[str, str], str] = {
    (APPLIED, START_KYC): KYC_PENDING,
    (KYC_PENDING, KYC_VERIFIED_ACTION): KYC_VERIFIED,
    (KYC_PENDING, KYC_REJECTED_ACTION): REJECTED,
    (KYC_VERIFIED, ADMIN_APPROVE): APPROVED,
    (KYC_VERIFIED, ADMIN_REJECT): REJECTED,
    # Admin can also reject earlier states:
    (APPLIED, ADMIN_REJECT): REJECTED,
    (KYC_PENDING, ADMIN_REJECT): REJECTED,
    (APPROVED, ACTIVATE): ACTIVE,
    (ACTIVE, SUSPEND): SUSPENDED,
    (SUSPENDED, REACTIVATE): ACTIVE,
}


class IllegalTransition(Exception):
    """Raised when (current_state, action) has no rule."""


def transition(current: str, action: str) -> str:
    """Return the new state, or raise IllegalTransition.

    >>> transition('APPLIED', 'start_kyc')
    'KYC_PENDING'
    >>> transition('REJECTED', 'admin_approve')  # noqa
    Traceback (most recent call last):
        ...
    marketplace.tutor_state.IllegalTransition: REJECTED + admin_approve
    """
    new = _TRANSITIONS.get((current, action))
    if new is None:
        raise IllegalTransition(f"{current} + {action}")
    return new


def is_listable(current: str) -> bool:
    """Only ACTIVE tutors appear in public listings."""
    return current == ACTIVE


def can_book(current: str) -> bool:
    """Bookings (P3-S2) require ACTIVE."""
    return current == ACTIVE
