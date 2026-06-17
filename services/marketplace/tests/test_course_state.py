"""Pure-function FSM tests for course_state."""

from __future__ import annotations

import pytest

from marketplace import course_state as cs


def test_draft_to_pending_review() -> None:
    assert cs.transition(cs.DRAFT, cs.SUBMIT_FOR_REVIEW) == cs.PENDING_REVIEW


def test_admin_approve_publishes() -> None:
    assert cs.transition(cs.PENDING_REVIEW, cs.ADMIN_APPROVE) == cs.PUBLISHED


def test_admin_reject_returns_to_draft() -> None:
    assert cs.transition(cs.PENDING_REVIEW, cs.ADMIN_REJECT) == cs.DRAFT


def test_creator_can_retire_published() -> None:
    assert cs.transition(cs.PUBLISHED, cs.RETIRE) == cs.RETIRED


def test_admin_can_force_retire_published() -> None:
    assert cs.transition(cs.PUBLISHED, cs.ADMIN_REJECT) == cs.RETIRED


def test_cannot_publish_from_draft_directly() -> None:
    with pytest.raises(cs.IllegalTransition):
        cs.transition(cs.DRAFT, cs.ADMIN_APPROVE)


def test_is_purchasable_only_when_published() -> None:
    assert cs.is_purchasable(cs.PUBLISHED)
    assert not cs.is_purchasable(cs.DRAFT)
    assert not cs.is_purchasable(cs.PENDING_REVIEW)
    assert not cs.is_purchasable(cs.RETIRED)


def test_can_edit_content_only_in_draft() -> None:
    assert cs.can_edit_content(cs.DRAFT)
    assert not cs.can_edit_content(cs.PUBLISHED)
    assert not cs.can_edit_content(cs.PENDING_REVIEW)
