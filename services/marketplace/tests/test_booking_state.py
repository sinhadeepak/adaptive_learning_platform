"""Pure-function FSM tests for booking_state — no DB."""

from __future__ import annotations

import pytest

from marketplace import booking_state as bs


def test_pending_to_confirmed_on_payment_success() -> None:
    assert bs.transition(bs.PENDING_PAYMENT, bs.PAYMENT_SUCCEEDED) == bs.CONFIRMED


def test_pending_to_cancelled_on_payment_failed() -> None:
    assert (
        bs.transition(bs.PENDING_PAYMENT, bs.PAYMENT_FAILED) == bs.CANCELLED_BY_STUDENT
    )


def test_confirmed_to_in_progress() -> None:
    assert bs.transition(bs.CONFIRMED, bs.START) == bs.IN_PROGRESS


def test_in_progress_to_completed() -> None:
    assert bs.transition(bs.IN_PROGRESS, bs.COMPLETE) == bs.COMPLETED


def test_in_progress_to_no_show_student() -> None:
    assert (
        bs.transition(bs.IN_PROGRESS, bs.NO_SHOW_STUDENT_ACTION) == bs.NO_SHOW_STUDENT
    )


def test_in_progress_to_no_show_tutor() -> None:
    assert bs.transition(bs.IN_PROGRESS, bs.NO_SHOW_TUTOR_ACTION) == bs.NO_SHOW_TUTOR


def test_cancel_by_student_from_confirmed() -> None:
    assert (
        bs.transition(bs.CONFIRMED, bs.CANCEL_BY_STUDENT) == bs.CANCELLED_BY_STUDENT
    )


def test_cancel_by_tutor_from_confirmed() -> None:
    assert bs.transition(bs.CONFIRMED, bs.CANCEL_BY_TUTOR) == bs.CANCELLED_BY_TUTOR


def test_completed_is_terminal() -> None:
    assert bs.is_terminal(bs.COMPLETED)
    with pytest.raises(bs.IllegalTransition):
        bs.transition(bs.COMPLETED, bs.START)
    with pytest.raises(bs.IllegalTransition):
        bs.transition(bs.COMPLETED, bs.CANCEL_BY_STUDENT)


def test_cancelled_is_terminal() -> None:
    assert bs.is_terminal(bs.CANCELLED_BY_STUDENT)
    assert bs.is_terminal(bs.CANCELLED_BY_TUTOR)
    with pytest.raises(bs.IllegalTransition):
        bs.transition(bs.CANCELLED_BY_STUDENT, bs.START)


def test_is_active_only_confirmed_and_in_progress() -> None:
    assert bs.is_active(bs.CONFIRMED)
    assert bs.is_active(bs.IN_PROGRESS)
    assert not bs.is_active(bs.PENDING_PAYMENT)
    assert not bs.is_active(bs.COMPLETED)


def test_can_join_room_only_in_progress() -> None:
    assert bs.can_join_room(bs.IN_PROGRESS)
    assert not bs.can_join_room(bs.CONFIRMED)
    assert not bs.can_join_room(bs.COMPLETED)


def test_pending_cancel_by_student() -> None:
    assert (
        bs.transition(bs.PENDING_PAYMENT, bs.CANCEL_BY_STUDENT)
        == bs.CANCELLED_BY_STUDENT
    )
