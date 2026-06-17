"""Phase 7 (P7-A1): user_tenant_memberships — first-class multi-tenant.

Today a user has at most one `auth_schema.users.institution_id`. This
migration introduces a many-to-many membership table so a student can
belong to multiple coaching centres / schools simultaneously, and
cross-tenant analytics rollups can dedupe by user_id.

The existing `users.institution_id` becomes the "primary" pointer
(is_primary=TRUE in the new table). Backfill is a one-shot INSERT.

Revision ID: 007
Revises: 006
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "institution_schema"


def upgrade() -> None:
    op.create_table(
        "user_tenant_memberships",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "is_primary",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("FALSE"),
        ),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("user_id", "tenant_id"),
        schema=SCHEMA,
    )
    op.create_index(
        "idx_utm_tenant",
        "user_tenant_memberships",
        ["tenant_id"],
        schema=SCHEMA,
    )

    # Backfill from auth_schema.users.institution_id (which is the
    # legacy single-tenant pointer). Cross-DB this is the same Postgres
    # instance + same identity DB, so no dblink needed.
    op.execute(
        text(
            """
            INSERT INTO institution_schema.user_tenant_memberships
              (user_id, tenant_id, is_primary, joined_at)
            SELECT id, institution_id, TRUE, COALESCE(created_at, NOW())
              FROM auth_schema.users
             WHERE institution_id IS NOT NULL
            ON CONFLICT (user_id, tenant_id) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.drop_index(
        "idx_utm_tenant", "user_tenant_memberships", schema=SCHEMA
    )
    op.drop_table("user_tenant_memberships", schema=SCHEMA)
