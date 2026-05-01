"""Scheduled audit-log retention task (P5-S63).

Per ADR-0019 §"Audit log" — retain ai_generation_jobs rows 90 days.
The /admin/ai-audit-log/purge route from S50 is the manual override;
this task fires the same primitive on a weekly cadence so operators
don't have to.

Implementation: asyncio task spawned by the lifespan hook in main.py.
Fires once on startup (catches any backlog from a long downtime),
then every 7 days. Internal-only — no auth surface.
"""

from __future__ import annotations

import asyncio
import logging

log = logging.getLogger(__name__)

# Defaults align with ADR-0019. Operators override via env when
# investigating regulatory questions (e.g. shorter retention for
# specific legal frameworks).
DEFAULT_RETENTION_DAYS = 90
DEFAULT_INTERVAL_SECONDS = 7 * 24 * 3600  # weekly


async def _purge_once(*, days: int) -> int:
    """One-shot purge. Lazy-imports the writer + sessionmaker so the
    module loads cleanly without a DB."""
    from learning.ai_gateway.audit_log import purge_older_than_days
    from learning.content.db import sessionmaker as content_sessionmaker

    try:
        async with content_sessionmaker()() as session:
            n = await purge_older_than_days(session, days=days)
            await session.commit()
        log.info("audit_log.purged rows=%d days=%d", n, days)
        return n
    except Exception as exc:  # noqa: BLE001
        log.warning("audit_log.purge_failed: %s", exc)
        return -1


async def start_retention_task(
    *,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    interval_seconds: int = DEFAULT_INTERVAL_SECONDS,
) -> asyncio.Task:
    """Spawn the weekly purge loop. Returns the task so the lifespan
    hook can cancel on shutdown.

    First fire is delayed by `interval_seconds // 7` (~1 day at the
    weekly default) so the spinning-up service doesn't lock contention
    with the migration runner. Subsequent fires are at full
    `interval_seconds`.
    """

    async def _loop() -> None:
        # Initial small delay: 1 day default, scaled down for short
        # intervals (test envs may set interval_seconds=1).
        first_delay = max(1, interval_seconds // 7)
        try:
            await asyncio.sleep(first_delay)
        except asyncio.CancelledError:
            raise
        while True:
            try:
                await _purge_once(days=retention_days)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                log.exception("audit retention loop iteration failed")
            try:
                await asyncio.sleep(interval_seconds)
            except asyncio.CancelledError:
                raise

    return asyncio.create_task(_loop())
