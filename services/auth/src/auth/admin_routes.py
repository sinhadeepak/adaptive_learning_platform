"""Admin endpoints for auth — guarded by PLATFORM_ADMIN bearer tokens.

Kept in a separate module/router so the public /auth/* surface stays
unauthenticated by default. Anything mounted here requires both:
  - a valid Bearer token issued by /auth/login
  - role == PLATFORM_ADMIN in that token
"""

from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth.config import settings
from auth.db import get_session
from auth.repositories import UserRepo
from auth.schemas import Problem
from auth.security import decode_token

router = APIRouter(prefix="/auth/admin", tags=["auth-admin"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _problem(code: str, message: str, *, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail=Problem(code=code, message=message).model_dump(),
    )


async def require_platform_admin(
    authorization: str | None = Header(default=None),
) -> dict:
    """Return the decoded claims if the bearer token is a PLATFORM_ADMIN.

    Raises 401 for missing/invalid tokens, 403 for non-admins.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _problem(
            "missing_bearer",
            "Authorization: Bearer <token> required",
            http_status=status.HTTP_401_UNAUTHORIZED,
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        claims = decode_token(token)
    except jwt.PyJWTError as err:
        raise _problem(
            "invalid_token", str(err), http_status=status.HTTP_401_UNAUTHORIZED
        ) from err
    if claims.get("role") != "PLATFORM_ADMIN":
        raise _problem(
            "forbidden",
            "PLATFORM_ADMIN role required",
            http_status=status.HTTP_403_FORBIDDEN,
        )
    return claims


@router.get("/users")
async def list_users(
    session: SessionDep,
    _claims: Annotated[dict, Depends(require_platform_admin)],
    role: Annotated[
        list[str] | None,
        Query(description="Repeat to filter by multiple roles"),
    ] = None,
    q: Annotated[
        str | None,
        Query(description="Case-insensitive substring of email or name"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    """Bare list endpoint for the educator-scope admin UI.

    Returned shape is intentionally minimal — just enough to render a
    pickable row. Suspend / impersonate / etc. live on the Phase 2
    Users page.
    """
    rows = await UserRepo(session).list_by_roles(
        roles=role or [],
        q=q,
        limit=limit,
    )
    return {
        "items": [
            {
                "id": str(r["id"]),
                "email": r["email"],
                "fullName": r.get("full_name") or "",
                "role": r["role"],
                "adminAccessLevel": r.get("admin_access_level") or "NONE",
                "accountStatus": r["account_status"],
            }
            for r in rows
        ]
    }
