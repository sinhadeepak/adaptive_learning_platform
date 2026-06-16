"""Root test config for the learning service.

Post-ADR-0005 the learning service owns several schemas inside ONE database
(`learning`). The local dev `learning` DB also holds seed data (auth users,
480 exam questions). Some suites — notably `tests/content` — TRUNCATE
`content_schema`, so they must NOT run against the seeded dev DB.

This conftest routes the content + catalog modules at a dedicated, throwaway
`learning_test` database and provisions it (create + migrate) once per
session if absent, so `uv run pytest` works with no manual step. CI / devs
can also provision it explicitly with `make test-db`.

Only CONTENT_/CATALOG_DATABASE_URL are repointed here — those cover the
three DB-touching suites (`tests/content`, `tests/catalog`,
`tests/test_screening_routes.py`). Other modules keep their own defaults.
"""

from __future__ import annotations

import os
from pathlib import Path

TEST_DB_NAME = "learning_test"
_PG = "postgresql+asyncpg://postgres:postgres@localhost:35432"
TEST_DB_URL = f"{_PG}/{TEST_DB_NAME}"

# Point the DB-truncating / seed-reading modules at the test DB BEFORE any
# test module imports service config. setdefault so an explicit env (CI) wins.
_JWT = "dev-only-change-me-in-staging-at-least-32-bytes-long"
for _var in ("CONTENT_DATABASE_URL", "CATALOG_DATABASE_URL", "DOUBTS_DATABASE_URL"):
    os.environ.setdefault(_var, TEST_DB_URL)
for _var in ("CONTENT_JWT_SECRET", "CATALOG_JWT_SECRET", "DOUBTS_JWT_SECRET"):
    os.environ.setdefault(_var, _JWT)

import pytest

_SVC_DIR = Path(__file__).resolve().parents[1]  # services/learning
# content gives content_schema (+ guardrail/pgvector); catalog gives
# catalog_schema with seeded exams/subjects/topics; doubts gives doubts_schema.
# Applied in order; doubts last (its table is the provisioning sentinel below).
_ALEMBIC_INIS = ("alembic_content.ini", "alembic_catalog.ini", "alembic_doubts.ini")
# Sentinel: the last-applied schema's table. If present, the DB is fully
# migrated; if absent (fresh or partially-migrated DB), run all migrations
# (alembic upgrade head is a no-op for schemas already at head).
_SENTINEL_TABLE = "doubts_schema.doubts"


def _connect(database: str):
    import asyncpg

    return asyncpg.connect(
        host="localhost", port=35432, user="postgres",
        password="postgres", database=database,  # noqa: S106 — local dev DB
    )


def _ensure_database() -> None:
    import asyncio

    async def _run() -> None:
        conn = await _connect("postgres")
        try:
            exists = await conn.fetchval(
                "SELECT 1 FROM pg_database WHERE datname = $1", TEST_DB_NAME
            )
            if not exists:
                await conn.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
        finally:
            await conn.close()

    asyncio.run(_run())


def _schema_present() -> bool:
    import asyncio

    async def _run() -> bool:
        conn = await _connect(TEST_DB_NAME)
        try:
            reg = await conn.fetchval(f"SELECT to_regclass('{_SENTINEL_TABLE}')")
            return reg is not None
        finally:
            await conn.close()

    try:
        return asyncio.run(_run())
    except Exception:
        return False


def _migrate() -> None:
    from alembic import command
    from alembic.config import Config

    prev = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = TEST_DB_URL  # alembic env.py reads this
    try:
        for ini in _ALEMBIC_INIS:
            cfg = Config(str(_SVC_DIR / ini))
            # script_location in the .ini is relative to services/learning;
            # make it absolute so alembic resolves it regardless of CWD.
            loc = cfg.get_main_option("script_location")
            if loc:
                cfg.set_main_option("script_location", str(_SVC_DIR / loc))
            command.upgrade(cfg, "head")
    finally:
        if prev is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = prev


@pytest.fixture(scope="session", autouse=True)
def _provision_test_db():
    """Create + migrate `learning_test` once per session if not already
    present. Idempotent — a no-op (one cheap query) once provisioned."""
    _ensure_database()
    if not _schema_present():
        _migrate()
    yield
