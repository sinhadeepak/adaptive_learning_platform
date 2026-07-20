from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest

from alp_auth import (
    DEFAULT_DEV_SECRET,
    AuthError,
    assert_secret_configured,
    decode_access_token,
)

SECRET = "unit-test-secret-at-least-32-bytes-long!!"


def _token(secret: str = SECRET, **overrides) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": "user-1",
        "role": "STUDENT",
        "token_type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=15)).timestamp()),
    }
    payload.update(overrides)
    # Allow tests to delete a claim by passing it as ``None``.
    payload = {k: v for k, v in payload.items() if v is not None}
    return jwt.encode(payload, secret, algorithm="HS256")


def test_valid_access_token_returns_claims() -> None:
    claims = decode_access_token(_token(), SECRET)
    assert claims["sub"] == "user-1"
    assert claims["role"] == "STUDENT"


def test_wrong_signature_is_invalid_token() -> None:
    with pytest.raises(AuthError) as exc:
        decode_access_token(_token(), "a-different-secret-value-of-length-32ish")
    assert exc.value.code == "invalid_token"


def test_expired_token_reports_token_expired() -> None:
    now = datetime.now(tz=timezone.utc)
    stale = _token(exp=int((now - timedelta(minutes=1)).timestamp()))
    with pytest.raises(AuthError) as exc:
        decode_access_token(stale, SECRET)
    assert exc.value.code == "token_expired"


def test_refresh_token_type_is_rejected() -> None:
    # This is the gap the lib closes: a non-access token must not verify.
    with pytest.raises(AuthError) as exc:
        decode_access_token(_token(token_type="refresh"), SECRET)
    assert exc.value.code == "wrong_token_type"


def test_missing_token_type_is_rejected() -> None:
    with pytest.raises(AuthError) as exc:
        decode_access_token(_token(token_type=None), SECRET)
    assert exc.value.code == "wrong_token_type"


def test_missing_sub_is_rejected() -> None:
    with pytest.raises(AuthError) as exc:
        decode_access_token(_token(sub=None), SECRET)
    assert exc.value.code == "invalid_token"


def test_require_token_type_none_allows_any() -> None:
    claims = decode_access_token(_token(token_type="refresh"), SECRET, require_token_type=None)
    assert claims["sub"] == "user-1"


@pytest.mark.parametrize("env", ["local", "test"])
def test_secret_guard_allows_default_in_local(env: str) -> None:
    # Must not raise.
    assert_secret_configured(DEFAULT_DEV_SECRET, env)


@pytest.mark.parametrize("env", ["staging", "production"])
def test_secret_guard_rejects_default_outside_local(env: str) -> None:
    with pytest.raises(AuthError) as exc:
        assert_secret_configured(DEFAULT_DEV_SECRET, env)
    assert exc.value.code == "insecure_jwt_secret"


def test_secret_guard_rejects_empty_secret_outside_local() -> None:
    with pytest.raises(AuthError):
        assert_secret_configured("", "production")


def test_secret_guard_allows_real_secret_outside_local() -> None:
    assert_secret_configured("a-properly-overridden-production-secret", "production")
