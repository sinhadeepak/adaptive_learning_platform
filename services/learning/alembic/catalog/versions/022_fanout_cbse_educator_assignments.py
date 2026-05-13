"""Fan out CBSE educator assignments after the Class 8/9 split.

Catalog migration 021 split `CBSE (Class 8-9)` into CBSE_8 (`…007`)
and CBSE_9 (`…008`) and re-pointed subjects, but didn't propagate
`educator_assignments`. As a result any educator who held a
legacy-CBSE grant kept it on the now-hidden legacy row and lost
visibility on the two new exams in the picker.

This migration mirrors every legacy assignment onto both new exams,
preserving subject scope (NULL → exam-wide; UUID → subject-level).
For subject-level rows the subject's exam was rewritten by 021, so
we look up the new exam from the subject's current `exam_id` rather
than fanning out blindly.

Idempotent — uses ON CONFLICT DO NOTHING. Re-running is a no-op.

Revision ID: 022
Revises: 021
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "022"
down_revision: str | None = "021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

LEGACY_CBSE_ID = "11111111-0000-0000-0000-000000000005"
CBSE_8_ID      = "11111111-0000-0000-0000-000000000007"
CBSE_9_ID      = "11111111-0000-0000-0000-000000000008"


def upgrade() -> None:
    # The unique constraints are partial indexes, so ON CONFLICT must
    # name the same predicate (`WHERE subject_id IS NULL` for exam-wide,
    # `WHERE subject_id IS NOT NULL` for subject-level) to match.

    # 1. Exam-wide legacy grants (subject_id IS NULL) → mirror to both
    #    CBSE_8 and CBSE_9 because the educator was authorised for the
    #    whole bundled exam.
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.educator_assignments (educator_id, exam_id, subject_id)
        SELECT educator_id, CAST('{CBSE_8_ID}' AS uuid), NULL
          FROM {SCHEMA}.educator_assignments
         WHERE exam_id = '{LEGACY_CBSE_ID}' AND subject_id IS NULL
        ON CONFLICT (educator_id, exam_id) WHERE subject_id IS NULL DO NOTHING
        """
    )
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.educator_assignments (educator_id, exam_id, subject_id)
        SELECT educator_id, CAST('{CBSE_9_ID}' AS uuid), NULL
          FROM {SCHEMA}.educator_assignments
         WHERE exam_id = '{LEGACY_CBSE_ID}' AND subject_id IS NULL
        ON CONFLICT (educator_id, exam_id) WHERE subject_id IS NULL DO NOTHING
        """
    )

    # 2. Subject-level legacy grants (subject_id IS NOT NULL) → re-point
    #    the row to the subject's *current* exam_id (set by migration
    #    021). The educator keeps their narrow scope; only the exam
    #    UUID changes. Idempotent because conflict on the unique key
    #    just skips the rewrite.
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.educator_assignments (educator_id, exam_id, subject_id)
        SELECT ea.educator_id, s.exam_id, ea.subject_id
          FROM {SCHEMA}.educator_assignments ea
          JOIN {SCHEMA}.subjects s ON ea.subject_id = s.id
         WHERE ea.exam_id = '{LEGACY_CBSE_ID}'
           AND ea.subject_id IS NOT NULL
        ON CONFLICT (educator_id, exam_id, subject_id)
            WHERE subject_id IS NOT NULL DO NOTHING
        """
    )

    # 3. Drop the now-redundant legacy rows. Anyone who had legacy
    #    access now has the equivalent on CBSE_8 + CBSE_9 (or just on
    #    the right one for subject-scoped grants).
    op.execute(
        f"DELETE FROM {SCHEMA}.educator_assignments "
        f"WHERE exam_id = '{LEGACY_CBSE_ID}'"
    )


def downgrade() -> None:
    # Best-effort rollback: re-create the exam-wide legacy rows for
    # every educator who currently has either CBSE_8 or CBSE_9 grants.
    # Subject-level rollback isn't perfectly reversible because we
    # don't track which row was the "source", so we just bring back
    # an exam-wide grant — close enough for dev.
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.educator_assignments (educator_id, exam_id, subject_id)
        SELECT DISTINCT educator_id, CAST('{LEGACY_CBSE_ID}' AS uuid), NULL
          FROM {SCHEMA}.educator_assignments
         WHERE exam_id IN ('{CBSE_8_ID}', '{CBSE_9_ID}')
        ON CONFLICT (educator_id, exam_id, subject_id) DO NOTHING
        """
    )
