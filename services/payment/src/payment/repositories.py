# ruff: noqa: S608 - schema name is a hardcoded constant
"""Persistence for payment_schema.

Three tables, three thin repos. The interesting paths:
- `webhook_events.upsert_event` — UNIQUE on stripe_event_id makes the
  webhook handler idempotent. Stripe retries up to 3 days; we mark
  `processed_at` only after the FSM transition completes successfully.
- `subscriptions.upsert_by_stripe_id` — keyed on stripe_subscription_id
  so re-running the same `customer.subscription.updated` event with a
  newer payload merges in cleanly.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "payment_schema"


# ─────────────────────────────────────────────────────────────────────────
# Customers
# ─────────────────────────────────────────────────────────────────────────


async def upsert_customer(
    session: AsyncSession,
    *,
    user_id: str,
    stripe_customer_id: str,
    tenant_id: str | None = None,
) -> dict[str, Any]:
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.customers (user_id, stripe_customer_id, tenant_id)
            VALUES (:uid, :scid, :tid)
            ON CONFLICT (user_id) DO UPDATE
              SET stripe_customer_id = EXCLUDED.stripe_customer_id,
                  tenant_id = COALESCE(EXCLUDED.tenant_id, {SCHEMA}.customers.tenant_id)
            RETURNING id, user_id, stripe_customer_id, tenant_id, created_at
            """
        ),
        {"uid": user_id, "scid": stripe_customer_id, "tid": tenant_id},
    )
    row = res.mappings().first()
    return dict(row) if row else {}


async def get_customer_by_user(
    session: AsyncSession, user_id: str
) -> dict[str, Any] | None:
    res = await session.execute(
        text(
            f"SELECT id, user_id, stripe_customer_id, tenant_id, created_at "
            f"FROM {SCHEMA}.customers WHERE user_id = :uid"
        ),
        {"uid": user_id},
    )
    row = res.mappings().first()
    return dict(row) if row else None


async def get_customer_by_stripe_id(
    session: AsyncSession, stripe_customer_id: str
) -> dict[str, Any] | None:
    res = await session.execute(
        text(
            f"SELECT id, user_id, stripe_customer_id, tenant_id, created_at "
            f"FROM {SCHEMA}.customers WHERE stripe_customer_id = :scid"
        ),
        {"scid": stripe_customer_id},
    )
    row = res.mappings().first()
    return dict(row) if row else None


# ─────────────────────────────────────────────────────────────────────────
# Subscriptions
# ─────────────────────────────────────────────────────────────────────────


async def upsert_subscription(
    session: AsyncSession,
    *,
    customer_id: str,
    stripe_subscription_id: str,
    status: str,
    period_end: datetime | None,
    cancel_at_period_end: bool = False,
    tier: str = "STUDENT_PREMIUM",
) -> dict[str, Any]:
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.subscriptions
              (customer_id, stripe_subscription_id, status, tier, period_end, cancel_at_period_end)
            VALUES (:cid, :ssid, :status, :tier, :pe, :cape)
            ON CONFLICT (stripe_subscription_id) DO UPDATE
              SET status = EXCLUDED.status,
                  tier = EXCLUDED.tier,
                  period_end = EXCLUDED.period_end,
                  cancel_at_period_end = EXCLUDED.cancel_at_period_end,
                  updated_at = now()
            RETURNING id, customer_id, stripe_subscription_id, status, tier,
                      period_end, cancel_at_period_end, created_at, updated_at
            """
        ),
        {
            "cid": customer_id,
            "ssid": stripe_subscription_id,
            "status": status,
            "tier": tier,
            "pe": period_end,
            "cape": cancel_at_period_end,
        },
    )
    row = res.mappings().first()
    return dict(row) if row else {}


async def latest_subscription_for_user(
    session: AsyncSession, user_id: str
) -> dict[str, Any] | None:
    """Pick the most-recently-updated subscription for a user. The JWT
    issuer + /payment/me both ask for this; we don't expose multiple
    concurrent subs in the API surface."""
    res = await session.execute(
        text(
            f"""
            SELECT s.id, s.customer_id, s.stripe_subscription_id, s.status, s.tier,
                   s.period_end, s.cancel_at_period_end, s.created_at, s.updated_at
              FROM {SCHEMA}.subscriptions s
              JOIN {SCHEMA}.customers c ON c.id = s.customer_id
             WHERE c.user_id = :uid
          ORDER BY s.updated_at DESC
             LIMIT 1
            """
        ),
        {"uid": user_id},
    )
    row = res.mappings().first()
    return dict(row) if row else None


# ─────────────────────────────────────────────────────────────────────────
# Webhook events (idempotency log)
# ─────────────────────────────────────────────────────────────────────────


async def upsert_event(
    session: AsyncSession,
    *,
    stripe_event_id: str,
    event_type: str,
    payload: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    """Returns (row, created). When `created` is False, this exact event
    has been seen before and the handler must short-circuit (Stripe
    redelivers up to 3 days)."""
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.webhook_events (stripe_event_id, event_type, payload)
            VALUES (:eid, :et, CAST(:p AS JSONB))
            ON CONFLICT (stripe_event_id) DO NOTHING
            RETURNING id, stripe_event_id, event_type, payload, processed_at, received_at
            """
        ),
        {"eid": stripe_event_id, "et": event_type, "p": json.dumps(payload)},
    )
    row = res.mappings().first()
    if row:
        return dict(row), True
    existing = (
        await session.execute(
            text(
                f"SELECT id, stripe_event_id, event_type, payload, processed_at, received_at "
                f"FROM {SCHEMA}.webhook_events WHERE stripe_event_id = :eid"
            ),
            {"eid": stripe_event_id},
        )
    ).mappings().first()
    return (dict(existing) if existing else {}), False


async def mark_event_processed(session: AsyncSession, stripe_event_id: str) -> None:
    await session.execute(
        text(
            f"UPDATE {SCHEMA}.webhook_events SET processed_at = now() "
            f"WHERE stripe_event_id = :eid"
        ),
        {"eid": stripe_event_id},
    )
