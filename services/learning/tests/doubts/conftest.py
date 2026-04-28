"""Shared test fixtures for the doubts service.

Per-test fixtures live in each test file (each owns its session + truncate
strategy) so that adding a future TestClient-based suite doesn't have to
fight the cross-loop asyncpg engine bookkeeping issue we hit elsewhere.
This conftest is intentionally a no-op — kept as a marker so pytest can
discover the package and so future shared fixtures (auth tokens etc.) have
an obvious home.
"""

from __future__ import annotations

import os

# Default DSN for local dev — tests can override via env if pointed at a
# different stack.
os.environ.setdefault(
    "DOUBTS_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/doubts",
)
os.environ.setdefault(
    "DOUBTS_JWT_SECRET",
    "dev-only-change-me-in-staging-at-least-32-bytes-long",
)
