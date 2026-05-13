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

from identity.auth.config import settings
from identity.auth.db import get_session
from identity.auth.repositories import UserRepo
from identity.auth.schemas import Problem
from identity.auth.security import decode_token

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
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    """Paged list endpoint for the admin Users page + educator-scope UI.

    Returned shape carries `total` so the React table can render
    "page X of Y" without an extra COUNT call. Suspend / impersonate /
    etc. land on this page in a follow-up.
    """
    rows, total = await UserRepo(session).list_by_roles(
        roles=role or [],
        q=q,
        limit=limit,
        offset=offset,
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
                "institution": (
                    {
                        "id": str(r["institution_id"]),
                        "name": r["institution_name"],
                        "slug": r["institution_slug"],
                        "kind": r["institution_kind"],
                    }
                    if r.get("institution_id") and r.get("institution_name")
                    else None
                ),
            }
            for r in rows
        ],
        "total": total,
    }
