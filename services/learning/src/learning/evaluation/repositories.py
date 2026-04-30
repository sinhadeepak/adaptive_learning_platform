"""DB writers for evaluation_records + calibration_samples (P5-S49).

Per ADR-0018 + ADR-0019. evaluation_records is immutable: re-evaluation
inserts a new row with the next implied version (count of prior rows
+ 1). calibration_samples captures the 5% deterministic sample for
weekly Cohen's kappa per criterion.

Pure DB layer — no business logic. Both writers idempotent on caller-
supplied id; collisions are no-ops.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.types.base import Resolution

CONTENT_SCHEMA = "content_schema"


# ── evaluation_records ───────────────────────────────────────────────────────


async def insert_evaluation_record(
    session: AsyncSession,
    *,
    response_id: str,
    resolution: Resolution,
    evaluator_kind: str = "AI",
    evaluator_id: str = "ai_gateway",
    confidence: float | None = None,
) -> str:
    """Persist a Resolution as an evaluation_record. Returns the new id.

    `evaluator_kind` ∈ {"AI", "HUMAN", "DETERMINISTIC"} — caller picks
    based on the type's evaluation_mode. `evaluator_id` is the model
    or human grader id.

    Old records preserved as immutable history per ADR-0018 §"Re-evaluation".
    """
    record_id = str(uuid.uuid4())
    meta = resolution.evaluator_metadata
    await session.execute(
        text(f"""
            INSERT INTO {CONTENT_SCHEMA}.evaluation_records
              (id, response_id, evaluator_kind, evaluator_id, resolution,
               confidence, prompt_version, rubric_version, evaluated_at)
            VALUES (:id, :rid, :kind, :eid, :resolution::jsonb,
                    :conf, :pv, :rv, now())
        """),
        {
            "id": record_id,
            "rid": response_id,
            "kind": evaluator_kind,
            "eid": evaluator_id,
            "resolution": json.dumps(resolution.model_dump(mode="json")),
            "conf": confidence,
            "pv": meta.prompt_version if meta else None,
            "rv": meta.rubric_version if meta else None,
        },
    )
    return record_id


async def count_evaluation_records(
    session: AsyncSession, *, response_id: str,
) -> int:
    """Used by re-evaluation gate to enforce MAX_AUTO_REEVAL_PER_RESPONSE."""
    rows = (
        await session.execute(
            text(f"""
                SELECT COUNT(*) AS n
                  FROM {CONTENT_SCHEMA}.evaluation_records
                 WHERE response_id = :rid
            """),
            {"rid": response_id},
        )
    ).mappings().all()
    return int(rows[0]["n"]) if rows else 0


# ── calibration_samples ──────────────────────────────────────────────────────


async def insert_calibration_sample(
    session: AsyncSession,
    *,
    response_id: str,
    criterion: str,
    ai_score: float,
    ai_resolution: dict[str, Any],
) -> str:
    """Persist an AI verdict awaiting human shadow grade.

    Sampled deterministically via SHA256(response_id) % 20 == 0 (5%).
    Human grader queue picks pending rows (human_resolution IS NULL)
    and posts back via update_calibration_human_score.
    """
    sample_id = str(uuid.uuid4())
    await session.execute(
        text(f"""
            INSERT INTO {CONTENT_SCHEMA}.calibration_samples
              (id, response_id, ai_resolution, criterion, ai_score, sampled_at)
            VALUES (:id, :rid, :res::jsonb, :cri, :s, now())
        """),
        {
            "id": sample_id,
            "rid": response_id,
            "res": json.dumps(ai_resolution),
            "cri": criterion,
            "s": ai_score,
        },
    )
    return sample_id


async def update_calibration_human_score(
    session: AsyncSession,
    *,
    sample_id: str,
    human_score: float,
    human_resolution: dict[str, Any],
) -> None:
    """Fill the human grader's verdict on a previously-sampled row.
    Subsequent kappa rollups only count rows where human_score IS NOT NULL."""
    await session.execute(
        text(f"""
            UPDATE {CONTENT_SCHEMA}.calibration_samples
               SET human_score      = :hs,
                   human_resolution = :hres::jsonb,
                   human_graded_at  = now()
             WHERE id = :id
        """),
        {
            "id": sample_id,
            "hs": human_score,
            "hres": json.dumps(human_resolution),
        },
    )
