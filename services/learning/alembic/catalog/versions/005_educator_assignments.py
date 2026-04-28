"""Create educator_assignments — links auth users to the catalog
hierarchy they're allowed to author against.

Each row says "educator X can author for exam E (and optionally only
subject S within it)". A NULL subject_id means "any subject under this
exam", a non-null subject_id pins the assignment to one subject.

Cross-service note: educator_id refers to auth_schema.users.id, but
auth and catalog live in separate Postgres databases so we can't
declare a FK. The relationship is enforced at the application layer
(routes verify the JWT sub matches an assignment row).

Indexed for the two read paths the cascading-dropdown UX exercises:
  1. "exams I can author for"  → idx_educator_assignments_educator
  2. "subjects in this exam I can author for" → idx_educator_assignments_exam

Revision ID: 005
Revises: 004
Create Date: 2026-04-26
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.educator_assignments (
          id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          educator_id   UUID         NOT NULL,
          exam_id       UUID         NOT NULL REFERENCES {SCHEMA}.exams(id),
          subject_id    UUID                  REFERENCES {SCHEMA}.subjects(id),
          created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          created_by    UUID
        )
        """
    )
    # One assignment per (educator, exam) at the exam-wide level.
    op.execute(
        f"""
        CREATE UNIQUE INDEX uq_educator_assignment_exam_wide
        ON {SCHEMA}.educator_assignments (educator_id, exam_id)
        WHERE subject_id IS NULL
        """
    )
    # One assignment per (educator, exam, subject) at the subject level.
    op.execute(
        f"""
        CREATE UNIQUE INDEX uq_educator_assignment_subject
        ON {SCHEMA}.educator_assignments (educator_id, exam_id, subject_id)
        WHERE subject_id IS NOT NULL
        """
    )
    op.execute(
        f"CREATE INDEX idx_educator_assignments_educator "
        f"ON {SCHEMA}.educator_assignments (educator_id)"
    )
    op.execute(
        f"CREATE INDEX idx_educator_assignments_exam "
        f"ON {SCHEMA}.educator_assignments (exam_id)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.educator_assignments")
