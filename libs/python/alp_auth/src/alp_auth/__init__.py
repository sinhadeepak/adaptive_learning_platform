"""ALP shared auth: JWT verification + startup secret guard.

Public surface:
    - :func:`decode_access_token` — framework-agnostic verify (signature,
      expiry, token_type, sub).
    - :func:`assert_secret_configured` — refuse the default secret outside local.
    - :class:`AuthError` — raised by the core; map to your transport.
    - FastAPI glue (:func:`claims_from_bearer`, :func:`make_current_principal`,
      :func:`require_roles`, :class:`Principal`) for services that want it.
"""

from __future__ import annotations

from alp_auth.fastapi_deps import (
    Principal,
    claims_from_bearer,
    has_any_role,
    make_current_principal,
    require_roles,
)
from alp_auth.verifier import (
    ALGORITHM,
    DEFAULT_DEV_SECRET,
    AuthError,
    assert_secret_configured,
    decode_access_token,
)

__all__ = [
    "ALGORITHM",
    "DEFAULT_DEV_SECRET",
    "AuthError",
    "Principal",
    "assert_secret_configured",
    "claims_from_bearer",
    "decode_access_token",
    "has_any_role",
    "make_current_principal",
    "require_roles",
]
