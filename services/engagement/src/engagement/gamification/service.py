"""Phase 1D-9 — Gamification (XP / leagues).

XP rules (defaults; configurable via XP_RULES env later):
  quiz_completed       : 25 XP per session, +1 per correct answer
  streak_day           : 5 XP per consecutive day in week
  mastery_milestone    : 50 XP when a topic crosses 0.7 EWA
  mistake_replay       : 15 XP per mistake-replay session
  flashcard_session    : 10 XP per 10 cards reviewed

Levels: total_xp -> level by floor(sqrt(total_xp / 100)). Cheap formula
that doesn't require a lookup table.

Leagues: Bronze (default) -> Silver -> Gold -> Platinum -> Diamond.
Promotion at top 10% of league weekly; demotion at bottom 20%.
Promote/demote runs nightly via a cron (see promote_demote()).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

XP_RULES: dict[str, int] = {
    "quiz_completed": 25,
    "quiz_correct_answer": 1,
    "streak_day": 5,
    "mastery_milestone": 50,
    "mistake_replay": 15,
    "flashcard_session": 10,
    "doubt_resolved": 8,
}

LEAGUE_ORDER = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"]


@dataclass
class XpStatus:
    user_id: str
    total_xp: int
    weekly_xp: int
    current_level: int
    current_league: str
    weekly_resets_at: str
    next_level_xp: int


def _level_from_xp(total_xp: int) -> int:
    return max(1, 1 + int(math.floor(math.sqrt(max(0, total_xp) / 100))))


def _xp_for_level(level: int) -> int:
    # Inverse of _level_from_xp
    return ((level - 1) ** 2) * 100


async def award_xp(
    session: AsyncSession,
    *,
    user_id: str,
    event_type: str,
    source_id: str | None = None,
    xp_delta: int | None = None,
) -> int:
    """Append an XP event and update the cache. Returns the user's
    new total XP."""
    delta = xp_delta if xp_delta is not None else XP_RULES.get(event_type, 0)
    if delta == 0:
        return 0
    await session.execute(
        text(
            """
            INSERT INTO analytics_schema.xp_events
              (user_id, event_type, xp_delta, source_id)
            VALUES
              (CAST(:uid AS uuid), :evt, :dx,
               CAST(:sid AS uuid))
            """
        ),
        {"uid": user_id, "evt": event_type, "dx": delta, "sid": source_id},
    )
    # Upsert into user_xp.
    await session.execute(
        text(
            """
            INSERT INTO analytics_schema.user_xp (user_id, total_xp, weekly_xp)
            VALUES (CAST(:uid AS uuid), :dx, :dx)
            ON CONFLICT (user_id) DO UPDATE
               SET total_xp  = analytics_schema.user_xp.total_xp + EXCLUDED.total_xp,
                   weekly_xp = CASE
                       WHEN analytics_schema.user_xp.weekly_resets_at < NOW()
                         THEN EXCLUDED.weekly_xp
                       ELSE analytics_schema.user_xp.weekly_xp + EXCLUDED.weekly_xp
                       END,
                   weekly_resets_at = CASE
                       WHEN analytics_schema.user_xp.weekly_resets_at < NOW()
                         THEN date_trunc('week', NOW()) + INTERVAL '7 days'
                       ELSE analytics_schema.user_xp.weekly_resets_at
                       END,
                   updated_at = NOW()
            """
        ),
        {"uid": user_id, "dx": delta},
    )
    # Refresh level
    await session.execute(
        text(
            """
            UPDATE analytics_schema.user_xp
               SET current_level = GREATEST(1,
                   1 + FLOOR(SQRT(GREATEST(0, total_xp) / 100.0))::int)
             WHERE user_id = CAST(:uid AS uuid)
            """
        ),
        {"uid": user_id},
    )
    # Mirror weekly_xp into league_memberships row for this week
    await session.execute(
        text(
            """
            INSERT INTO analytics_schema.league_memberships
              (user_id, week_start, league_id, weekly_xp)
            VALUES (
              CAST(:uid AS uuid),
              date_trunc('week', NOW())::date,
              COALESCE(
                (SELECT current_league FROM analytics_schema.user_xp
                  WHERE user_id = CAST(:uid AS uuid)),
                'BRONZE'
              ),
              :dx
            )
            ON CONFLICT (user_id, week_start) DO UPDATE
               SET weekly_xp = analytics_schema.league_memberships.weekly_xp + EXCLUDED.weekly_xp
            """
        ),
        {"uid": user_id, "dx": delta},
    )
    await session.commit()
    row = (
        await session.execute(
            text(
                "SELECT total_xp FROM analytics_schema.user_xp WHERE user_id = CAST(:uid AS uuid)"
            ),
            {"uid": user_id},
        )
    ).first()
    return int(row[0]) if row else delta


async def get_status(session: AsyncSession, *, user_id: str) -> XpStatus:
    row = (
        await session.execute(
            text(
                """
                SELECT total_xp, weekly_xp, current_level, current_league,
                       weekly_resets_at::text
                  FROM analytics_schema.user_xp
                 WHERE user_id = CAST(:uid AS uuid)
                """
            ),
            {"uid": user_id},
        )
    ).first()
    if row is None:
        # Cold-start
        return XpStatus(
            user_id=user_id,
            total_xp=0,
            weekly_xp=0,
            current_level=1,
            current_league="BRONZE",
            weekly_resets_at="",
            next_level_xp=_xp_for_level(2),
        )
    total = int(row[0])
    level = int(row[2])
    return XpStatus(
        user_id=user_id,
        total_xp=total,
        weekly_xp=int(row[1]),
        current_level=level,
        current_league=str(row[3]),
        weekly_resets_at=row[4],
        next_level_xp=_xp_for_level(level + 1),
    )


async def league_standings(
    session: AsyncSession,
    *,
    league_id: str,
    week_start: date | None = None,
    limit: int = 50,
) -> list[dict]:
    if week_start is None:
        week_start = date.today()
    rows = (
        await session.execute(
            text(
                """
                SELECT user_id::text AS user_id,
                       weekly_xp,
                       rank_in_league
                  FROM analytics_schema.league_memberships
                 WHERE league_id = :lid
                   AND week_start = date_trunc('week', CAST(:ws AS date))::date
                 ORDER BY weekly_xp DESC
                 LIMIT :lim
                """
            ),
            {"lid": league_id, "ws": week_start, "lim": limit},
        )
    ).mappings().all()
    return [
        {
            "rank": i + 1,
            "userId": r["user_id"],
            "weeklyXp": int(r["weekly_xp"]),
        }
        for i, r in enumerate(rows)
    ]


async def promote_demote(session: AsyncSession) -> dict:
    """Weekly job: promote top 10% of each league, demote bottom 20%.
    Reads `league_memberships` for the week-just-ended; updates
    `user_xp.current_league`. Idempotent (recompute is safe)."""
    moved = {"promoted": 0, "demoted": 0}
    for i, lid in enumerate(LEAGUE_ORDER):
        rows = (
            await session.execute(
                text(
                    """
                    SELECT user_id::text, weekly_xp
                      FROM analytics_schema.league_memberships
                     WHERE league_id = :lid
                       AND week_start = (date_trunc('week', NOW()) - INTERVAL '7 days')::date
                     ORDER BY weekly_xp DESC
                    """
                ),
                {"lid": lid},
            )
        ).all()
        if not rows:
            continue
        n = len(rows)
        top10 = max(1, int(n * 0.10))
        bot20 = max(1, int(n * 0.20))
        # Promote top
        if i + 1 < len(LEAGUE_ORDER):
            promote_users = [r[0] for r in rows[:top10]]
            for uid in promote_users:
                await session.execute(
                    text(
                        """
                        UPDATE analytics_schema.user_xp
                           SET current_league = :nxt, updated_at = NOW()
                         WHERE user_id = CAST(:uid AS uuid)
                        """
                    ),
                    {"nxt": LEAGUE_ORDER[i + 1], "uid": uid},
                )
                moved["promoted"] += 1
        # Demote bottom
        if i > 0:
            demote_users = [r[0] for r in rows[-bot20:]]
            for uid in demote_users:
                await session.execute(
                    text(
                        """
                        UPDATE analytics_schema.user_xp
                           SET current_league = :prev, updated_at = NOW()
                         WHERE user_id = CAST(:uid AS uuid)
                        """
                    ),
                    {"prev": LEAGUE_ORDER[i - 1], "uid": uid},
                )
                moved["demoted"] += 1
    await session.commit()
    return moved
