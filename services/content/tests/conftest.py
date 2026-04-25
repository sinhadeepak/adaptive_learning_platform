"""Shared test fixtures for Content.

Subtle: TestClient runs each request inside its own ephemeral event loop.
If conftest creates a shared SQLAlchemy engine on pytest-asyncio's loop and
TestClient then borrows it, asyncpg cross-loop bookkeeping breaks. So we
truncate using a one-shot raw asyncpg connection (own loop, own teardown)
and let each test's TestClient create + dispose its own engine.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Iterator

import asyncpg
import pytest

os.environ.setdefault(
    "CONTENT_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/content",
)
os.environ.setdefault(
    "CONTENT_JWT_SECRET",
    "dev-only-change-me-in-staging-at-least-32-bytes-long",
)

from content import db


async def _truncate() -> None:
    conn = await asyncpg.connect(
        host="localhost",
        port=35432,
        user="postgres",
        password="postgres",  # noqa: S106  # local dev DB
        database="content",
    )
    try:
        await conn.execute("TRUNCATE content_schema.questions")
    finally:
        await conn.close()


@pytest.fixture(autouse=True)
def _clean_state() -> Iterator[None]:
    asyncio.run(_truncate())
    db._engine = None
    db._sessionmaker = None
    yield
    db._engine = None
    db._sessionmaker = None
