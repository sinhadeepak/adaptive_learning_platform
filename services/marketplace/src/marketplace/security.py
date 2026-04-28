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

import jwt
from fastapi import Depends, Header, HTTPException

JWT_SECRET = os.environ.get(
    "MARKETPLACE_JWT_SECRET",
    "dev-only-change-me-in-staging-at-least-32-bytes-long",
)


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: str
    admin_access_level: str
    tenant_id: str | None


def _decode(token: str) -> Principal:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(401, detail={"code": "token_expired", "message": "JWT expired"}) from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(401, detail={"code": "invalid_token", "message": "JWT invalid"}) from e
    if payload.get("token_type") != "access":
        raise HTTPException(401, detail={"code": "wrong_token_type", "message": "expected access token"})
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


def require_admin(p: Annotated[Principal, Depends(require_user)]) -> Principal:
    # Identity's current JWT shape carries `role` but not always
    # `admin_access_level` (the latter is only set when an admin scope
    # is explicitly issued). Accept either signal.
    if p.admin_access_level == "PLATFORM" or p.role == "PLATFORM_ADMIN":
        return p
    raise HTTPException(
        403, detail={"code": "admin_only", "message": "PLATFORM_ADMIN required"}
    )
