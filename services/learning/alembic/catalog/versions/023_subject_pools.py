"""Subject pools — mandatory / optional grouping for exams.

Until now `catalog_schema.subjects` had no concept of "mandatory vs
optional" — every subject was treated as required for every student.
That works for JEE / NEET / CBSE where the syllabus is fixed, but it
falls apart for exams like UPSC Mains where the student picks 1 of
22 Indian languages (qualifying paper A) and 1 of ~26 optional
subjects (papers VI + VII).

Two structural additions:

1. `subjects.is_mandatory boolean DEFAULT TRUE` — the cheap case.
   When `TRUE`, every student in the exam takes the subject. Existing
   rows default to TRUE so today's behaviour is preserved.

2. `subject_pools` — represents a "pick N of M" group. A pool has
   `pick_min` and `pick_max` so we can model both single-pick
   (`min=max=1`) and ranged-pick (e.g. CBSE elective stream picks
   3 of 5 with `min=3, max=3`). Subjects link to a pool via
   `subjects.pool_id`. A subject is in *either* the mandatory set
   (pool_id NULL, is_mandatory TRUE) *or* a pool — never both.

Rollout note: new exams created via the admin AI builder (Phase 7)
write to these columns directly; existing exams stay on the all-
mandatory default until manually opted-in. No data migration needed.

Revision ID: 023
Revises: 022
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "023"
down_revision: str | None = "022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"


def upgrade() -> None:
    # 1. Add is_mandatory to subjects. DEFAULT TRUE preserves existing
    #    behaviour — every seeded subject is mandatory until an admin
    #    flips it via the exam-builder UI.
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.subjects
            ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT TRUE
        """
    )

    # 2. New table — subject_pools. One row per "pick N of M" group.
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.subject_pools (
            id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
            exam_id     UUID    NOT NULL REFERENCES {SCHEMA}.exams(id) ON DELETE CASCADE,
            code        TEXT    NOT NULL,
            name        TEXT    NOT NULL,
            description TEXT,
            pick_min    INTEGER NOT NULL DEFAULT 1 CHECK (pick_min >= 0),
            pick_max    INTEGER NOT NULL DEFAULT 1 CHECK (pick_max >= pick_min),
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_subject_pools_exam_code UNIQUE (exam_id, code)
        )
        """
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_subject_pools_exam ON {SCHEMA}.subject_pools (exam_id)"
    )

    # 3. Link subjects to a pool. Nullable — most subjects (mandatory
    #    ones) won't be in a pool. ON DELETE SET NULL so dropping a
    #    pool downgrades its subjects to "no pool" rather than
    #    cascading-deleting them. The accompanying
    #    `is_mandatory + pool_id` invariant is enforced at the
    #    application layer (admin UI / save endpoint), not via a CHECK
    #    constraint — Postgres CHECK can't reference foreign tables and
    #    this rule is non-trivial.
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.subjects
            ADD COLUMN IF NOT EXISTS pool_id UUID
                REFERENCES {SCHEMA}.subject_pools(id) ON DELETE SET NULL
        """
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_subjects_pool ON {SCHEMA}.subjects (pool_id) WHERE pool_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_subjects_pool")
    op.execute(f"ALTER TABLE {SCHEMA}.subjects DROP COLUMN IF EXISTS pool_id")
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_subject_pools_exam")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.subject_pools")
    op.execute(f"ALTER TABLE {SCHEMA}.subjects DROP COLUMN IF EXISTS is_mandatory")
