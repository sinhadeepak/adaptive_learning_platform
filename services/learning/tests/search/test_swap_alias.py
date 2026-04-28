"""Tests for the alias-swap automation against live OpenSearch.

Skipped when OpenSearch isn't reachable. Each test creates a private
alias + concrete index pair to avoid colliding with the live `topics_v2`.
"""

from __future__ import annotations

import contextlib
import os
import secrets

import pytest
from opensearchpy.exceptions import ConnectionError as OSConnectionError

from learning.search.aliases import current_index_for_alias, reindex, swap_alias
from learning.search.index import TOPIC_MAPPING, client, close

os.environ.setdefault("SEARCH_OPENSEARCH_URL", "http://localhost:39200")

pytestmark = pytest.mark.asyncio


def _name(prefix: str) -> str:
    return f"swaptest-{prefix}-{secrets.token_hex(4)}"


@pytest.fixture(autouse=True)
async def _close_client() -> None:
    """Always release the cached client between tests so connection state
    doesn't leak event-loop bindings across pytest-asyncio fixtures."""
    yield
    await close()


async def _ensure_os() -> None:
    """Skip the suite if OpenSearch isn't up."""
    try:
        os_client = client()
        # Health probe — small request_timeout so a missing OS skips fast
        # instead of stalling the whole suite.
        await os_client.cluster.health(request_timeout=2)
    except (OSConnectionError, ConnectionError) as err:
        pytest.skip(f"OpenSearch unreachable: {err}")


async def _create(os_client, name: str) -> None:
    await os_client.indices.create(index=name, body=TOPIC_MAPPING)


async def _cleanup(os_client, *names: str) -> None:
    for n in names:
        if await os_client.indices.exists(index=n):
            await os_client.indices.delete(index=n)


async def test_current_index_for_alias_returns_none_when_missing() -> None:
    await _ensure_os()
    os_client = client()
    alias = _name("alias")
    got = await current_index_for_alias(os_client, alias)
    assert got is None


async def test_swap_alias_first_time_just_adds() -> None:
    await _ensure_os()
    os_client = client()
    alias = _name("alias")
    target = _name("v1")
    try:
        await _create(os_client, target)
        await swap_alias(os_client, alias=alias, new_index=target, old_index=None)
        got = await current_index_for_alias(os_client, alias)
        assert got == target
    finally:
        # Remove the alias before deleting the index
        with contextlib.suppress(Exception):
            await os_client.indices.delete_alias(index=target, name=alias)
        await _cleanup(os_client, target)


async def test_swap_alias_atomically_moves_old_to_new() -> None:
    await _ensure_os()
    os_client = client()
    alias = _name("alias")
    v1 = _name("v1")
    v2 = _name("v2")
    try:
        await _create(os_client, v1)
        await _create(os_client, v2)
        # Initial state — alias points at v1
        await swap_alias(os_client, alias=alias, new_index=v1, old_index=None)
        assert await current_index_for_alias(os_client, alias) == v1

        # Swap to v2 — old removal + add are atomic
        await swap_alias(os_client, alias=alias, new_index=v2, old_index=v1)
        assert await current_index_for_alias(os_client, alias) == v2

        # v1 still exists (we didn't drop it)
        assert await os_client.indices.exists(index=v1)
    finally:
        with contextlib.suppress(Exception):
            await os_client.indices.delete_alias(index="*", name=alias)
        await _cleanup(os_client, v1, v2)


async def test_reindex_copies_documents() -> None:
    await _ensure_os()
    os_client = client()
    src = _name("src")
    dst = _name("dst")
    try:
        await _create(os_client, src)
        await _create(os_client, dst)
        # Seed src with a few docs
        for i in range(5):
            await os_client.index(
                index=src,
                id=f"d{i}",
                body={"id": f"d{i}", "type": "topic", "title": f"Doc {i}"},
                refresh=True,
            )
        n = await reindex(os_client, source_index=src, target_index=dst)
        assert n == 5
        count_resp = await os_client.count(index=dst)
        assert count_resp["count"] == 5
    finally:
        await _cleanup(os_client, src, dst)


async def test_multi_index_alias_raises() -> None:
    await _ensure_os()
    os_client = client()
    alias = _name("multi")
    a = _name("a")
    b = _name("b")
    try:
        await _create(os_client, a)
        await _create(os_client, b)
        # Manually point the alias at both — swap_alias would never produce
        # this state, but `current_index_for_alias` should refuse to guess.
        await os_client.indices.update_aliases(
            body={
                "actions": [
                    {"add": {"index": a, "alias": alias}},
                    {"add": {"index": b, "alias": alias}},
                ]
            }
        )
        with pytest.raises(ValueError, match="multiple indices"):
            await current_index_for_alias(os_client, alias)
    finally:
        with contextlib.suppress(Exception):
            await os_client.indices.delete_alias(index="*", name=alias)
        await _cleanup(os_client, a, b)
