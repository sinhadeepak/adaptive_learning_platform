"""Zero-downtime index-version cutover.

Usage
-----
  python -m search.swap_alias --target topics_v3
  python -m search.swap_alias --target topics_v3 --reindex
  python -m search.swap_alias --target topics_v3 --reindex --drop-old

What it does
------------
1. Resolve the current concrete index the alias points at (or None on
   first cutover).
2. Create `--target` if it doesn't exist (uses the latest mapping from
   `index.TOPIC_MAPPING`).
3. If `--reindex` is set AND there's an old index, copy every doc from
   old → new via OpenSearch's built-in `_reindex` API.
4. Atomic alias swap: remove from old, add to new — single API call.
5. If `--drop-old` is set AND there's an old index AND the swap succeeded,
   delete the old concrete index.

Idempotent: re-running with the same `--target` is a no-op (alias is
already correct, reindex is a no-op into the same index, drop is skipped).

Override the alias name with `--alias`; defaults to whatever
`SEARCH_TOPICS_INDEX` is set to. In production set
`SEARCH_TOPICS_INDEX=topics_active` (an alias) so the search service
queries through it.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from opensearchpy.exceptions import RequestError

from search.aliases import current_index_for_alias, reindex, swap_alias
from search.config import settings
from search.index import TOPIC_MAPPING, client, close

log = logging.getLogger(__name__)


async def run(*, alias: str, target: str, do_reindex: bool, drop_old: bool) -> int:
    os_client = client()
    try:
        old = await current_index_for_alias(os_client, alias)
        log.info("alias=%s current=%s target=%s", alias, old, target)

        if old == target:
            log.info("alias %s already at %s — nothing to do", alias, target)
            return 0

        # 1. Create target (idempotent — RequestError on already-exists, swallow).
        try:
            await os_client.indices.create(index=target, body=TOPIC_MAPPING)
            log.info("created index %s", target)
        except RequestError as err:
            if "resource_already_exists_exception" not in str(err):
                raise
            log.info("index %s already exists — using as-is", target)

        # 2. Reindex if requested + we have an old to copy from.
        if do_reindex and old is not None:
            n = await reindex(os_client, source_index=old, target_index=target)
            log.info("reindexed %d docs", n)
        elif do_reindex and old is None:
            log.info("--reindex set but no old index — skipping (fresh cutover)")

        # 3. Atomic swap.
        await swap_alias(os_client, alias=alias, new_index=target, old_index=old)
        log.info("alias %s now points at %s", alias, target)

        # 4. Drop old if requested.
        if drop_old and old is not None and old != target:
            await os_client.indices.delete(index=old)
            log.info("dropped old index %s", old)
    finally:
        await close()
    return 0


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    )
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--target",
        required=True,
        help='New concrete index name (e.g. "topics_v3")',
    )
    parser.add_argument(
        "--alias",
        default=settings.topics_index,
        help="Alias to swap (defaults to SEARCH_TOPICS_INDEX, currently %(default)s)",
    )
    parser.add_argument(
        "--reindex",
        action="store_true",
        help="Copy docs from the current index to target before swapping",
    )
    parser.add_argument(
        "--drop-old",
        action="store_true",
        help="Delete the previous concrete index after a successful swap",
    )
    args = parser.parse_args()

    return asyncio.run(
        run(
            alias=args.alias,
            target=args.target,
            do_reindex=args.reindex,
            drop_old=args.drop_old,
        )
    )


if __name__ == "__main__":
    sys.exit(main())
