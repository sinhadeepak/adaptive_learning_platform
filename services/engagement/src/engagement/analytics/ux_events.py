"""UX-34 instrumentation — append-only telemetry endpoint.

Drives the Phase 6 UX KPI dashboard. Client batches events; server
validates the event_name format + a static allow-list, drops
malformed rows with a warning, and bulk-inserts the rest.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)
SCHEMA = "analytics_schema"

# Static allow-list of event names. Adding a new event requires a
# code change so we don't ingest arbitrary high-cardinality names.
ALLOWED_EVENTS: set[str] = {
    # Core
    "page.viewed",
    # Screening (S49)
    "screening.start", "screening.q_answered", "screening.complete",
    "screening.signup_clicked", "screening.signup_completed",
    # Onboarding (S49)
    "onboarding.started", "onboarding.completed", "onboarding.step_skipped",
    # Mission (S50)
    "mission.shown", "mission.started", "mission.completed",
    "mission.skipped", "mission.expired",
    # Quiz (S51 + S54)
    "quiz.session.start", "quiz.session.complete", "quiz.session.abandon",
    "quiz.network.lost", "quiz.network.replay", "quiz.network.replay.success",
    # Insights (S52)
    "insights.tab.opened", "insights.tile.opened", "insights.evidence.drilled",
    # Narrative (S53)
    "narrative.shown", "narrative.section_expanded", "narrative.evidence_drilled",
    # Difficulty (S54)
    "difficulty.intent.set", "difficulty.friction.shown",
    "difficulty.friction.taken", "difficulty.calibration.set",
    # Plan editor (S55)
    "plan.viewed", "plan.edited", "plan.regenerated", "plan.confirmed",
    # Decay / bands / revision (S56)
    "decay.tile.opened", "band.action.taken", "revision.ritual.completed",
    # Reflection / recovery / low-bandwidth (S57)
    "reflection.shown", "reflection.responded", "commitment.set",
    "commitment.checked_in", "recovery.shown", "recovery.accepted",
    "recovery.declined", "low_bandwidth.toggled",
    # Polish (S58)
    "command_palette.opened", "command_palette.action",
    "quick_actions.opened", "quick_actions.action",
    "confidence.set", "doubt.bridge.shown", "doubt.bridge.accepted",
}

_EVENT_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$")


def _valid_event_name(name: str) -> bool:
    return bool(_EVENT_NAME_RE.match(name)) and name in ALLOWED_EVENTS


async def insert_events(
    session: AsyncSession,
    *,
    events: list[dict[str, Any]],
    user_id: str | None,
    user_agent: str | None,
) -> tuple[int, int]:
    """Bulk insert a batch of UX events. Returns (inserted, dropped).

    Drops rows with unknown event_name or malformed format. Best-
    effort: a single bad row doesn't fail the batch.
    """
    inserted = 0
    dropped = 0
    rows: list[dict[str, Any]] = []
    for ev in events:
        name = ev.get("event_name", "")
        if not isinstance(name, str) or not _valid_event_name(name):
            dropped += 1
            log.warning("ux_event dropped: bad name %r", name)
            continue
        rows.append(
            {
                "user_id": user_id,
                "session_id": ev.get("session_id"),
                "event_name": name,
                "properties": ev.get("properties") or {},
                "route": ev.get("route"),
                "variant": ev.get("variant"),
                "user_agent": user_agent,
                "network_kind": ev.get("network_kind"),
            }
        )

    if not rows:
        return (0, dropped)

    # PostgreSQL UNNEST-style bulk insert
    import json
    values_sql = ", ".join(
        f"(CAST(:uid_{i} AS uuid), CAST(:sid_{i} AS uuid), :name_{i}, "
        f"CAST(:props_{i} AS jsonb), :route_{i}, :variant_{i}, :ua_{i}, :net_{i})"
        for i in range(len(rows))
    )
    params: dict[str, Any] = {}
    for i, r in enumerate(rows):
        params[f"uid_{i}"] = r["user_id"]
        params[f"sid_{i}"] = r["session_id"]
        params[f"name_{i}"] = r["event_name"]
        params[f"props_{i}"] = json.dumps(r["properties"])
        params[f"route_{i}"] = r["route"]
        params[f"variant_{i}"] = r["variant"]
        params[f"ua_{i}"] = r["user_agent"]
        params[f"net_{i}"] = r["network_kind"]

    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.ux_events
              (user_id, session_id, event_name, properties,
               route, variant, user_agent, network_kind)
            VALUES {values_sql}
            """
        ).bindparams(**params)
    )
    inserted = len(rows)
    return (inserted, dropped)


