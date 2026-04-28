"""Decision-log helper — turns the alpflags `on_decision` hook into a
`flag.decision` structlog event with consistent fields across all services.

Usage in a service's connect_flags():

    from alp_flags import FlagClient
    from alp_flags.decision_log import structlog_decision_hook

    _client = FlagClient(
        institution_url=...,
        on_decision=structlog_decision_hook("auth"),
        ...
    )

The emitted event:

    {
      "event": "flag.decision",
      "service": "auth",
      "flag_name": "email_channel_enabled",
      "tenant_id": null,
      "value": true,
      "source": "cache",
      "fallback_reason": null
    }

Source labels: "cache" (hot path), "institution" (HTTP fetch), "fallback"
(institution unhealthy or unknown flag — `fallback_reason` carries detail).
A spike in source=fallback is the standard signal that Institution is sick.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from alp_flags.client import Decision


def structlog_decision_hook(service_name: str) -> Callable[["Decision"], Awaitable[None]]:
    """Return an OnDecision callback that emits structlog `flag.decision` events.

    Imports structlog lazily so the alp_flags lib stays usable in services
    that haven't installed structlog yet (none today, but defensive).
    """
    import structlog

    logger = structlog.get_logger("alp_flags.decision")

    async def _hook(d: "Decision") -> None:
        logger.info(
            "flag.decision",
            service=service_name,
            flag_name=d.flag_name,
            tenant_id=d.tenant_id,
            value=d.value,
            source=d.source,
            fallback_reason=d.fallback_reason,
        )

    return _hook
