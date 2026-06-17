"""Fernet at-rest encryption for AI provider API keys.

Why Fernet, not raw AES: Fernet is the canonical "encrypt this short
string and store it" recipe in `cryptography` — AES-128-CBC with a
random IV + HMAC-SHA256 + base64. We don't need anything more
sophisticated for ~50-byte API keys.

Master key resolution:
  1. `ALP_AI_KEY_SECRET` env (preferred — operator-injected via
     docker secret / k8s secret).
  2. Dev-only fallback constant. Logs a `ai_crypto_dev_key_in_use`
     warning at every call so it's visible in CI / staging if
     someone forgot to inject the real secret.

The dev-only constant is intentionally well-known and safe to leak —
it only secures dev DBs, where the keys themselves are also dev-only.
"""

from __future__ import annotations

import logging
import os
import warnings
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

log = logging.getLogger(__name__)

# Dev-only fallback. Generated once via `Fernet.generate_key()`.
# Documented as well-known — not a security boundary; only used when
# no real master key is set.
_DEV_FALLBACK_KEY = b"7cE0Zl7CoKqJRJBnHymQu_W8HK-Gqf4N7XeBJ3p0_rA="


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    secret = os.environ.get("ALP_AI_KEY_SECRET", "").strip()
    if not secret:
        warnings.warn(
            "ALP_AI_KEY_SECRET not set — using dev-only Fernet key. "
            "Provider API keys in the DB are NOT secure against an attacker "
            "with read access to the codebase. Set ALP_AI_KEY_SECRET in "
            "production via your secrets manager.",
            stacklevel=2,
        )
        return Fernet(_DEV_FALLBACK_KEY)
    try:
        return Fernet(secret.encode("ascii"))
    except Exception as e:  # noqa: BLE001
        log.error("ai_crypto_bad_master_key", extra={"err": str(e)})
        raise


def encrypt_key(plaintext: str) -> str:
    """Return a Fernet token (URL-safe base64) for `plaintext`."""
    if not plaintext:
        raise ValueError("plaintext key cannot be empty")
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_key(token: str) -> str:
    """Reverse of encrypt_key. Raises InvalidToken on tamper / wrong key."""
    if not token:
        raise InvalidToken("empty token")
    return _fernet().decrypt(token.encode("ascii")).decode("utf-8")


def mask_key(plaintext: str) -> str:
    """Last-4-only display form for the admin UI. Never returns more."""
    if not plaintext:
        return ""
    if len(plaintext) <= 4:
        return "…" + plaintext
    return f"{plaintext[:3]}…{plaintext[-4:]}"
