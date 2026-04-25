"""Background dispatcher worker — polls the notifications table for queued
rows, sends each via the configured Sender (SMTP locally → Mailpit; SendGrid
in staging+prod), marks dispatched on success or records the error on
failure with backoff via attempt counter.

Run as an asyncio background task off the FastAPI lifespan. One worker
instance per service replica; SELECT … FOR UPDATE SKIP LOCKED in the
repo lets multiple replicas coexist safely (Sprint 4 horizontal scale).
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from notification.config import settings
from notification.db import sessionmaker
from notification.profile_lookup import email_for
from notification.repositories import (
    claim_pending_batch,
    mark_dispatched,
    record_dispatch_error,
)
from notification.sender import default_sender, render_email

if TYPE_CHECKING:
    from notification.sender import Sender

log = logging.getLogger(__name__)

_task: asyncio.Task | None = None


async def _tick(sender: Sender) -> int:
    """One pass: claim a batch, send each, mark or record. Returns count
    successfully dispatched (mostly for tests + ops metrics)."""
    sent = 0
    async with sessionmaker()() as session:
        rows = await claim_pending_batch(session)
        await session.commit()  # release lock + persist attempt bump immediately

    for row in rows:
        if row.dispatch_attempts > settings.dispatch_max_attempts:
            log.warning(
                "notification dispatch giving up id=%s attempts=%d",
                row.id,
                row.dispatch_attempts,
            )
            continue
        if row.channel != "email":
            # SMS / push handled by future channel workers; mark dispatched
            # so a missing dispatcher doesn't cause perpetual retry storms.
            async with sessionmaker()() as session:
                await mark_dispatched(session, row.id)
                await session.commit()
            continue
        try:
            to = await email_for(row.user_id) or f"unknown+{row.user_id}@adaptivelearn.in"
            subject, body = render_email(row.type, row.payload)
            await sender.send_email(to=to, subject=subject, body=body, message_id=row.id)
            async with sessionmaker()() as session:
                await mark_dispatched(session, row.id)
                await session.commit()
            sent += 1
            log.info("notification dispatched id=%s to=%s type=%s", row.id, to, row.type)
        except Exception as err:
            log.warning("notification dispatch failed id=%s: %s", row.id, err)
            try:
                async with sessionmaker()() as session:
                    await record_dispatch_error(session, row.id, str(err))
                    await session.commit()
            except Exception as ee:
                log.warning("notification record_dispatch_error failed: %s", ee)
    return sent


async def _run_loop(sender: Sender) -> None:
    log.info(
        "notification dispatcher running interval=%.1fs max_attempts=%d",
        settings.dispatch_interval_seconds,
        settings.dispatch_max_attempts,
    )
    while True:
        try:
            await _tick(sender)
        except Exception as err:
            log.warning("notification dispatcher tick crashed: %s", err)
        await asyncio.sleep(settings.dispatch_interval_seconds)


async def start(sender: Sender | None = None) -> None:
    """Spawn the worker if dispatch_enabled. No-op when disabled (e.g. tests)."""
    global _task
    if not settings.dispatch_enabled:
        log.info("notification dispatcher disabled by config")
        return
    if _task is not None and not _task.done():
        return
    _task = asyncio.create_task(_run_loop(sender or default_sender))


async def stop() -> None:
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except (asyncio.CancelledError, Exception):
        pass
    _task = None


# Test helper — drive a single tick without spawning the loop.
async def run_one_tick(sender: Sender | None = None) -> int:
    return await _tick(sender or default_sender)
