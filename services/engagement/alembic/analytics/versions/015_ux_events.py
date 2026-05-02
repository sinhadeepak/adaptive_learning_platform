"""ux_events + ux_kpis_daily — Phase 6 instrumentation foundation (S49).

Append-only event log driving UX-34: instrumentation for every UX
recommendation we ship in Phase 6. Daily aggregation rolls into
ux_kpis_daily for the /admin/ux-health dashboard.

Revision ID: 015
Revises: 014
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "015"
down_revision: str | None = "014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.ux_events (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id       UUID NULL,
            session_id    UUID NULL,
            event_name    TEXT NOT NULL,
            properties    JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            route         TEXT NULL,
            variant       TEXT NULL,
            user_agent    TEXT NULL,
            network_kind  TEXT NULL,
            occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

            CONSTRAINT chk_event_name_format
                CHECK (event_name ~ '^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$')
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_ux_events_user "
        f"ON {SCHEMA}.ux_events (user_id, occurred_at DESC) "
        f"WHERE user_id IS NOT NULL"
    )
    op.execute(
        f"CREATE INDEX idx_ux_events_event "
        f"ON {SCHEMA}.ux_events (event_name, occurred_at DESC)"
    )
    op.execute(
        f"CREATE INDEX idx_ux_events_session "
        f"ON {SCHEMA}.ux_events (session_id) "
        f"WHERE session_id IS NOT NULL"
    )

    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.ux_kpis_daily (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            date         DATE NOT NULL,
            kpi_name     TEXT NOT NULL,
            dimension    JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            value        NUMERIC NOT NULL,
            sample_size  INT NOT NULL,
            computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

            CONSTRAINT uq_ux_kpis_daily UNIQUE (date, kpi_name, dimension)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_ux_kpis_daily_kpi "
        f"ON {SCHEMA}.ux_kpis_daily (kpi_name, date DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.ux_kpis_daily")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.ux_events")
