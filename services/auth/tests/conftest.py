"""Shared test fixtures — reset module-level singletons (DB engine + Redis client)
between tests so the asyncio event loop is fresh per `pytest-asyncio` function-scope."""

from __future__ import annotations

import pytest_asyncio

from auth import db, lockout


@pytest_asyncio.fixture(autouse=True)
async def _reset_singletons_per_test() -> None:
    # DB engine
    if db._engine is not None:  # type: ignore[attr-defined]
        await db._engine.dispose()  # type: ignore[attr-defined]
    db._engine = None  # type: ignore[attr-defined]
    db._sessionmaker = None  # type: ignore[attr-defined]
    # Lockout Redis client
    if lockout._client is not None:  # type: ignore[attr-defined]
        try:
            await lockout._client.aclose()  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            pass
    lockout._client = None  # type: ignore[attr-defined]
