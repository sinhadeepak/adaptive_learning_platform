"""Optional FastAPI glue over :mod:`alp_auth.verifier`.

Services with a bespoke ``Principal`` shape can keep it and just call
:func:`claims_from_bearer` for the security-critical decode. Services that
want the batteries-included path can depend on :func:`current_principal`
directly.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Annotated, Any

from fastapi import Header, HTTPException

from alp_auth.verifier import AuthError, decode_access_token


def _http_401(err: AuthError) -> HTTPException:
    return HTTPException(status_code=401, detail={"code": err.code, "message": err.message})


def claims_from_bearer(
    authorization: str | None,
    secret: str,
    *,
    require_token_type: str | None = "access",
) -> dict[str, Any]:
    """Parse an ``Authorization: Bearer`` header and return verified claims.

    Raises :class:`fastapi.HTTPException` (401) on any problem — this is the
    drop-in replacement for the hand-rolled ``_decode`` helpers.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail={"code": "missing_bearer", "message": "Authorization: Bearer <token> required"},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        return decode_access_token(token, secret, require_token_type=require_token_type)
    except AuthError as err:
        raise _http_401(err) from err


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: str
    tenant_id: str | None
    claims: dict[str, Any] = field(default_factory=dict)


def make_current_principal(secret_getter):
    """Build a FastAPI dependency bound to a callable returning the secret.

    ``secret_getter`` is a zero-arg callable (e.g. ``lambda: settings.jwt_secret``)
    so the secret is read at request time, not import time.
    """

    async def current_principal(authorization: Annotated[str | None, Header()] = None) -> Principal:
        claims = claims_from_bearer(authorization, secret_getter())
        return Principal(
            user_id=str(claims["sub"]),
            role=str(claims.get("role", "STUDENT")),
            tenant_id=claims.get("tenant_id"),
            claims=claims,
        )

    return current_principal


def require_roles(principal: Principal, *allowed: str) -> Principal:
    """Raise 403 unless the principal's role is in ``allowed``."""
    if principal.role not in allowed:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "forbidden",
                "message": f"Role {principal.role} cannot perform this action",
                "required": list(allowed),
            },
        )
    return principal


def has_any_role(principal: Principal, allowed: Sequence[str]) -> bool:
    return principal.role in allowed
