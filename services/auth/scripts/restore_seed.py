"""Idempotent re-seed for the four local test users.

Why this exists: integration tests TRUNCATE auth_schema.users between
runs (they share the compose Postgres at port 35432). The seed
migration `004_seed_test_users` only runs once; once recorded, alembic
won't re-execute it. This script does the equivalent insert directly
so `make seed-restore` brings the local stack back to the canonical
sign-in-ready state.

ON CONFLICT (email) DO NOTHING — safe to run repeatedly.
"""

from __future__ import annotations

import asyncio
import os

import asyncpg
import bcrypt

# Same shape as alembic/versions/004_seed_test_users.py — duplicated
# rather than imported because alembic env spin-up wants the migration
# context, which we deliberately bypass here.
SEED_PASSWORD = "Password123!"
SEED_USERS = [
    {
        "email": "student@alp.dev",
        "full_name": "Student Demo",
        "role": "STUDENT",
        "admin_level": "NONE",
    },
    {
        "email": "teacher@alp.dev",
        "full_name": "Teacher Demo",
        "role": "TEACHER",
        "admin_level": "NONE",
    },
    {
        "email": "moderator@alp.dev",
        "full_name": "Moderator Demo",
        "role": "MODERATOR",
        "admin_level": "NONE",
    },
    {
        "email": "admin@alp.dev",
        "full_name": "Admin Demo",
        "role": "PLATFORM_ADMIN",
        "admin_level": "PLATFORM",
    },
]


async def main() -> None:
    if not os.environ.get("AUTH_SEED_LOCAL"):
        print("Refusing to seed without AUTH_SEED_LOCAL=1 (production guard).")
        return

    pw_hash = bcrypt.hashpw(
        SEED_PASSWORD.encode("utf-8"), bcrypt.gensalt(rounds=12)
    ).decode("utf-8")

    conn = await asyncpg.connect(
        host="localhost",
        port=35432,
        user="postgres",
        password="postgres",  # noqa: S106
        database="auth",
    )
    try:
        for u in SEED_USERS:
            await conn.execute(
                """
                INSERT INTO auth_schema.users (
                  email, full_name, password_hash,
                  role, admin_access_level,
                  account_status, onboarding_status,
                  tos_version, tos_accepted_at
                )
                VALUES (
                  $1, $2, $3,
                  $4::auth_schema.user_role_enum,
                  $5::auth_schema.admin_level_enum,
                  'ACTIVE', 'COMPLETE',
                  '1.0', NOW()
                )
                ON CONFLICT (email) DO NOTHING
                """,
                u["email"],
                u["full_name"],
                pw_hash,
                u["role"],
                u["admin_level"],
            )
        n = await conn.fetchval("SELECT COUNT(*) FROM auth_schema.users")
        print(f"auth_schema.users → {n} rows")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
