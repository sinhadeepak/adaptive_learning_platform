"""Sprint 9 A-1 — Payment HTTP fallback at JWT issuance.

Catches the dropped-NATS-payment-success edge case: a user paid via Stripe,
the webhook landed at Payment, the FSM transitioned, but the
`payment.subscription.changed` NATS message dropped before Auth's subscriber
saw it. Without this fallback, the user logs in and gets a STUDENT JWT
forever (until they hit Logout → Login again *after* a manual fix).

Invocation contract: `_issue_session` (auth/routes.py) calls
`fallback_premium_until` only when `users.premium_until IS NULL`. Premium
users with a valid `premium_until > now()` skip the HTTP round-trip; this
keeps the hot path identical to before.

Fail-open: any error (timeout, 5xx, connection refused) returns None and
Auth falls back to the row's existing premium_until (i.e., the user is
treated as free, which is the same outcome as without the fallback).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from identity.auth.config import settings

log = logging.getLogger(__name__)


async def fallback_premium_until(user_id: str) -> datetime | None:
    """Ask Payment service whether this user is premium right now.

    Returns the premium_until timestamp (the period_end), or None if the
    user is not premium / the request failed. The caller writes this back
    into auth_schema.users.premium_until so subsequent JWT issuance hits
    the fast path.
    """
    url = f"{settings.payment_base_url.rstrip('/')}/payment/internal/users/{user_id}/premium"
    try:
        async with httpx.AsyncClient(
            timeout=settings.payment_fallback_timeout_seconds
        ) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            log.warning(
                "payment fallback for %s returned HTTP %s", user_id, resp.status_code
            )
            return None
        body = resp.json()
    except Exception as e:  # noqa: BLE001
        # Connection refused, timeout, JSON decode, network blip — fail-open.
        log.info("payment fallback for %s failed (fail-open): %s", user_id, e)
        return None
    if not body.get("isPremium"):
        return None
    # Payment's /internal endpoint doesn't surface period_end yet; treat
    # the response as "premium for at least the next refresh window" so
    # the JWT carries STUDENT_PREMIUM. The next NATS message will refine
    # this to the real period_end.
    return derive_provisional_until(datetime.now(tz=timezone.utc))


def derive_provisional_until(now: datetime) -> datetime:
    """When the fallback says 'isPremium=true' but doesn't expose period_end,
    we synthesise a 24h provisional window so the JWT is correct now and
    NATS gets a chance to write the real period_end before this expires.

    Pure function — extracted so tests can pin the contract."""
    return now + timedelta(hours=24)
