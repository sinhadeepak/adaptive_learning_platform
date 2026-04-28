"""Seed educator_assignments — give the local seed teacher and
moderator authoring access to every published exam.

Pairs with auth migration 005 which pins the seed user IDs to known
constants. Without those pinned IDs the educator_id values inserted
here would not match anything in auth, so authoring would 403 even
on a fresh stack.

Local-only: guarded by CATALOG_SEED_LOCAL — set in
infrastructure/docker/docker-compose.yml for the catalog service.
Absent in staging/prod, where assignments are created by the admin
UI rather than seeded at migration time.

Idempotent: ON CONFLICT DO NOTHING uses the partial unique index
`uq_educator_assignment_exam_wide` (which keys on educator_id +
exam_id when subject_id IS NULL).

Revision ID: 006
Revises: 005
Create Date: 2026-04-26
"""

from __future__ import annotations

import os
from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

# Mirrors auth/alembic/versions/005_pin_seed_user_ids.py — the two
# files MUST stay in sync or the seed assignment rows will reference
# users that don't exist in auth.
SEED_TEACHER_ID = "00000000-0000-0000-0000-000000000002"
SEED_MODERATOR_ID = "00000000-0000-0000-0000-000000000003"


def upgrade() -> None:
    if not os.environ.get("CATALOG_SEED_LOCAL"):
        return

    for educator_id in (SEED_TEACHER_ID, SEED_MODERATOR_ID):
        op.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.educator_assignments
                  (educator_id, exam_id, subject_id, created_by)
                SELECT CAST(:educator_id AS uuid), e.id, NULL,
                       CAST(:educator_id AS uuid)
                FROM {SCHEMA}.exams e
                WHERE e.is_published = TRUE
                ON CONFLICT (educator_id, exam_id) WHERE subject_id IS NULL
                DO NOTHING
                """
            ).bindparams(educator_id=educator_id)
        )


def downgrade() -> None:
    if not os.environ.get("CATALOG_SEED_LOCAL"):
        return

    op.execute(
        text(
            f"DELETE FROM {SCHEMA}.educator_assignments "
            f"WHERE educator_id IN (CAST(:teacher AS uuid), "
            f"CAST(:moderator AS uuid))"
        ).bindparams(teacher=SEED_TEACHER_ID, moderator=SEED_MODERATOR_ID)
    )
