"""Pure-function FSM tests for creator_state."""

from __future__ import annotations

import pytest

from marketplace import creator_state as cs


def test_apply_to_kyc_pending() -> None:
    assert cs.transition(cs.APPLIED, cs.START_KYC) == cs.KYC_PENDING


def test_kyc_pending_to_verified() -> None:
    assert cs.transition(cs.KYC_PENDING, cs.KYC_VERIFIED_ACTION) == cs.KYC_VERIFIED


def test_kyc_pending_to_rejected() -> None:
    assert cs.transition(cs.KYC_PENDING, cs.KYC_REJECTED_ACTION) == cs.REJECTED


def test_admin_approve_after_kyc() -> None:
    assert cs.transition(cs.KYC_VERIFIED, cs.ADMIN_APPROVE) == cs.APPROVED


def test_activate_only_from_approved() -> None:
    assert cs.transition(cs.APPROVED, cs.ACTIVATE) == cs.ACTIVE
    with pytest.raises(cs.IllegalTransition):
        cs.transition(cs.APPLIED, cs.ACTIVATE)


def test_admin_reject_from_early_states() -> None:
    assert cs.transition(cs.APPLIED, cs.ADMIN_REJECT) == cs.REJECTED
    assert cs.transition(cs.KYC_PENDING, cs.ADMIN_REJECT) == cs.REJECTED
    assert cs.transition(cs.KYC_VERIFIED, cs.ADMIN_REJECT) == cs.REJECTED


def test_can_publish_courses_only_when_active() -> None:
    assert cs.can_publish_courses(cs.ACTIVE)
    assert not cs.can_publish_courses(cs.APPROVED)
    assert not cs.can_publish_courses(cs.REJECTED)


def test_active_can_be_suspended_and_reactivated() -> None:
    assert cs.transition(cs.ACTIVE, cs.SUSPEND) == cs.SUSPENDED
    assert cs.transition(cs.SUSPENDED, cs.REACTIVATE) == cs.ACTIVE
