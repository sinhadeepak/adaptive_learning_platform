"""Shared test fixtures for Analytics."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

# Force a clean module-level engine cache between tests so each gets a fresh
# event loop binding (function-scoped pytest-asyncio).
os.environ.setdefault(
    "ANALYTICS_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/engagement",
)

from engagement.analytics import db
from engagement.main import app


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture(autouse=True)
async def _clean_state() -> AsyncIterator[None]:
    db._engine = None
    db._sessionmaker = None
    async with db.sessionmaker()() as session:
        await session.execute(text("TRUNCATE analytics_schema.mastery"))
        await session.execute(text("TRUNCATE analytics_schema.readiness"))
        await session.execute(text("TRUNCATE analytics_schema.processed_sessions"))
        await session.execute(text("TRUNCATE analytics_schema.streaks"))
        await session.commit()
    yield
    await db.dispose()
