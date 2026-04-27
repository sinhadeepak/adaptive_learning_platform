"""Alembic env — async-friendly. Reads DATABASE_URL from environment.

Pattern other services copy verbatim. The only thing that changes per service
is `target_metadata` once each service introduces SQLAlchemy ORM models
(Sprint 1+); for now we run pure-SQL migrations and leave it as None.
"""

from __future__ import annotations

import asyncio
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# When ORM models land in Sprint 1, import the declarative Base and assign:
#   from auth.models import Base
#   target_metadata = Base.metadata
# Until then, hand-written migrations only — no autogenerate.
target_metadata = None


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.stderr.write(
            "DATABASE_URL not set. Example for local dev:\n"
            "  export DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:35432/auth\n"
        )
        raise SystemExit(2)
    return url


def run_migrations_offline() -> None:
    """Generate SQL without connecting to a DB. Used for review / dry runs."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = _database_url()

    engine = async_engine_from_config(
        cfg,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
