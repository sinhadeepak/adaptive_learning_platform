"""POST /grading/grade endpoint — Type Dispatcher behind HTTP."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from learning.types import Resolution, get_handler, is_supported

router = APIRouter(prefix="/grading", tags=["grading"])


class GradeRequest(BaseModel):
    question_id: str = Field(min_length=1)
    question_type: str = Field(min_length=1)
    payload: dict[str, Any]
    response: dict[str, Any]
    language: str = "en"


class BatchGradeRequest(BaseModel):
    items: list[GradeRequest] = Field(min_length=1, max_length=200)


class BatchGradeResponse(BaseModel):
    resolutions: list[Resolution]


def _problem(code: str, message: str, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail={"code": code, "message": message},
    )


@router.post("/grade", response_model=Resolution)
async def grade(req: GradeRequest) -> Resolution:
    """Single-item grading. Returns Resolution; never marks.

    Quiz Go calls this for AI_ASSISTED / HYBRID / HUMAN types. During
    Phase 5 initial rollout, DETERMINISTIC types also go through this
    endpoint (Quiz Go inlines them only after smoke validates parity).
    """
    if not is_supported(req.question_type):
        raise _problem(
            "unknown_question_type",
            f"question_type={req.question_type!r} is not registered",
            http_status=400,
        )

    handler = get_handler(req.question_type)
    # The handler's evaluate signature receives `response` only; we
    # inject question_id via a wrapper dict so the handler can attach
    # it to the Resolution.
    response_with_id = {**req.response, "question_id": req.question_id}
    try:
        return await handler.evaluate(req.payload, response_with_id, req.language)
    except Exception as e:
        # Surface validation errors as 400, other failures as 500.
        from pydantic import ValidationError as PydanticValidationError

        if isinstance(e, PydanticValidationError):
            raise _problem(
                "invalid_payload_or_response",
                str(e),
                http_status=400,
            ) from e
        raise _problem(
            "grading_failed",
            f"evaluator raised: {type(e).__name__}: {e}",
            http_status=500,
        ) from e


@router.post("/batch", response_model=BatchGradeResponse)
async def grade_batch(req: BatchGradeRequest) -> BatchGradeResponse:
    """Bulk grading on quiz submit. Each item evaluates independently;
    one item's failure does not block the rest. Failed items return a
    PENDING_HUMAN_REVIEW Resolution as a safe default."""
    resolutions: list[Resolution] = []
    for item in req.items:
        try:
            resolutions.append(await grade(item))
        except HTTPException as e:
            # Coerce HTTP errors into a Resolution so the batch caller
            # gets a uniform shape per item. HTTP-status info is lost
            # but the caller can inspect the resolution status.
            resolutions.append(
                Resolution(
                    question_id=item.question_id,
                    type_id=item.question_type,
                    status="PENDING_HUMAN_REVIEW",
                    matched_count=0,
                    total_count=0,
                    evaluation_mode="DETERMINISTIC",
                )
            )
    return BatchGradeResponse(resolutions=resolutions)
