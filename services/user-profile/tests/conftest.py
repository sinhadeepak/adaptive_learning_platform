"""Shared test fixtures — reset module-level engine between tests (function-scoped loops)."""

from __future__ import annotations

import pytest_asyncio

from user_profile import db


@pytest_asyncio.fixture(autouse=True)
async def _reset_engine_per_test() -> None:
    if db._engine is not None:  # type: ignore[attr-defined]
        await db._engine.dispose()  # type: ignore[attr-defined]
    db._engine = None  # type: ignore[attr-defined]
    db._sessionmaker = None  # type: ignore[attr-defined]
