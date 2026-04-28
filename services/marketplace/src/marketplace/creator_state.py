"""Creator application FSM.

Identical structure to tutor_state.py — same states + actions + rule
table. Kept as a separate module rather than parameterising tutor_state
because future divergence is likely (creators may need
content-moderation hooks tutors don't, etc.).
"""

from __future__ import annotations

from typing import Final

# States
APPLIED: Final = "APPLIED"
KYC_PENDING: Final = "KYC_PENDING"
KYC_VERIFIED: Final = "KYC_VERIFIED"
APPROVED: Final = "APPROVED"
ACTIVE: Final = "ACTIVE"
REJECTED: Final = "REJECTED"
SUSPENDED: Final = "SUSPENDED"

# Actions
START_KYC: Final = "start_kyc"
KYC_VERIFIED_ACTION: Final = "kyc_verified"
KYC_REJECTED_ACTION: Final = "kyc_rejected"
ADMIN_APPROVE: Final = "admin_approve"
ADMIN_REJECT: Final = "admin_reject"
ACTIVATE: Final = "activate"
SUSPEND: Final = "suspend"
REACTIVATE: Final = "reactivate"

_TRANSITIONS: dict[tuple[str, str], str] = {
    (APPLIED, START_KYC): KYC_PENDING,
    (KYC_PENDING, KYC_VERIFIED_ACTION): KYC_VERIFIED,
    (KYC_PENDING, KYC_REJECTED_ACTION): REJECTED,
    (KYC_VERIFIED, ADMIN_APPROVE): APPROVED,
    (KYC_VERIFIED, ADMIN_REJECT): REJECTED,
    (APPLIED, ADMIN_REJECT): REJECTED,
    (KYC_PENDING, ADMIN_REJECT): REJECTED,
    (APPROVED, ACTIVATE): ACTIVE,
    (ACTIVE, SUSPEND): SUSPENDED,
    (SUSPENDED, REACTIVATE): ACTIVE,
}


class IllegalTransition(Exception):
    pass


def transition(current: str, action: str) -> str:
    new = _TRANSITIONS.get((current, action))
    if new is None:
        raise IllegalTransition(f"{current} + {action}")
    return new


def can_publish_courses(current: str) -> bool:
    """Only ACTIVE creators may submit courses for review + publish."""
    return current == ACTIVE
