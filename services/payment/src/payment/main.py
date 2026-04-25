import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator, Literal

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from payment import __version__
from payment.config import settings
from payment.flags import checkout_enabled, close_flags, connect_flags
from payment.logging import configure_logging


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    await connect_flags()
    try:
        yield
    finally:
        await close_flags()


app = FastAPI(
    title=f"{settings.service_name} service",
    version=__version__,
    lifespan=lifespan,
)

# Trace-id propagation must be the OUTERMOST middleware (Sprint 4).
app.add_middleware(TraceContextMiddleware)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": settings.service_name}


BillingPeriod = Literal["monthly", "yearly"]


class CheckoutStartRequest(BaseModel):
    planId: str
    billingPeriod: BillingPeriod
    tenantId: str | None = None


class CheckoutIntentResponse(BaseModel):
    intentId: str
    url: str


@app.post("/checkout/start", response_model=CheckoutIntentResponse)
async def start_checkout(req: CheckoutStartRequest) -> CheckoutIntentResponse:
    if not await checkout_enabled(tenant_id=req.tenantId):
        raise HTTPException(
            status_code=503,
            detail={
                "code": "checkout_disabled",
                "message": "Checkout is not enabled yet — launch is Sprint 3.",
            },
        )
    intent_id = str(uuid.uuid4())
    return CheckoutIntentResponse(
        intentId=intent_id,
        url=f"https://checkout.stripe.com/c/pay/{intent_id}",
    )
