"""Sprint 8 I-1 — institution core: tenants, cohorts, cohort_members.

Why these three tables in institution_schema (not user-profile):
- Tenants are the billing unit (a coaching center, school) that owns
  some number of seats. The Payment service joins tenants to
  subscriptions in Phase 2 when bulk-license SKUs land; for now they
  exist so cohorts have somewhere to live.
- Cohorts are the educator's classroom slice (Class 11 Physics 2026, etc.)
  used by Educator Assignments and the upcoming class-leaderboard.
- cohort_members maps user_id → cohort with a role (STUDENT or LEAD_TEACHER)
  so Educator Assignments can fan out only to the right roster.

Revision ID: 003
Revises: 002
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "institution_schema"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.tenants (
            id           UUID NOT NULL DEFAULT gen_random_uuid(),
            name         TEXT NOT NULL,
            slug         TEXT NOT NULL,
            kind         TEXT NOT NULL CHECK (kind IN ('SCHOOL','COACHING_CENTER','UNIVERSITY','OTHER')),
            seat_limit   INT,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (id),
            UNIQUE (slug)
        )
        """
    )
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.cohorts (
            id          UUID NOT NULL DEFAULT gen_random_uuid(),
            tenant_id   UUID NOT NULL,
            name        TEXT NOT NULL,
            exam        TEXT,
            year        INT,
            created_by  UUID,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (id),
            FOREIGN KEY (tenant_id) REFERENCES {SCHEMA}.tenants(id) ON DELETE CASCADE,
            UNIQUE (tenant_id, name)
        )
        """
    )
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.cohort_members (
            cohort_id   UUID NOT NULL,
            user_id     UUID NOT NULL,
            role        TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT','LEAD_TEACHER')),
            joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (cohort_id, user_id),
            FOREIGN KEY (cohort_id) REFERENCES {SCHEMA}.cohorts(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_cohort_members_user ON {SCHEMA}.cohort_members (user_id)"
    )
    op.execute(
        f"CREATE INDEX idx_cohorts_tenant ON {SCHEMA}.cohorts (tenant_id)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.cohort_members")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.cohorts")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.tenants")
