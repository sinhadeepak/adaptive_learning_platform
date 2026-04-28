"""Shared fixtures for marketplace integration tests.

Truncation is done via a synchronous psql subprocess on purpose:
TestClient spins up its own event loop per request, and a module-cached
async engine bound to a different loop causes "Future attached to a
different loop" errors. Subprocess sidesteps the loop crossover entirely.
"""

from __future__ import annotations

import os
import subprocess

import pytest

os.environ.setdefault(
    "MARKETPLACE_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/marketplace",
)

from marketplace import db


PG_CONTAINER = os.environ.get("MARKETPLACE_PG_CONTAINER", "alp-local-postgres-1")


@pytest.fixture(autouse=True)
def _clean_state() -> None:
    """Truncate marketplace tables between tests so each starts fresh.
    Reset the module-cached async engine + sessionmaker so the next
    request gets a fresh pool bound to TestClient's loop."""
    db._engine = None
    db._sessionmaker = None
    subprocess.run(
        [
            "docker",
            "exec",
            PG_CONTAINER,
            "psql",
            "-U",
            "postgres",
            "-d",
            "marketplace",
            "-c",
            "TRUNCATE marketplace_schema.tutor_admin_actions, "
            "marketplace_schema.tutor_sessions, "
            "marketplace_schema.bookings, "
            "marketplace_schema.tutor_topics, "
            "marketplace_schema.tutor_availability, "
            "marketplace_schema.tutor_qualifications, "
            "marketplace_schema.tutor_profiles "
            "RESTART IDENTITY CASCADE",
        ],
        capture_output=True,
        check=False,
    )
    yield
