"""Course publishing FSM.

DRAFT → PENDING_REVIEW → PUBLISHED → RETIRED.
Admin reject from PENDING_REVIEW returns to DRAFT (creator can fix and
resubmit).
"""

from __future__ import annotations

from typing import Final

DRAFT: Final = "DRAFT"
PENDING_REVIEW: Final = "PENDING_REVIEW"
PUBLISHED: Final = "PUBLISHED"
RETIRED: Final = "RETIRED"

SUBMIT_FOR_REVIEW: Final = "submit_for_review"
ADMIN_APPROVE: Final = "admin_approve"
ADMIN_REJECT: Final = "admin_reject"
RETIRE: Final = "retire"

_TRANSITIONS: dict[tuple[str, str], str] = {
    (DRAFT, SUBMIT_FOR_REVIEW): PENDING_REVIEW,
    (PENDING_REVIEW, ADMIN_APPROVE): PUBLISHED,
    (PENDING_REVIEW, ADMIN_REJECT): DRAFT,
    (PUBLISHED, RETIRE): RETIRED,
    # Admin can also retire a published course as a safety net.
    (PUBLISHED, ADMIN_REJECT): RETIRED,
}


class IllegalTransition(Exception):
    pass


def transition(current: str, action: str) -> str:
    new = _TRANSITIONS.get((current, action))
    if new is None:
        raise IllegalTransition(f"{current} + {action}")
    return new


def is_purchasable(current: str) -> bool:
    return current == PUBLISHED


def can_edit_content(current: str) -> bool:
    """Once published, only admin can pull a course back to DRAFT for
    content edits. Creator-side edits on metadata (price/title) are
    allowed in any state for v1, but the content_md field is locked
    once published. Enforced in routes."""
    return current == DRAFT
