"""FastAPI routes for /payment/* — Stripe Checkout + webhook + /me.

Heuristic-fallback pattern: when STRIPE_API_KEY is unset (local dev,
unit tests), the Stripe SDK calls are short-circuited and a synthetic
checkout URL is returned that, when "completed" client-side, can be
manually wired by hitting the webhook endpoint with a fake event payload.
This lets the entire flow be exercised against a stack without a real
Stripe account.
"""

from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from payment.config import settings
from payment.db import sessionmaker
from payment.fsm import IllegalTransition, State, derive_target, is_premium, transition
from payment.repositories import (
    get_customer_by_stripe_id,
    get_customer_by_user,
    latest_subscription_for_user,
    mark_event_processed,
    upsert_customer,
    upsert_event,
    upsert_subscription,
)
from payment.security import JwtPrincipal, current_principal

log = logging.getLogger(__name__)
router = APIRouter(prefix="/payment", tags=["payment"])


async def _session() -> Any:
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]
PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


# ─────────────────────────────────────────────────────────────────────────
# /payment/checkout/session — start a Stripe Checkout
# ─────────────────────────────────────────────────────────────────────────


class CheckoutSessionRequest(BaseModel):
    plan: str = Field(default="premium_monthly")  # or premium_yearly
    tenantId: str | None = None


class CheckoutSessionResponse(BaseModel):
    sessionId: str
    url: str
    stripeMode: str  # "live" if real, "stub" when no API key (local dev)


@router.post("/checkout/session", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    body: CheckoutSessionRequest,
    session: SessionDep,
    principal: PrincipalDep,
) -> CheckoutSessionResponse:
    price_id = (
        settings.stripe_price_id_premium_yearly
        if body.plan == "premium_yearly"
        else settings.stripe_price_id_premium_monthly
    )
    if settings.stripe_api_key:
        # Real Stripe path
        import stripe

        stripe.api_key = settings.stripe_api_key
        # Reuse existing customer if we have one mapped.
        existing = await get_customer_by_user(session, principal.user_id)
        customer_kwargs: dict[str, Any] = {}
        if existing:
            customer_kwargs["customer"] = existing["stripe_customer_id"]
        else:
            email = principal.claims.get("email")
            stripe_customer = stripe.Customer.create(
                email=email or None,
                metadata={"user_id": principal.user_id, "tenant_id": body.tenantId or ""},
            )
            await upsert_customer(
                session,
                user_id=principal.user_id,
                stripe_customer_id=stripe_customer["id"],
                tenant_id=body.tenantId,
            )
            await session.commit()
            customer_kwargs["customer"] = stripe_customer["id"]

        sess = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=settings.checkout_success_url,
            cancel_url=settings.checkout_cancel_url,
            metadata={"user_id": principal.user_id, "tenant_id": body.tenantId or ""},
            **customer_kwargs,
        )
        return CheckoutSessionResponse(
            sessionId=sess["id"], url=sess["url"], stripeMode="live"
        )

    # Stub path — no real Stripe. Issue a synthetic session id so the
    # client redirect flow still works against a local stack. The webhook
    # endpoint accepts a stub-mode event with this same session id.
    stub_session_id = f"cs_stub_{secrets.token_urlsafe(8)}"
    stub_customer_id = f"cus_stub_{secrets.token_urlsafe(8)}"
    await upsert_customer(
        session,
        user_id=principal.user_id,
        stripe_customer_id=stub_customer_id,
        tenant_id=body.tenantId,
    )
    await session.commit()
    # Local dev convenience: redirect-back URL with the synthetic id so
    # the post-checkout lander can poll /payment/me and see the stub.
    url = settings.checkout_success_url.replace("{CHECKOUT_SESSION_ID}", stub_session_id)
    return CheckoutSessionResponse(sessionId=stub_session_id, url=url, stripeMode="stub")


