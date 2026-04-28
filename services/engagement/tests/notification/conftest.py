"""Shared test fixtures for Notification."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest_asyncio
from sqlalchemy import text

os.environ.setdefault(
    "NOTIFICATION_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/notification",
)

from engagement.notification import db


@pytest_asyncio.fixture(autouse=True)
async def _clean_state() -> AsyncIterator[None]:
    db._engine = None
    db._sessionmaker = None
    async with db.sessionmaker()() as session:
        await session.execute(text("TRUNCATE notification_schema.notifications"))
        await session.execute(text("TRUNCATE notification_schema.processed_events"))
        await session.commit()
    yield
    await db.dispose()
