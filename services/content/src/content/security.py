"""JWT verification helpers — mirror of services/auth/security shape."""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException, status

from content.config import settings


@dataclass(frozen=True)
class JwtPrincipal:
    user_id: str
    role: str
    tenant_id: str | None
    claims: dict


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token", "message": str(err)},
        ) from err


async def current_principal(authorization: str | None = Header(default=None)) -> JwtPrincipal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "missing_bearer", "message": "Authorization: Bearer <token> required"},
        )
    token = authorization.split(" ", 1)[1].strip()
    claims = _decode(token)
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token", "message": "missing sub"},
        )
    return JwtPrincipal(
        user_id=str(sub),
        role=str(claims.get("role", "STUDENT")),
        tenant_id=claims.get("tenant_id"),
        claims=claims,
    )


def principal_with_role(*allowed: str, principal: JwtPrincipal) -> JwtPrincipal:
    """Raise 403 if the JWT's role isn't in the allowed list. Used by routes
    that need RBAC beyond what the bearer-token check gives."""
    if principal.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "forbidden",
                "message": f"Role {principal.role} cannot perform this action",
                "required": list(allowed),
            },
        )
    return principal
