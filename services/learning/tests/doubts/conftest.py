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

# Dedicated throwaway test DB — these tests TRUNCATE doubts_schema, so they must
# never hit the seeded dev `learning` DB. Root tests/conftest.py provisions
# `learning_test`; this setdefault is a standalone-run fallback.
os.environ.setdefault(
    "DOUBTS_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/learning_test",
)
os.environ.setdefault(
    "DOUBTS_JWT_SECRET",
    "dev-only-change-me-in-staging-at-least-32-bytes-long",
)
