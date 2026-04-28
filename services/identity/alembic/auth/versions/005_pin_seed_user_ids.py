"""Pin deterministic UUIDs for the four seeded test users.

Migration 004 inserts the four persona accounts (student@/teacher@/
moderator@/admin@alp.dev) but lets PostgreSQL pick a random UUID via
`gen_random_uuid()`. That makes cross-DB referencing (e.g. catalog's
educator_assignments table linking auth users to exams) impossible
without a runtime lookup.

This migration replaces those random IDs with constants so other
services' seed migrations can reference them by literal:

| Email             | Pinned ID                              |
|-------------------|-----------------------------------------|
| student@alp.dev   | 00000000-0000-0000-0000-000000000001    |
| teacher@alp.dev   | 00000000-0000-0000-0000-000000000002    |
| moderator@alp.dev | 00000000-0000-0000-0000-000000000003    |
| admin@alp.dev     | 00000000-0000-0000-0000-000000000004    |

Local-only — guarded by AUTH_SEED_LOCAL like 004. The UPDATE only
matches the four seed emails so any real user with a colliding random
UUID (vanishingly unlikely) is left untouched.

Revision ID: 005
Revises: 004
Create Date: 2026-04-26
"""

from __future__ import annotations

import os
from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "auth_schema"

PINNED_IDS = {
    "student@alp.dev": "00000000-0000-0000-0000-000000000001",
    "teacher@alp.dev": "00000000-0000-0000-0000-000000000002",
    "moderator@alp.dev": "00000000-0000-0000-0000-000000000003",
    "admin@alp.dev": "00000000-0000-0000-0000-000000000004",
}


def upgrade() -> None:
    if not os.environ.get("AUTH_SEED_LOCAL"):
        return

    for email, pinned_id in PINNED_IDS.items():
        # Three FKs reference auth_schema.users(id) — refresh_tokens,
        # user_exam_selections, invite_links.created_by. None has
        # ON UPDATE CASCADE, so the UPDATE below would fail if a seed
        # user already has child rows. Clear them first; forcing a
        # re-login in local dev is fine, and seed users won't have
        # issued invites.
        op.execute(
            text(
                f"DELETE FROM {SCHEMA}.refresh_tokens "
                f"WHERE user_id = ("
                f"  SELECT id FROM {SCHEMA}.users WHERE email = :email)"
            ).bindparams(email=email)
        )
        op.execute(
            text(
                f"DELETE FROM {SCHEMA}.user_exam_selections "
                f"WHERE user_id = ("
                f"  SELECT id FROM {SCHEMA}.users WHERE email = :email)"
            ).bindparams(email=email)
        )
        op.execute(
            text(
                f"DELETE FROM {SCHEMA}.invite_links "
                f"WHERE created_by = ("
                f"  SELECT id FROM {SCHEMA}.users WHERE email = :email)"
            ).bindparams(email=email)
        )
        op.execute(
            text(
                f"UPDATE {SCHEMA}.users SET id = CAST(:pinned AS uuid) "
                f"WHERE email = :email"
            ).bindparams(pinned=pinned_id, email=email)
        )


def downgrade() -> None:
    # No-op: re-randomising the IDs would orphan any cross-service
    # references. If you really need a clean slate, drop migration 004's
    # rows and start over.
    pass
