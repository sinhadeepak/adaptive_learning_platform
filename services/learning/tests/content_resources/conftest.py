"""Shared fixtures for /content/resources tests.

Mirrors tests/content/conftest.py: truncate via a one-shot raw asyncpg
connection (own loop) and let each TestClient create + dispose its own
engine. Truncates only the resources + view-event tables so these suites
never touch the seeded dev DB (root conftest points us at learning_test).
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Iterator

import asyncpg
import pytest

os.environ.setdefault(
    "CONTENT_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/learning_test",
)
os.environ.setdefault(
    "CONTENT_JWT_SECRET",
    "dev-only-change-me-in-staging-at-least-32-bytes-long",
)

from learning.content import db


async def _truncate() -> None:
    conn = await asyncpg.connect(
        host="localhost",
        port=35432,
        user="postgres",
        password="postgres",  # noqa: S106  # local dev DB
        database="learning_test",
    )
    try:
        await conn.execute(
            "TRUNCATE content_schema.resource_view_events, "
            "content_schema.concept_resources RESTART IDENTITY CASCADE"
        )
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
