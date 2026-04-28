"""Async SQLAlchemy engine + sessionmaker for marketplace.

Lazy-init pattern matches the rest of the stack: the engine is created
on first sessionmaker() call, not at import time, so test conftests can
override DATABASE_URL via env var before anything connects.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    async_sessionmaker,
    create_async_engine,
)

from marketplace.config import settings

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker | None = None


def _get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(settings.database_url, pool_size=5, max_overflow=2)
    return _engine


def sessionmaker() -> async_sessionmaker:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(_get_engine(), expire_on_commit=False)
    return _sessionmaker


async def dispose() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None
