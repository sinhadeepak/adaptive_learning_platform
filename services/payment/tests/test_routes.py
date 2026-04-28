"""Route tests for /payment/* — covers the stub-mode happy path that
exercises Checkout, the webhook (with FSM transition + idempotency), and
both /payment/me + /internal/users/{id}/premium.

Stripe is stubbed out via STRIPE_API_KEY="" — the routes detect this and
return a synthetic `cs_stub_<id>` session id. Webhook signature verification
is bypassed when STRIPE_WEBHOOK_SECRET is unset, so we POST raw JSON.
"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import AsyncIterator

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from payment.config import settings
from payment.main import app
from payment.repositories import SCHEMA

os.environ.setdefault(
    "PAYMENT_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/payment",
)

pytestmark = pytest.mark.asyncio


def _bearer(user_id: str | None = None, role: str = "STUDENT") -> str:
    token = jwt.encode(
        {"sub": user_id or str(uuid.uuid4()), "role": role, "email": "t@example.com"},
        settings.jwt_secret,
        algorithm="HS256",
    )
    return f"Bearer {token}"


@pytest_asyncio.fixture
async def truncated() -> AsyncIterator[None]:
    """Wipe payment tables before each test — routes share state via DB.

    Also dispose the module-level engine in payment.db so the next ASGI
    request (running in this test's event loop) creates a fresh engine —
    avoids the cross-loop asyncpg "another operation in progress" bug
    the doubts conftest already warned about."""
    from payment import db as payment_db

    await payment_db.dispose()
    engine = create_async_engine(os.environ["PAYMENT_DATABASE_URL"])
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    f"TRUNCATE {SCHEMA}.webhook_events, {SCHEMA}.subscriptions, "
                    f"{SCHEMA}.customers RESTART IDENTITY CASCADE"
                )
            )
        yield
    finally:
        await engine.dispose()
        await payment_db.dispose()


@pytest_asyncio.fixture
async def client(truncated: None) -> AsyncIterator[AsyncClient]:  # noqa: ARG001
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[any]:  # type: ignore[valid-type]
    engine = create_async_engine(os.environ["PAYMENT_DATABASE_URL"])
    sm = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with sm() as s:
            yield s
    finally:
        await engine.dispose()


# ─────────────────────────────────────────────────────────────────────────
# /payment/checkout/session — stub mode
# ─────────────────────────────────────────────────────────────────────────


async def test_checkout_session_requires_bearer(client: AsyncClient) -> None:
    r = await client.post("/payment/checkout/session", json={"plan": "premium_monthly"})
    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "missing_token"


async def test_checkout_session_stub_mode_returns_synthetic_id(
    client: AsyncClient,
) -> None:
    """No STRIPE_API_KEY → routes should issue a `cs_stub_<id>` session
    and persist a `cus_stub_<id>` customer mapping for the user."""
    user = str(uuid.uuid4())
    r = await client.post(
        "/payment/checkout/session",
        json={"plan": "premium_monthly"},
        headers={"Authorization": _bearer(user)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["stripeMode"] == "stub"
    assert body["sessionId"].startswith("cs_stub_")
    # The success_url substitution is wired so the post-checkout lander
    # can pick up the session id from the URL.
    assert body["sessionId"] in body["url"]


# ─────────────────────────────────────────────────────────────────────────
# /payment/webhook — idempotent FSM
# ─────────────────────────────────────────────────────────────────────────


async def _prime_customer(client: AsyncClient, user: str) -> str:
    """Create a customer via the stub Checkout flow and return the
    stripe_customer_id we'd get sent in subsequent webhook payloads."""
    await client.post(
        "/payment/checkout/session",
        json={"plan": "premium_monthly"},
        headers={"Authorization": _bearer(user)},
    )
    # Grab the stub customer id we just persisted.
    engine = create_async_engine(os.environ["PAYMENT_DATABASE_URL"])
    try:
        async with engine.connect() as conn:
            res = await conn.execute(
                text(
                    f"SELECT stripe_customer_id FROM {SCHEMA}.customers "
                    f"WHERE user_id = :uid"
                ),
                {"uid": user},
            )
            row = res.mappings().first()
            assert row is not None
            return row["stripe_customer_id"]
    finally:
        await engine.dispose()


async def test_webhook_subscription_created_activates_user(
    client: AsyncClient,
) -> None:
    user = str(uuid.uuid4())
    cust = await _prime_customer(client, user)
    event_id = f"evt_{uuid.uuid4().hex}"
    sub_id = f"sub_{uuid.uuid4().hex[:14]}"
    payload = {
        "id": event_id,
        "type": "customer.subscription.created",
        "data": {
            "object": {
                "id": sub_id,
                "customer": cust,
                "status": "active",
                "current_period_end": 1893456000,  # 2030-01-01 UTC
                "cancel_at_period_end": False,
            }
        },
    }
    r = await client.post(
        "/payment/webhook",
        content=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["tracked"] is True
    assert body["newState"] == "ACTIVE"

    # /payment/me should now show premium.
    me = await client.get(
        "/payment/me", headers={"Authorization": _bearer(user)}
    )
    assert me.status_code == 200
    assert me.json()["isPremium"] is True
    assert me.json()["status"] == "ACTIVE"


async def test_webhook_idempotent_on_duplicate_event_id(
    client: AsyncClient,
) -> None:
    """Stripe redelivers up to 3 days. The second POST with the same event
    id must short-circuit and return `duplicate: true`."""
    user = str(uuid.uuid4())
    cust = await _prime_customer(client, user)
    event_id = f"evt_{uuid.uuid4().hex}"
    sub_id = f"sub_{uuid.uuid4().hex[:14]}"
    payload = {
        "id": event_id,
        "type": "customer.subscription.created",
        "data": {
            "object": {
                "id": sub_id,
                "customer": cust,
                "status": "active",
                "current_period_end": 1893456000,
                "cancel_at_period_end": False,
            }
        },
    }
    raw = json.dumps(payload).encode()
    r1 = await client.post(
        "/payment/webhook", content=raw, headers={"content-type": "application/json"}
    )
    r2 = await client.post(
        "/payment/webhook", content=raw, headers={"content-type": "application/json"}
    )
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r2.json().get("duplicate") is True


async def test_webhook_signature_required_when_secret_set(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When STRIPE_WEBHOOK_SECRET is set, the route must verify the
    `stripe-signature` header. A missing/bad signature → 400."""
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_test")
    r = await client.post(
        "/payment/webhook",
        content=b'{"id":"evt_x","type":"x"}',
        headers={"content-type": "application/json"},
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "invalid_signature"


async def test_webhook_unknown_event_is_acked_not_tracked(
    client: AsyncClient,
) -> None:
    """`invoice.upcoming` isn't part of our FSM. We ACK 200 so Stripe stops
    retrying, but `tracked: false` so future audits know we didn't act."""
    payload = {"id": f"evt_{uuid.uuid4().hex}", "type": "invoice.upcoming", "data": {"object": {}}}
    r = await client.post(
        "/payment/webhook",
        content=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
    )
    assert r.status_code == 200
    assert r.json()["tracked"] is False


# ─────────────────────────────────────────────────────────────────────────
# /payment/me + /internal/users/{id}/premium
# ─────────────────────────────────────────────────────────────────────────


async def test_me_returns_free_tier_for_unsubscribed_user(
    client: AsyncClient,
) -> None:
    user = str(uuid.uuid4())
    r = await client.get(
        "/payment/me", headers={"Authorization": _bearer(user)}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["isPremium"] is False
    assert body["tier"] == "STUDENT_FREE"
    assert body["status"] == "INACTIVE"


async def test_internal_premium_check_for_unknown_user(client: AsyncClient) -> None:
    r = await client.get(f"/internal/users/{uuid.uuid4()}/premium")
    # Note: this endpoint is registered under /payment via the router prefix.
    if r.status_code == 404:
        # Router prefix means full path is /payment/internal/users/{id}/premium.
        r = await client.get(f"/payment/internal/users/{uuid.uuid4()}/premium")
    assert r.status_code == 200
    body = r.json()
    assert body["isPremium"] is False
    assert body["tier"] == "STUDENT_FREE"
