"""Shared `quiz.session.completed` processing for the JetStream consumer +
the nightly backfill.

Both invoke `process_quiz_completed()`. The function applies the same
channel-flag gate the live consumer always did, then either appends a
notification row or terminates by marking the event processed. Caller
commits the session — gives the backfill the option to commit per row
(for visibility) without forcing the live handler into the same shape.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from notification.flags import channel_enabled
from notification.repositories import (
    append_notification,
    is_event_processed,
    mark_event_processed,
)

log = logging.getLogger(__name__)


async def process_quiz_completed(
    session: AsyncSession,
    *,
    session_id: str,
    user_id: str,
    score: float,
    topic_id: str | None = None,
    tenant_id: str | None = None,
    channel: str = "email",
) -> str:
    """Run the channel-flag-gated insert path. Returns one of:

      "appended" — fresh row inserted into notifications + processed_events
      "skipped"  — already in processed_events (idempotent re-run)
      "dropped"  — channel disabled, terminal decision; processed_events
                   marked so a future flag-flip doesn't replay backlog.

    Caller is responsible for `session.commit()`.
    """
    if await is_event_processed(session, session_id):
        return "skipped"

    if not await channel_enabled(channel, tenant_id=tenant_id):
        log.info(
            "notification dropping quiz.completed user=%s — %s channel disabled",
            user_id,
            channel,
        )
        await mark_event_processed(session, session_id)
        return "dropped"

    await append_notification(
        session,
        notification_id=str(uuid.uuid4()),
        user_id=user_id,
        type_="quiz.completed",
        channel=channel,
        payload={
            "sessionId": session_id,
            "score": score,
            "topicId": topic_id,
        },
    )
    await mark_event_processed(session, session_id)
    return "appended"
