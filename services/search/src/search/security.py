"""Minimal JWT verifier — admin scope for /admin/* endpoints."""

from __future__ import annotations

from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from search.config import settings

_bearer = HTTPBearer(auto_error=True)


class JwtPrincipal:
    def __init__(self, claims: dict[str, Any]) -> None:
        self.user_id: str = claims["sub"]
        self.role: str = claims.get("role", "STUDENT")
        self.admin_level: str = claims.get("admin_access_level", "NONE")
        self.claims = claims

    @property
    def is_admin(self) -> bool:
        return self.admin_level in {"INSTITUTION", "PLATFORM"} or self.role == "PLATFORM_ADMIN"


async def require_admin(
    creds: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> JwtPrincipal:
    try:
        claims = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.InvalidTokenError as err:
        raise HTTPException(
            status_code=401, detail={"code": "invalid_token", "message": "Invalid token"}
        ) from err
    p = JwtPrincipal(claims)
    if not p.is_admin:
        raise HTTPException(
            status_code=403, detail={"code": "forbidden", "message": "Admin required"}
        )
    return p
