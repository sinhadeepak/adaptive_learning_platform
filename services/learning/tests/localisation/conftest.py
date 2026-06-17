"""Shared fixtures for localisation tests.

Provides `content_session` — an async SQLAlchemy session bound to the
migrated `content_schema` in the `learning_test` database. The root
`tests/conftest.py` provisions + migrates `learning_test` once per session
via `_provision_test_db`, so by the time any test in this package runs the
schema is already at head.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Root conftest.py sets this before our package is imported, but set a
# standalone fallback for running this file in isolation.
os.environ.setdefault(
    "CONTENT_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/learning_test",
)


@pytest_asyncio.fixture
async def content_session() -> AsyncIterator[AsyncSession]:
    """Yield an AsyncSession connected to the learning_test DB.

    Does NOT truncate — these are schema-smoke tests that only read seed
    data or insert and immediately verify, so isolation is per-test by
    design.  If a test inserts rows it should clean up via rollback or
    explicit delete; tests in this suite that insert use fixed UUIDs so
    re-runs are idempotent (INSERT … ON CONFLICT or DELETE first).
    """
    engine = create_async_engine(os.environ["CONTENT_DATABASE_URL"])
    sm = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with sm() as session:
            yield session
    finally:
        await engine.dispose()
