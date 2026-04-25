"""Reset OpenSearch client between tests."""

from __future__ import annotations

import pytest_asyncio

from search import index as idx


@pytest_asyncio.fixture(autouse=True)
async def _reset_os_client_per_test() -> None:
    if idx._client is not None:  # type: ignore[attr-defined]
        await idx._client.close()  # type: ignore[attr-defined]
    idx._client = None  # type: ignore[attr-defined]