# ─────────────────────────────────────────────────────────────────────────
# /payment/webhook — Stripe webhook receiver
# ─────────────────────────────────────────────────────────────────────────


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    session: SessionDep,
    stripe_signature: Annotated[str | None, Header(alias="stripe-signature")] = None,
) -> dict:
    """Stripe webhook receiver. Verifies signature when STRIPE_WEBHOOK_SECRET
    is set; bypasses verification in stub mode (local dev). Idempotent on
    `stripe_event_id` so Stripe retries (up to 3 days) are no-ops."""
    raw = await request.body()
    if settings.stripe_webhook_secret:
        import stripe

        try:
            event = stripe.Webhook.construct_event(
                raw.decode("utf-8"), stripe_signature or "", settings.stripe_webhook_secret
            )
        except Exception as e:  # noqa: BLE001
            log.warning("stripe webhook signature failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_signature", "message": "Bad signature"},
            ) from e
    else:
        # Stub mode — accept the JSON as-is. The dev tool uses
        # `stripe-event-id: evt_stub_<id>` and emits the standard event
        # body shape.
        try:
            import json

            event = json.loads(raw.decode("utf-8") or "{}")
        except Exception as e:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_payload", "message": str(e)},
            ) from e

    event_id = event.get("id") or f"evt_{uuid.uuid4()}"
    event_type = event.get("type") or ""
    payload = event.get("data", {}).get("object") or {}

    _row, created = await upsert_event(
        session,
        stripe_event_id=event_id,
        event_type=event_type,
        payload=event,
    )
    await session.commit()
    if not created:
        return {"ok": True, "duplicate": True}

    target = derive_target(event_type, stripe_status=payload.get("status"))
    if target is None:
        # Event we don't track — log + ack.
        await mark_event_processed(session, event_id)
        await session.commit()
        return {"ok": True, "tracked": False}

    # Resolve customer_id from the payload.
    stripe_customer_id = payload.get("customer")
    if not stripe_customer_id:
        log.warning("webhook %s missing customer", event_type)
        return {"ok": True, "tracked": False}
    customer = await get_customer_by_stripe_id(session, stripe_customer_id)
    if customer is None:
        log.warning("webhook %s for unknown customer %s", event_type, stripe_customer_id)
        return {"ok": True, "tracked": False}

    # Resolve subscription id (missing on checkout.session.completed for
    # one-time purchases — but our flow is always subscription mode).
    stripe_sub_id = payload.get("subscription") or payload.get("id")
    if not stripe_sub_id:
        await mark_event_processed(session, event_id)
        await session.commit()
        return {"ok": True, "tracked": False}

    # Run the FSM. For idempotency (re-applying the same event after a
    # crash), self-loop transitions are allowed and don't fire NATS.
    current_sub = await latest_subscription_for_user(session, customer["user_id"])
    current_state = State(current_sub["status"]) if current_sub else State.INACTIVE
    try:
        outcome = transition(current=current_state, target=target)
    except IllegalTransition as e:
        log.warning("illegal transition for %s: %s", event_id, e)
        await mark_event_processed(session, event_id)
        await session.commit()
        return {"ok": True, "tracked": True, "skipped": "illegal"}

    period_end_iso = payload.get("current_period_end")
    period_end = (
        datetime.fromtimestamp(int(period_end_iso), tz=UTC) if period_end_iso else None
    )
    cancel_at_period_end = bool(payload.get("cancel_at_period_end", False))

    await upsert_subscription(
        session,
        customer_id=customer["id"],
        stripe_subscription_id=stripe_sub_id,
        status=outcome.to_state.value,
        period_end=period_end,
        cancel_at_period_end=cancel_at_period_end,
    )
    await mark_event_processed(session, event_id)
    await session.commit()

    if outcome.notify:
        try:
            await _publish_subscription_changed(
                user_id=customer["user_id"],
                state=outcome.to_state.value,
                period_end=period_end,
            )
        except Exception:
            log.exception("payment.subscription.changed publish failed")

    return {"ok": True, "tracked": True, "newState": outcome.to_state.value}


# ─────────────────────────────────────────────────────────────────────────
# /payment/me — current subscription summary
# ─────────────────────────────────────────────────────────────────────────


class SubscriptionSummary(BaseModel):
    tier: str
    status: str
    isPremium: bool
    periodEnd: str | None
    cancelAtPeriodEnd: bool


@router.get("/me", response_model=SubscriptionSummary)
async def get_my_subscription(
    session: SessionDep, principal: PrincipalDep
) -> SubscriptionSummary:
    sub = await latest_subscription_for_user(session, principal.user_id)
    if sub is None:
        return SubscriptionSummary(
            tier="STUDENT_FREE",
            status="INACTIVE",
            isPremium=False,
            periodEnd=None,
            cancelAtPeriodEnd=False,
        )
    state = State(sub["status"])
    return SubscriptionSummary(
        tier=sub["tier"] if state != State.INACTIVE else "STUDENT_FREE",
        status=sub["status"],
        isPremium=is_premium(state, sub["period_end"], datetime.now(tz=UTC)),
        periodEnd=sub["period_end"].isoformat() if sub["period_end"] else None,
        cancelAtPeriodEnd=bool(sub["cancel_at_period_end"]),
    )


# Service-to-service — Auth subscribes to NATS; this is the HTTP fallback
# for environments where NATS isn't available (also used by tests).
@router.get("/internal/users/{user_id}/premium")
async def is_user_premium(user_id: str, session: SessionDep) -> dict:
    sub = await latest_subscription_for_user(session, user_id)
    if sub is None:
        return {"userId": user_id, "isPremium": False, "tier": "STUDENT_FREE"}
    state = State(sub["status"])
    premium = is_premium(state, sub["period_end"], datetime.now(tz=UTC))
    return {
        "userId": user_id,
        "isPremium": premium,
        "tier": sub["tier"] if state != State.INACTIVE else "STUDENT_FREE",
        "status": sub["status"],
    }


# ─────────────────────────────────────────────────────────────────────────
# NATS publisher (lazy — same pattern Analytics + Notification use)
# ─────────────────────────────────────────────────────────────────────────


async def _publish_subscription_changed(
    *, user_id: str, state: str, period_end: datetime | None
) -> None:
    """Publish a `payment.subscription.changed` event so Auth / Quiz /
    Adaptive can re-cache the user's tier without a round-trip."""
    nats_url = os.environ.get("PAYMENT_NATS_URL") or settings.nats_url
    if not nats_url:
        return
    try:
        import nats

        nc = await nats.connect(nats_url, connect_timeout=2)
        try:
            import json

            await nc.publish(
                "payment.subscription.changed",
                json.dumps({
                    "user_id": user_id,
                    "state": state,
                    "period_end": period_end.isoformat() if period_end else None,
                }).encode(),
            )
            await nc.flush()
        finally:
            await nc.close()
    except Exception:
        log.exception("NATS publish failed (non-fatal)")