async def kpis_daily(
    session: AsyncSession,
    *,
    date_from: datetime,
    date_to: datetime,
    kpi_name: str | None = None,
) -> list[dict[str, Any]]:
    """Read pre-aggregated KPIs for the admin dashboard."""
    where = ["date BETWEEN :df AND :dt"]
    params: dict[str, Any] = {"df": date_from.date(), "dt": date_to.date()}
    if kpi_name:
        where.append("kpi_name = :name")
        params["name"] = kpi_name
    res = await session.execute(
        text(
            f"""
            SELECT date, kpi_name, dimension, value, sample_size
              FROM {SCHEMA}.ux_kpis_daily
             WHERE {' AND '.join(where)}
          ORDER BY date DESC, kpi_name
            """
        ).bindparams(**params)
    )
    return [dict(r) for r in res.mappings()]


async def daily_rollup(session: AsyncSession, *, target_date: datetime) -> int:
    """Roll up the previous day's events into ux_kpis_daily.
    Idempotent — uses ON CONFLICT DO UPDATE.
    Computes 5 core KPIs from the §13 review:
      - mission_start_rate, mission_completion_rate
      - narrative_read_rate
      - screening_completion_rate
      - quiz_first_session_completion_rate
    """
    d = target_date.date()
    rollups = [
        # mission_start_rate = started / shown (per day)
        (
            "mission_start_rate",
            f"""
            SELECT
              (COALESCE(SUM(CASE WHEN event_name='mission.started' THEN 1 ELSE 0 END),0))::numeric /
              NULLIF(SUM(CASE WHEN event_name='mission.shown' THEN 1 ELSE 0 END),0) AS value,
              SUM(CASE WHEN event_name='mission.shown' THEN 1 ELSE 0 END) AS sample
              FROM {SCHEMA}.ux_events
             WHERE occurred_at::date = :d
            """,
        ),
        (
            "mission_completion_rate",
            f"""
            SELECT
              (COALESCE(SUM(CASE WHEN event_name='mission.completed' THEN 1 ELSE 0 END),0))::numeric /
              NULLIF(SUM(CASE WHEN event_name='mission.started' THEN 1 ELSE 0 END),0) AS value,
              SUM(CASE WHEN event_name='mission.started' THEN 1 ELSE 0 END) AS sample
              FROM {SCHEMA}.ux_events
             WHERE occurred_at::date = :d
            """,
        ),
        (
            "narrative_read_rate",
            f"""
            SELECT
              (COALESCE(SUM(CASE WHEN event_name='narrative.section_expanded' THEN 1 ELSE 0 END),0))::numeric /
              NULLIF(SUM(CASE WHEN event_name='narrative.shown' THEN 1 ELSE 0 END),0) AS value,
              SUM(CASE WHEN event_name='narrative.shown' THEN 1 ELSE 0 END) AS sample
              FROM {SCHEMA}.ux_events
             WHERE occurred_at::date = :d
            """,
        ),
        (
            "screening_completion_rate",
            f"""
            SELECT
              (COALESCE(SUM(CASE WHEN event_name='screening.complete' THEN 1 ELSE 0 END),0))::numeric /
              NULLIF(SUM(CASE WHEN event_name='screening.start' THEN 1 ELSE 0 END),0) AS value,
              SUM(CASE WHEN event_name='screening.start' THEN 1 ELSE 0 END) AS sample
              FROM {SCHEMA}.ux_events
             WHERE occurred_at::date = :d
            """,
        ),
    ]
    written = 0
    for kpi, sql in rollups:
        res = await session.execute(text(sql), {"d": d})
        row = res.mappings().first()
        value = float(row.get("value") or 0)
        sample = int(row.get("sample") or 0)
        await session.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.ux_kpis_daily
                  (date, kpi_name, dimension, value, sample_size)
                VALUES
                  (:d, :name, '{{}}'::jsonb, :value, :sample)
                ON CONFLICT (date, kpi_name, dimension)
                  DO UPDATE SET value = EXCLUDED.value,
                                sample_size = EXCLUDED.sample_size,
                                computed_at = now()
                """
            ),
            {"d": d, "name": kpi, "value": value, "sample": sample},
        )
        written += 1
    await session.commit()
    return written
