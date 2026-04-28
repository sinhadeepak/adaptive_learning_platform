"""Sprint 11 S11-A — signed invite tokens.

Token shape: `<random>.<hmac>` where:
  - `<random>` is 16 url-safe bytes (educator can paste this part of the
    URL on Slack and it's the unique row key in cohort_invites).
  - `<hmac>` is HMAC-SHA256(JWT_SECRET, random) truncated to 16 bytes.

Why HMAC rather than a pure random token: defense in depth. Without the
HMAC, a leaked DB read would let an attacker brute-force token strings
to find live invites. With HMAC, even if they enumerate `random` values,
they can't forge the signature without the shared secret.

The full token (`random.hmac`) is what we store in `cohort_invites.token`
AND what the URL surfaces. Verification rebuilds the HMAC over the
random part and constant-time compares.
"""

from __future__ import annotations

import hmac
import secrets
from hashlib import sha256


def generate_invite_token(secret: str) -> str:
    """Returns a `<random>.<hmac>` URL-safe string. Suitable for embedding
    in a public link — the HMAC tail makes brute-force enumeration of
    valid tokens infeasible without the server's secret."""
    random_part = secrets.token_urlsafe(12)
    sig = _sign(random_part, secret)
    return f"{random_part}.{sig}"


def verify_invite_token(token: str, secret: str) -> bool:
    """Constant-time check that the HMAC tail matches the random head.

    Returns False on any malformed input — this is the only signature
    check the claim flow relies on, so wrong inputs must NOT raise."""
    if not token or "." not in token:
        return False
    random_part, _, sig = token.rpartition(".")
    if not random_part or not sig:
        return False
    expected = _sign(random_part, secret)
    return hmac.compare_digest(sig, expected)


def _sign(payload: str, secret: str) -> str:
    """Truncated HMAC-SHA256, URL-safe base64 without padding."""
    raw = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), sha256).digest()
    # 16 bytes = 128 bits, plenty for this surface.
    import base64

    return base64.urlsafe_b64encode(raw[:16]).rstrip(b"=").decode("ascii")
