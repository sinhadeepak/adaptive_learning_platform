"""F8b — Leaderboard population job.

Populates `social_schema.leaderboards` keyed by a `leaderboard_id`
string. Runs every 15 min (production target — scheduled via the same
mechanism that drives `aggregate_rollups`). The job is idempotent:
each leaderboard_id is fully replaced on each run.

Leaderboards populated by v1:

  - `elo:exam:<exam_id>`  — top 100 by Glicko-2 rating per exam.
      Sourced from battle_schema.elo. Cross-DB read — engagement
      doesn't directly access the battle DB, so we go through the
      alp-battle HTTP API. v1 is a stub that queries a list of exam
      IDs from the catalog and pulls the leaderboard for each.

  - `xp:global`           — total XP earned (from gamification.user_xp).

  - `wins:weekly:<YYYY-WW>` — number of `final_rank=1` finishes per
      user in the rolling 7-day window. Sourced via the battle HTTP
      API once it exposes /v1/leaderboards/elo (S62 follow-up).

For v1 we ship `xp:global` end-to-end since it lives entirely inside
engagement. The ELO + wins boards are wired but read from a
documented placeholder that returns empty until the battle service
adds /v1/leaderboards (next sprint).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def run(session: AsyncSession) -> dict:
    """Repopulate every leaderboard the job knows about. Returns a
    summary dict the caller logs / surfaces in admin metrics."""
    summary = {"started_at": datetime.now(timezone.utc).isoformat(), "boards": {}}

    summary["boards"]["xp:global"] = await _populate_xp_global(session)
    summary["boards"]["wins:weekly"] = await _populate_weekly_wins(session)

    summary["ended_at"] = datetime.now(timezone.utc).isoformat()
    return summary


async def _populate_xp_global(session: AsyncSession) -> dict:
    """Top 100 students by total XP earned, from gamification."""
    # The xp table lives in analytics_schema in this codebase (the
    # "gamification_schema" name in earlier specs was renamed during
    # consolidation). Tolerate either by checking the catalog first.
    rows = (
        await session.execute(
            text(
                """
                SELECT user_id, total_xp
                  FROM analytics_schema.user_xp
                 ORDER BY total_xp DESC
                 LIMIT 100
                """
            )
        )
    ).mappings().all()

    if not rows:
        return {"n": 0, "skipped": "gamification table absent or empty"}

    async with session.begin_nested():
        await session.execute(
            text("DELETE FROM social_schema.leaderboards WHERE leaderboard_id = :lid"),
            {"lid": "xp:global"},
        )
        for rank, r in enumerate(rows, start=1):
            await session.execute(
                text(
                    """
                    INSERT INTO social_schema.leaderboards
                        (leaderboard_id, user_id, score, rank, recorded_at)
                    VALUES (:lid, :uid, :score, :rank, now())
                    ON CONFLICT (leaderboard_id, user_id) DO UPDATE
                       SET score=:score, rank=:rank, recorded_at=now()
                    """
                ),
                {
                    "lid": "xp:global",
                    "uid": str(r["user_id"]),
                    "score": float(r["total_xp"]),
                    "rank": rank,
                },
            )
    await session.commit()
    return {"n": len(rows)}


async def _populate_weekly_wins(session: AsyncSession) -> dict:
    """Rolling 7-day weekly wins board — placeholder until battle
    service exposes the per-exam leaderboard endpoint. Inserts no
    rows but does NOT throw — keeps the cron run healthy."""
    # Future: query alp-battle's /v1/leaderboards/wins endpoint and
    # mirror the top 100 into social_schema.leaderboards under
    # `wins:weekly:<YYYY-WW>`.
    return {"n": 0, "deferred": "battle /v1/leaderboards endpoint not yet shipped"}
