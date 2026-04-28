"""Add INSTITUTION_ADMIN + PLATFORM_ADMIN to user_role_enum.

Migration 001 created `user_role_enum` with only 4 values
(STUDENT, EXPERT, TEACHER, MODERATOR). The Pydantic schema in
auth/schemas.py (and the AdminGate in apps/web-admin) reference two
additional roles — INSTITUTION_ADMIN and PLATFORM_ADMIN — but there
was no follow-up migration to extend the Postgres enum. As a result
no user can be promoted via SQL UPDATE because the DB rejects the
literal value.

This migration adds the two missing variants. PG 12+ supports
`ALTER TYPE ... ADD VALUE` in a transaction; the `commit_before`
flag isn't needed here.

Revision ID: 003
Revises: 002
Create Date: 2026-04-26
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "auth_schema"


def upgrade() -> None:
    # IF NOT EXISTS is required because Alembic re-runs the upgrade if it
    # was partially applied; ADD VALUE is idempotent only with this guard.
    op.execute(
        f"ALTER TYPE {SCHEMA}.user_role_enum ADD VALUE IF NOT EXISTS 'INSTITUTION_ADMIN'"
    )
    op.execute(
        f"ALTER TYPE {SCHEMA}.user_role_enum ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN'"
    )


def downgrade() -> None:
    # Postgres does not support removing enum values without rebuilding the
    # type. Treating this migration as forward-only — anyone running
    # downgrade past 003 should drop the enum and recreate it from
    # migration 001's definition.
    raise NotImplementedError(
        "Downgrade not supported for enum value addition. Drop and recreate "
        "user_role_enum from migration 001 if a true rollback is required."
    )
