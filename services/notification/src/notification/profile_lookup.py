"""Cheap user-email lookup against the Profile service.

The dispatcher needs a `to` address per notification. Quiz publishes
quiz.session.completed with only the user_id; rather than thread the email
through every event payload, we look it up here and cache for 5 min.

Sprint 4 promotes this to a richer addressbook (with phone for SMS, FCM
token for push). Today email is the only channel actively dispatching.
"""

from __future__ import annotations

import logging
import time

import httpx

from notification.config import settings

log = logging.getLogger(__name__)

_TTL = 300.0  # 5 min
_cache: dict[str, tuple[float, str | None]] = {}


async def email_for(user_id: str) -> str | None:
    """Return the email registered for `user_id`, or None if unknown.

    Profile service exposes /profile/{user_id} (Sprint 4 addition); until
    that lands we fall through to the placeholder dev address so Mailpit
    still captures something for the demo.
    """
    now = time.monotonic()
    cached = _cache.get(user_id)
    if cached is not None and now - cached[0] < _TTL:
        return cached[1]

    email: str | None = None
    try:
        # Profile has /profile/me (auth-required). Sprint 4 adds
        # /profile/{userId} for service-to-service lookup. For closed-beta
        # demo we fall back to a synthesized address derived from user_id.
        async with httpx.AsyncClient(timeout=2.0) as http:
            r = await http.get(f"http://user-profile:8000/profile/{user_id}")
            if r.status_code == 200:
                email = r.json().get("email")
    except Exception as err:  # noqa: BLE001
        log.debug("profile lookup failed for %s: %s", user_id, err)

    if not email:
        # Closed-beta fallback so Mailpit captures a recipient instead of
        # silently dropping. Sprint 4 hard-fails here once the
        # /profile/{userId} endpoint is live.
        email = f"user-{user_id[:8]}@adaptivelearn.in"

    _cache[user_id] = (now, email)
    return email


def clear_cache() -> None:
    """Test helper — wipe the per-process email cache between scenarios."""
    _cache.clear()
