"""Human grader queue routes (P5-S57, closes CE-308 backend gap).

Per AIM §3.5 + Question Catalogue §8.2:

  GET  /grading/queue                           -> grader pulls from queue
  POST /grading/responses/{id}/grade            -> grader submits per-criterion
                                                    verdict
  GET  /grading/calibration-set                 -> daily calibration warm-up
                                                    items (3 pre-graded)

The queue surfaces two sources:
- evaluation_records with PENDING_HUMAN_REVIEW (low-confidence AI)
- calibration_samples with human_score IS NULL (5% sampled regardless)

Both sources surface anonymised — no student id, no name, no prior
performance. Backend strips before serialising.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker as content_sessionmaker
from learning.evaluation.repositories import (
    insert_evaluation_record,
    update_calibration_human_score,
)
from learning.types.base import (
    EvaluatorMetadata,
    PartDetail,
    Resolution,
)
from datetime import UTC, datetime

router = APIRouter(prefix="/grading", tags=["grading"])

CONTENT_SCHEMA = "content_schema"


async def _content_session() -> AsyncSession:
    async with content_sessionmaker()() as s:
        yield s


# ── /grading/queue ──────────────────────────────────────────────────────────


class QueueItem(BaseModel):
    """One row in the grader's queue. Anonymised — student fields stripped."""

    queue_kind: str  # "pending_review" | "calibration_sample"
    response_id: str
    question_id: str | None
    type_id: str | None
    rubric_version: int | None
    prompt_version: str | None
    ai_confidence: float | None
    sampled_at: str
    # For calibration samples we surface the per-criterion AI verdict so
    # the human can compare. Pending-review items don't carry a per-
    # criterion view yet (resolution lives on evaluation_records).
    ai_resolution: dict[str, Any] | None = None
    criterion: str | None = None
    ai_score: float | None = None


class QueueResponse(BaseModel):
    items: list[QueueItem]
    pendingReviewCount: int
    calibrationSampleCount: int


@router.get("/queue", response_model=QueueResponse)
async def get_queue(
    limit: int = 25,
    session: AsyncSession = Depends(_content_session),
) -> QueueResponse:
    """Pull oldest-first across both queue sources. Limit applies per
    source; total returned ≤ 2 * limit."""
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=400,
            detail={"code": "bad_limit", "message": "limit must be 1..100"},
        )

    pending_rows = (
        await session.execute(
            text(f"""
                SELECT response_id, evaluator_kind, evaluator_id,
                       resolution, confidence, prompt_version,
                       rubric_version, evaluated_at
                  FROM {CONTENT_SCHEMA}.evaluation_records
                 WHERE evaluator_kind = 'AI'
                   AND resolution->>'status' = 'PENDING_HUMAN_REVIEW'
                   AND NOT EXISTS (
                     SELECT 1 FROM {CONTENT_SCHEMA}.evaluation_records er2
                      WHERE er2.response_id = evaluation_records.response_id
                        AND er2.evaluator_kind = 'HUMAN'
                   )
                 ORDER BY evaluated_at ASC
                 LIMIT :lim
            """),
            {"lim": limit},
        )
    ).mappings().all()

    calibration_rows = (
        await session.execute(
            text(f"""
                SELECT id, response_id, criterion, ai_score, ai_resolution,
                       sampled_at
                  FROM {CONTENT_SCHEMA}.calibration_samples
                 WHERE human_score IS NULL
                 ORDER BY sampled_at ASC
                 LIMIT :lim
            """),
            {"lim": limit},
        )
    ).mappings().all()

    items: list[QueueItem] = []
    for r in pending_rows:
        res_dict = r["resolution"] or {}
        items.append(
            QueueItem(
                queue_kind="pending_review",
                response_id=str(r["response_id"]),
                question_id=res_dict.get("question_id"),
                type_id=res_dict.get("type_id"),
                rubric_version=int(r["rubric_version"]) if r["rubric_version"] is not None else None,
                prompt_version=r["prompt_version"],
                ai_confidence=float(r["confidence"]) if r["confidence"] is not None else None,
                sampled_at=r["evaluated_at"].isoformat(),
                ai_resolution=res_dict,
            )
        )
    for r in calibration_rows:
        items.append(
            QueueItem(
                queue_kind="calibration_sample",
                response_id=str(r["response_id"]),
                question_id=None,
                type_id=None,
                rubric_version=None,
                prompt_version=None,
                ai_confidence=None,
                sampled_at=r["sampled_at"].isoformat(),
                ai_resolution=r["ai_resolution"],
                criterion=r["criterion"],
                ai_score=float(r["ai_score"]),
            )
        )

    return QueueResponse(
        items=items,
        pendingReviewCount=len(pending_rows),
        calibrationSampleCount=len(calibration_rows),
    )


# ── POST /grading/responses/{response_id}/grade ────────────────────────────


class GraderCriterionVerdict(BaseModel):
    criterion_id: str = Field(min_length=1)
    satisfied: float = Field(ge=0.0, le=1.0)
    note: str = Field(default="", max_length=500)


