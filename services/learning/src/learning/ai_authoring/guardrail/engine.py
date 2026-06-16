"""GuardrailEngine — orchestrates L1 → L2 → L3 with a retry loop.

Per the AI Content Guardrail Action Plan. The engine does NOT own L1
generation (the 29 per-type prompt templates live in `ai_authoring.draft`);
the caller passes a `generate_fn` that runs one L1 generation — with the
guardrail preamble already injected — and the engine drives audit (L2),
deterministic verification (L3), the verdict, retries on FAIL (max N), and
escalation. Returns `(payload, GuardrailVerdict)`.

I/O collaborators (gateway, embedding client, hash/vector stores, trace
sink) are injected so unit tests substitute in-memory fakes.
"""

from __future__ import annotations

import logging
from typing import Awaitable, Callable

from pydantic import BaseModel

from learning.ai_authoring.guardrail import audit
from learning.ai_authoring.guardrail.escalation import (
    NullTraceSink,
    TraceSink,
    escalate_to_admin,
    record_attempt,
)
from learning.ai_authoring.guardrail.prompt_injection import GUARDRAIL_PROMPT_VERSION
from learning.ai_authoring.guardrail.schemas import (
    GuardrailConfig,
    GuardrailVerdict,
)
from learning.ai_authoring.guardrail.similarity import (
    EmbeddingClient,
    HashStore,
    VectorStore,
    md5_hash,
    run_l3,
)
from learning.ai_gateway import AIGateway

log = logging.getLogger(__name__)

GenerateFn = Callable[[int], Awaitable[BaseModel]]
StemExtractor = Callable[[BaseModel], str]


def default_stem_extractor(payload: BaseModel) -> str:
    """Best-effort stem for hashing/auditing. Most draft schemas expose
    `.stem`; ASSERTION_REASON uses `.assertion`. Fall back to the first
    string field so no type slips through unhashed."""
    for attr in ("stem", "assertion"):
        val = getattr(payload, attr, None)
        if isinstance(val, str) and val:
            return val
    data = payload.model_dump() if hasattr(payload, "model_dump") else {}
    for v in data.values():
        if isinstance(v, str) and v:
            return v
    return ""


class GuardrailEngine:
    def __init__(
        self,
        gateway: AIGateway,
        *,
        config: GuardrailConfig | None = None,
        hash_store: HashStore | None = None,
        vector_store: VectorStore | None = None,
        embedding_client: EmbeddingClient | None = None,
        trace_sink: TraceSink | None = None,
    ) -> None:
        self._gateway = gateway
        self._config = config or GuardrailConfig()
        self._hash_store = hash_store
        self._vector_store = vector_store
        self._embedding_client = embedding_client
        self._trace_sink = trace_sink or NullTraceSink()

    @property
    def config(self) -> GuardrailConfig:
        return self._config

    async def run(
        self,
        generate_fn: GenerateFn,
        *,
        type_id: str,
        topic: str,
        group_id: str,
        stem_extractor: StemExtractor = default_stem_extractor,
        creator_id: str | None = None,
    ) -> tuple[BaseModel, GuardrailVerdict]:
        """Generate-audit-verify with retry. Returns the last payload plus
        its verdict (PASS/REVIEW on success; FAIL after max attempts)."""
        last_payload: BaseModel | None = None
        last_verdict: GuardrailVerdict | None = None

        for attempt in range(1, self._config.max_attempts + 1):
            payload = await generate_fn(attempt)  # L1 (preamble in generate_fn)
            last_payload = payload
            stem = stem_extractor(payload)

            try:
                verdict = await self._audit_and_verify(
                    payload, stem, type_id, topic, attempt, creator_id
                )
            except Exception as e:  # noqa: BLE001
                # L2/L3 are infra-dependent (LLM call, embeddings, DB). An
                # infra failure must NOT 500 the draft or be read as a
                # copyright pass — degrade to REVIEW so a human checks it.
                # A genuine content FAIL is a *verdict*, not an exception,
                # and still blocks below.
                log.warning("guardrail audit degraded to REVIEW: %s", e)
                verdict = GuardrailVerdict(
                    status="REVIEW",
                    generation_attempt=attempt,
                    guardrail_version=GUARDRAIL_PROMPT_VERSION,
                    normalized_hash=md5_hash(stem) if stem else None,
                    fail_reason=None,
                )
            status = verdict.status
            last_verdict = verdict
            await record_attempt(
                self._trace_sink,
                generation_group_id=group_id,
                attempt=attempt,
                verdict=verdict,
                type_id=type_id,
            )

            if status != "FAIL":
                return payload, verdict
            # FAIL → regenerate (next loop iteration).

        # Exhausted attempts — escalate and return the final FAIL verdict.
        assert last_payload is not None and last_verdict is not None
        await escalate_to_admin(
            self._trace_sink,
            generation_group_id=group_id,
            verdict=last_verdict,
            type_id=type_id,
        )
        return last_payload, last_verdict

    async def _audit_and_verify(
        self,
        payload: BaseModel,
        stem: str,
        type_id: str,
        topic: str,
        attempt: int,
        creator_id: str | None,
    ) -> GuardrailVerdict:
        """Run L2 (self-audit) + L3 (similarity) and build the verdict.

        Raises on infra failure — the caller degrades that to REVIEW."""
        report = await audit.run_self_audit(
            self._gateway,
            question_payload=payload.model_dump(),
            type_id=type_id,
            topic=topic,
            version=self._config.prompt_version,
            creator_id=creator_id,
        )

        embedding: list[float] | None = None
        if self._embedding_client is not None and self._vector_store is not None:
            embedding = await self._embedding_client.embed(stem, creator_id=creator_id)
        l3 = await run_l3(
            stem=stem,
            embedding=embedding,
            hash_store=_or_empty_hash_store(self._hash_store),
            vector_store=self._vector_store,
            threshold=self._config.similarity_threshold,
        )

        status = audit.decide(report, l3, self._config)
        return GuardrailVerdict(
            status=status,
            generation_attempt=attempt,
            guardrail_version=GUARDRAIL_PROMPT_VERSION,
            audit_confidence=report.confidence,
            similarity_score=l3.similarity_score,
            nearest_neighbour_id=l3.nearest_neighbour_id,
            exact_hash_hit=l3.exact_hash_hit,
            normalized_hash=md5_hash(stem) if stem else None,
            fail_reason=report.fail_reason if status == "FAIL" else None,
            self_audit=report,
        )


class _EmptyHashStore:
    """No-op hash store for when Redis isn't wired (L3 hash check skipped)."""

    async def exists(self, md5: str) -> bool:
        return False

    async def reserve(self, md5: str, ttl_seconds: int = 3600) -> None:
        return None

    async def commit(self, md5: str, question_id: str) -> None:
        return None


def _or_empty_hash_store(store: HashStore | None) -> HashStore:
    return store if store is not None else _EmptyHashStore()
