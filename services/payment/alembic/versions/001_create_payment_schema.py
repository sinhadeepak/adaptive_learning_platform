"""Create payment_schema with customers, subscriptions, webhook_events.

Schema design:
- `customers` — one row per (user_id, stripe_customer_id) mapping. Created
  on first checkout for a user; reused on every subsequent webhook.
- `subscriptions` — one row per Stripe subscription, joined to a customer.
  Tracks the FSM state and the period_end so the JWT issuance logic can
  decide whether to grant STUDENT_PREMIUM.
- `webhook_events` — every received Stripe webhook by event id. UNIQUE on
  stripe_event_id makes replay (Stripe redelivers up to 3 days) idempotent.

Why per-row tier check rather than a denormalised role on the customer:
A user can re-subscribe / cancel multiple times; the JWT issuance flow
asks "is there a current ACTIVE subscription that hasn't passed period_end?"
which is one query against subscriptions.

Revision ID: 001
Revises:
Create Date: 2026-04-27
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "payment_schema"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.customers (
            id                   UUID NOT NULL DEFAULT gen_random_uuid(),
            user_id              UUID NOT NULL,
            stripe_customer_id   TEXT NOT NULL,
            tenant_id            UUID,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (id),
            UNIQUE (user_id),
            UNIQUE (stripe_customer_id)
        )
        """
    )
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.subscriptions (
            id                       UUID NOT NULL DEFAULT gen_random_uuid(),
            customer_id              UUID NOT NULL,
            stripe_subscription_id   TEXT NOT NULL,
            status                   TEXT NOT NULL CHECK (status IN (
                                       'INACTIVE','CHECKOUT_PENDING','ACTIVE',
                                       'PAST_DUE','CANCELED','REACTIVATED')),
            tier                     TEXT NOT NULL DEFAULT 'STUDENT_PREMIUM',
            period_end               TIMESTAMPTZ,
            cancel_at_period_end     BOOLEAN NOT NULL DEFAULT FALSE,
            created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (id),
            UNIQUE (stripe_subscription_id),
            FOREIGN KEY (customer_id) REFERENCES {SCHEMA}.customers(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_subscriptions_customer ON {SCHEMA}.subscriptions (customer_id, updated_at DESC)"
    )
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.webhook_events (
            id                  UUID NOT NULL DEFAULT gen_random_uuid(),
            stripe_event_id     TEXT NOT NULL,
            event_type          TEXT NOT NULL,
            payload             JSONB NOT NULL,
            processed_at        TIMESTAMPTZ,
            received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (id),
            UNIQUE (stripe_event_id)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_webhook_events_unprocessed ON {SCHEMA}.webhook_events "
        f"(received_at) WHERE processed_at IS NULL"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.webhook_events")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.subscriptions")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.customers")
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
