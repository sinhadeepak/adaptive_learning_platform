"""Persona scope resolver for hierarchical drill endpoints.

The API gateway authenticates the request and forwards `Authorization:
Bearer …` unchanged. We decode (no signature verification — the gateway
already did) to learn role + user_id + tenant_id, then map that onto a
ScopeFilter the SQL layer can apply.

Cross-tenant student support: institution_schema.user_tenant_memberships
is the source of truth for "all tenants this user belongs to." A student
member of two coaching centres appears in both their dashboards but is
deduped in cross-tenant rollups via DISTINCT user_id.
"""

from __future__ import annotations

import base64
import json
import logging
import secrets
from dataclasses import dataclass
from typing import Annotated, Literal

import httpx
from fastapi import Header, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _decode_jwt_payload(token: str) -> dict:
    """Pure-Python JWT payload decoder. We don't verify the signature
    (gateway already did); just base64-decode the middle segment."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("malformed token")
    payload = parts[1]
    # Add padding if needed
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))

from engagement.analytics.config import settings

log = logging.getLogger(__name__)

ScopeMode = Literal["PLATFORM", "TENANT", "COHORTS", "STUDENT"]


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: str
    tenant_id: str | None
    raw_claims: dict


@dataclass(frozen=True)
class ScopeFilter:
    """SQL-level filter for drill queries.

    `mode='PLATFORM'`  → no user filter (admin sees everything)
    `mode='TENANT'`    → filter to tenant_id (institute admin)
    `mode='COHORTS'`   → filter to user_ids resolved from cohort list (teacher)
    `mode='STUDENT'`   → user_ids = [self] (student)
    """

    mode: ScopeMode
    tenant_ids: tuple[str, ...] = ()       # populated when mode=TENANT
    cohort_ids: tuple[str, ...] = ()       # populated when mode=COHORTS
    user_ids: tuple[str, ...] = ()         # populated when mode in (STUDENT, COHORTS)


def _problem(code: str, msg: str, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status, detail={"code": code, "message": msg}
    )


async def get_principal(
    authorization: Annotated[str | None, Header()] = None,
) -> Principal:
    """Decode the bearer token forwarded by the gateway. No signature
    verification — gateway already authenticated. We trust the claims."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _problem("missing_bearer", "Bearer token required",
                       http_status=status.HTTP_401_UNAUTHORIZED)
    token = authorization.split(" ", 1)[1].strip()
    try:
        claims = _decode_jwt_payload(token)
    except (ValueError, json.JSONDecodeError) as exc:
        raise _problem("invalid_token", str(exc),
                       http_status=status.HTTP_401_UNAUTHORIZED) from exc
    sub = claims.get("sub") or claims.get("user_id")
    role = claims.get("role", "STUDENT")
    if not sub:
        raise _problem("invalid_token", "no subject claim",
                       http_status=status.HTTP_401_UNAUTHORIZED)
    return Principal(
        user_id=str(sub),
        role=str(role),
        tenant_id=claims.get("tenant_id"),
        raw_claims=claims,
    )


async def require_owner(
    user_id: str,
    authorization: Annotated[str | None, Header()] = None,
    x_internal_token: Annotated[str | None, Header()] = None,
) -> Principal | None:
    """Ownership gate for personal `/analytics/{user_id}` endpoints.

    Two legitimate caller classes reach these endpoints:

      * trusted peer services (learning's study-plan / personal-yield /
        mission fan-outs) which call engagement directly and carry NO user
        bearer — they present the shared `x-internal-token` instead;
      * an authenticated end user reading their OWN data (or a platform admin).

    Everything else is rejected: 401 when no usable credential is present,
    403 when an authenticated user asks for a different `user_id`. This closes
    the IDOR where any caller could read another student's analytics by
    swapping the path id. Returns the resolved Principal for user calls, or
    None for a trusted internal call.
    """
    expected = settings.internal_service_token
    if x_internal_token and expected and secrets.compare_digest(x_internal_token, expected):
        return None  # trusted service-to-service call
    principal = await get_principal(authorization)  # raises 401 on missing/invalid bearer
    if principal.user_id != user_id and principal.role.upper() != "PLATFORM_ADMIN":
        raise _problem(
            "forbidden",
            "You can only access your own data.",
            http_status=status.HTTP_403_FORBIDDEN,
        )
    return principal


