"""Framework-agnostic JWT access-token verification.

This is the single source of truth for how ALP services verify an access
token. Before this lib, ~11 copies of ``jwt.decode(...)`` lived across the
services and had drifted: only three enforced ``token_type == "access"``.
Centralising the decode here closes that gap everywhere.

The core (:func:`decode_access_token`) has no FastAPI dependency and raises
:class:`AuthError` — callers map that to whatever their transport needs
(FastAPI helpers in :mod:`alp_auth.fastapi_deps` do the HTTP mapping).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import jwt

ALGORITHM = "HS256"

# The placeholder secret shipped in every service's config default. Booting a
# non-local environment with this value means anyone can forge tokens, so
# :func:`assert_secret_configured` refuses it outside ``local``.
DEFAULT_DEV_SECRET = "dev-only-change-me-in-staging-at-least-32-bytes-long"


class AuthError(Exception):
    """Verification failure with a stable ``code`` for transport mapping.

    ``code`` mirrors the strings the services already return in their
    ``{"detail": {"code", "message"}}`` envelopes so migrating a call site
    doesn't change its observable 401 body.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def decode_access_token(
    token: str,
    secret: str,
    *,
    algorithms: Sequence[str] = (ALGORITHM,),
    require_token_type: str | None = "access",
) -> dict[str, Any]:
    """Verify signature + expiry + token type; return the claims.

    Raises :class:`AuthError` with codes ``token_expired``, ``invalid_token``
    or ``wrong_token_type``. Pass ``require_token_type=None`` only where a
    non-access token is legitimately being read (there are none today).
    """
    try:
        claims: dict[str, Any] = jwt.decode(token, secret, algorithms=list(algorithms))
    except jwt.ExpiredSignatureError as err:
        raise AuthError("token_expired", "Token expired") from err
    except jwt.PyJWTError as err:
        raise AuthError("invalid_token", str(err) or "Invalid token") from err

    if require_token_type is not None and claims.get("token_type") != require_token_type:
        raise AuthError("wrong_token_type", f"expected {require_token_type} token")

    if not claims.get("sub"):
        raise AuthError("invalid_token", "missing sub")

    return claims


def assert_secret_configured(
    secret: str,
    environment: str,
    *,
    default: str = DEFAULT_DEV_SECRET,
    local_environments: Sequence[str] = ("local", "test"),
) -> None:
    """Fail closed if a service boots on the shared default secret.

    Call from each service's startup/lifespan. Outside ``local``/``test`` a
    default (or empty) secret raises :class:`AuthError` so the process refuses
    to serve rather than accepting forged tokens.
    """
    if environment in local_environments:
        return
    if not secret or secret == default:
        raise AuthError(
            "insecure_jwt_secret",
            f"jwt_secret must be overridden in environment={environment!r}; "
            "the built-in development default is not allowed outside "
            f"{tuple(local_environments)}",
        )
