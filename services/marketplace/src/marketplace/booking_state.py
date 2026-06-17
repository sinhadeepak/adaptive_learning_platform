"""Booking FSM.

Pure-function state machine, no DB. Mirrors tutor_state.py's pattern.
The 24-hour cancel-by-student rule is a business rule enforced in the
route, not encoded here — the FSM only knows about state transitions.
"""

from __future__ import annotations

from typing import Final

# States
PENDING_PAYMENT: Final = "PENDING_PAYMENT"
CONFIRMED: Final = "CONFIRMED"
IN_PROGRESS: Final = "IN_PROGRESS"
COMPLETED: Final = "COMPLETED"
CANCELLED_BY_STUDENT: Final = "CANCELLED_BY_STUDENT"
CANCELLED_BY_TUTOR: Final = "CANCELLED_BY_TUTOR"
NO_SHOW_STUDENT: Final = "NO_SHOW_STUDENT"
NO_SHOW_TUTOR: Final = "NO_SHOW_TUTOR"
REFUNDED_BY_ADMIN: Final = "REFUNDED_BY_ADMIN"  # Sprint 19

# Actions
PAYMENT_SUCCEEDED: Final = "payment_succeeded"
PAYMENT_FAILED: Final = "payment_failed"
START: Final = "start"
COMPLETE: Final = "complete"
CANCEL_BY_STUDENT: Final = "cancel_by_student"
CANCEL_BY_TUTOR: Final = "cancel_by_tutor"
NO_SHOW_STUDENT_ACTION: Final = "no_show_student"
NO_SHOW_TUTOR_ACTION: Final = "no_show_tutor"
ADMIN_REFUND: Final = "admin_refund"  # Sprint 19

_TRANSITIONS: dict[tuple[str, str], str] = {
    (PENDING_PAYMENT, PAYMENT_SUCCEEDED): CONFIRMED,
    (PENDING_PAYMENT, PAYMENT_FAILED): CANCELLED_BY_STUDENT,
    (PENDING_PAYMENT, CANCEL_BY_STUDENT): CANCELLED_BY_STUDENT,
    (CONFIRMED, START): IN_PROGRESS,
    (CONFIRMED, CANCEL_BY_STUDENT): CANCELLED_BY_STUDENT,
    (CONFIRMED, CANCEL_BY_TUTOR): CANCELLED_BY_TUTOR,
    (IN_PROGRESS, COMPLETE): COMPLETED,
    (IN_PROGRESS, NO_SHOW_STUDENT_ACTION): NO_SHOW_STUDENT,
    (IN_PROGRESS, NO_SHOW_TUTOR_ACTION): NO_SHOW_TUTOR,
    # Admin refund — terminal. Allowed from COMPLETED + the cancel + no-show
    # variants (anything where money already changed hands and the admin
    # decides to reverse it).
    (COMPLETED, ADMIN_REFUND): REFUNDED_BY_ADMIN,
    (CANCELLED_BY_TUTOR, ADMIN_REFUND): REFUNDED_BY_ADMIN,
    (NO_SHOW_TUTOR, ADMIN_REFUND): REFUNDED_BY_ADMIN,
}


class IllegalTransition(Exception):
    """(current_state, action) has no rule."""


def transition(current: str, action: str) -> str:
    new = _TRANSITIONS.get((current, action))
    if new is None:
        raise IllegalTransition(f"{current} + {action}")
    return new


def is_terminal(state: str) -> bool:
    return state in {
        COMPLETED,
        CANCELLED_BY_STUDENT,
        CANCELLED_BY_TUTOR,
        NO_SHOW_STUDENT,
        NO_SHOW_TUTOR,
    }


def is_active(state: str) -> bool:
    """Bookings that block a slot for the tutor."""
    return state in {CONFIRMED, IN_PROGRESS}


def can_join_room(state: str) -> bool:
    """Daily room is reachable while the session is in progress."""
    return state == IN_PROGRESS
