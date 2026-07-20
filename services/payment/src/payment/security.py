"""JWT validation — same HS256 shape used by every other Phase 1 service."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from alp_auth import AuthError, decode_access_token
from fastapi import Header, HTTPException, status

from payment.config import settings


@dataclass(frozen=True)
class JwtPrincipal:
    user_id: str
    role: str
    tenant_id: str | None
    claims: dict[str, Any]


def current_principal(authorization: str | None = Header(default=None)) -> JwtPrincipal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "missing_token", "message": "Bearer token required"},
        )
    token = authorization[len("bearer "):].strip()
    try:
        claims = decode_access_token(token, settings.jwt_secret)
    except AuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": e.code, "message": e.message},
        ) from e
    return JwtPrincipal(
        user_id=str(claims.get("sub", "")),
        role=str(claims.get("role", "STUDENT")),
        tenant_id=claims.get("tenant_id"),
        claims=claims,
    )
