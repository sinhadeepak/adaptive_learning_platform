"""JWT verification — Sprint 1 uses HS256 shared-secret with Auth.

Sprint 2 plan: Auth service exposes a JWKS endpoint and we verify with RS256.
"""

from __future__ import annotations

from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from user_profile.config import settings

_bearer = HTTPBearer(auto_error=True)


class JwtPrincipal:
    def __init__(self, claims: dict[str, Any]) -> None:
        self.user_id: str = claims["sub"]
        self.role: str = claims.get("role", "STUDENT")
        self.tenant_id: str | None = claims.get("tenant_id")
        self.onboarding_state: str = claims.get("onboarding_state", "NEW")
        self.claims = claims


def verify_token(token: str) -> JwtPrincipal:
    try:
        claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as err:
        raise HTTPException(status_code=401, detail={"code": "token_expired", "message": "Token expired"}) from err
    except jwt.InvalidTokenError as err:
        raise HTTPException(status_code=401, detail={"code": "invalid_token", "message": "Invalid token"}) from err
    if claims.get("token_type") != "access":
        raise HTTPException(status_code=401, detail={"code": "invalid_token_type", "message": "Not an access token"})
    return JwtPrincipal(claims)


async def current_principal(
    creds: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> JwtPrincipal:
    return verify_token(creds.credentials)
