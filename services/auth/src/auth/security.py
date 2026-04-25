"""Password hashing + JWT issue/verify + OTP helpers."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import bcrypt
import jwt

from auth.config import settings

ALGORITHM = "HS256"


def hash_password(plaintext: str) -> str:
    return bcrypt.hashpw(plaintext.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plaintext: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plaintext.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def issue_access_token(*, user_id: str, role: str, tenant_id: str | None, onboarding_state: str) -> tuple[str, int]:
    """Return (token, epoch_millis_expires_at)."""
    now = datetime.now(tz=timezone.utc)
    exp = now + timedelta(seconds=settings.jwt_access_ttl_seconds)
    payload: dict[str, Any] = {
        "sub": user_id,
        "role": role,
        "onboarding_state": onboarding_state,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "jti": secrets.token_urlsafe(12),
        "token_type": "access",
    }
    if tenant_id is not None:
        payload["tenant_id"] = tenant_id
    token = jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)
    return token, int(exp.timestamp() * 1000)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])


def generate_refresh_token() -> str:
    # 256-bit URL-safe string; hashed before storage.
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def refresh_expires_at(*, remember: bool) -> datetime:
    seconds = settings.jwt_refresh_ttl_seconds_remember if remember else settings.jwt_refresh_ttl_seconds
    return datetime.now(tz=timezone.utc) + timedelta(seconds=seconds)


def generate_otp() -> str:
    # N-digit numeric OTP, zero-padded. `secrets.randbelow` for cryptographic randomness.
    n = settings.otp_length
    return f"{secrets.randbelow(10**n):0{n}d}"


def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()


OtpChannel = Literal["email", "sms"]
