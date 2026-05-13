"""Seed CBSE Class 9 — full-syllabus question bank.

Generates ~100 PUBLISHED MCQ_SINGLE questions per Class 9 chapter
(across Maths, Science, Social Science, English, Hindi, Sanskrit)
using the concept-bank + template generator in
``learning.content.seed.cbse9_full_bank``.

Catalog dependencies:
  019_seed_cbse_full_syllabus     — adds the bulk of Class 9 chapters
  020_seed_cbse9_hindi_sanskrit   — adds Hindi + Sanskrit chapters

Question UUIDs are deterministic via uuid5 over a stable namespace
+ (topic_code, idx). Re-running is a no-op once rows exist —
ON CONFLICT (id) DO NOTHING. The namespace is distinct from the
prior CBSE / NEET / JEE seeds so we don't collide with their rows.

Local-only: gated on CONTENT_SEED_LOCAL=1 to mirror migrations
003 / 030 / 032.

Revision ID: 034
Revises: 033
Create Date: 2026-05-04
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

revision: str = "034"
down_revision: str | None = "033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"
SEED_ADMIN_ID = "00000000-0000-0000-0000-000000000004"

# Distinct from migrations 003 / 030 / 032 namespaces — re-running this
# migration alongside them produces additive rows, never collisions.
NAMESPACE = uuid.UUID("a0000000-0000-4000-a000-000000000034")

# Maps the concept-bank topic_code → catalog topic UUID. Mirrors
# migrations 017, 019, 020. Keeping the map inline instead of
# importing from cbse_class9_bank because that module only covers
# part of the surface; this one covers all 68 chapters that have a
# concept bank.
TOPIC_IDS: dict[str, str] = {
    # ─── from catalog migration 017 (original 12) ────────────
    "C9_MATTER":       "33333333-0000-0000-0000-000000000031",
    "C9_MOTION":       "33333333-0000-0000-0000-000000000032",
    "C9_GRAV":         "33333333-0000-0000-0000-000000000033",
    "C9_NUM":          "33333333-0000-0000-0000-000000000034",
    "C9_POLY":         "33333333-0000-0000-0000-000000000035",
    "C9_TRI":          "33333333-0000-0000-0000-000000000036",
    # ─── from catalog migration 019 (Class 9 Maths extension) ──
    "C9M_COORD":       "33333333-0000-0000-0000-000000000088",
    "C9M_LIN2":        "33333333-0000-0000-0000-000000000089",
    "C9M_EUCL":        "33333333-0000-0000-0000-000000000090",
    "C9M_LA":          "33333333-0000-0000-0000-000000000091",
    "C9M_QUAD":        "33333333-0000-0000-0000-000000000092",
    "C9M_CIRC":        "33333333-0000-0000-0000-000000000093",
    "C9M_HER":         "33333333-0000-0000-0000-000000000094",
    "C9M_SAV":         "33333333-0000-0000-0000-000000000095",
    "C9M_STAT":        "33333333-0000-0000-0000-000000000096",
    # ─── 019 Class 9 Science extension ───────────────────────
    "C9S_PURE":        "33333333-0000-0000-0000-000000000097",
    "C9S_ATOM":        "33333333-0000-0000-0000-000000000098",
    "C9S_STRUC":       "33333333-0000-0000-0000-000000000099",
    "C9S_CELL":        "33333333-0000-0000-0000-000000000100",
    "C9S_TIS":         "33333333-0000-0000-0000-000000000101",
    "C9S_FORCE":       "33333333-0000-0000-0000-000000000102",
    "C9S_WE":          "33333333-0000-0000-0000-000000000103",
    "C9S_SOUND":       "33333333-0000-0000-0000-000000000104",
    "C9S_FOOD":        "33333333-0000-0000-0000-000000000105",
    # ─── 019 Class 9 SST chapters ────────────────────────────
    "C9H_FRENCH":      "33333333-0000-0000-0000-000000000106",
    "C9H_RUSSIA":      "33333333-0000-0000-0000-000000000107",
    "C9H_NAZI":        "33333333-0000-0000-0000-000000000108",
    "C9H_FOREST":      "33333333-0000-0000-0000-000000000109",
    "C9H_PASTOR":      "33333333-0000-0000-0000-000000000110",
    "C9G_LOC":         "33333333-0000-0000-0000-000000000111",
    "C9G_PHY":         "33333333-0000-0000-0000-000000000112",
    "C9G_DRAIN":       "33333333-0000-0000-0000-000000000113",
    "C9G_CLIM":        "33333333-0000-0000-0000-000000000114",
    "C9G_VEG":         "33333333-0000-0000-0000-000000000115",
    "C9G_POP":         "33333333-0000-0000-0000-000000000116",
    "C9P_DEMO":        "33333333-0000-0000-0000-000000000117",
    "C9P_CONST":       "33333333-0000-0000-0000-000000000118",
    "C9P_ELEC":        "33333333-0000-0000-0000-000000000119",
    "C9P_INST":        "33333333-0000-0000-0000-000000000120",
    "C9P_RIGHTS":      "33333333-0000-0000-0000-000000000121",
    "C9E_PALAM":       "33333333-0000-0000-0000-000000000122",
    "C9E_PEOP":        "33333333-0000-0000-0000-000000000123",
    "C9E_POV":         "33333333-0000-0000-0000-000000000124",
    "C9E_FOOD":        "33333333-0000-0000-0000-000000000125",
    # ─── 019 Class 9 English buckets ─────────────────────────
    # The bank only covers two of the five English buckets — Beehive
    # bundle + grammar. The remaining three buckets share the
    # Beehive bundle's row keyed by topic id below.
    "C9_ENG":          "33333333-0000-0000-0000-000000000126",
    "C9_GRAMMAR_E":    "33333333-0000-0000-0000-000000000129",
    # ─── 020 Class 9 Hindi (Kshitij + Kritika) ───────────────
    "C9H_KS_DOPAHAR":  "33333333-0000-0000-0000-000000000131",
    "C9H_KS_KIBLA":    "33333333-0000-0000-0000-000000000132",
    "C9H_KS_SAVALE":   "33333333-0000-0000-0000-000000000133",
    "C9H_KS_PREMVAND": "33333333-0000-0000-0000-000000000134",
    "C9H_KS_MERA_GHAR":"33333333-0000-0000-0000-000000000135",
    "C9H_KS_RAIDAS":   "33333333-0000-0000-0000-000000000136",
    "C9H_KS_RAHIM":    "33333333-0000-0000-0000-000000000137",
    "C9H_KS_NAGARJUN": "33333333-0000-0000-0000-000000000138",
    "C9H_KS_SUMITRA":  "33333333-0000-0000-0000-000000000139",
    "C9H_KS_KEDARNATH":"33333333-0000-0000-0000-000000000140",
    "C9H_KR_IS_JAL":   "33333333-0000-0000-0000-000000000141",
    "C9H_KR_MERE_HAM": "33333333-0000-0000-0000-000000000142",
    "C9H_KR_REEDH":    "33333333-0000-0000-0000-000000000143",
    "C9H_KR_KIS_TARAH":"33333333-0000-0000-0000-000000000144",
    # ─── 020 Class 9 Sanskrit ───────────────────────────────
    "C9S_BHARATIVAM":  "33333333-0000-0000-0000-000000000145",
    "C9S_SVARNA":      "33333333-0000-0000-0000-000000000146",
    "C9S_GOLI":        "33333333-0000-0000-0000-000000000147",
    "C9S_KALOSI":      "33333333-0000-0000-0000-000000000148",
    "C9S_SUKTI":       "33333333-0000-0000-0000-000000000149",
    "C9S_BHAGEEr":     "33333333-0000-0000-0000-000000000150",
    "C9S_PRARYAA":     "33333333-0000-0000-0000-000000000151",
    "C9S_VYANJANA":    "33333333-0000-0000-0000-000000000152",
}


def _question_id(topic_id: str, idx: int) -> str:
    return str(uuid.uuid5(NAMESPACE, f"cbse9-full|{topic_id}|{idx}"))


def _import_seed():
    here = Path(__file__).resolve()
    seed_root = here.parent.parent.parent.parent / "src"
    if str(seed_root) not in sys.path:
        sys.path.insert(0, str(seed_root))
    return __import__(
        "learning.content.seed.cbse9_full_bank",
        fromlist=["cbse9_full_bank"],
    )


def _build_rows() -> list[dict[str, Any]]:
    bank = _import_seed()
    rows: list[dict[str, Any]] = []
    for code, topic_uuid in TOPIC_IDS.items():
        items = bank.generate_for_topic(code, target=100)
        for i, q in enumerate(items, start=1):
            rows.append(
                {
                    "id": _question_id(topic_uuid, i),
                    "topic_id": topic_uuid,
                    "stem": q["stem"],
                    "choices": json.dumps(q["choices"], ensure_ascii=False),
                    "correct_idx": int(q["correct_idx"]),
                    "difficulty_b": float(q["difficulty_b"]),
                    "language": "en",
                    "status": "PUBLISHED",
                    "created_by": SEED_ADMIN_ID,
                    "question_type": "MCQ_SINGLE",
                }
            )
    return rows


def upgrade() -> None:
    if not os.environ.get("CONTENT_SEED_LOCAL"):
        return
    rows = _build_rows()
    chunk = 200
    for start in range(0, len(rows), chunk):
        batch = rows[start : start + chunk]
        values_sql = ", ".join(
            f"(CAST(:id_{i} AS uuid), CAST(:topic_{i} AS uuid), :stem_{i}, "
            f"CAST(:choices_{i} AS jsonb), :corr_{i}, :diff_{i}, :lang_{i}, "
            f":status_{i}, CAST(:by_{i} AS uuid), :type_{i})"
            for i in range(len(batch))
        )
        params: dict[str, Any] = {}
        for i, r in enumerate(batch):
            params[f"id_{i}"] = r["id"]
            params[f"topic_{i}"] = r["topic_id"]
            params[f"stem_{i}"] = r["stem"]
            params[f"choices_{i}"] = r["choices"]
            params[f"corr_{i}"] = r["correct_idx"]
            params[f"diff_{i}"] = r["difficulty_b"]
            params[f"lang_{i}"] = r["language"]
            params[f"status_{i}"] = r["status"]
            params[f"by_{i}"] = r["created_by"]
            params[f"type_{i}"] = r["question_type"]
        op.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.questions
                  (id, topic_id, stem, choices, correct_idx, difficulty_b,
                   language, status, created_by, question_type)
                VALUES {values_sql}
                ON CONFLICT (id) DO NOTHING
                """
            ).bindparams(**params)
        )


def downgrade() -> None:
    if not os.environ.get("CONTENT_SEED_LOCAL"):
        return
    rows = _build_rows()
    chunk = 200
    for start in range(0, len(rows), chunk):
        batch = rows[start : start + chunk]
        ids_sql = ", ".join(f":id_{i}" for i in range(len(batch)))
        params = {f"id_{i}": r["id"] for i, r in enumerate(batch)}
        op.execute(
            text(
                f"DELETE FROM {SCHEMA}.questions WHERE id IN ({ids_sql})"
            ).bindparams(**params)
        )
