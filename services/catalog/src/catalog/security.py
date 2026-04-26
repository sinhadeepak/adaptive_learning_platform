"""JWT verification helpers — used by the educator-scoped routes.

Mirrors services/content/src/content/security.py. The catalog service
otherwise serves anonymous reads, so this is only required on the
`/catalog/educators/me/*` paths.
"""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException, status

from catalog.config import settings


PLATFORM_ADMIN_ROLE = "PLATFORM_ADMIN"


@dataclass(frozen=True)
class JwtPrincipal:
    user_id: str
    role: str
    tenant_id: str | None
    claims: dict

    @property
    def is_platform_admin(self) -> bool:
        return self.role == PLATFORM_ADMIN_ROLE


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token", "message": str(err)},
        ) from err


async def current_principal(
    authorization: str | None = Header(default=None),
) -> JwtPrincipal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "missing_bearer",
                "message": "Authorization: Bearer <token> required",
            },
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
