"""Admin endpoints for /admin/ai-providers/*.

  GET  /admin/ai-providers           — list (key masked)
  POST /admin/ai-providers           — create new row
  PUT  /admin/ai-providers/{id}      — update fields (incl. set/clear key)
  POST /admin/ai-providers/{id}/test — health probe
  POST /admin/ai-providers/reorder   — bulk priority update
"""

from __future__ import annotations

import logging
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.ai_providers.crypto import encrypt_key, mask_key
from learning.ai_providers.fallback import test_provider
from learning.content.db import get_session
from learning.content.security import JwtPrincipal, current_principal

log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/ai-providers", tags=["admin", "ai-providers"])

PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _require_admin(principal: JwtPrincipal) -> None:
    if principal.role not in ("PLATFORM_ADMIN", "INSTITUTION_ADMIN"):
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "ai-provider config requires admin"},
        )


# ─────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────


class ProviderEntry(BaseModel):
    id: str
    kind: Literal["ollama", "openai", "anthropic"]
    display_name: str
    enabled: bool
    priority: int
    base_url: str | None = None
    model: str
    # Whether a key is set on this row. Server never returns the
    # plaintext or the encrypted token — only the truth bit + last-4.
    has_key: bool
    key_hint: str | None = None
    extra: dict[str, Any] = {}


class CreateProviderRequest(BaseModel):
    kind: Literal["ollama", "openai", "anthropic"]
    display_name: str = Field(min_length=1, max_length=80)
    enabled: bool = False
    priority: int = Field(default=100, ge=0, le=1000)
    base_url: str | None = Field(default=None, max_length=500)
    model: str = Field(min_length=1, max_length=120)
    api_key: str | None = Field(default=None, max_length=512)
    extra: dict[str, Any] = Field(default_factory=dict)


class UpdateProviderRequest(BaseModel):
    """All fields optional — PATCH-style. Only the fields the admin
    actually changed go in. `api_key` has 3 modes:
      - omitted (key in model_fields_set is False): leave existing.
      - set to "": clear the key.
      - set to a string: re-encrypt + replace.
    """

    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    enabled: bool | None = None
    priority: int | None = Field(default=None, ge=0, le=1000)
    base_url: str | None = Field(default=None, max_length=500)
    model: str | None = Field(default=None, min_length=1, max_length=120)
    api_key: str | None = Field(default=None, max_length=512)
    extra: dict[str, Any] | None = None


class ReorderRequest(BaseModel):
    # List of {id, priority} pairs — applied in one transaction.
    items: list[dict[str, Any]] = Field(min_length=1, max_length=20)


class TestResponse(BaseModel):
    ok: bool
    message: str


# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────


def _to_entry(row: dict[str, Any]) -> ProviderEntry:
    return ProviderEntry(
        id=str(row["id"]),
        kind=row["kind"],
        display_name=row["display_name"],
        enabled=bool(row["enabled"]),
        priority=int(row["priority"]),
        base_url=row.get("base_url"),
        model=row["model"],
        has_key=row.get("api_key_encrypted") is not None,
        key_hint=(
            f"…{row['api_key_last4']}" if row.get("api_key_last4") else None
        ),
        extra=row.get("extra") or {},
    )


# ─────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────


@router.get("", response_model=list[ProviderEntry])
async def list_providers(
    session: SessionDep, principal: PrincipalDep,
) -> list[ProviderEntry]:
    _require_admin(principal)
    res = await session.execute(
        text(
            "SELECT id, kind, display_name, enabled, priority, base_url, model, "
            "       api_key_encrypted, api_key_last4, extra "
            "  FROM content_schema.ai_provider_config "
            " ORDER BY priority, created_at"
        )
    )
    return [_to_entry(dict(r)) for r in res.mappings().all()]


@router.post("", response_model=ProviderEntry, status_code=201)
async def create_provider(
    body: CreateProviderRequest,
    session: SessionDep,
    principal: PrincipalDep,
) -> ProviderEntry:
    _require_admin(principal)
    enc = None
    last4 = None
    if body.api_key:
        enc = encrypt_key(body.api_key)
        last4 = body.api_key[-4:]

    res = await session.execute(
        text(
            """
            INSERT INTO content_schema.ai_provider_config
                (kind, display_name, enabled, priority, base_url, model,
                 api_key_encrypted, api_key_last4, extra)
            VALUES (:kind, :name, :enabled, :prio, :base, :model,
                    :enc, :last4, CAST(:extra AS jsonb))
            RETURNING id, kind, display_name, enabled, priority, base_url, model,
                      api_key_encrypted, api_key_last4, extra
            """
        ),
        {
            "kind": body.kind,
            "name": body.display_name,
            "enabled": body.enabled,
            "prio": body.priority,
            "base": body.base_url,
            "model": body.model,
            "enc": enc,
            "last4": last4,
            "extra": _jsonify(body.extra),
        },
    )
    row = res.mappings().first()
    if row is None:
        raise HTTPException(status_code=500, detail="insert failed")
    await session.commit()
    return _to_entry(dict(row))


