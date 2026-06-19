"""Shared fixtures for localisation tests.

Provides `content_session` — an async SQLAlchemy session bound to the
migrated `content_schema` in the `learning_test` database. The root
`tests/conftest.py` provisions + migrates `learning_test` once per session
via `_provision_test_db`, so by the time any test in this package runs the
schema is already at head.
"""

from __future__ import annotations

import os
import secrets
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import jwt
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Root conftest.py sets this before our package is imported, but set a
# standalone fallback for running this file in isolation.
os.environ.setdefault(
    "CONTENT_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/learning_test",
)


_JWT_SECRET = "dev-only-change-me-in-staging-at-least-32-bytes-long"


@pytest.fixture(autouse=True)
def _reset_content_db_engine() -> None:
    """Reset the cached content DB engine before each test.

    The content `db` module caches an AsyncEngine as a module-level
    singleton. Each pytest-asyncio test runs in its own event loop, so
    a cached engine from a previous test will be bound to a dead loop and
    raise "got Future attached to a different loop". We reset it here so
    route tests that hit the DB (via ASGITransport + FastAPI dependency
    injection) always create a fresh engine on the current loop.
    """
    from learning.content import db
    db._engine = None
    db._sessionmaker = None


@pytest.fixture
def admin_headers() -> dict[str, str]:
    """Mint a short-lived PLATFORM_ADMIN JWT using the default dev secret.

    The language CRUD routes are guarded by require_admin (added in
    commit e56151c). This fixture mints a PLATFORM_ADMIN token so all
    admin-gated localisation routes can be tested. Other tests in
    tests/localisation/ should reuse this fixture.
    """
    now = datetime.now(tz=UTC)
    token = jwt.encode(
        {
            "sub": "00000000-0000-0000-0000-0000000000ad",
            "role": "PLATFORM_ADMIN",
            "admin_access_level": "PLATFORM",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=15)).timestamp()),
            "jti": secrets.token_urlsafe(12),
            "token_type": "access",
        },
        _JWT_SECRET,
        algorithm="HS256",
    )
    return {"authorization": f"Bearer {token}"}


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
