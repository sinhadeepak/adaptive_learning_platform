"""JWT verification — same shape as content/security."""

from __future__ import annotations

from dataclasses import dataclass

from alp_auth import AuthError, decode_access_token
from fastapi import Header, HTTPException, status

from learning.doubts.config import settings


@dataclass(frozen=True)
class JwtPrincipal:
    user_id: str
    role: str
    tenant_id: str | None
    claims: dict


def _decode(token: str) -> dict:
    try:
        return decode_access_token(token, settings.jwt_secret)
    except AuthError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": err.code, "message": err.message},
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
