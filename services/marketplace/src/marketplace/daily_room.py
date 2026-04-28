"""Daily.co A/V integration — stub for Sprint 17.

Per ADR-0009, A/V media goes through Daily.co (third-party SaaS). P3-S2
stubs room creation so the session FSM can move through IN_PROGRESS
and the client can reach a room URL (even though the URL points at
nothing in stub mode).
"""

from __future__ import annotations

import os
from typing import Final

LIVE_MODE: Final = os.environ.get("MARKETPLACE_DAILY_LIVE") == "1"


def create_room(session_id: str) -> tuple[str, str]:
    """Returns (room_id, room_url).

    Stub: deterministic on session_id so re-runs don't surface different
    URLs in tests. Real Daily call would POST to https://api.daily.co/v1/rooms.
    """
    if LIVE_MODE:  # pragma: no cover
        raise NotImplementedError("Live Daily.co not wired. Set MARKETPLACE_DAILY_LIVE=0.")
    short = session_id.replace("-", "")[:12]
    room_id = f"rm_test_{short}"
    room_url = f"https://example.daily.co/{room_id}"
    return room_id, room_url


def delete_room(room_id: str) -> None:
    """Stub no-op. Real Daily call cleans up post-session."""
    if LIVE_MODE:  # pragma: no cover
        raise NotImplementedError("Live Daily.co not wired.")
