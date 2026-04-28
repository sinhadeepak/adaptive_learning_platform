"""Sprint 8 — Institution Core repositories.

Tenants + cohorts + cohort_members. Kept in a separate module from the
flag-store repo (`repositories.py`) since they form an orthogonal domain
and the flag tables are operationally separate (flag mutations route
through admin tooling; cohort writes are part of educator UX).
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "institution_schema"

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    """Lower-case, dash-separated. We never auto-fall-back to UUIDs here —
    a name like "????" should error so the educator notices and picks a
    real slug."""
    s = _SLUG_RE.sub("-", name.strip().lower()).strip("-")
    return s


# ─────────────────────────────────────────────────────────────────────────
# Tenants
# ─────────────────────────────────────────────────────────────────────────


async def create_tenant(
    session: AsyncSession,
    *,
    name: str,
    kind: str,
    slug: str | None = None,
    seat_limit: int | None = None,
) -> dict[str, Any]:
    final_slug = slug or slugify(name)
    if not final_slug:
        raise ValueError("slug must be a non-empty string")
    row = (
        await session.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.tenants (name, slug, kind, seat_limit)
                VALUES (:n, :s, :k, :l)
                RETURNING id, name, slug, kind, seat_limit, created_at, updated_at
                """
            ),
            {"n": name, "s": final_slug, "k": kind, "l": seat_limit},
        )
    ).mappings().first()
    return dict(row) if row else {}


async def get_tenant(
    session: AsyncSession, tenant_id: str
) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(
                f"SELECT id, name, slug, kind, seat_limit, created_at, updated_at "
                f"FROM {SCHEMA}.tenants WHERE id = :id"
            ),
            {"id": tenant_id},
        )
    ).mappings().first()
    return dict(row) if row else None


async def get_tenant_by_slug(
    session: AsyncSession, slug: str
) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(
                f"SELECT id, name, slug, kind, seat_limit, created_at, updated_at "
                f"FROM {SCHEMA}.tenants WHERE slug = :s"
            ),
            {"s": slug},
        )
    ).mappings().first()
    return dict(row) if row else None


# ─────────────────────────────────────────────────────────────────────────
# Cohorts
# ─────────────────────────────────────────────────────────────────────────


async def create_cohort(
    session: AsyncSession,
    *,
    tenant_id: str,
    name: str,
    exam: str | None = None,
    year: int | None = None,
    created_by: str | None = None,
) -> dict[str, Any]:
    row = (
        await session.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.cohorts (tenant_id, name, exam, year, created_by)
                VALUES (:t, :n, :e, :y, :u)
                RETURNING id, tenant_id, name, exam, year, created_by, created_at
                """
            ),
            {"t": tenant_id, "n": name, "e": exam, "y": year, "u": created_by},
        )
    ).mappings().first()
    return dict(row) if row else {}


async def list_cohorts_for_tenant(
    session: AsyncSession, tenant_id: str
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(
                f"SELECT id, tenant_id, name, exam, year, created_by, created_at "
                f"FROM {SCHEMA}.cohorts WHERE tenant_id = :t ORDER BY created_at DESC"
            ),
            {"t": tenant_id},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────
# Cohort members
# ─────────────────────────────────────────────────────────────────────────


async def add_cohort_member(
    session: AsyncSession,
    *,
    cohort_id: str,
    user_id: str,
    role: str = "STUDENT",
) -> tuple[dict[str, Any], bool]:
    """Returns (row, created). When `created` is False, the user was
    already a member and the row's `joined_at` is the original timestamp —
    useful for the "Already in cohort" UX nudge."""
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.cohort_members (cohort_id, user_id, role)
            VALUES (:c, :u, :r)
            ON CONFLICT (cohort_id, user_id) DO NOTHING
            RETURNING cohort_id, user_id, role, joined_at
            """
        ),
        {"c": cohort_id, "u": user_id, "r": role},
    )
    row = res.mappings().first()
    if row:
        return dict(row), True
    existing = (
        await session.execute(
            text(
                f"SELECT cohort_id, user_id, role, joined_at "
                f"FROM {SCHEMA}.cohort_members WHERE cohort_id = :c AND user_id = :u"
            ),
            {"c": cohort_id, "u": user_id},
        )
    ).mappings().first()
    return (dict(existing) if existing else {}), False


