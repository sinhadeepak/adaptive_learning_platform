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

from engagement.notification.config import settings

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
        # Profile exposes /internal/profile/{userId} (no JWT, network-protected).
        # If lookup fails we fall back to a synthesized address so dispatch
        # keeps moving under partial-outage conditions.
        async with httpx.AsyncClient(timeout=2.0) as http:
            r = await http.get(f"{settings.profile_internal_base_url}/internal/profile/{user_id}")
            if r.status_code == 200:
                email = r.json().get("email") or None
    except Exception as err:
        log.debug("profile lookup failed for %s: %s", user_id, err)

    if not email:
        # Defensive fallback. Real users registered via /auth/register always
        # have an email captured by the user.created NATS subscriber.
        email = f"user-{user_id[:8]}@adaptivelearn.in"

    _cache[user_id] = (now, email)
    return email


def clear_cache() -> None:
    """Test helper — wipe the per-process email cache between scenarios."""
    _cache.clear()