@router.put("/{provider_id}", response_model=ProviderEntry)
async def update_provider(
    provider_id: str,
    body: UpdateProviderRequest,
    session: SessionDep,
    principal: PrincipalDep,
) -> ProviderEntry:
    _require_admin(principal)
    sets: list[str] = []
    params: dict[str, Any] = {"id": provider_id}
    fset = body.model_fields_set

    if "display_name" in fset and body.display_name is not None:
        sets.append("display_name = :name")
        params["name"] = body.display_name
    if "enabled" in fset and body.enabled is not None:
        sets.append("enabled = :enabled")
        params["enabled"] = body.enabled
    if "priority" in fset and body.priority is not None:
        sets.append("priority = :prio")
        params["prio"] = body.priority
    if "base_url" in fset:
        sets.append("base_url = :base")
        params["base"] = body.base_url
    if "model" in fset and body.model is not None:
        sets.append("model = :model")
        params["model"] = body.model
    if "extra" in fset and body.extra is not None:
        sets.append("extra = CAST(:extra AS jsonb)")
        params["extra"] = _jsonify(body.extra)

    # Three-mode key handling — see UpdateProviderRequest docstring.
    if "api_key" in fset:
        if body.api_key:
            sets.append("api_key_encrypted = :enc, api_key_last4 = :last4")
            params["enc"] = encrypt_key(body.api_key)
            params["last4"] = body.api_key[-4:]
        else:
            sets.append("api_key_encrypted = NULL, api_key_last4 = NULL")

    if not sets:
        # No-op PUT — just return current row. Common when the admin
        # toggles a checkbox the UI sends as a full PUT.
        res = await session.execute(
            text(
                "SELECT id, kind, display_name, enabled, priority, base_url, model, "
                "       api_key_encrypted, api_key_last4, extra "
                "  FROM content_schema.ai_provider_config WHERE id = CAST(:id AS uuid)"
            ),
            params,
        )
        row = res.mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail="provider not found")
        return _to_entry(dict(row))

    sets.append("updated_at = NOW()")
    res = await session.execute(
        text(
            f"""
            UPDATE content_schema.ai_provider_config
               SET {', '.join(sets)}
             WHERE id = CAST(:id AS uuid)
            RETURNING id, kind, display_name, enabled, priority, base_url, model,
                      api_key_encrypted, api_key_last4, extra
            """
        ),
        params,
    )
    row = res.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="provider not found")
    await session.commit()
    return _to_entry(dict(row))


@router.delete("/{provider_id}", status_code=204)
async def delete_provider(
    provider_id: str, session: SessionDep, principal: PrincipalDep,
) -> None:
    _require_admin(principal)
    await session.execute(
        text("DELETE FROM content_schema.ai_provider_config WHERE id = CAST(:id AS uuid)"),
        {"id": provider_id},
    )
    await session.commit()


@router.post("/{provider_id}/test", response_model=TestResponse)
async def test_provider_endpoint(
    provider_id: str, session: SessionDep, principal: PrincipalDep,
) -> TestResponse:
    _require_admin(principal)
    res = await session.execute(
        text(
            "SELECT id, kind, display_name, base_url, model, api_key_encrypted "
            "  FROM content_schema.ai_provider_config WHERE id = CAST(:id AS uuid)"
        ),
        {"id": provider_id},
    )
    row = res.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="provider not found")
    ok, msg = await test_provider(dict(row))
    return TestResponse(ok=ok, message=msg)


@router.post("/reorder", response_model=list[ProviderEntry])
async def reorder(
    body: ReorderRequest,
    session: SessionDep,
    principal: PrincipalDep,
) -> list[ProviderEntry]:
    _require_admin(principal)
    for item in body.items:
        if "id" not in item or "priority" not in item:
            raise HTTPException(status_code=400, detail="each item needs id + priority")
        await session.execute(
            text(
                "UPDATE content_schema.ai_provider_config "
                "SET priority = :p, updated_at = NOW() "
                "WHERE id = CAST(:id AS uuid)"
            ),
            {"p": int(item["priority"]), "id": str(item["id"])},
        )
    await session.commit()
    return await list_providers(session, principal)


def _jsonify(d: dict[str, Any] | None) -> str:
    import json as _json

    return _json.dumps(d or {})


# Re-export for callers that don't want a circular import path.
__all__ = ["router", "mask_key"]
