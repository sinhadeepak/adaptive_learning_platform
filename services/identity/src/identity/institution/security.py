"""JWT verify + admin-scope guard.

ADR-0001 requires an admin JWT claim for flag writes. Sprint 1 uses HS256 shared-secret;
Sprint 2 upgrades to RS256 + JWKS. Admin means `admin_access_level in {'INSTITUTION','PLATFORM'}`
OR `role == 'PLATFORM_ADMIN'` (Sprint 1 scope: treat both as admin-write permitted).
"""

from __future__ import annotations

from typing import Annotated, Any

from alp_auth import AuthError, decode_access_token
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from identity.institution.config import settings

_bearer = HTTPBearer(auto_error=True)


class JwtPrincipal:
    def __init__(self, claims: dict[str, Any]) -> None:
        self.user_id: str = claims["sub"]
        self.role: str = claims.get("role", "STUDENT")
        self.admin_level: str = claims.get("admin_access_level", "NONE")
        self.tenant_id: str | None = claims.get("tenant_id")
        self.claims = claims

    @property
    def is_admin(self) -> bool:
        return self.admin_level in {"INSTITUTION", "PLATFORM"} or self.role == "PLATFORM_ADMIN"

    @property
    def is_platform_admin(self) -> bool:
        return self.admin_level == "PLATFORM" or self.role == "PLATFORM_ADMIN"


def verify_token(token: str) -> JwtPrincipal:
    try:
        claims = decode_access_token(token, settings.jwt_secret)
    except AuthError as err:
        raise HTTPException(status_code=401, detail={"code": err.code, "message": err.message}) from err
    return JwtPrincipal(claims)


async def current_principal(
    creds: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> JwtPrincipal:
    return verify_token(creds.credentials)


async def require_admin(
    principal: Annotated[JwtPrincipal, Depends(current_principal)],
) -> JwtPrincipal:
    if not principal.is_admin:
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "Admin privilege required"},
        )
    return principal
