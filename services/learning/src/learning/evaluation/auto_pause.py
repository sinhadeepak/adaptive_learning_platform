"""Runtime auto-pause for kappa-paused criteria (P5-S52, closes AIM §3.3).

Per ADR-0019 + AIM §3.3:
  "If kappa drops below 0.7 for any criterion: auto-pause AI evaluation
   for that criterion; route 100% to humans; alert ML Eng + Product."

The calibration dashboard already surfaces the auto-paused set via
GET /evaluation/calibration/dashboard. This module turns that set into
a runtime gate consulted by `decide_routing` — when an essay rubric
includes a paused criterion, AI evaluation skips and the resolution
goes straight to PENDING_HUMAN_REVIEW.

Implementation: in-memory cache of paused criteria with periodic
refresh. Single-process today (uvicorn workers each maintain their
own cache; Redis-backed shared state is a follow-up).

Threading model: read-mostly. The set is queried per evaluation
(hot path); mutated only on the dashboard-poll cycle. Plain set +
lock is sufficient at this access pattern.
"""

from __future__ import annotations

import asyncio
import logging
import time
from threading import Lock
from typing import Iterable

from learning.localisation.calibration import (
    KAPPA_AUTO_PAUSE_FLOOR,
    KappaSample,
    cohens_kappa,
)

log = logging.getLogger(__name__)

# Refresh paused-set every 5 minutes by default. Strictness vs DB load.
DEFAULT_REFRESH_SECONDS = 300


class _State:
    __slots__ = ("paused", "last_refresh_at")

    def __init__(self) -> None:
        self.paused: frozenset[str] = frozenset()
        self.last_refresh_at: float = 0.0


_STATE = _State()
_LOCK = Lock()


def is_paused(criterion: str) -> bool:
    """Hot path. Returns True iff criterion's rolling-kappa is below
    KAPPA_AUTO_PAUSE_FLOOR. Single dict lookup; no I/O."""
    with _LOCK:
        return criterion in _STATE.paused


def get_paused_set() -> frozenset[str]:
    with _LOCK:
        return _STATE.paused


def set_paused(criteria: Iterable[str]) -> None:
    """Replace the paused set. Called by the refresh task; tests inject
    directly via this entry point."""
    with _LOCK:
        _STATE.paused = frozenset(criteria)
        _STATE.last_refresh_at = time.time()


async def refresh_from_calibration_samples(weeks: int = 12) -> int:
    """Rebuild the paused set from `content_schema.calibration_samples`.

    Pulls last `weeks` weeks of samples, groups by criterion, computes
    kappa, and replaces the paused set with criteria below the floor.
    Returns the new paused-set size.

    Lazy-imports the content sessionmaker so the module loads cleanly
    in test environments without a DB.
    """
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import text

    from learning.content.db import sessionmaker as content_sessionmaker

    cutoff = datetime.now(tz=UTC) - timedelta(weeks=weeks)
    by_criterion: dict[str, list[KappaSample]] = {}

    try:
        async with content_sessionmaker()() as session:
            rows = (
                await session.execute(
                    text("""
                        SELECT criterion, ai_score, human_score
                          FROM content_schema.calibration_samples
                         WHERE sampled_at >= :cutoff
                           AND human_score IS NOT NULL
                    """),
                    {"cutoff": cutoff},
                )
            ).mappings().all()
    except Exception as e:  # noqa: BLE001
        log.warning("auto_pause refresh failed: %s", e)
        return -1

    for r in rows:
        by_criterion.setdefault(r["criterion"], []).append(
            KappaSample(
                ai_score=float(r["ai_score"]),
                human_score=float(r["human_score"]),
            )
        )

    paused: list[str] = []
    for criterion, samples in by_criterion.items():
        k = cohens_kappa(samples)
        if k is not None and k < KAPPA_AUTO_PAUSE_FLOOR:
            paused.append(criterion)

    set_paused(paused)
    log.info(
        "auto_pause refreshed: %d criterion(s) paused, weeks=%d",
        len(paused), weeks,
    )
    return len(paused)


async def start_refresh_task(
    *,
    refresh_seconds: int = DEFAULT_REFRESH_SECONDS,
) -> asyncio.Task:
    """Background task: refresh paused set every `refresh_seconds`.
    Caller (lifespan) holds the returned task for cancellation on
    shutdown."""

    async def _loop() -> None:
        while True:
            try:
                await refresh_from_calibration_samples()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                log.exception("auto_pause refresh loop failed")
            try:
                await asyncio.sleep(refresh_seconds)
            except asyncio.CancelledError:
                raise

    return asyncio.create_task(_loop())


def reset_for_tests() -> None:
    set_paused([])
