"""L3 — deterministic verification (verification layer).

Two cheap, deterministic checks run before storage:
  1. MD5 of the normalised stem against a Redis hash table → exact-duplicate
     instant reject.
  2. pgvector cosine similarity against the existing question bank → flag
     when the nearest neighbour exceeds the configured threshold (0.92).

The pure helpers (`normalize_stem`, `md5_hash`, `cosine`) are unit-tested
standalone. The store classes (`RedisHashStore`, `PgVectorStore`,
`EmbeddingClient`) wrap I/O and are injected into the engine so tests can
substitute in-memory fakes — mirroring how AIGateway takes a provider map.
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import Any, Protocol

from learning.ai_authoring.guardrail.schemas import L3Result
from learning.ai_gateway import AIGateway

# Embedding model + dimensionality. 1536 matches the questions.embedding
# vector(1536) column. Routed through the gateway "embedding" touchpoint.
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMS = 1536

_PUNCT_RE = re.compile(r"[^\w\s]", flags=re.UNICODE)
_WS_RE = re.compile(r"\s+")


def normalize_stem(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace. The canonical
    form hashed for exact-duplicate detection (Action Plan TASK-011)."""
    lowered = text.lower()
    no_punct = _PUNCT_RE.sub(" ", lowered)
    return _WS_RE.sub(" ", no_punct).strip()


def md5_hash(text: str) -> str:
    """MD5 of the normalised stem. Stable dedup key across sessions."""
    return hashlib.md5(normalize_stem(text).encode("utf-8")).hexdigest()


def cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity in [-1, 1]. Returns 0.0 for a zero vector."""
    if len(a) != len(b):
        raise ValueError(f"vector length mismatch: {len(a)} vs {len(b)}")
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


# ── Injectable store protocols ───────────────────────────────────────────────


class HashStore(Protocol):
    async def exists(self, md5: str) -> bool: ...
    async def reserve(self, md5: str, ttl_seconds: int) -> None: ...
    async def commit(self, md5: str, question_id: str) -> None: ...


class VectorStore(Protocol):
    async def nearest(self, embedding: list[float]) -> tuple[str, float] | None: ...
    async def store(self, question_id: str, embedding: list[float]) -> None: ...


# ── Redis-backed exact-duplicate store ───────────────────────────────────────


class RedisHashStore:
    """Two namespaces (Action Plan §6, reconciled in the plan):
      - `question_hash:{md5}`         → persistent (no TTL): the published/
        DRAFT bank. Survives forever so dedup never silently degrades.
      - `question_hash_pending:{md5}` → TTL'd reservation that debounces a
        bulk-draft fan-out producing identical stems inside one batch.
    L3 treats a hit in *either* namespace as an exact duplicate.
    """

    BANK_PREFIX = "question_hash:"
    PENDING_PREFIX = "question_hash_pending:"

    def __init__(self, redis_client: Any) -> None:
        self._r = redis_client

    async def exists(self, md5: str) -> bool:
        if await self._r.exists(self.BANK_PREFIX + md5):
            return True
        return bool(await self._r.exists(self.PENDING_PREFIX + md5))

    async def reserve(self, md5: str, ttl_seconds: int = 3600) -> None:
        await self._r.set(self.PENDING_PREFIX + md5, "pending", ex=ttl_seconds)

    async def commit(self, md5: str, question_id: str) -> None:
        """Promote to the persistent bank on successful DRAFT write."""
        await self._r.set(self.BANK_PREFIX + md5, question_id)
        await self._r.delete(self.PENDING_PREFIX + md5)


# ── pgvector nearest-neighbour store ─────────────────────────────────────────


class PgVectorStore:
    """Queries `content_schema.questions.embedding` via pgvector cosine
    distance. Accepts an asyncpg-style connection acquirer so it composes
    with the content service's existing session management."""

    def __init__(self, execute_fn: Any) -> None:
        # execute_fn(sql, *params) -> list[Row]; injected so the store
        # stays decoupled from the concrete DB driver/session.
        self._execute = execute_fn

    async def nearest(self, embedding: list[float]) -> tuple[str, float] | None:
        vec = "[" + ",".join(repr(float(x)) for x in embedding) + "]"
        rows = await self._execute(
            """
            SELECT id::text,
                   1 - (embedding <=> $1::vector) AS cosine
            FROM content_schema.questions
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> $1::vector
            LIMIT 1
            """,
            vec,
        )
        if not rows:
            return None
        row = rows[0]
        return (row["id"], float(row["cosine"]))

    async def store(self, question_id: str, embedding: list[float]) -> None:
        vec = "[" + ",".join(repr(float(x)) for x in embedding) + "]"
        await self._execute(
            "UPDATE content_schema.questions SET embedding = $1::vector WHERE id = $2",
            vec,
            question_id,
        )


# ── Embedding client (gateway-routed) ────────────────────────────────────────


class EmbeddingClient:
    """Wraps `AIGateway.embed` so embedding generation stays behind the
    single ADR-0019 door (never a direct OpenAI call)."""

    def __init__(self, gateway: AIGateway) -> None:
        self._gateway = gateway

    async def embed(self, text: str, *, creator_id: str | None = None) -> list[float]:
        vectors = await self._gateway.embed(
            texts=[text],
            model=EMBEDDING_MODEL,
            creator_id=creator_id,
        )
        return vectors[0]


# ── L3 runner ────────────────────────────────────────────────────────────────


async def run_l3(
    *,
    stem: str,
    embedding: list[float] | None,
    hash_store: HashStore,
    vector_store: VectorStore | None,
    threshold: float,
) -> L3Result:
    """Run the two deterministic checks. Exact-hash short-circuits the
    (more expensive) vector lookup since it's already an instant reject."""
    md5 = md5_hash(stem)
    if await hash_store.exists(md5):
        return L3Result(exact_hash_hit=True)

    if embedding is None or vector_store is None:
        return L3Result(exact_hash_hit=False)

    neighbour = await vector_store.nearest(embedding)
    if neighbour is None:
        return L3Result(exact_hash_hit=False)
    neighbour_id, score = neighbour
    return L3Result(
        exact_hash_hit=False,
        similarity_score=score,
        nearest_neighbour_id=neighbour_id,
        over_threshold=score > threshold,
    )
