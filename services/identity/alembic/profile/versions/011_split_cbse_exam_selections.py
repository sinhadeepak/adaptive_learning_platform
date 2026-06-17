"""Rebind users from legacy CBSE (Class 8-9) to CBSE (Class 9).

Companion to catalog migration 021. Users selected the bundled
`CBSE (Class 8-9)` exam before the split; after the split that exam
is hidden (`is_published=FALSE`) so we'd orphan their dashboard.

Heuristic chosen: rebind everyone to **CBSE_9**. Class 9 carries the
larger seeded question bank (~6,800 questions across 68 chapters per
content migration 034) and is the upper grade most students preparing
for the bundled exam are targeting. Class-8 students can switch via
Profile → Target Exam after the migration runs.

Forward-only and idempotent. The `ON CONFLICT (user_id, exam_id) DO
NOTHING` skips users who somehow already have a CBSE_9 row, and the
DELETE drops the legacy row regardless. Also rebinds
`profiles.target_exam_id` (added in migration 010) so the closed-loop
study plan uses the new UUID.

Revision ID: 011
Revises: 010
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "011"
down_revision: str | None = "010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"

LEGACY_CBSE_ID = "11111111-0000-0000-0000-000000000005"
CBSE_9_ID      = "11111111-0000-0000-0000-000000000008"


def upgrade() -> None:
    # 1. Insert a CBSE_9 row for every user currently bound to legacy.
    #    Preserves target_date + selected_at so the readiness countdown
    #    keeps ticking correctly. ON CONFLICT skips the no-op case
    #    where the user already has a CBSE_9 binding.
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.exam_selections
              (user_id, exam_id, target_date, selected_at, removed_at)
        SELECT user_id,
               CAST('{CBSE_9_ID}' AS uuid),
               target_date,
               selected_at,
               removed_at
          FROM {SCHEMA}.exam_selections
         WHERE exam_id = '{LEGACY_CBSE_ID}'
        ON CONFLICT (user_id, exam_id) DO NOTHING
        """
    )

    # 2. Drop the legacy bindings now that CBSE_9 rows exist.
    op.execute(
        f"DELETE FROM {SCHEMA}.exam_selections "
        f"WHERE exam_id = '{LEGACY_CBSE_ID}'"
    )

    # 3. Rebind profiles.target_exam_id (added in migration 010).
    op.execute(
        f"""
        UPDATE {SCHEMA}.profiles
           SET target_exam_id = CAST('{CBSE_9_ID}' AS uuid)
         WHERE target_exam_id = '{LEGACY_CBSE_ID}'
        """
    )


def downgrade() -> None:
    # Best-effort rollback: re-introduce the legacy binding. The
    # CBSE_9 rows we created are kept (no destructive cleanup) so a
    # follow-up downgrade of catalog 021 can rebind subjects safely.
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.exam_selections
              (user_id, exam_id, target_date, selected_at, removed_at)
        SELECT user_id,
               CAST('{LEGACY_CBSE_ID}' AS uuid),
               target_date,
               selected_at,
               removed_at
          FROM {SCHEMA}.exam_selections
         WHERE exam_id = '{CBSE_9_ID}'
        ON CONFLICT (user_id, exam_id) DO NOTHING
        """
    )
    op.execute(
        f"""
        UPDATE {SCHEMA}.profiles
           SET target_exam_id = CAST('{LEGACY_CBSE_ID}' AS uuid)
         WHERE target_exam_id = '{CBSE_9_ID}'
        """
    )
