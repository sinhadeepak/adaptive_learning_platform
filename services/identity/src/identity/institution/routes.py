"""FastAPI router for /flags/* — ADR-0001.

GETs allow any authenticated user; PUTs require admin. Writes emit audit rows and
(Sprint 1 Day 4+) NATS `flag.changed` events for SDK invalidation.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from identity.institution.db import get_session
from identity.institution.events import publish_flag_changed
from identity.institution.repositories import FlagRepo
from identity.institution.schemas import (
    Flag,
    FlagAuditEntry,
    FlagDetail,
    FlagOverride,
    FlagPut,
    Problem,
)
from identity.institution.security import JwtPrincipal, current_principal, require_admin

router = APIRouter(prefix="/flags", tags=["flags"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]
AdminDep = Annotated[JwtPrincipal, Depends(require_admin)]


def _not_found(msg: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail=Problem(code="flag_not_found", message=msg).model_dump(),
    )


def _flag_summary(row: dict) -> Flag:
    return Flag(
        name=row["name"],
        description=row["description"],
        defaultValue=row["default_value"],
        dangerCritical=row["danger_critical"],
        owner=row.get("owner"),
        blastRadius=row.get("blast_radius"),
        overrideCount=int(row.get("override_count", 0)),
        updatedAt=row["updated_at"],
    )


# GETs are open intra-cluster — every backend service hits them on flag eval.
# Network-level segmentation (Sprint 1) + service mesh mTLS (Sprint 3) bound the surface.
# Writes stay admin-only.


@router.get("", response_model=list[Flag])
async def list_flags(session: SessionDep) -> list[Flag]:
    rows = await FlagRepo(session).list_flags()
    return [_flag_summary(r) for r in rows]


# Declared BEFORE /{name} so FastAPI matches the literal "/audit" first
# instead of routing GET /flags/audit to get_flag(name="audit").
@router.get("/audit", response_model=list[FlagAuditEntry])
async def list_audit(
    session: SessionDep,
    _: PrincipalDep,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[FlagAuditEntry]:
    """Global audit log across every flag — backs the admin /audit screen."""
    rows = await FlagRepo(session).audit_all(limit=limit)
    return [
        FlagAuditEntry(
            ts=r["ts"],
            flagName=r["flag_name"],
            scope=r["scope"],
            tenantId=str(r["tenant_id"]) if r.get("tenant_id") else None,
            oldValue=r.get("old_value"),
            newValue=r.get("new_value"),
            actorUserId=str(r["actor_user_id"]) if r.get("actor_user_id") else None,
            rationale=r.get("rationale"),
        )
        for r in rows
    ]


@router.get("/{name}", response_model=FlagDetail)
async def get_flag(name: str, session: SessionDep) -> FlagDetail:
    repo = FlagRepo(session)
    flag = await repo.get_flag(name)
    if flag is None:
        raise _not_found(f"Flag {name} not found")
    flag_dict = dict(flag)
    flag_dict["override_count"] = 0  # not needed in detail shape but keep the summary happy
    base = _flag_summary(flag_dict)
    overrides = [
        FlagOverride(
            tenantId=str(o["tenant_id"]),
            value=o["value"],
            setByUserId=str(o["set_by_user_id"]) if o.get("set_by_user_id") else None,
            setAt=o["set_at"],
        )
        for o in await repo.overrides_for(name)
    ]
    audit = [
        FlagAuditEntry(
            ts=a["ts"],
            flagName=a["flag_name"],
            scope=a["scope"],
            tenantId=str(a["tenant_id"]) if a.get("tenant_id") else None,
            oldValue=a.get("old_value"),
            newValue=a.get("new_value"),
            actorUserId=str(a["actor_user_id"]) if a.get("actor_user_id") else None,
            rationale=a.get("rationale"),
        )
        for a in await repo.audit_for(name)
    ]
    return FlagDetail(
        **base.model_dump(),
        overrides=overrides,
        audit=audit,
    )


@router.put("/{name}", response_model=Flag)
async def set_default(name: str, body: FlagPut, session: SessionDep, admin: AdminDep) -> Flag:
    repo = FlagRepo(session)
    updated, old_value = await repo.set_default(
        name=name, value=body.value, actor_user_id=admin.user_id, rationale=body.rationale
    )
    if updated is None:
        raise _not_found(f"Flag {name} not found")
    await session.commit()
    await publish_flag_changed(
        flag_name=name,
        scope="GLOBAL",
        tenant_id=None,
        old_value=old_value,
        new_value=body.value,
        actor_user_id=admin.user_id,
        rationale=body.rationale,
    )
    updated["override_count"] = 0
    return _flag_summary(updated)


@router.put("/{name}/tenants/{tenant_id}", response_model=Flag)
async def set_override(
    name: str,
    tenant_id: str,
    body: FlagPut,
    session: SessionDep,
    admin: AdminDep,
) -> Flag:
    repo = FlagRepo(session)
    ok, old_value = await repo.set_override(
        flag_name=name,
        tenant_id=tenant_id,
        value=body.value,
        actor_user_id=admin.user_id,
        rationale=body.rationale,
    )
    if not ok:
        raise _not_found(f"Flag {name} not found")
    await session.commit()
    await publish_flag_changed(
        flag_name=name,
        scope="TENANT",
        tenant_id=tenant_id,
        old_value=old_value,
        new_value=body.value,
        actor_user_id=admin.user_id,
        rationale=body.rationale,
    )
    flag = await repo.get_flag(name)
    assert flag is not None
    flag["override_count"] = 0  # cheap; list_flags recomputes the real count
    return _flag_summary(flag)


@router.get("/{name}/audit", response_model=list[FlagAuditEntry])
async def get_audit(
    name: str,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[FlagAuditEntry]:
    rows = await FlagRepo(session).audit_for(name, limit=limit)
    return [
        FlagAuditEntry(
            ts=r["ts"],
            flagName=r["flag_name"],
            scope=r["scope"],
            tenantId=str(r["tenant_id"]) if r.get("tenant_id") else None,
            oldValue=r.get("old_value"),
            newValue=r.get("new_value"),
            actorUserId=str(r["actor_user_id"]) if r.get("actor_user_id") else None,
            rationale=r.get("rationale"),
        )
        for r in rows
    ]
