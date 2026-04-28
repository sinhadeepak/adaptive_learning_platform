"""OpenSearch alias-swap helpers — for zero-downtime index-version cutovers.

Pattern: configure the search service to query through an alias
(`SEARCH_TOPICS_INDEX=topics_active`). When you need to migrate to a new
analyzer config or mapping:

  1. Build the new concrete index (`topics_v3`) with the latest mapping.
  2. Reindex from the old concrete index (`topics_v2`) into the new one.
  3. Atomic-swap the alias: remove from old, add to new — single API call,
     no client gap.
  4. (Optional) drop the old concrete index.

Designed to be safe to call against a missing alias (first run) and against
a running stack (the swap is the only mutation).
"""

from __future__ import annotations

import logging
from typing import Any

from opensearchpy import AsyncOpenSearch
from opensearchpy.exceptions import NotFoundError

log = logging.getLogger(__name__)


async def current_index_for_alias(os_client: AsyncOpenSearch, alias: str) -> str | None:
    """Return the single concrete index the alias points at, or None if the
    alias doesn't exist. Raises ValueError if the alias points at multiple
    indices — that's a misconfiguration this script doesn't support."""
    try:
        body = await os_client.indices.get_alias(name=alias)
    except NotFoundError:
        return None
    indices = list(body.keys())
    if not indices:
        return None
    if len(indices) > 1:
        raise ValueError(
            f"alias {alias!r} points at multiple indices {indices}; manual cleanup required"
        )
    return indices[0]


async def swap_alias(
    os_client: AsyncOpenSearch,
    *,
    alias: str,
    new_index: str,
    old_index: str | None = None,
) -> None:
    """Atomic alias swap. If `old_index` is given, remove it from the alias
    in the same API call. If only adding (first cutover), call with
    `old_index=None`.

    Uses the `_aliases` actions endpoint — both remove + add execute in a
    single transaction at OpenSearch's side, so there's no observable
    "alias points nowhere" window."""
    actions: list[dict[str, Any]] = []
    if old_index is not None and old_index != new_index:
        actions.append({"remove": {"index": old_index, "alias": alias}})
    actions.append({"add": {"index": new_index, "alias": alias}})
    await os_client.indices.update_aliases(body={"actions": actions})
    log.info("alias swap: %s -> %s (was %s)", alias, new_index, old_index)


async def reindex(os_client: AsyncOpenSearch, *, source_index: str, target_index: str) -> int:
    """Copy every document from source to target. Blocks until done. Returns
    the doc count for log-line confirmation. Uses OpenSearch's built-in
    `_reindex` API — no app-side bulk loop, server-side throttled."""
    body = {
        "source": {"index": source_index},
        "dest": {"index": target_index},
    }
    res = await os_client.reindex(body=body, wait_for_completion=True, refresh=True)
    total = int(res.get("total", 0))
    log.info("reindex %s -> %s: %d docs", source_index, target_index, total)
    return total
