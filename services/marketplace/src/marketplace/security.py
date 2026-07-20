"""JWT decode + Principal dependency.

Mirrors auth's contract: HS256 access tokens with claims {sub, role,
admin_access_level, tenant_id, iat, exp, token_type}. We only validate
the signature + expiry + token_type=='access'; role-based access
control (RBAC) happens at the route level via require_role / require_admin.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Annotated

from alp_auth import DEFAULT_DEV_SECRET, AuthError, decode_access_token
from fastapi import Depends, Header, HTTPException

JWT_SECRET = os.environ.get("MARKETPLACE_JWT_SECRET", DEFAULT_DEV_SECRET)


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: str
    admin_access_level: str
    tenant_id: str | None


def _decode(token: str) -> Principal:
    try:
        payload = decode_access_token(token, JWT_SECRET)
    except AuthError as e:
        raise HTTPException(401, detail={"code": e.code, "message": e.message}) from e
    return Principal(
        user_id=str(payload["sub"]),
        role=str(payload.get("role", "STUDENT")),
        admin_access_level=str(payload.get("admin_access_level", "NONE")),
        tenant_id=payload.get("tenant_id"),
    )


def require_user(authorization: Annotated[str | None, Header()] = None) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, detail={"code": "missing_auth", "message": "Authorization header required"})
    token = authorization.split(" ", 1)[1].strip()
    return _decode(token)


def optional_user(
    authorization: Annotated[str | None, Header()] = None,
) -> Principal | None:
    """Soft auth: returns the Principal if a valid bearer token is
    present, else None. Used by routes (e.g. course detail) that want
    to serve a public preview to anonymous callers and the full
    payload to authenticated ones — without 401-ing on missing /
    invalid auth.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        return _decode(token)
    except HTTPException:
        return None


def require_admin(p: Annotated[Principal, Depends(require_user)]) -> Principal:
    # Identity's current JWT shape carries `role` but not always
    # `admin_access_level` (the latter is only set when an admin scope
    # is explicitly issued). Accept either signal.
    if p.admin_access_level == "PLATFORM" or p.role == "PLATFORM_ADMIN":
        return p
    raise HTTPException(
        403, detail={"code": "admin_only", "message": "PLATFORM_ADMIN required"}
    )
