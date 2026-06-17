"""Phase 5 (P5-S45): persistent AI call cost log + seed sample data.

The ai_gateway/cost_dashboard module keeps a rolling cost tracker
in-memory. That works for a long-lived single-process service but
zeroes out on every restart and makes the admin /admin/ai-cost
surface look broken in dev.

This migration creates content_schema.ai_call_logs as the persistent
record. A startup hook in learning.main loads recent rows into the
in-memory tracker so the dashboard has data after a fresh boot.
Future production work will plumb record_cost() to also write to this
table for live persistence.

Sample seed rows (gated behind LEARNING_SEED_LOCAL) populate ~150
realistic AI calls over the past 30 days so the admin dashboard shows
something useful in local dev.

Revision ID: 031
Revises: 030
Create Date: 2026-05-03
"""

from __future__ import annotations

import os
import random
import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "031"
down_revision: str | None = "030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.create_table(
        "ai_call_logs",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("touchpoint", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'success'")),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=False, server_default=sa.text("0")),
        sa.Column("tokens_in", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("tokens_out", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("creator_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("artifact_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "idx_ai_call_logs_ts", "ai_call_logs", ["ts"], schema=SCHEMA, postgresql_using="btree",
    )
    op.create_index(
        "idx_ai_call_logs_touchpoint", "ai_call_logs", ["touchpoint", "ts"], schema=SCHEMA,
    )
    op.create_index(
        "idx_ai_call_logs_creator", "ai_call_logs", ["creator_id", "ts"], schema=SCHEMA,
        postgresql_where=sa.text("creator_id IS NOT NULL"),
    )

    if not os.environ.get("CONTENT_SEED_LOCAL"):
        return

    # Realistic seed: ~150 calls across the past 30 days, weighted
    # toward today + past week. Touchpoints + costs match the routing
    # config in config/ai_routing.yaml so the dashboard breakdowns
    # mirror what real traffic would look like.
    random.seed(42)

    TOUCHPOINTS = [
        # (name, base_cost_usd, model)
        ("question_authoring", 0.024, "gpt-4o"),
        ("explanation_generation", 0.018, "gpt-4o"),
        ("essay_grading", 0.045, "gpt-4o"),
        ("doubt_chat", 0.008, "gpt-4o-mini"),
        ("translation_hi", 0.011, "gpt-4o-mini"),
        ("translation_ta", 0.011, "gpt-4o-mini"),
        ("transcription_audio", 0.006, "whisper-1"),
        ("image_moderation", 0.003, "gpt-4o-mini"),
        ("weekly_narrative", 0.022, "gpt-4o"),
        ("hint_generation", 0.005, "gpt-4o-mini"),
    ]

    # 5 sample creators (matches the institution-teacher seed UUIDs
    # from identity 006_seed_e2e_institutions so the by-creator panel
    # surfaces real names when joined client-side).
    CREATORS = [
        "4e781c8d-4362-59ec-8cb3-f361eca4e8a6",  # Anika
        "c3960d7e-44d7-5920-abdf-e12729d8e66a",  # Dr. Menon
        "e74d9cb0-522a-5d3a-8ae4-ac643f50ba38",  # Priya
        "b0528241-b889-5bd0-adb5-ea4a62d814bb",  # Mohan
        "862dde37-b6fb-541e-82a3-25999ec648ca",  # Ishaan
    ]

    rows: list[dict[str, object]] = []
    now = datetime.now(timezone.utc)

    # Distribute: 60 calls today, 50 in past week (excl. today), 40 in past 30d (excl. past week)
    for i in range(60):
        rows.append(_make_row(now - timedelta(minutes=random.randint(0, 1440)), TOUCHPOINTS, CREATORS))
    for i in range(50):
        rows.append(_make_row(
            now - timedelta(days=random.randint(1, 7), minutes=random.randint(0, 1440)),
            TOUCHPOINTS, CREATORS,
        ))
    for i in range(40):
        rows.append(_make_row(
            now - timedelta(days=random.randint(8, 29), minutes=random.randint(0, 1440)),
            TOUCHPOINTS, CREATORS,
        ))

    for r in rows:
        op.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.ai_call_logs (
                  id, ts, touchpoint, provider, model, status,
                  cost_usd, tokens_in, tokens_out, latency_ms, creator_id
                )
                VALUES (
                  CAST(:id AS uuid), :ts, :tp, :prov, :model, 'success',
                  :cost, :tin, :tout, :lat, CAST(:cid AS uuid)
                )
                """
            ).bindparams(**r)
        )


def _make_row(ts: datetime, touchpoints: list, creators: list) -> dict:
    tp_name, base_cost, model = random.choice(touchpoints)
    # Vary cost ±40% so the rollup looks organic.
    cost = round(base_cost * random.uniform(0.6, 1.4), 6)
    # Token estimates loosely tied to cost (rough $/Mtok math).
    tokens_in = random.randint(200, 2000)
    tokens_out = random.randint(100, 1500)
    latency = random.randint(400, 4500)
    return {
        "id": str(uuid.uuid4()),
        "ts": ts,
        "tp": tp_name,
        "prov": "openai",
        "model": model,
        "cost": cost,
        "tin": tokens_in,
        "tout": tokens_out,
        "lat": latency,
        "cid": random.choice(creators),
    }


def downgrade() -> None:
    op.drop_index("idx_ai_call_logs_creator", "ai_call_logs", schema=SCHEMA)
    op.drop_index("idx_ai_call_logs_touchpoint", "ai_call_logs", schema=SCHEMA)
    op.drop_index("idx_ai_call_logs_ts", "ai_call_logs", schema=SCHEMA)
    op.drop_table("ai_call_logs", schema=SCHEMA)
