"""Sprint 8 — Institution Core HTTP routes.

Endpoint inventory:
  POST   /institution/tenants              — create a tenant
  GET    /institution/tenants/{id}         — read a tenant
  POST   /institution/tenants/{id}/cohorts — create a cohort under a tenant
  GET    /institution/tenants/{id}/cohorts — list cohorts for a tenant
  POST   /institution/cohorts/{id}/members — add a member to a cohort
  GET    /institution/cohorts/{id}/members — list cohort members
  DELETE /institution/cohorts/{id}/members/{user_id} — remove a member

Auth: this service trusts upstream routing; no JWT verification here yet.
The Educator Assignments flow (which is what consumes these endpoints)
does its own authorization in the calling service. RBAC for institution-
admin tooling is deferred to Sprint 9 — none of these endpoints are
exposed to anonymous internet traffic in compose.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from institution.config import settings
from institution.core_repo import (
    SCHEMA,
    add_cohort_member,
    create_cohort,
    create_invite,
    create_tenant,
    get_invite_by_token,
    get_tenant,
    get_tenant_by_slug,
    increment_invite_uses,
    list_cohort_members,
    list_cohorts_for_tenant,
    remove_cohort_member,
    slugify,
)
from institution.invite_token import generate_invite_token, verify_invite_token
from institution.db import sessionmaker

router = APIRouter(prefix="/institution", tags=["institution-core"])


async def _session() -> Any:
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]


# ─────────────────────────────────────────────────────────────────────────
# Tenants
# ─────────────────────────────────────────────────────────────────────────


class TenantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    kind: Literal["SCHOOL", "COACHING_CENTER", "UNIVERSITY", "OTHER"]
    slug: str | None = Field(default=None, min_length=2, max_length=80)
    seatLimit: int | None = Field(default=None, ge=1, le=100_000)


class TenantOut(BaseModel):
    id: str
    name: str
    slug: str
    kind: str
    seatLimit: int | None
    createdAt: str
    updatedAt: str


def _tenant_to_out(row: dict[str, Any]) -> TenantOut:
    return TenantOut(
        id=str(row["id"]),
        name=row["name"],
        slug=row["slug"],
        kind=row["kind"],
        seatLimit=row.get("seat_limit"),
        createdAt=row["created_at"].isoformat(),
        updatedAt=row["updated_at"].isoformat(),
    )


@router.post("/tenants", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
async def post_tenant(body: TenantCreate, session: SessionDep) -> TenantOut:
    final_slug = body.slug or slugify(body.name)
    if not final_slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_slug", "message": "slug couldn't be derived from name"},
        )
    existing = await get_tenant_by_slug(session, final_slug)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "slug_taken", "message": f"slug '{final_slug}' is already in use"},
        )
    row = await create_tenant(
        session,
        name=body.name,
        kind=body.kind,
        slug=final_slug,
        seat_limit=body.seatLimit,
    )
    await session.commit()
    return _tenant_to_out(row)


@router.get("/tenants/{tenant_id}", response_model=TenantOut)
async def get_tenant_endpoint(tenant_id: str, session: SessionDep) -> TenantOut:
    row = await get_tenant(session, tenant_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "tenant_not_found", "message": "No tenant with that id"},
        )
    return _tenant_to_out(row)


# ─────────────────────────────────────────────────────────────────────────
# Cohorts
# ─────────────────────────────────────────────────────────────────────────


class CohortCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    exam: str | None = Field(default=None, max_length=64)
    year: int | None = Field(default=None, ge=2020, le=2100)
    createdBy: str | None = None


class CohortOut(BaseModel):
    id: str
    tenantId: str
    name: str
    exam: str | None
    year: int | None
    createdBy: str | None
    createdAt: str


def _cohort_to_out(row: dict[str, Any]) -> CohortOut:
    return CohortOut(
        id=str(row["id"]),
        tenantId=str(row["tenant_id"]),
        name=row["name"],
        exam=row.get("exam"),
        year=row.get("year"),
        createdBy=str(row["created_by"]) if row.get("created_by") else None,
        createdAt=row["created_at"].isoformat(),
    )


@router.post(
    "/tenants/{tenant_id}/cohorts",
    response_model=CohortOut,
    status_code=status.HTTP_201_CREATED,
)
async def post_cohort(
    tenant_id: str, body: CohortCreate, session: SessionDep
) -> CohortOut:
    if await get_tenant(session, tenant_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "tenant_not_found", "message": "No tenant with that id"},
        )
    row = await create_cohort(
        session,
        tenant_id=tenant_id,
        name=body.name,
        exam=body.exam,
        year=body.year,
        created_by=body.createdBy,
    )
    await session.commit()
    return _cohort_to_out(row)


@router.get(
    "/tenants/{tenant_id}/cohorts", response_model=list[CohortOut]
)
async def list_cohorts(tenant_id: str, session: SessionDep) -> list[CohortOut]:
    rows = await list_cohorts_for_tenant(session, tenant_id)
    return [_cohort_to_out(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────
# Cohort members
# ─────────────────────────────────────────────────────────────────────────


class MemberAdd(BaseModel):
    userId: str
    role: Literal["STUDENT", "LEAD_TEACHER"] = "STUDENT"


class MemberOut(BaseModel):
    cohortId: str
    userId: str
    role: str
    joinedAt: str


def _member_to_out(row: dict[str, Any]) -> MemberOut:
    return MemberOut(
        cohortId=str(row["cohort_id"]),
        userId=str(row["user_id"]),
        role=row["role"],
        joinedAt=row["joined_at"].isoformat(),
    )


@router.post(
    "/cohorts/{cohort_id}/members",
    response_model=MemberOut,
)
async def post_member(
    cohort_id: str, body: MemberAdd, session: SessionDep
) -> MemberOut:
    row, created = await add_cohort_member(
        session, cohort_id=cohort_id, user_id=body.userId, role=body.role
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "cohort_not_found", "message": "Cohort doesn't exist"},
        )
    await session.commit()
    return _member_to_out(row)


@router.get(
    "/cohorts/{cohort_id}/members", response_model=list[MemberOut]
)
async def get_members(cohort_id: str, session: SessionDep) -> list[MemberOut]:
    rows = await list_cohort_members(session, cohort_id)
    return [_member_to_out(r) for r in rows]


@router.delete(
    "/cohorts/{cohort_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_member(
    cohort_id: str, user_id: str, session: SessionDep
) -> None:
    removed = await remove_cohort_member(
        session, cohort_id=cohort_id, user_id=user_id
    )
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "member_not_found", "message": "User isn't in this cohort"},
        )
    await session.commit()


# ─────────────────────────────────────────────────────────────────────────
# Sprint 11 S11-A — Cohort invites
# ─────────────────────────────────────────────────────────────────────────


class InviteCreate(BaseModel):
    """Educator generates a cohort invite link.

    `maxUses=None` means unlimited (a class-wide link). Finite values let
    the educator hand out a "20-seat" invite. `expiresAt` is optional —
    when set, the claim endpoint refuses past it."""

    maxUses: int | None = Field(default=None, ge=1, le=10_000)
    expiresAt: str | None = None  # ISO-8601


class InviteOut(BaseModel):
    id: str
    cohortId: str
    token: str
    maxUses: int | None
    uses: int
    expiresAt: str | None
    createdAt: str


def _invite_to_out(row: dict[str, Any]) -> InviteOut:
    return InviteOut(
        id=str(row["id"]),
        cohortId=str(row["cohort_id"]),
        token=row["token"],
        maxUses=row.get("max_uses"),
        uses=row["uses"],
        expiresAt=row["expires_at"].isoformat() if row.get("expires_at") else None,
        createdAt=row["created_at"].isoformat() if row.get("created_at") else "",
    )


@router.post(
    "/cohorts/{cohort_id}/invites",
    response_model=InviteOut,
    status_code=status.HTTP_201_CREATED,
)
async def post_invite(
    cohort_id: str, body: InviteCreate, session: SessionDep
) -> InviteOut:
    # Defensive: refuse to mint invites for a cohort that doesn't exist
    # (FK CASCADE would orphan the row otherwise).
    res = await session.execute(
        text(f"SELECT 1 FROM {SCHEMA}.cohorts WHERE id = :id"),
        {"id": cohort_id},
    )
    if res.first() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "cohort_not_found", "message": "No cohort with that id"},
        )
    token = generate_invite_token(settings.jwt_secret)
    row = await create_invite(
        session,
        cohort_id=cohort_id,
        token=token,
        max_uses=body.maxUses,
        expires_at=body.expiresAt,
    )
    await session.commit()
    return _invite_to_out(row)


class InviteClaim(BaseModel):
    userId: str


@router.post("/cohorts/invites/{token}/claim")
async def post_claim(
    token: str, body: InviteClaim, session: SessionDep
) -> dict:
    """Student-side: redeem a cohort invite. Adds the user to
    cohort_members and atomically increments `uses`. Returns 410 if the
    invite is invalid, expired, or already at the cap."""
    if not verify_invite_token(token, settings.jwt_secret):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "invalid_invite",
                "message": "Invite token is invalid or has been revoked",
            },
        )
    invite = await get_invite_by_token(session, token)
    if invite is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "invalid_invite",
                "message": "Invite token is invalid or has been revoked",
            },
        )
    # Expiry check
    if invite.get("expires_at"):
        from datetime import datetime as _dt
        from datetime import timezone as _tz

        expires_at = invite["expires_at"]
        if isinstance(expires_at, str):
            expires_at = _dt.fromisoformat(expires_at)
        now = _dt.now(tz=_tz.utc)
        if expires_at < now:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail={
                    "code": "invite_expired",
                    "message": "Invite has expired",
                },
            )
    # Atomic uses-bump: returns False when at the cap.
    claimed = await increment_invite_uses(session, str(invite["id"]))
    if not claimed:
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "invite_exhausted",
                "message": "Invite has reached its claim limit",
            },
        )
    # Add to cohort_members (idempotent — student opening the same link
    # twice doesn't error).
    await add_cohort_member(
        session, cohort_id=str(invite["cohort_id"]), user_id=body.userId
    )
    await session.commit()
    return {
        "ok": True,
        "cohortId": str(invite["cohort_id"]),
        "userId": body.userId,
    }
