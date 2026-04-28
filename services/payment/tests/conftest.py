"""Shared test config for the payment service.

Mirrors the doubts/notification/user-profile pattern: the DSN defaults
point at the local docker-compose Postgres so unit + integration tests
can share the same setup.
"""

from __future__ import annotations

import os

os.environ.setdefault(
    "PAYMENT_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/payment",
)
os.environ.setdefault(
    "PAYMENT_JWT_SECRET",
    "dev-only-change-me-in-staging-at-least-32-bytes-long",
)
# Tests must run in stub mode — never reach out to real Stripe.
os.environ.setdefault("PAYMENT_STRIPE_API_KEY", "")
os.environ.setdefault("PAYMENT_STRIPE_WEBHOOK_SECRET", "")
