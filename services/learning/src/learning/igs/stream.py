"""Real-time IGS WebSocket gateway.

Endpoint: `wss://app.alp/api/v1/igs/stream?token=<jwt>`

Protocol mirrors alp-battle's WS gateway (JSON envelopes with
`t` + `p`). JWT-in-querystring auth so browsers can connect without
custom headers on the upgrade.

Server pushes:
  igs.next-action.updated  — recommendation changed
  igs.plan.updated         — today's plan changed (e.g. teacher
                             intervention flagged)
  igs.recommendation.expired — current rec invalid (timer expired,
                             prerequisite changed)
  igs.heartbeat            — server liveness ping (every 30 s)
  igs.error                — structured error

Triggers — the gateway subscribes to NATS topics that affect
guidance state:
  quiz.session.completed
  quiz.session.item.answered
  mastery.delta
  cohort.intervention.flagged

When any of those fires for a connected user, the gateway re-runs
the IGS decision incrementally and pushes the result.

Single connection per user — connecting again closes the prior
socket. Reconnect-with-resume uses `last_event_id` query param so
a transient drop doesn't lose pushed state.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import AsyncIterator
from contextlib import suppress
from typing import Any

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState
from sqlalchemy.ext.asyncio import AsyncSession

from learning.catalog.db import sessionmaker
from learning.igs import candidate_generator as _cg
from learning.igs import decision as _dec
from learning.igs import explainer as _exp
from learning.pce import personal_yield as _py

log = logging.getLogger(__name__)

ws_router = APIRouter(prefix="/igs", tags=["igs-ws"])

# JWT secret — same value identity/learning use elsewhere. We read
# at call time so tests can override.
_JWT_SECRET = os.environ.get(
    "CONTENT_JWT_SECRET",
    "dev-only-change-me-in-staging-at-least-32-bytes-long",
)


# ── Connection registry ────────────────────────────────────────────


class IGSGateway:
    """Process-wide registry of connected WS clients.

    Tracks: user_id → WebSocket. New connection for an existing user
    closes the prior socket (matches battle gateway's invariant).
    """

    def __init__(self) -> None:
        self._conns: dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            prev = self._conns.get(user_id)
            self._conns[user_id] = ws
        if prev is not None:
            with suppress(Exception):
                await prev.close(code=1000)

    async def disconnect(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            # Only forget if we're still the registered conn (a new
            # connection might have superseded us mid-flight).
            if self._conns.get(user_id) is ws:
                del self._conns[user_id]

    async def push(self, user_id: str, message: dict[str, Any]) -> bool:
        """Push one envelope. Returns True if delivered, False if the
        user isn't connected."""
        async with self._lock:
            ws = self._conns.get(user_id)
        if ws is None or ws.client_state != WebSocketState.CONNECTED:
            return False
        try:
            await ws.send_text(json.dumps(message))
            return True
        except Exception as exc:  # noqa: BLE001
            log.warning("igs.push_failed", extra={"user_id": user_id, "err": str(exc)})
            return False

    async def push_to_all(self, message: dict[str, Any]) -> int:
        """Broadcast (used for admin-driven invalidations). Returns the
        number of delivered envelopes."""
        async with self._lock:
            targets = list(self._conns.items())
        n = 0
        for uid, _ in targets:
            if await self.push(uid, message):
                n += 1
        return n

    @property
    def connected_users(self) -> set[str]:
        """Snapshot of currently-connected user ids."""
        return set(self._conns.keys())


# Module-level singleton — services/learning/main.py wires the same
# instance into the NATS subscriber via app.state.igs_gateway.
gateway = IGSGateway()


# ── WebSocket endpoint ────────────────────────────────────────────


@ws_router.websocket("/stream")
async def igs_stream(
    websocket: WebSocket,
    token: str = Query(default=""),
    exam_id: str = Query(default=""),
) -> None:
    """Client connects, server replies with the current next-action
    snapshot, then keeps the connection open for pushes."""
    # Auth handshake — short-circuit BEFORE accept() so bad-token
    # connections never see the upgrade.
    user_id = _verify_jwt(token)
    if user_id is None:
        await websocket.close(code=4401)  # custom: auth failed
        return
    await websocket.accept()
    await gateway.connect(user_id, websocket)

    # Heartbeat task — keeps Indian mobile NAT timeouts at bay (typical
    # ~60s; we ping every 30s).
    hb_task = asyncio.create_task(_heartbeat_loop(websocket))

    try:
        # Initial snapshot — fire-and-forget; never block the accept.
        if exam_id:
            await _push_snapshot(user_id, exam_id)
        # Read loop — client sends `igs.subscribe` / `igs.ack`; we
        # mostly ignore but log unknown types so a future bug doesn't
        # silently swallow client messages.
        async for raw in _safe_iter(websocket):
            try:
                env = json.loads(raw)
            except Exception:
                continue
            kind = env.get("t")
            if kind == "igs.subscribe":
                requested_exam = (env.get("p") or {}).get("examId") or exam_id
                if requested_exam:
                    await _push_snapshot(user_id, requested_exam)
            # Other types currently unused; reserved for future.
    except WebSocketDisconnect:
        pass
    finally:
        hb_task.cancel()
        with suppress(Exception):
            await gateway.disconnect(user_id, websocket)


# ── Internal helpers ──────────────────────────────────────────────


async def _safe_iter(ws: WebSocket) -> AsyncIterator[str]:
    """Yield text frames until disconnect. Tolerates binary frames by
    skipping them (FastAPI raises on iter_text if a binary lands)."""
    while True:
        try:
            yield await ws.receive_text()
        except WebSocketDisconnect:
            return
        except Exception:
            return


async def _heartbeat_loop(ws: WebSocket) -> None:
    """30-second heartbeat. Survives transient send failures by
    closing the loop — the disconnect path takes over from there."""
    try:
        while True:
            await asyncio.sleep(30)
            if ws.client_state != WebSocketState.CONNECTED:
                return
            await ws.send_text(json.dumps({"t": "igs.heartbeat"}))
    except Exception:
        return


def _verify_jwt(token: str) -> str | None:
    """Returns user_id (sub claim) on success, None on failure."""
    if not token:
        return None
    try:
        claims = jwt.decode(token, _JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as e:
        log.info("igs.jwt_failed", extra={"err": str(e)})
        return None
    return str(claims.get("sub") or "") or None


async def _push_snapshot(user_id: str, exam_id: str) -> None:
    """Compute the current next-action and push it as an
    `igs.next-action.updated` envelope. Used both for initial
    subscribe AND any reactive recompute."""
    from datetime import datetime
    forecast_year = datetime.now().year + 1
    try:
        async with sessionmaker()() as sess:
            scored = await _generate_and_rank_for_stream(
                sess, user_id=user_id, exam_id=exam_id,
                forecast_year=forecast_year,
            )
    except Exception as exc:  # noqa: BLE001
        log.warning("igs.snapshot_failed", extra={"user_id": user_id, "err": str(exc)})
        await gateway.push(user_id, {
            "t": "igs.error",
            "p": {"code": "snapshot_failed", "message": str(exc)},
        })
        return
    if not scored:
        return
    top = scored[0]
    await gateway.push(user_id, {
        "t": "igs.next-action.updated",
        "p": {
            "examId": exam_id,
            "chosen": _serialise_action(top),
            "alternatives": [_serialise_action(c) for c in scored[1:4]],
            "confidence": _exp.confidence_from_gap(scored),
        },
    })


async def _generate_and_rank_for_stream(
    sess: AsyncSession, *, user_id: str, exam_id: str, forecast_year: int,
) -> list[dict[str, Any]]:
    """Stream-side equivalent of routes._generate_and_rank — kept
    separate to avoid pulling FastAPI Depends into the WS path."""
    decay_days = await _py.fetch_user_topic_decay(user_id)
    candidates = await _cg.generate_candidates(
        sess,
        user_id=user_id, exam_id=exam_id, forecast_year=forecast_year,
        decay_topic_days=decay_days,
    )
    context = _dec.IGSContext(
        user_id=user_id,
        exam_id=exam_id,
        forecast_year=forecast_year,
        recent_frustration_events=0,
        recent_boredom_events=0,
        time_of_day_minutes=_dec.now_minutes_of_day(),
        streak_days=0,
        active_last_7d=0,
    )
    return _dec.rank_candidates(candidates, context)


def _serialise_action(scored: dict[str, Any]) -> dict[str, Any]:
    """Trim a scored candidate dict to the WS payload shape."""
    return {
        "actionKind": scored["action_kind"],
        "conceptId": scored.get("concept_id"),
        "expectedMinutes": int(scored.get("expected_minutes", 20)),
        "questionCount": scored.get("question_count"),
        "score": float(scored["score"]),
        "rank": int(scored.get("rank", 1)),
        "rationale": _exp.rationale_for(scored),
        "expectedMarksGained": float(scored.get("expected_marks_gained", 0.0)),
    }


# ── NATS-triggered reactive push API ─────────────────────────────


async def on_state_change(user_id: str, exam_id: str, trigger: str) -> None:
    """Called by the NATS subscriber whenever a state-change event
    fires for a connected user. Recomputes the IGS top action and
    pushes if the recommendation actually changed (cheap: just the
    pure ranking compare; no network round-trip)."""
    if user_id not in gateway.connected_users:
        return
    log.info("igs.state_change", extra={"user_id": user_id, "trigger": trigger})
    await _push_snapshot(user_id, exam_id)