async def list_cohort_members(
    session: AsyncSession, cohort_id: str
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(
                f"SELECT cohort_id, user_id, role, joined_at "
                f"FROM {SCHEMA}.cohort_members WHERE cohort_id = :c "
                f"ORDER BY role DESC, joined_at"
            ),
            {"c": cohort_id},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


async def remove_cohort_member(
    session: AsyncSession, *, cohort_id: str, user_id: str
) -> bool:
    res = await session.execute(
        text(
            f"DELETE FROM {SCHEMA}.cohort_members "
            f"WHERE cohort_id = :c AND user_id = :u"
        ),
        {"c": cohort_id, "u": user_id},
    )
    return (res.rowcount or 0) > 0


# ─────────────────────────────────────────────────────────────────────────
# Cohort invites (Sprint 11 S11-A)
# ─────────────────────────────────────────────────────────────────────────


async def create_invite(
    session: AsyncSession,
    *,
    cohort_id: str,
    token: str,
    created_by: str | None = None,
    max_uses: int | None = None,
    expires_at: Any | None = None,
) -> dict[str, Any]:
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.cohort_invites
              (cohort_id, token, created_by, max_uses, expires_at)
            VALUES (:c, :t, :u, :m, :e)
            RETURNING id, cohort_id, token, created_by, max_uses, uses,
                      expires_at, created_at
            """
        ),
        {
            "c": cohort_id,
            "t": token,
            "u": created_by,
            "m": max_uses,
            "e": expires_at,
        },
    )
    row = res.mappings().first()
    return dict(row) if row else {}


async def get_invite_by_token(
    session: AsyncSession, token: str
) -> dict[str, Any] | None:
    res = await session.execute(
        text(
            f"""
            SELECT id, cohort_id, token, created_by, max_uses, uses,
                   expires_at, created_at
              FROM {SCHEMA}.cohort_invites WHERE token = :t
            """
        ),
        {"t": token},
    )
    row = res.mappings().first()
    return dict(row) if row else None


async def increment_invite_uses(
    session: AsyncSession, invite_id: str
) -> bool:
    """Atomically increment `uses` only when below `max_uses` (or
    max_uses IS NULL = unlimited). Returns True if the slot was claimed,
    False if the invite was already at the cap."""
    res = await session.execute(
        text(
            f"""
            UPDATE {SCHEMA}.cohort_invites
               SET uses = uses + 1
             WHERE id = :id
               AND (max_uses IS NULL OR uses < max_uses)
            """
        ),
        {"id": invite_id},
    )
    return (res.rowcount or 0) > 0


async def list_invites_for_cohort(
    session: AsyncSession, cohort_id: str
) -> list[dict[str, Any]]:
    """Sprint 12 S12-A — newest-first invite listing for the educator UI."""
    res = await session.execute(
        text(
            f"""
            SELECT id, cohort_id, token, created_by, max_uses, uses,
                   expires_at, created_at
              FROM {SCHEMA}.cohort_invites
             WHERE cohort_id = :c
          ORDER BY created_at DESC
            """
        ),
        {"c": cohort_id},
    )
    return [dict(r) for r in res.mappings().all()]


async def delete_invite(session: AsyncSession, invite_id: str) -> bool:
    """Sprint 12 S12-A — hard-delete revocation. Returns True if the row
    existed (UI can show "revoked" or "already gone" copy)."""
    res = await session.execute(
        text(f"DELETE FROM {SCHEMA}.cohort_invites WHERE id = :id"),
        {"id": invite_id},
    )
    return (res.rowcount or 0) > 0


def redact_invite_token(token: str) -> str:
    """Show only the last 4 chars of the random head — never the HMAC
    tail. A list-response leak then can't be replayed against the claim
    endpoint without re-forging a valid signature. Pure function so
    tests can pin the contract."""
    head, _, tail = token.partition(".")
    if not head or not tail:
        return "***"
    visible = head[-4:] if len(head) >= 4 else head
    return f"…{visible}.***"


# ─────────────────────────────────────────────────────────────────────────
# Sprint 13 S13-B — invite claim audit
# ─────────────────────────────────────────────────────────────────────────


async def insert_invite_claim(
    session: AsyncSession,
    *,
    invite_id: str,
    user_id: str,
) -> None:
    """Append-only — the claim endpoint calls this on every successful
    redemption. Educator UI consumes via list_invite_claims."""
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.cohort_invite_claims (invite_id, user_id)
            VALUES (:i, :u)
            """
        ),
        {"i": invite_id, "u": user_id},
    )


async def list_invite_claims(
    session: AsyncSession, invite_id: str
) -> list[dict[str, Any]]:
    """Newest-first claim list for the invite-funnel UI."""
    res = await session.execute(
        text(
            f"""
            SELECT id, invite_id, user_id, claimed_at
              FROM {SCHEMA}.cohort_invite_claims
             WHERE invite_id = :i
          ORDER BY claimed_at DESC
            """
        ),
        {"i": invite_id},
    )
    return [dict(r) for r in res.mappings().all()]
