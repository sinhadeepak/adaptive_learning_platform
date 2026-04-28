"""Sprint 9 E-1 — Educator Assignments tables.

Why content_schema (not a new service): an Assignment is a curated set of
already-published `content_schema.questions` plus a cohort + due date. It
sits firmly inside the authoring boundary the Content service already
owns, and reusing the existing JWT-gated educator-scope check means we
don't have to re-implement it in a new service.

Schema design:
- `assignments` — header row. `cohort_id` is a UUID pointing at
  `institution_schema.cohorts(id)` BUT we deliberately do NOT add a FK
  (cross-schema FKs across service boundaries violate AP-01 — each
  service owns its own schema).
- `assignment_questions` — pivot table. Storing `position` so the
  educator's chosen ordering survives without forcing them to re-author
  in sequence.
- `assignment_progress` — one row per (assignment, user) when the
  student finishes the assignment. UNIQUE (assignment_id, user_id) so
  re-submissions overwrite the previous attempt's score.

The `published_at` flow:
- An assignment lives in DRAFT (published_at NULL) while the educator
  is editing the question list and due date.
- POST /assignments/{id}/publish flips published_at to NOW() and the
  Content service publishes `content.assignment.created` to NATS.
  Notification fans out to cohort members (E-5).

Revision ID: 005
Revises: 004
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.assignments (
            id              UUID NOT NULL DEFAULT gen_random_uuid(),
            cohort_id       UUID NOT NULL,
            tenant_id       UUID,
            title           TEXT NOT NULL,
            description     TEXT,
            created_by      UUID NOT NULL,
            due_at          TIMESTAMPTZ,
            published_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (id)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_assignments_cohort ON {SCHEMA}.assignments (cohort_id, published_at DESC)"
    )
    op.execute(
        f"CREATE INDEX idx_assignments_creator ON {SCHEMA}.assignments (created_by, created_at DESC)"
    )
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.assignment_questions (
            assignment_id   UUID NOT NULL,
            question_id     UUID NOT NULL,
            position        INT NOT NULL,
            PRIMARY KEY (assignment_id, question_id),
            FOREIGN KEY (assignment_id) REFERENCES {SCHEMA}.assignments(id) ON DELETE CASCADE,
            UNIQUE (assignment_id, position)
        )
        """
    )
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.assignment_progress (
            assignment_id   UUID NOT NULL,
            user_id         UUID NOT NULL,
            correct_count   INT NOT NULL DEFAULT 0,
            total_count     INT NOT NULL DEFAULT 0,
            completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (assignment_id, user_id),
            FOREIGN KEY (assignment_id) REFERENCES {SCHEMA}.assignments(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_assignment_progress_user ON {SCHEMA}.assignment_progress (user_id, completed_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.assignment_progress")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.assignment_questions")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.assignments")
