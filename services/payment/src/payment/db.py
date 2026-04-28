"""Async SQLAlchemy session factory for the payment service.

Mirrors the pattern used by user-profile / notification / doubts:
- Single shared engine + sessionmaker, lazy-initialized on first call.
- `dispose()` is idempotent for clean test teardown.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from payment.config import settings

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker | None = None  # type: ignore[type-arg]


def sessionmaker() -> async_sessionmaker:  # type: ignore[type-arg]
    global _engine, _sessionmaker
    if _sessionmaker is None:
        _engine = create_async_engine(settings.database_url, future=True)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _sessionmaker


async def dispose() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None
