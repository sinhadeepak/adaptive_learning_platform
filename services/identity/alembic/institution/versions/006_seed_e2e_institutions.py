"""Seed 5 institutions × 5-6 teachers × cohorts × students for the
end-to-end test fixture.

Sister migration to ``auth/004_seed_test_users.py`` — gated behind
``AUTH_SEED_LOCAL`` so the synthetic accounts never leak into staging
or production. Both auth_schema (users) and institution_schema
(tenants/cohorts/cohort_members) live in the same identity database,
so we land everything in one migration here on the institution
branch (which depends on the auth branch via Alembic-merge-style
sequencing in env.py — but in practice the user inserts are guarded
by ``ON CONFLICT (email) DO NOTHING`` and pre-existing user pinning
in ``auth/005_pin_seed_user_ids.py``).

Volume:
  * 5 tenants (one per institution kind)
  * 28 teachers (5–6 per tenant)
  * 5 cohorts (one per tenant, exam-aligned)
  * 50 students (10 per cohort)

All accounts share the password ``Password123!`` (matches the existing
seed users). UUIDs are deterministic via ``uuid5`` so re-running is
safe and the orchestrator can reference accounts by email.

Revision ID: 006
Revises: 005
Create Date: 2026-05-03
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Sequence

import bcrypt
from alembic import op
from sqlalchemy import text

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

AUTH_SCHEMA = "auth_schema"
INST_SCHEMA = "institution_schema"

SEED_PASSWORD = "Password123!"

E2E_NAMESPACE = uuid.UUID("c0000000-0000-4000-a000-000000000006")


# ─────────────────────────────────────────────────────────────────────────
# Institution catalogue. Five rows mapping (tenant kind, exam, cohort
# year) so each institution becomes a distinct fixture.
# ─────────────────────────────────────────────────────────────────────────
INSTITUTIONS = [
    {
        "tenant_id": "55555555-0000-0000-0000-000000000001",
        "name": "Aurora Coaching Centre",
        "slug": "aurora-coaching",
        "kind": "COACHING_CENTER",
        "exam": "JEE_MAIN",
        "cohort_id": "66666666-0000-0000-0000-000000000001",
        "cohort_name": "JEE Main 2027 Batch",
        "year": 2027,
        "n_teachers": 6,
        "n_students": 10,
    },
    {
        "tenant_id": "55555555-0000-0000-0000-000000000002",
        "name": "Vedanta Tutorials",
        "slug": "vedanta-tutorials",
        "kind": "COACHING_CENTER",
        "exam": "NEET",
        "cohort_id": "66666666-0000-0000-0000-000000000002",
        "cohort_name": "NEET 2027 Foundation",
        "year": 2027,
        "n_teachers": 6,
        "n_students": 10,
    },
    {
        "tenant_id": "55555555-0000-0000-0000-000000000003",
        "name": "DPS RK Puram",
        "slug": "dps-rk-puram",
        "kind": "SCHOOL",
        "exam": "CBSE",
        "cohort_id": "66666666-0000-0000-0000-000000000003",
        "cohort_name": "Class 9 Section A",
        "year": 2026,
        "n_teachers": 5,
        "n_students": 10,
    },
    {
        "tenant_id": "55555555-0000-0000-0000-000000000004",
        "name": "Kendriya Vidyalaya New Delhi",
        "slug": "kv-new-delhi",
        "kind": "SCHOOL",
        "exam": "CBSE",
        "cohort_id": "66666666-0000-0000-0000-000000000004",
        "cohort_name": "Class 8 Section B",
        "year": 2026,
        "n_teachers": 5,
        "n_students": 10,
    },
    {
        "tenant_id": "55555555-0000-0000-0000-000000000005",
        "name": "Allen Career Institute (Test)",
        "slug": "allen-test",
        "kind": "COACHING_CENTER",
        "exam": "JEE_MAIN",
        "cohort_id": "66666666-0000-0000-0000-000000000005",
        "cohort_name": "JEE Main 2026 Final-Sprint",
        "year": 2026,
        "n_teachers": 6,
        "n_students": 10,
    },
]


def _user_id(role: str, slug: str, idx: int) -> str:
    return str(uuid.uuid5(E2E_NAMESPACE, f"{role}|{slug}|{idx}"))


def _user_email(role: str, slug: str, idx: int) -> str:
    return f"{role}{idx}.{slug}@e2e.alp.dev"


def upgrade() -> None:
    if not os.environ.get("AUTH_SEED_LOCAL"):
        return

    pw_hash = bcrypt.hashpw(
        SEED_PASSWORD.encode("utf-8"), bcrypt.gensalt(rounds=12)
    ).decode("utf-8")

    for inst in INSTITUTIONS:
        # 1. Tenant
        op.execute(
            text(
                f"""
                INSERT INTO {INST_SCHEMA}.tenants (id, name, slug, kind, seat_limit)
                VALUES (CAST(:tid AS uuid), :name, :slug, :kind, :limit)
                ON CONFLICT (slug) DO NOTHING
                """
            ).bindparams(
                tid=inst["tenant_id"],
                name=inst["name"],
                slug=inst["slug"],
                kind=inst["kind"],
                limit=200,
            )
        )

        # 2. Cohort
        op.execute(
            text(
                f"""
                INSERT INTO {INST_SCHEMA}.cohorts (id, tenant_id, name, exam, year, created_by)
                VALUES (CAST(:cid AS uuid), CAST(:tid AS uuid), :name, :exam, :year, NULL)
                ON CONFLICT (tenant_id, name) DO NOTHING
                """
            ).bindparams(
                cid=inst["cohort_id"],
                tid=inst["tenant_id"],
                name=inst["cohort_name"],
                exam=inst["exam"],
                year=inst["year"],
            )
        )

        # 3. Teachers (TEACHER role + LEAD_TEACHER on the cohort)
        for t_idx in range(inst["n_teachers"]):
            uid = _user_id("teacher", inst["slug"], t_idx)
            email = _user_email("teacher", inst["slug"], t_idx)
            op.execute(
                text(
                    f"""
                    INSERT INTO {AUTH_SCHEMA}.users (
                      id, email, full_name, password_hash,
                      role, admin_access_level,
                      account_status, onboarding_status,
                      tos_version, tos_accepted_at
                    )
                    VALUES (
                      CAST(:uid AS uuid), :email, :name, :pw_hash,
                      CAST('TEACHER' AS {AUTH_SCHEMA}.user_role_enum),
                      CAST('NONE'    AS {AUTH_SCHEMA}.admin_level_enum),
                      'ACTIVE', 'COMPLETE',
                      '1.0', NOW()
                    )
                    ON CONFLICT (email) DO NOTHING
                    """
                ).bindparams(
                    uid=uid,
                    email=email,
                    name=f"Teacher {t_idx + 1} ({inst['name']})",
                    pw_hash=pw_hash,
                )
            )
            op.execute(
                text(
                    f"""
                    INSERT INTO {INST_SCHEMA}.cohort_members (cohort_id, user_id, role)
                    VALUES (CAST(:cid AS uuid), CAST(:uid AS uuid), 'LEAD_TEACHER')
                    ON CONFLICT (cohort_id, user_id) DO NOTHING
                    """
                ).bindparams(cid=inst["cohort_id"], uid=uid)
            )

        # 4. Students (STUDENT role + STUDENT in cohort)
        for s_idx in range(inst["n_students"]):
            uid = _user_id("student", inst["slug"], s_idx)
            email = _user_email("student", inst["slug"], s_idx)
            op.execute(
                text(
                    f"""
                    INSERT INTO {AUTH_SCHEMA}.users (
                      id, email, full_name, password_hash,
                      role, admin_access_level,
                      account_status, onboarding_status,
                      tos_version, tos_accepted_at
                    )
                    VALUES (
                      CAST(:uid AS uuid), :email, :name, :pw_hash,
                      CAST('STUDENT' AS {AUTH_SCHEMA}.user_role_enum),
                      CAST('NONE'    AS {AUTH_SCHEMA}.admin_level_enum),
                      'ACTIVE', 'COMPLETE',
                      '1.0', NOW()
                    )
                    ON CONFLICT (email) DO NOTHING
                    """
                ).bindparams(
                    uid=uid,
                    email=email,
                    name=f"Student {s_idx + 1} ({inst['name']})",
                    pw_hash=pw_hash,
                )
            )
            op.execute(
                text(
                    f"""
                    INSERT INTO {INST_SCHEMA}.cohort_members (cohort_id, user_id, role)
                    VALUES (CAST(:cid AS uuid), CAST(:uid AS uuid), 'STUDENT')
                    ON CONFLICT (cohort_id, user_id) DO NOTHING
                    """
                ).bindparams(cid=inst["cohort_id"], uid=uid)
            )


def downgrade() -> None:
    if not os.environ.get("AUTH_SEED_LOCAL"):
        return

    for inst in INSTITUTIONS:
        # Drop memberships first (FK)
        op.execute(
            text(
                f"DELETE FROM {INST_SCHEMA}.cohort_members WHERE cohort_id = CAST(:cid AS uuid)"
            ).bindparams(cid=inst["cohort_id"])
        )

        emails: list[str] = []
        for t in range(inst["n_teachers"]):
            emails.append(_user_email("teacher", inst["slug"], t))
        for s in range(inst["n_students"]):
            emails.append(_user_email("student", inst["slug"], s))
        if emails:
            op.execute(
                text(
                    f"DELETE FROM {AUTH_SCHEMA}.users WHERE email = ANY(:emails)"
                ).bindparams(emails=emails)
            )

        op.execute(
            text(
                f"DELETE FROM {INST_SCHEMA}.cohorts WHERE id = CAST(:cid AS uuid)"
            ).bindparams(cid=inst["cohort_id"])
        )
        op.execute(
            text(
                f"DELETE FROM {INST_SCHEMA}.tenants WHERE id = CAST(:tid AS uuid)"
            ).bindparams(tid=inst["tenant_id"])
        )
