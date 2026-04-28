"""FlagClient — async, framework-agnostic feature-flag evaluator.

GAP-25 closure: every evaluate() call fires an optional `on_decision` hook
with the resolved value + source (cache/institution/fallback) + tenant. The
service installs a structlog-backed hook at startup so each request's flag
decisions land as `flag.decision` JSON events. Source labels matter — a
spike in `fallback` is the leading indicator that Institution is unhealthy.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

import httpx

from alp_flags.cache import TtlCache

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Decision:
    """One flag decision. Emitted to the OnDecision hook after each evaluate()."""

    flag_name: str
    tenant_id: str | None
    value: bool
    source: str  # "cache" | "institution" | "fallback"
    fallback_reason: str | None = None


# Hook the service registers at startup. Async-friendly; the FlagClient awaits
# it. Failures inside the hook are swallowed (a logging bug must never break
# a flag evaluation).
OnDecision = Callable[[Decision], Awaitable[None]]


class FlagClient:
    """Evaluates feature flags via Institution HTTP + NATS-driven cache invalidation.

    Lookup order: local cache → Institution HTTP → hardcoded fallback.
    Tenant override beats global default when `tenant_id` is supplied.
    """

    def __init__(
        self,
        *,
        institution_url: str,
        nats_url: str | None = None,
        fallbacks: dict[str, bool],
        cache_ttl: float = 30.0,
        http_timeout: float = 1.5,
        auth_token: str | None = None,
        on_decision: OnDecision | None = None,
    ) -> None:
        self._institution_url = institution_url.rstrip("/")
        self._nats_url = nats_url
        self._fallbacks = fallbacks
        self._cache = TtlCache(cache_ttl)
        self._http_timeout = http_timeout
        self._auth_token = auth_token
        self._on_decision = on_decision
        self._http: httpx.AsyncClient | None = None
        self._nats: Any | None = None
        self._nats_sub: Any | None = None

    async def connect(self) -> None:
        """Open the HTTP client + (optionally) subscribe to NATS for cache invalidation."""
        headers = {"authorization": f"Bearer {self._auth_token}"} if self._auth_token else {}
        self._http = httpx.AsyncClient(
            base_url=self._institution_url,
            timeout=self._http_timeout,
            headers=headers,
        )
        if self._nats_url:
            await self._connect_nats()

    async def _connect_nats(self) -> None:
        try:
            import nats  # imported lazily so consumers without NATS still work
        except ImportError:  # pragma: no cover
            log.warning("nats-py not installed; NATS invalidation disabled")
            return
        try:
            self._nats = await nats.connect(self._nats_url, connect_timeout=2)
            self._nats_sub = await self._nats.subscribe("flag.changed", cb=self._on_flag_changed)
            log.info("alp-flags subscribed to NATS flag.changed")
        except Exception as err:  # noqa: BLE001 — NATS must not block startup
            log.warning("alp-flags could not connect to NATS (%s); running poll-only", err)
            self._nats = None

    async def _on_flag_changed(self, msg: Any) -> None:
        try:
            payload = json.loads(msg.data.decode("utf-8"))
            name = payload.get("flag_name") or payload.get("name")
            if name:
                self._cache.invalidate(name)
                log.debug("alp-flags invalidated cache for %s", name)
        except Exception as err:  # noqa: BLE001 — bad event must not crash subscriber
            log.warning("alp-flags failed to handle flag.changed: %s", err)

    async def close(self) -> None:
        if self._http is not None:
            await self._http.aclose()
        if self._nats is not None:
            await self._nats.drain()

    async def evaluate(self, name: str, *, tenant_id: str | None = None) -> bool:
        cached = self._cache.get((name, tenant_id))
        if cached is not None:
            await self._emit_decision(name, tenant_id, bool(cached), source="cache")
            return bool(cached)

        # _fetch builds the decision itself so it can label fallback source.
        value, source, reason = await self._fetch_with_source(name, tenant_id=tenant_id)
        self._cache.put((name, tenant_id), value)
        await self._emit_decision(name, tenant_id, value, source=source, fallback_reason=reason)
        return value

    async def _fetch_with_source(
        self, name: str, *, tenant_id: str | None
    ) -> tuple[bool, str, str | None]:
        try:
            assert self._http is not None, "FlagClient not connected — call .connect() first"
            res = await self._http.get(f"/flags/{name}")
            if res.status_code == 404:
                return self._fallback(name, reason="flag_unknown"), "fallback", "flag_unknown"
            res.raise_for_status()
            body = res.json()
            if tenant_id is not None:
                for ovr in body.get("overrides", []):
                    if ovr.get("tenantId") == tenant_id:
                        return bool(ovr["value"]), "institution", None
            return bool(body["defaultValue"]), "institution", None
        except (httpx.HTTPError, AssertionError) as err:
            reason = f"institution_error:{err}"
            return self._fallback(name, reason=reason), "fallback", reason

    def _fallback(self, name: str, *, reason: str) -> bool:
        if name not in self._fallbacks:
            raise KeyError(
                f"flag {name!r} has no hardcoded fallback — every flag the service consumes "
                "must be declared in FlagClient(fallbacks=...)"
            )
        log.warning("alp-flags using hardcoded fallback for %s (reason=%s)", name, reason)
        return self._fallbacks[name]

    async def _emit_decision(
        self,
        name: str,
        tenant_id: str | None,
        value: bool,
        *,
        source: str,
        fallback_reason: str | None = None,
    ) -> None:
        if self._on_decision is None:
            return
        try:
            await self._on_decision(
                Decision(
                    flag_name=name,
                    tenant_id=tenant_id,
                    value=value,
                    source=source,
                    fallback_reason=fallback_reason,
                )
            )
        except Exception as err:  # noqa: BLE001 — logging must never break evaluation
            log.warning("alp-flags on_decision hook raised: %s", err)

    # Test / introspection helper.
    def cache_size(self) -> int:
        return len(self._cache._data)  # type: ignore[attr-defined]