async def resolve_scope(
    session: AsyncSession,
    principal: Principal,
    *,
    target_tenant_id: str | None = None,
    target_cohort_id: str | None = None,
    target_user_id: str | None = None,
) -> ScopeFilter:
    """Compute the ScopeFilter for the current request.

    Raises 403 if the principal is asking for data outside their reach.
    """
    role = principal.role.upper()

    if role == "PLATFORM_ADMIN":
        # Pin to a tenant if the URL specifies one; otherwise platform-wide.
        if target_tenant_id:
            return ScopeFilter(mode="TENANT", tenant_ids=(target_tenant_id,))
        return ScopeFilter(mode="PLATFORM")

    if role in ("INSTITUTION_ADMIN", "INSTITUTE_ADMIN"):
        if not principal.tenant_id:
            raise _problem("no_tenant", "Institute admin without tenant",
                           http_status=status.HTTP_403_FORBIDDEN)
        if target_tenant_id and target_tenant_id != principal.tenant_id:
            raise _problem("forbidden",
                           "Institute admin cannot read other tenants",
                           http_status=status.HTTP_403_FORBIDDEN)
        return ScopeFilter(mode="TENANT", tenant_ids=(principal.tenant_id,))

    if role in ("TEACHER", "LEAD_TEACHER"):
        cohort_ids = await _teacher_cohorts(principal.user_id)
        if target_cohort_id and target_cohort_id not in cohort_ids:
            raise _problem("forbidden",
                           "Teacher is not a lead of this cohort",
                           http_status=status.HTTP_403_FORBIDDEN)
        # Resolve cohort members to user_ids.
        scope_cohorts = (
            (target_cohort_id,) if target_cohort_id else tuple(cohort_ids)
        )
        user_ids = tuple(await _members_of_cohorts(scope_cohorts))
        return ScopeFilter(mode="COHORTS", cohort_ids=scope_cohorts, user_ids=user_ids)

    # Default: STUDENT.
    if target_user_id and target_user_id != principal.user_id:
        raise _problem("forbidden",
                       "Students can only read their own data",
                       http_status=status.HTTP_403_FORBIDDEN)
    return ScopeFilter(mode="STUDENT", user_ids=(principal.user_id,))


async def tenant_user_ids(
    session: AsyncSession, tenant_id: str
) -> list[str]:
    """All user_ids belonging to a tenant. Used by TENANT-scoped queries."""
    base = settings.institution_base_url.rstrip("/")
    url = f"{base}/institution/tenants/{tenant_id}/members"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(url)
            if r.status_code == 200:
                return [m["userId"] for m in r.json().get("members", [])]
    except httpx.HTTPError as exc:
        log.warning("tenant_user_ids HTTP failed: %s — falling back to dblink", exc)

    # Fallback: query directly via dblink. user_tenant_memberships lives
    # in identity DB, not engagement.
    rows = (
        await session.execute(
            text(
                """
                SELECT user_id::text FROM dblink(
                  'host=postgres dbname=identity user=postgres password=postgres',
                  'SELECT user_id::text FROM institution_schema.user_tenant_memberships
                    WHERE tenant_id = ''' || :tid || ''''
                ) AS m(user_id text)
                """
            ),
            {"tid": tenant_id},
        )
    ).all()
    return [r[0] for r in rows]


# ── Internal helpers ────────────────────────────────────────────────────


async def _teacher_cohorts(teacher_user_id: str) -> list[str]:
    """Cohorts where this user is LEAD_TEACHER. HTTP from Institution."""
    base = settings.institution_base_url.rstrip("/")
    url = f"{base}/institution/teachers/{teacher_user_id}/cohorts"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(url)
            if r.status_code == 200:
                return [c["id"] for c in r.json().get("cohorts", [])]
    except httpx.HTTPError as exc:
        log.warning("_teacher_cohorts HTTP failed: %s", exc)
    return []


async def _members_of_cohorts(cohort_ids: tuple[str, ...]) -> list[str]:
    """All user_ids across given cohorts. HTTP from Institution."""
    if not cohort_ids:
        return []
    base = settings.institution_base_url.rstrip("/")
    members: set[str] = set()
    async with httpx.AsyncClient(timeout=2.0) as client:
        for cid in cohort_ids:
            try:
                r = await client.get(f"{base}/institution/cohorts/{cid}/members")
                if r.status_code == 200:
                    for m in r.json().get("members", []):
                        if m.get("role") == "STUDENT":
                            members.add(m["userId"])
            except httpx.HTTPError as exc:
                log.warning("_members_of_cohorts HTTP failed for %s: %s", cid, exc)
    return list(members)
