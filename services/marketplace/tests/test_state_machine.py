"""Pure-function FSM tests — no DB. Default `pytest` runs these."""

from __future__ import annotations

import pytest

from marketplace import tutor_state as ts


def test_apply_to_kyc_pending() -> None:
    assert ts.transition(ts.APPLIED, ts.START_KYC) == ts.KYC_PENDING


def test_kyc_pending_to_verified() -> None:
    assert ts.transition(ts.KYC_PENDING, ts.KYC_VERIFIED_ACTION) == ts.KYC_VERIFIED


def test_kyc_pending_to_rejected() -> None:
    assert ts.transition(ts.KYC_PENDING, ts.KYC_REJECTED_ACTION) == ts.REJECTED


def test_admin_approve_after_kyc_verified() -> None:
    assert ts.transition(ts.KYC_VERIFIED, ts.ADMIN_APPROVE) == ts.APPROVED


def test_activate_only_from_approved() -> None:
    assert ts.transition(ts.APPROVED, ts.ACTIVATE) == ts.ACTIVE
    with pytest.raises(ts.IllegalTransition):
        ts.transition(ts.APPLIED, ts.ACTIVATE)
    with pytest.raises(ts.IllegalTransition):
        ts.transition(ts.KYC_VERIFIED, ts.ACTIVATE)


def test_admin_can_reject_from_early_states() -> None:
    assert ts.transition(ts.APPLIED, ts.ADMIN_REJECT) == ts.REJECTED
    assert ts.transition(ts.KYC_PENDING, ts.ADMIN_REJECT) == ts.REJECTED
    assert ts.transition(ts.KYC_VERIFIED, ts.ADMIN_REJECT) == ts.REJECTED


def test_terminal_states_have_no_outbound_except_explicit() -> None:
    # REJECTED is terminal
    with pytest.raises(ts.IllegalTransition):
        ts.transition(ts.REJECTED, ts.ADMIN_APPROVE)
    with pytest.raises(ts.IllegalTransition):
        ts.transition(ts.REJECTED, ts.ACTIVATE)


def test_active_can_be_suspended_and_reactivated() -> None:
    assert ts.transition(ts.ACTIVE, ts.SUSPEND) == ts.SUSPENDED
    assert ts.transition(ts.SUSPENDED, ts.REACTIVATE) == ts.ACTIVE


def test_is_listable() -> None:
    assert ts.is_listable(ts.ACTIVE)
    assert not ts.is_listable(ts.APPROVED)
    assert not ts.is_listable(ts.REJECTED)
    assert not ts.is_listable(ts.SUSPENDED)


def test_can_book_only_active() -> None:
    assert ts.can_book(ts.ACTIVE)
    assert not ts.can_book(ts.APPROVED)
    assert not ts.can_book(ts.SUSPENDED)
