from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException

from alp_auth import Principal, claims_from_bearer, make_current_principal, require_roles

SECRET = "unit-test-secret-at-least-32-bytes-long!!"


def _bearer(**overrides) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": "user-1",
        "role": "STUDENT",
        "token_type": "access",
        "exp": int((now + timedelta(minutes=15)).timestamp()),
    }
    payload.update(overrides)
    return "Bearer " + jwt.encode(payload, SECRET, algorithm="HS256")


def test_claims_from_bearer_happy_path() -> None:
    claims = claims_from_bearer(_bearer(), SECRET)
    assert claims["sub"] == "user-1"


def test_missing_header_is_401_missing_bearer() -> None:
    with pytest.raises(HTTPException) as exc:
        claims_from_bearer(None, SECRET)
    assert exc.value.status_code == 401
    assert exc.value.detail["code"] == "missing_bearer"


def test_non_bearer_scheme_is_401() -> None:
    with pytest.raises(HTTPException) as exc:
        claims_from_bearer("Basic abc123", SECRET)
    assert exc.value.status_code == 401


def test_bad_token_maps_to_401() -> None:
    with pytest.raises(HTTPException) as exc:
        claims_from_bearer(_bearer(token_type="refresh"), SECRET)
    assert exc.value.status_code == 401
    assert exc.value.detail["code"] == "wrong_token_type"


async def test_make_current_principal_reads_secret_at_request_time() -> None:
    dep = make_current_principal(lambda: SECRET)
    principal = await dep(authorization=_bearer(role="TEACHER", tenant_id="t-9"))
    assert isinstance(principal, Principal)
    assert principal.user_id == "user-1"
    assert principal.role == "TEACHER"
    assert principal.tenant_id == "t-9"


def test_require_roles_allows_and_forbids() -> None:
    p = Principal(user_id="u", role="MODERATOR", tenant_id=None)
    assert require_roles(p, "MODERATOR", "PLATFORM_ADMIN") is p
    with pytest.raises(HTTPException) as exc:
        require_roles(p, "PLATFORM_ADMIN")
    assert exc.value.status_code == 403
