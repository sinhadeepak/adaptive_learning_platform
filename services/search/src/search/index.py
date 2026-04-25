"""OpenSearch client + index lifecycle helpers.

The `topics_v1` index has English analyzer for Sprint 1. SPIKE-02 informs the
Hindi analyzer choice for `topics_v2` (Sprint 2). Index name is versioned so
re-indexing into a new analyzer can happen behind a small swap with zero downtime.
"""

from __future__ import annotations

from typing import Any

from opensearchpy import AsyncOpenSearch

from search.config import settings

_client: AsyncOpenSearch | None = None


def client() -> AsyncOpenSearch:
    global _client
    if _client is None:
        _client = AsyncOpenSearch(
            hosts=[settings.opensearch_url],
            use_ssl=False,
            verify_certs=False,
            ssl_show_warn=False,
        )
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


TOPIC_MAPPING: dict[str, Any] = {
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
        "analysis": {
            "analyzer": {
                "alp_english": {
                    "tokenizer": "standard",
                    "filter": ["lowercase", "english_stop", "english_stemmer"],
                }
            },
            "filter": {
                "english_stop": {"type": "stop", "stopwords": "_english_"},
                "english_stemmer": {"type": "stemmer", "language": "english"},
            },
        },
    },
    "mappings": {
        "properties": {
            "id": {"type": "keyword"},
            "type": {"type": "keyword"},
            "title": {"type": "text", "analyzer": "alp_english"},
            "subtitle": {"type": "text", "analyzer": "alp_english"},
            "subject_name": {"type": "keyword"},
            "exam_code": {"type": "keyword"},
            "tier": {"type": "keyword"},
            "title_suggest": {"type": "completion"},
        }
    },
}


async def ensure_index() -> None:
    os_client = client()
    exists = await os_client.indices.exists(index=settings.topics_index)
    if not exists:
        await os_client.indices.create(index=settings.topics_index, body=TOPIC_MAPPING)


async def drop_index() -> None:
    os_client = client()
    if await os_client.indices.exists(index=settings.topics_index):
        await os_client.indices.delete(index=settings.topics_index)


async def bulk_index_topics(docs: list[dict[str, Any]]) -> int:
    """Bulk index topics. `docs` is a list of plain dicts shaped to the mapping."""
    if not docs:
        return 0
    os_client = client()
    body: list[dict[str, Any]] = []
    for d in docs:
        body.append({"index": {"_index": settings.topics_index, "_id": d["id"]}})
        body.append(d)
    await os_client.bulk(body=body, refresh="true")
    return len(docs)