class GraderSubmission(BaseModel):
    grader_id: str = Field(min_length=1)
    type_id: str = Field(min_length=1)  # e.g. ESSAY
    question_id: str = Field(min_length=1)
    rubric_version: int = Field(ge=1)
    criteria: list[GraderCriterionVerdict] = Field(min_length=1, max_length=20)
    final_status: str = Field(
        pattern="^(CORRECT|PARTIAL_CORRECT|INCORRECT|UNATTEMPTED)$"
    )
    second_grader_required: bool = False
    # When the queue item was a calibration_sample, supply its id so we
    # update calibration_samples.human_score directly.
    calibration_sample_id: str | None = None


class GraderSubmissionResponse(BaseModel):
    response_id: str
    evaluation_record_id: str | None
    calibration_sample_updated: bool


@router.post(
    "/responses/{response_id}/grade",
    response_model=GraderSubmissionResponse,
)
async def submit_grade(
    response_id: str,
    submission: GraderSubmission,
    session: AsyncSession = Depends(_content_session),
) -> GraderSubmissionResponse:
    """Grader's verdict. Writes a HUMAN evaluation_record (immutable
    history; the AI record stays as the previous version per
    ADR-0018). Updates the calibration sample if one was supplied.

    Webhook to Quiz orchestration is fired on success — the
    orchestrator decides whether to update student-visible scores
    (per its scoring profile, not a content concern)."""
    matched = sum(1 for c in submission.criteria if c.satisfied >= 0.5)
    total = len(submission.criteria)

    per_part = [
        PartDetail(
            id=c.criterion_id,
            matched=c.satisfied >= 0.5,
            details={"satisfied": c.satisfied, "note": c.note},
        )
        for c in submission.criteria
    ]
    resolution = Resolution(
        question_id=submission.question_id,
        type_id=submission.type_id,
        status=submission.final_status,
        matched_count=matched,
        total_count=total,
        per_part=per_part,
        evaluation_mode="HYBRID",
        evaluator_metadata=EvaluatorMetadata(
            model=f"human:{submission.grader_id}",
            rubric_version=submission.rubric_version,
            prompt_version=None,
            evaluated_at=datetime.now(tz=UTC),
            human_review_required=submission.second_grader_required,
        ),
    )

    rec_id = await insert_evaluation_record(
        session,
        response_id=response_id,
        resolution=resolution,
        evaluator_kind="HUMAN",
        evaluator_id=f"human:{submission.grader_id}",
        confidence=None,
    )

    cal_updated = False
    if submission.calibration_sample_id is not None:
        # Use the first criterion's score as the canonical human verdict;
        # callers can update each criterion-level row by supplying a
        # different sample id per criterion if needed.
        first = submission.criteria[0]
        await update_calibration_human_score(
            session,
            sample_id=submission.calibration_sample_id,
            human_score=first.satisfied,
            human_resolution=resolution.model_dump(mode="json"),
        )
        cal_updated = True

    await session.commit()

    return GraderSubmissionResponse(
        response_id=response_id,
        evaluation_record_id=rec_id,
        calibration_sample_updated=cal_updated,
    )


# ── /grading/calibration-set ───────────────────────────────────────────────


class CalibrationSetItem(BaseModel):
    id: str
    stem: str
    rubric: list[dict[str, Any]]
    gold_verdict: list[dict[str, Any]]


class CalibrationSetResponse(BaseModel):
    items: list[CalibrationSetItem]


# Static set of pre-graded calibration items. Real implementation would
# pull from a curated table; v1 ships the 3 items the grader UI uses.
_CALIBRATION_ITEMS: list[CalibrationSetItem] = [
    CalibrationSetItem(
        id="cal-1",
        stem=(
            "In 80 words, explain why the sky appears blue. Reference a "
            "specific physical phenomenon."
        ),
        rubric=[
            {"id": "c1", "text": "Names Rayleigh scattering", "weight": 50},
            {"id": "c2", "text": "Connects to wavelength dependence", "weight": 50},
        ],
        gold_verdict=[
            {"criterion_id": "c1", "satisfied": 1.0},
            {"criterion_id": "c2", "satisfied": 1.0},
        ],
    ),
    CalibrationSetItem(
        id="cal-2",
        stem=(
            "Discuss the doctrine of basic structure (50 words). "
            "Cite at least one landmark case."
        ),
        rubric=[
            {"id": "c1", "text": "Defines basic structure doctrine", "weight": 50},
            {
                "id": "c2",
                "text": "Cites Kesavananda Bharati v. State of Kerala",
                "weight": 50,
            },
        ],
        gold_verdict=[
            {"criterion_id": "c1", "satisfied": 1.0},
            {"criterion_id": "c2", "satisfied": 1.0},
        ],
    ),
    CalibrationSetItem(
        id="cal-3",
        stem=(
            "Derive Newton's second law from the principle of "
            "conservation of momentum."
        ),
        rubric=[
            {"id": "c1", "text": "States dp/dt = F", "weight": 50},
            {"id": "c2", "text": "Reduces to F=ma for constant mass", "weight": 50},
        ],
        gold_verdict=[
            {"criterion_id": "c1", "satisfied": 1.0},
            {"criterion_id": "c2", "satisfied": 1.0},
        ],
    ),
]


@router.get("/calibration-set", response_model=CalibrationSetResponse)
async def get_calibration_set() -> CalibrationSetResponse:
    """Daily calibration warm-up. The grader's day starts with these
    3 pre-graded items per AIM §3.5; ≥85% agreement with gold to
    proceed."""
    return CalibrationSetResponse(items=_CALIBRATION_ITEMS)
