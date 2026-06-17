"""AIGateway — main orchestrator.

Per ADR-0019. Single internal door for every LLM call. Per-touchpoint
provider routing, structured-output enforcement (delegated to
provider), PII scrubbing, fallback on primary failure, audit log via
structured logging.

Quotas + cost dashboards land in S40 (when first real consumer
arrives). Calibration + circuit breaker land in S43.
"""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from typing import Any

from learning.ai_gateway.cache import CACHEABLE_TOUCHPOINTS, get_cache
from learning.ai_gateway.metrics import record_call
from learning.ai_gateway.pii_scrubber import scrub_payload
from learning.ai_gateway.prompt_registry import PromptRegistry
from learning.ai_gateway.providers import OpenAIProvider, Provider, ProviderError, StubProvider
from learning.ai_gateway.quotas import QuotaChecker, QuotaConfig, QuotaExceededError
from learning.ai_gateway.routing import RoutingConfig, default_stub_config

# P5-S49 — audit log writer; lazy-imported so the gateway still works
# when content_schema isn't reachable (early dev, tests without DB).
try:  # noqa: SIM105
    from learning.ai_gateway.audit_log import write_audit_row
except Exception:  # pragma: no cover
    write_audit_row = None  # type: ignore[assignment]

log = logging.getLogger(__name__)


class AIGatewayError(Exception):
    """Raised when both primary + fallback fail. Calling handler
    degrades per its own semantics (catalogue §5.3 / ADR-0019)."""


