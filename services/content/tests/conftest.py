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

from content import catalog_client, db
from content.catalog_client import AuthorizeResult


async def _truncate() -> None:
    conn = await asyncpg.connect(
        host="localhost",
        port=35432,
        user="postgres",
        password="postgres",  # noqa: S106  # local dev DB
        database="content",
    )
    try:
        # Sprint 9 — assignment_progress + assignment_questions FK back to
        # assignments; CASCADE handles the cleanup. questions table is
        # the original Sprint 3 table.
        await conn.execute(
            "TRUNCATE content_schema.assignment_progress, "
            "content_schema.assignment_questions, "
            "content_schema.assignments, "
            "content_schema.questions RESTART IDENTITY CASCADE"
        )
    finally:
        await conn.close()


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    asyncio.run(_truncate())
    db._engine = None
    db._sessionmaker = None
    # Sprint 10 S10-A — content unit tests shouldn't depend on a running
    # catalog service. The catalog authorize hop is exercised in catalog's
    # own tests; here we stub it to always-allow so we exercise content's
    # own logic in isolation. Tests that explicitly want to verify the
    # 403/404 branches must monkeypatch this back themselves.
    async def _stub_authorize(
        *, bearer_token: str, topic_id: str  # noqa: ARG001
    ) -> AuthorizeResult:
        return AuthorizeResult(allowed=True, not_found=False)

    monkeypatch.setattr(catalog_client, "authorize_topic", _stub_authorize)
    monkeypatch.setattr("content.routes.authorize_topic", _stub_authorize)
    yield
    db._engine = None
    db._sessionmaker = None
