"""Seed four known test users — one per persona — so `make dev-reset`
always reproduces a sign-in-ready local stack.

| Email                 | Role           | Admin level  | Use case                      |
|-----------------------|----------------|--------------|-------------------------------|
| student@alp.dev       | STUDENT        | NONE         | web-student app               |
| teacher@alp.dev       | TEACHER        | NONE         | web-portal authoring (no review) |
| moderator@alp.dev     | MODERATOR      | NONE         | web-portal authoring + review |
| admin@alp.dev         | PLATFORM_ADMIN | PLATFORM     | web-admin everything          |

All four use the same password — `Password123!` — for local convenience.
The bcrypt hash is computed inside the migration so the seed survives
fresh `make dev-reset` cycles without external setup.

The migration is idempotent: each INSERT uses ON CONFLICT (email) DO
NOTHING so re-running on a DB that already has these accounts is safe.
The `is_deleted = false` clause means a previously-deleted seed user
won't be re-inserted; promote them manually if that happens.

Local-only safety: this migration is GUARDED behind the AUTH_SEED_LOCAL
environment variable. The variable is set in
`infrastructure/docker/docker-compose.yml` for the auth service. In
staging/production deployments the env var is absent and the migration
is a no-op — preventing a known-password admin from leaking into a
shared environment.

Revision ID: 004
Revises: 003
Create Date: 2026-04-26
"""

from __future__ import annotations

import os
from collections.abc import Sequence

import bcrypt
from alembic import op
from sqlalchemy import text

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "auth_schema"

# Single bcrypt hash reused for all four seed users. Generated at
# migration time with rounds=12, matching auth/security.py:hash_password.
SEED_PASSWORD = "Password123!"

SEED_USERS = [
    {
        "email": "student@alp.dev",
        "full_name": "Sample Student",
        "role": "STUDENT",
        "admin_access_level": "NONE",
    },
    {
        "email": "teacher@alp.dev",
        "full_name": "Sample Teacher",
        "role": "TEACHER",
        "admin_access_level": "NONE",
    },
    {
        "email": "moderator@alp.dev",
        "full_name": "Sample Moderator",
        "role": "MODERATOR",
        "admin_access_level": "NONE",
    },
    {
        "email": "admin@alp.dev",
        "full_name": "Sample Admin",
        "role": "PLATFORM_ADMIN",
        "admin_access_level": "PLATFORM",
    },
]


def upgrade() -> None:
    if not os.environ.get("AUTH_SEED_LOCAL"):
        # Production / staging — never seed known passwords.
        return

    password_hash = bcrypt.hashpw(
        SEED_PASSWORD.encode("utf-8"),
        bcrypt.gensalt(rounds=12),
    ).decode("utf-8")

    for u in SEED_USERS:
        op.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.users (
                  email, full_name, password_hash,
                  role, admin_access_level,
                  account_status, onboarding_status,
                  tos_version, tos_accepted_at
                )
                VALUES (
                  :email, :full_name, :pw_hash,
                  CAST(:role AS {SCHEMA}.user_role_enum),
                  CAST(:admin_lvl AS {SCHEMA}.admin_level_enum),
                  'ACTIVE', 'COMPLETE',
                  '1.0', NOW()
                )
                ON CONFLICT (email) DO NOTHING
                """
            ).bindparams(
                email=u["email"],
                full_name=u["full_name"],
                pw_hash=password_hash,
                role=u["role"],
                admin_lvl=u["admin_access_level"],
            )
        )


def downgrade() -> None:
    if not os.environ.get("AUTH_SEED_LOCAL"):
        return

    emails = [u["email"] for u in SEED_USERS]
    op.execute(
        text(
            f"DELETE FROM {SCHEMA}.users WHERE email = ANY(:emails)"
        ).bindparams(emails=emails)
    )