class AIGateway:
    """Public surface — `call(touchpoint, …)` returns a validated
    schema instance.

    Construction: receives a routing config + prompt registry + a
    provider map. Provider map keys are the ProviderName literal; the
    Gateway dispatches by `routing[touchpoint].primary.provider`.

    Stateless apart from the audit log + provider clients. Safe to
    share across requests (FastAPI dependency-injection singleton).
    """

    def __init__(
        self,
        routing: RoutingConfig | None = None,
        prompts: PromptRegistry | None = None,
        providers: dict[str, Provider] | None = None,
        quotas: QuotaChecker | None = None,
    ) -> None:
        self.routing = routing or default_stub_config()
        self.prompts = prompts or PromptRegistry()
        # Default provider map: stub always present so dev stack
        # works without API keys; OpenAI lazy-loads when first used.
        self._providers: dict[str, Provider] = providers or {"stub": StubProvider()}
        self._openai_lazy: OpenAIProvider | None = None
        # Quota check is opt-in. None = no enforcement (fail-open).
        # S40+ wires the Redis-backed checker via Depends() — see
        # ai_gateway/quotas.make_redis_incr_fn.
        self._quotas = quotas or QuotaChecker(QuotaConfig(), incr_fn=None)

    # ── Public API ───────────────────────────────────────────────────────

    async def call(
        self,
        *,
        touchpoint: str,
        prompt_template_id: str,
        prompt_template_version: str,
        prompt_inputs: dict[str, Any],
        schema: type,
        creator_id: str | None = None,
    ) -> Any:
        """Make an LLM call. Returns a validated `schema` instance.

        Per ADR-0019: explicit `(prompt_template_id, version)`; no
        implicit "latest". PII scrubbing pre-call. Quota check before
        provider dispatch. Fallback on primary failure. Audit log per
        call. AIGatewayError raised when both primary and fallback
        fail. QuotaExceededError raised when over-quota (caller
        surfaces as 429 with reset_at).
        """
        if touchpoint not in self.routing.routing:
            raise AIGatewayError(
                f"no routing config for touchpoint {touchpoint!r}"
            )

        # Quota check — pre-provider so over-quota fails fast without
        # burning a token. QuotaExceededError propagates to caller.
        await self._quotas.check(touchpoint=touchpoint, creator_id=creator_id)

        tp_routing = self.routing.routing[touchpoint]

        # Look up prompt template — explicit version, no fallback.
        template = self.prompts.get(prompt_template_id, prompt_template_version)
        if template.touchpoint != touchpoint:
            raise AIGatewayError(
                f"prompt template {prompt_template_id} v{prompt_template_version} "
                f"is for touchpoint {template.touchpoint!r}, not {touchpoint!r}"
            )

        # Pre-call PII scrub.
        scrub = scrub_payload(prompt_inputs)
        system = template.render_system(scrub.payload)

        # Hash the (template, scrubbed inputs) for audit + cache key.
        input_hash = _hash_inputs(prompt_template_id, prompt_template_version, scrub.payload)
        call_id = str(uuid.uuid4())
        started = time.monotonic()

        # P5-S52 — deterministic-input cache lookup (touchpoint-gated).
        # Idempotent touchpoints (translation, quality_check, vision)
        # cache by (touchpoint, input_hash). Returns the cached
        # validated instance when present + unexpired.
        cache = get_cache()
        if touchpoint in CACHEABLE_TOUCHPOINTS:
            cache_key = f"{touchpoint}:{input_hash}"
            cached = cache.get(touchpoint=touchpoint, key=cache_key)
            if cached is not None:
                # Re-validate the cached payload through the schema so
                # the caller always gets a fresh model instance.
                return schema.model_validate(cached)

        # Try primary, then fallback.
        for attempt_role, provider_cfg in _candidates(tp_routing):
            provider = self._get_provider(provider_cfg.provider)
            try:
                result = await provider.complete(
                    model=provider_cfg.model,
                    system=system,
                    user=scrub.payload,
                    schema=schema,
                    max_tokens=provider_cfg.max_tokens,
                    timeout_ms=tp_routing.timeout_ms,
                )
                # Validate against caller-supplied schema for safety;
                # provider already validated but Gateway re-checks
                # (defence in depth).
                validated = schema.model_validate(result.data)
                _audit(
                    call_id=call_id,
                    touchpoint=touchpoint,
                    template_id=prompt_template_id,
                    template_version=prompt_template_version,
                    input_hash=input_hash,
                    provider=provider.name,
                    model=result.model,
                    attempt_role=attempt_role,
                    latency_ms=result.latency_ms,
                    tokens_in=result.tokens_in,
                    tokens_out=result.tokens_out,
                    status="success",
                )
                record_call(
                    touchpoint=touchpoint,
                    provider=provider.name,
                    status="success",
                    latency_ms=result.latency_ms,
                    tokens_in=result.tokens_in,
                    tokens_out=result.tokens_out,
                    creator_id=creator_id,
                )
                # P5-S49 — fire-and-forget audit row. Failure here MUST
                # NOT block the call return; the warning lands in logs.
                if write_audit_row is not None:
                    import asyncio as _asyncio

                    _asyncio.create_task(write_audit_row(
                        artifact_id=None,
                        prompt_template_id=prompt_template_id,
                        prompt_version=prompt_template_version,
                        model=f"{provider.name}:{result.model}",
                        status="succeeded",
                        output=result.data if isinstance(result.data, dict) else None,
                    ))
                # P5-S52 — populate cache for idempotent touchpoints.
                if touchpoint in CACHEABLE_TOUCHPOINTS and isinstance(result.data, dict):
                    cache.put(
                        touchpoint=touchpoint,
                        key=f"{touchpoint}:{input_hash}",
                        value=result.data,
                    )
                return validated
            except ProviderError as e:
                err_latency_ms = int((time.monotonic() - started) * 1000)
                _audit(
                    call_id=call_id,
                    touchpoint=touchpoint,
                    template_id=prompt_template_id,
                    template_version=prompt_template_version,
                    input_hash=input_hash,
                    provider=provider.name,
                    model=provider_cfg.model,
                    attempt_role=attempt_role,
                    latency_ms=err_latency_ms,
                    tokens_in=0,
                    tokens_out=0,
                    status=f"error:{type(e).__name__}",
                )
                record_call(
                    touchpoint=touchpoint,
                    provider=provider.name,
                    status=f"error:{attempt_role}",
                    latency_ms=err_latency_ms,
                )
                if not e.retryable:
                    # Non-retryable on primary still tries fallback;
                    # retryable=False on fallback escapes the loop.
                    if attempt_role == "fallback":
                        break
                    continue

        raise AIGatewayError(
            f"all providers failed for touchpoint={touchpoint} "
            f"template={prompt_template_id}@{prompt_template_version}"
        )

    async def embed(
        self,
        *,
        texts: list[str],
        model: str | None = None,
        creator_id: str | None = None,
    ) -> list[list[float]]:
        """Generate embeddings for `texts` via the `embedding` touchpoint.

        Mirrors `call()` for quota + telemetry but skips schema validation
        (embeddings are raw float vectors). Providers that don't implement
        `embed` (e.g. the admin chain) are skipped so the touchpoint falls
        through to an embedding-capable provider. Per the ADR-0019
        amendment for the AI Content Guardrail L3 similarity scan.
        """
        touchpoint = "embedding"
        if touchpoint not in self.routing.routing:
            raise AIGatewayError("no routing config for touchpoint 'embedding'")
        await self._quotas.check(touchpoint=touchpoint, creator_id=creator_id)

        tp_routing = self.routing.routing[touchpoint]
        for attempt_role, provider_cfg in _candidates(tp_routing):
            provider = self._get_provider(provider_cfg.provider)
            embed_fn = getattr(provider, "embed", None)
            if embed_fn is None:
                continue  # text-only provider — try the fallback
            started = time.monotonic()
            try:
                result = await embed_fn(
                    model=model or provider_cfg.model,
                    texts=texts,
                    timeout_ms=tp_routing.timeout_ms,
                )
                record_call(
                    touchpoint=touchpoint,
                    provider=provider.name,
                    status="success",
                    latency_ms=result.latency_ms,
                    tokens_in=result.tokens_in,
                    tokens_out=0,
                    creator_id=creator_id,
                )
                return result.vectors
            except ProviderError as e:
                err_latency_ms = int((time.monotonic() - started) * 1000)
                record_call(
                    touchpoint=touchpoint,
                    provider=provider.name,
                    status=f"error:{attempt_role}",
                    latency_ms=err_latency_ms,
                )
                if not e.retryable and attempt_role == "fallback":
                    break
                continue

        raise AIGatewayError("all providers failed for touchpoint=embedding")

    # ── Provider resolution ──────────────────────────────────────────────

    def _get_provider(self, name: str) -> Provider:
        if name in self._providers:
            return self._providers[name]
        if name == "openai":
            # Lazy-load. Raises ProviderError if no API key — caller's
            # try/except in `call()` catches and falls through.
            if self._openai_lazy is None:
                self._openai_lazy = OpenAIProvider()
            return self._openai_lazy
        if name in ("admin_chain", "admin"):
            # Phase-7 admin-managed chain (Ollama / OpenAI / Anthropic
            # by priority). Lazy-loaded so the import doesn't add to
            # gateway boot time when no touchpoint routes to it.
            from learning.ai_gateway.providers.admin_chain_provider import (
                AdminChainProvider,
            )
            inst = AdminChainProvider()
            self._providers[name] = inst
            return inst
        raise AIGatewayError(f"unknown provider name: {name!r}")


