"""Repository tests for the payment service — DB-backed.

The interesting paths for Stripe-driven flows:
- `upsert_event` is the linchpin of webhook idempotency. Stripe redelivers
  for up to 3 days; the second insert of the same stripe_event_id must
  return (existing_row, created=False) so the handler short-circuits.
- `upsert_customer` keys on user_id (one customer per user) — re-running
  Checkout for the same user with a new Stripe customer id replaces it.
- `upsert_subscription` keys on stripe_subscription_id so applying a
  newer `customer.subscription.updated` payload merges in cleanly.
- `latest_subscription_for_user` joins customers → subscriptions and
  picks the most-recently-updated row, which is what /payment/me returns.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from payment.repositories import (
    SCHEMA,
    get_customer_by_stripe_id,
    get_customer_by_user,
    latest_subscription_for_user,
    mark_event_processed,
    upsert_customer,
    upsert_event,
    upsert_subscription,
)

os.environ.setdefault(
    "PAYMENT_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/payment",
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(os.environ["PAYMENT_DATABASE_URL"])
    sm = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    f"TRUNCATE {SCHEMA}.webhook_events, {SCHEMA}.subscriptions, "
                    f"{SCHEMA}.customers RESTART IDENTITY CASCADE"
                )
            )
        async with sm() as s:
            yield s
    finally:
        await engine.dispose()


def _uid() -> str:
    return str(uuid.uuid4())


def _stripe_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:14]}"


# ─────────────────────────────────────────────────────────────────────────
# customers
# ─────────────────────────────────────────────────────────────────────────


async def test_upsert_customer_inserts_new_row(session: AsyncSession) -> None:
    user = _uid()
    cust_id = _stripe_id("cus")
    row = await upsert_customer(
        session, user_id=user, stripe_customer_id=cust_id, tenant_id=None
    )
    await session.commit()
    assert row["user_id"] == uuid.UUID(user)
    assert row["stripe_customer_id"] == cust_id
    assert row["tenant_id"] is None


async def test_upsert_customer_is_idempotent_on_user_id(session: AsyncSession) -> None:
    """User clicking 'Upgrade' twice (fast double-click; Stripe drops the
    first session before mounting the iframe) shouldn't blow up — the second
    upsert should overwrite the stripe_customer_id mapping."""
    user = _uid()
    first = _stripe_id("cus")
    second = _stripe_id("cus")
    await upsert_customer(session, user_id=user, stripe_customer_id=first)
    await upsert_customer(session, user_id=user, stripe_customer_id=second)
    await session.commit()
    got = await get_customer_by_user(session, user)
    assert got is not None
    assert got["stripe_customer_id"] == second


async def test_get_customer_by_user_returns_none_when_absent(
    session: AsyncSession,
) -> None:
    assert await get_customer_by_user(session, _uid()) is None


async def test_get_customer_by_stripe_id_round_trip(session: AsyncSession) -> None:
    user = _uid()
    cust_id = _stripe_id("cus")
    await upsert_customer(session, user_id=user, stripe_customer_id=cust_id)
    await session.commit()
    got = await get_customer_by_stripe_id(session, cust_id)
    assert got is not None
    assert got["user_id"] == uuid.UUID(user)


async def test_upsert_customer_preserves_tenant_id_when_omitted(
    session: AsyncSession,
) -> None:
    """COALESCE keeps the existing tenant_id if the second upsert doesn't
    pass one (the webhook path doesn't have tenant context)."""
    user = _uid()
    tenant = _uid()
    await upsert_customer(
        session,
        user_id=user,
        stripe_customer_id=_stripe_id("cus"),
        tenant_id=tenant,
    )
    await upsert_customer(
        session,
        user_id=user,
        stripe_customer_id=_stripe_id("cus"),
        tenant_id=None,
    )
    await session.commit()
    got = await get_customer_by_user(session, user)
    assert got is not None
    assert got["tenant_id"] == uuid.UUID(tenant)


# ─────────────────────────────────────────────────────────────────────────
# subscriptions
# ─────────────────────────────────────────────────────────────────────────


async def test_upsert_subscription_inserts_then_updates_in_place(
    session: AsyncSession,
) -> None:
    """Webhook flow: subscription.created fires first (status=ACTIVE),
    then subscription.updated arrives later (status=PAST_DUE). Both must
    target the same row."""
    user = _uid()
    cust = await upsert_customer(
        session, user_id=user, stripe_customer_id=_stripe_id("cus")
    )
    sub_id = _stripe_id("sub")
    period_end = datetime.now(tz=UTC) + timedelta(days=30)
    first = await upsert_subscription(
        session,
        customer_id=str(cust["id"]),
        stripe_subscription_id=sub_id,
        status="ACTIVE",
        period_end=period_end,
    )
    second = await upsert_subscription(
        session,
        customer_id=str(cust["id"]),
        stripe_subscription_id=sub_id,
        status="PAST_DUE",
        period_end=period_end,
    )
    await session.commit()
    assert first["id"] == second["id"]  # same row
    assert second["status"] == "PAST_DUE"


async def test_latest_subscription_returns_none_for_unknown_user(
    session: AsyncSession,
) -> None:
    assert await latest_subscription_for_user(session, _uid()) is None


async def test_latest_subscription_picks_most_recent(session: AsyncSession) -> None:
    """If a user churned then re-subscribed, the latest sub is the one we
    return — that drives /payment/me + /internal/users/{id}/premium.

    Commit between upserts so `now()` advances and ORDER BY updated_at DESC
    has distinct values to compare; in production the two events land in
    different transactions naturally (separate webhook deliveries)."""
    import asyncio

    user = _uid()
    cust = await upsert_customer(
        session, user_id=user, stripe_customer_id=_stripe_id("cus")
    )
    older_end = datetime.now(tz=UTC) - timedelta(days=5)
    newer_end = datetime.now(tz=UTC) + timedelta(days=25)
    await upsert_subscription(
        session,
        customer_id=str(cust["id"]),
        stripe_subscription_id=_stripe_id("sub"),
        status="CANCELED",
        period_end=older_end,
    )
    await session.commit()
    await asyncio.sleep(0.01)  # ensure now() advances at ms granularity
    await upsert_subscription(
        session,
        customer_id=str(cust["id"]),
        stripe_subscription_id=_stripe_id("sub"),
        status="ACTIVE",
        period_end=newer_end,
    )
    await session.commit()
    got = await latest_subscription_for_user(session, user)
    assert got is not None
    assert got["status"] == "ACTIVE"


# ─────────────────────────────────────────────────────────────────────────
# webhook_events idempotency
# ─────────────────────────────────────────────────────────────────────────


async def test_upsert_event_first_time_returns_created_true(
    session: AsyncSession,
) -> None:
    eid = f"evt_{uuid.uuid4().hex}"
    row, created = await upsert_event(
        session,
        stripe_event_id=eid,
        event_type="customer.subscription.created",
        payload={"id": eid, "type": "customer.subscription.created"},
    )
    await session.commit()
    assert created is True
    assert row["stripe_event_id"] == eid


async def test_upsert_event_replay_returns_created_false(
    session: AsyncSession,
) -> None:
    """Stripe redelivers up to 3 days. The second upsert of the same
    event_id must signal duplicate so the handler short-circuits before
    re-running the FSM."""
    eid = f"evt_{uuid.uuid4().hex}"
    payload = {"id": eid, "type": "invoice.payment_succeeded"}
    _, first = await upsert_event(
        session, stripe_event_id=eid, event_type="invoice.payment_succeeded", payload=payload
    )
    await session.commit()
    row, second = await upsert_event(
        session, stripe_event_id=eid, event_type="invoice.payment_succeeded", payload=payload
    )
    await session.commit()
    assert first is True
    assert second is False
    assert row["stripe_event_id"] == eid


async def test_mark_event_processed_sets_timestamp(session: AsyncSession) -> None:
    eid = f"evt_{uuid.uuid4().hex}"
    await upsert_event(
        session, stripe_event_id=eid, event_type="x", payload={"id": eid}
    )
    await mark_event_processed(session, eid)
    await session.commit()
    res = await session.execute(
        text(
            f"SELECT processed_at FROM {SCHEMA}.webhook_events "
            f"WHERE stripe_event_id = :eid"
        ),
        {"eid": eid},
    )
    row = res.mappings().first()
    assert row is not None
    assert row["processed_at"] is not None
