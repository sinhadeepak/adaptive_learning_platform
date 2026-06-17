"""Backfill analytics_schema.mastery.tenant_id from
institution_schema.user_tenant_memberships, then refresh the
mv_drill_topic materialized view.

Why: the seed simulation wrote mastery rows but didn't set tenant_id,
so the drill-tenants matview (which groups by tenant_id) doesn't see
them and the analytics drill page shows the cold-start projection
even though there's plenty of real data.

Same fix is needed for any other tables that carry tenant_id and were
seeded without it (concept_mastery, readiness, etc).
"""

from __future__ import annotations

import asyncio
import logging

import asyncpg

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("backfill")


async def main() -> None:
    identity = await asyncpg.connect(
        host="postgres", user="postgres", password="postgres", database="identity",
    )
    eng = await asyncpg.connect(
        host="postgres", user="postgres", password="postgres", database="engagement",
    )
    try:
        # Pull primary tenant per user (one row per user_id).
        rows = await identity.fetch(
            """
            SELECT DISTINCT ON (user_id) user_id, tenant_id
              FROM institution_schema.user_tenant_memberships
             ORDER BY user_id, COALESCE(is_primary, FALSE) DESC, joined_at ASC
            """
        )
        log.info("loaded %d (user, tenant) pairs", len(rows))
        if not rows:
            return

        # Discover which engagement tables have a tenant_id column.
        candidate_tables = [
            "mastery", "concept_mastery", "readiness", "session_item_outcomes",
            "daily_activity", "streaks", "user_xp", "league_memberships",
        ]
        with_tenant = await eng.fetch(
            """
            SELECT table_name
              FROM information_schema.columns
             WHERE table_schema = 'analytics_schema'
               AND column_name = 'tenant_id'
               AND table_name = ANY($1)
            """,
            candidate_tables,
        )
        tables = [r["table_name"] for r in with_tenant]
        log.info("tables with tenant_id: %s", tables)
        for table in tables:
            params = [(r["tenant_id"], r["user_id"]) for r in rows]
            res = await eng.executemany(
                f"""
                UPDATE analytics_schema.{table}
                   SET tenant_id = $1
                 WHERE user_id = $2
                   AND tenant_id IS NULL
                """,
                params,
            )
            count = await eng.fetchval(
                f"SELECT COUNT(*) FROM analytics_schema.{table} WHERE tenant_id IS NOT NULL"
            )
            log.info("  %s: %d rows now have tenant_id", table, count)

        log.info("refreshing mv_drill_topic …")
        await eng.execute("REFRESH MATERIALIZED VIEW analytics_schema.mv_drill_topic")
        n = await eng.fetchval("SELECT COUNT(*) FROM analytics_schema.mv_drill_topic")
        log.info("  mv_drill_topic: %d rows", n)
    finally:
        await identity.close()
        await eng.close()


if __name__ == "__main__":
    asyncio.run(main())