# ── Helpers ──────────────────────────────────────────────────────────────────


def _candidates(tp_routing) -> list[tuple[str, Any]]:
    out = [("primary", tp_routing.primary)]
    if tp_routing.fallback is not None:
        out.append(("fallback", tp_routing.fallback))
    return out


def _hash_inputs(template_id: str, version: str, scrubbed_inputs: dict[str, Any]) -> str:
    """Deterministic hash for audit + caching. SHA256 over the
    (template, version, sorted-keys-canonical-JSON) tuple."""
    import json

    payload = {
        "tid": template_id,
        "ver": version,
        "in": _canonicalise(scrubbed_inputs),
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(raw).hexdigest()[:32]


def _canonicalise(v: Any) -> Any:
    if isinstance(v, dict):
        return {k: _canonicalise(v[k]) for k in sorted(v.keys())}
    if isinstance(v, (list, tuple)):
        return [_canonicalise(x) for x in v]
    return v


def _audit(
    *,
    call_id: str,
    touchpoint: str,
    template_id: str,
    template_version: str,
    input_hash: str,
    provider: str,
    model: str,
    attempt_role: str,
    latency_ms: int,
    tokens_in: int,
    tokens_out: int,
    status: str,
) -> None:
    """Per-call audit log via structured logging.

    Persisted audit (90-day retention) lands when first real consumer
    arrives in S40 — `content_schema.ai_generation_jobs` table is
    already migrated, the writer wires up there.
    """
    log.info(
        "ai_gateway.call",
        extra={
            "ai_gateway_call_id": call_id,
            "touchpoint": touchpoint,
            "template_id": template_id,
            "template_version": template_version,
            "input_hash": input_hash,
            "provider": provider,
            "model": model,
            "attempt_role": attempt_role,
            "latency_ms": latency_ms,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "status": status,
        },
    )
