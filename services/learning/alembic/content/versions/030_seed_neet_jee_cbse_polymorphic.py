"""Seed NEET, JEE Main and CBSE 8-9 polymorphic question banks
(24 types × 200 questions each, ~14,400 rows total).

Mirrors the UPSC seed pattern from migration 020 but applies three
banks at once. UUIDs are deterministic via uuid5 over a unique
namespace per exam, so re-runs are safe.

Local-only (gated by ``CONTENT_SEED_LOCAL=1``). When the env var is
absent (staging / production) this migration is a no-op so the
synthetic test fixtures never leak into a shared environment.

Revision ID: 030
Revises: 029
Create Date: 2026-05-03
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from alembic import op
from sqlalchemy import text

revision: str = "030"
down_revision: str | None = "029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"
SEED_ADMIN_ID = "00000000-0000-0000-0000-000000000004"

# One namespace per exam keeps deterministic IDs scoped — re-running
# any one of these is independent of the others.
NAMESPACES: dict[str, uuid.UUID] = {
    "NEET":     uuid.UUID("a0000000-0000-4000-a000-000000000030"),
    "JEE-MAIN": uuid.UUID("a0000000-0000-4000-a000-000000000031"),
    "CBSE":     uuid.UUID("a0000000-0000-4000-a000-000000000032"),
}


def _question_id(namespace: uuid.UUID, type_id: str, topic_id: str, idx: int) -> str:
    return str(uuid.uuid5(namespace, f"{type_id}|{topic_id}|{idx}"))


def _import_seed_module(module_name: str):
    here = Path(__file__).resolve()
    seed_dir = here.parent.parent.parent.parent / "src"
    if str(seed_dir) not in sys.path:
        sys.path.insert(0, str(seed_dir))
    return __import__(f"learning.content.seed.{module_name}", fromlist=[module_name])


def _insert_rows(rows: list[dict[str, Any]], namespace: uuid.UUID) -> None:
    chunk = 50
    for start in range(0, len(rows), chunk):
        batch = rows[start : start + chunk]
        values_sql = ", ".join(
            f"(CAST(:id_{i} AS uuid), CAST(:topic_{i} AS uuid), :stem_{i}, "
            f"CAST(:choices_{i} AS jsonb), :corr_{i}, :diff_{i}, :lang_{i}, "
            f":status_{i}, CAST(:by_{i} AS uuid), :type_{i}, "
            f"CAST(:payload_{i} AS jsonb))"
            for i in range(len(batch))
        )
        params: dict[str, Any] = {}
        for i, r in enumerate(batch):
            qid = _question_id(namespace, r["type_id"], r["topic_id"], r["idx"])
            params[f"id_{i}"]      = qid
            params[f"topic_{i}"]   = r["topic_id"]
            params[f"stem_{i}"]    = r["stem"]
            params[f"choices_{i}"] = json.dumps(r["choices"])
            params[f"corr_{i}"]    = int(r["correct_idx"])
            params[f"diff_{i}"]    = float(r["difficulty_b"])
            params[f"lang_{i}"]    = "en"
            params[f"status_{i}"]  = "PUBLISHED"
            params[f"by_{i}"]      = SEED_ADMIN_ID
            params[f"type_{i}"]    = r["type_id"]
            params[f"payload_{i}"] = (
                json.dumps(r["payload"]) if r["payload"] is not None else None
            )
        op.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.questions
                  (id, topic_id, stem, choices, correct_idx, difficulty_b,
                   language, status, created_by, question_type, payload)
                VALUES {values_sql}
                ON CONFLICT (id) DO NOTHING
                """
            ).bindparams(**params)
        )


def upgrade() -> None:
    if not os.environ.get("CONTENT_SEED_LOCAL"):
        return

    for module_name, namespace_key in (
        ("neet_polymorphic", "NEET"),
        ("jee_polymorphic",  "JEE-MAIN"),
        ("cbse_polymorphic", "CBSE"),
    ):
        mod = _import_seed_module(module_name)
        rows = mod.all_questions()
        _insert_rows(rows, NAMESPACES[namespace_key])


def downgrade() -> None:
    if not os.environ.get("CONTENT_SEED_LOCAL"):
        return

    for module_name, namespace_key in (
        ("neet_polymorphic", "NEET"),
        ("jee_polymorphic",  "JEE-MAIN"),
        ("cbse_polymorphic", "CBSE"),
    ):
        mod = _import_seed_module(module_name)
        rows = mod.all_questions()
        ns = NAMESPACES[namespace_key]
        seed_ids = [_question_id(ns, r["type_id"], r["topic_id"], r["idx"]) for r in rows]
        chunk = 200
        for start in range(0, len(seed_ids), chunk):
            batch = seed_ids[start : start + chunk]
            ids_sql = ", ".join(f":id_{i}" for i in range(len(batch)))
            params = {f"id_{i}": v for i, v in enumerate(batch)}
            op.execute(
                text(
                    f"DELETE FROM {SCHEMA}.questions WHERE id IN ({ids_sql})"
                ).bindparams(**params)
            )
