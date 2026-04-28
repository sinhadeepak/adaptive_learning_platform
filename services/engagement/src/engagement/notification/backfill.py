"""Nightly backfill — replays Quiz `SUBMITTED` sessions that the live
JetStream consumer never landed in `notification_schema.processed_events`.

Mirror of the Analytics backfill shape from PR #29. Same situation: if
Notification is down (or the channel-flag eval fails) past JetStream's
retry window, the message is terminated and the user never gets the
in-app notification for that quiz submit. With closed-beta volumes this
is rare; once we open to real cohorts a single bad night could lose
hundreds of "you finished a quiz" pings.

Backfill closes that gap. It reads the source-of-truth (`quiz_schema.quiz_sessions`),
filters to SUBMITTED rows in the requested window, and runs each missing
session through the same `process_quiz_completed` function the live
consumer uses (idempotent via `processed_events` short-circuit; same
channel-flag gate).

Usage
-----
  uv run python -m notification.backfill --since 2026-04-25T00:00:00Z

Production cron / Argo Workflow runs:
  uv run python -m notification.backfill --since "$(date -u -Iseconds -d '36 hours ago')"

The 36h window is intentionally double the JetStream MaxDeliver+ack-wait
upper bound — same rationale as Analytics.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from engagement.notification.config import settings
from engagement.notification.db import sessionmaker as notification_sessionmaker
from engagement.notification.processing import process_quiz_completed

log = logging.getLogger(__name__)


@dataclass
class SubmittedSession:
    session_id: str
    user_id: str
    topic_id: str
    tenant_id: str | None
    served_count: int
    correct_count: int

    @property
    def score(self) -> float:
        if self.served_count == 0:
            return 0.0
        return self.correct_count / self.served_count


async def _iter_submitted_sessions(
    quiz_session: AsyncSession, *, since: datetime, limit: int
) -> AsyncIterator[SubmittedSession]:
    """Read SUBMITTED rows from quiz_schema.quiz_sessions in submitted_at order.
    Reads only — never writes to Quiz's DB."""
    res = await quiz_session.execute(
        text(
            """
            SELECT id, user_id, topic_id, tenant_id, served_count, correct_count
              FROM quiz_schema.quiz_sessions
             WHERE status = 'SUBMITTED'
               AND submitted_at >= :since
               AND served_count > 0
             ORDER BY submitted_at ASC
             LIMIT :lim
            """
        ),
        {"since": since, "lim": limit},
    )
    for row in res.mappings():
        yield SubmittedSession(
            session_id=str(row["id"]),
            user_id=str(row["user_id"]),
            topic_id=str(row["topic_id"]),
            tenant_id=str(row["tenant_id"]) if row.get("tenant_id") else None,
            served_count=int(row["served_count"]),
            correct_count=int(row["correct_count"]),
        )


@dataclass
class BackfillStats:
    scanned: int = 0
    appended: int = 0  # fresh notification row added
    dropped: int = 0  # channel disabled — terminal
    skipped: int = 0  # already in processed_events
    failed: int = 0

    def __str__(self) -> str:
        return (
            f"scanned={self.scanned} appended={self.appended} "
            f"dropped={self.dropped} skipped={self.skipped} failed={self.failed}"
        )


async def run_backfill(*, since: datetime, limit: int = 10_000) -> BackfillStats:
    """Scan Quiz's submitted-session table and replay anything Notification
    didn't land. Returns counters for observability."""
    stats = BackfillStats()

    quiz_engine = create_async_engine(settings.quiz_database_url, pool_size=2, max_overflow=2)
    quiz_session = async_sessionmaker(quiz_engine, expire_on_commit=False)
    try:
        async with quiz_session() as q_sess, notification_sessionmaker()() as n_sess:
            async for s in _iter_submitted_sessions(q_sess, since=since, limit=limit):
                stats.scanned += 1
                try:
                    outcome = await process_quiz_completed(
                        n_sess,
                        session_id=s.session_id,
                        user_id=s.user_id,
                        score=s.score,
                        topic_id=s.topic_id,
                        tenant_id=s.tenant_id,
                    )
                    await n_sess.commit()
                    if outcome == "appended":
                        stats.appended += 1
                        log.info(
                            "backfill appended session=%s user=%s score=%.3f",
                            s.session_id,
                            s.user_id,
                            s.score,
                        )
                    elif outcome == "dropped":
                        stats.dropped += 1
                    else:  # skipped
                        stats.skipped += 1
                except Exception as err:
                    stats.failed += 1
                    log.warning("backfill failed for session=%s: %s", s.session_id, err)
                    await n_sess.rollback()
    finally:
        await quiz_engine.dispose()

    return stats


def _parse_since(s: str) -> datetime:
    """Accept ISO-8601 with or without trailing Z."""
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    )
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--since",
        required=True,
        help='ISO-8601 lower bound on submitted_at (e.g. "2026-04-25T00:00:00Z")',
    )
    parser.add_argument(
        "--limit", type=int, default=10_000, help="Max sessions to scan in one pass (default 10k)"
    )
    args = parser.parse_args()

    since = _parse_since(args.since)
    log.info("backfill start since=%s limit=%d", since.isoformat(), args.limit)
    stats = asyncio.run(run_backfill(since=since, limit=args.limit))
    log.info("backfill done %s", stats)
    return 0 if stats.failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
