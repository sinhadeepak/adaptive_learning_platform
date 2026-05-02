"""Screening routes — Phase 6 S49.

Endpoints:
  POST /screening/start                  (no auth — anonymous allowed)
  GET  /screening/{token}/next           (no auth)
  POST /screening/{token}/answer         (no auth)
  GET  /screening/{token}/reveal         (no auth)
  POST /screening/{token}/persist        (auth required)

Persisted screenings land as the user's first quiz session post-signup.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker
from learning.content.security import JwtPrincipal, current_principal
from learning.screening import blueprint as _blueprint
from learning.screening import store as _store

router = APIRouter(prefix="/screening", tags=["screening"])


PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


async def _session() -> AsyncSession:  # type: ignore[return-value]
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]


class StartRequest(BaseModel):
    exam_code: str = Field(default="JEE-MAIN", max_length=20)
    language: str = Field(default="en", pattern="^(en|hi)$")


class StartResponse(BaseModel):
    token: str
    target_count: int
    exam_code: str


class NextResponse(BaseModel):
    item_idx: int
    total: int
    stem: str
    choices: list[str]


class AnswerRequest(BaseModel):
    item_idx: int = Field(ge=0)
    answer_idx: int = Field(ge=0)


class TopicBreakdown(BaseModel):
    topic_id: str
    correct: int
    total: int


class RevealResponse(BaseModel):
    score_pct: float
    correct: int
    total: int
    topic_breakdown: list[TopicBreakdown]
    readiness_seed: float


@router.post("/start", response_model=StartResponse)
async def start_screening(body: StartRequest, session: SessionDep) -> StartResponse:
    items = await _blueprint.select_questions(
        session, exam_code=body.exam_code, language=body.language,
    )
    if len(items) < 4:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "screening_unavailable",
                "message": "Not enough published questions to seed a screening test for this exam yet.",
            },
        )
    payload = {
        "exam_code": body.exam_code,
        "language": body.language,
        "items": items,
        "responses": [],
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    token = await _store.create(payload)
    return StartResponse(token=token, target_count=len(items), exam_code=body.exam_code)


@router.get("/{token}/next", response_model=NextResponse)
async def next_question(token: str) -> NextResponse:
    payload = await _store.get(token)
    if payload is None:
        raise HTTPException(status_code=404, detail={"code": "expired", "message": "Screening session expired."})
    item_idx = len(payload["responses"])
    if item_idx >= len(payload["items"]):
        raise HTTPException(status_code=409, detail={"code": "complete", "message": "Screening complete."})
    item = payload["items"][item_idx]
    return NextResponse(
        item_idx=item_idx,
        total=len(payload["items"]),
        stem=item["stem"],
        choices=item["choices"],
    )


@router.post("/{token}/answer", status_code=204)
async def answer_question(token: str, body: AnswerRequest) -> None:
    payload = await _store.get(token)
    if payload is None:
        raise HTTPException(status_code=404, detail={"code": "expired", "message": "Screening session expired."})
    item_idx = body.item_idx
    if item_idx != len(payload["responses"]):
        raise HTTPException(status_code=409, detail={"code": "out_of_order", "message": "Answers must be sequential."})
    item = payload["items"][item_idx]
    is_correct = body.answer_idx == item["correct_idx"]
    payload["responses"].append(
        {
            "item_idx": item_idx,
            "topic_id": item["topic_id"],
            "answer_idx": body.answer_idx,
            "is_correct": is_correct,
        }
    )
    await _store.update(token, payload)
    return None


@router.get("/{token}/reveal", response_model=RevealResponse)
async def reveal_score(token: str) -> RevealResponse:
    payload = await _store.get(token)
    if payload is None:
        raise HTTPException(status_code=404, detail={"code": "expired", "message": "Screening session expired."})
    responses = payload["responses"]
    if len(responses) < len(payload["items"]):
        raise HTTPException(
            status_code=409,
            detail={"code": "incomplete", "message": "Answer all questions before revealing the score."},
        )
    correct = sum(1 for r in responses if r["is_correct"])
    total = len(responses)
    score_pct = round((correct / total) * 100, 1) if total else 0.0
    # Per-topic
    by_topic: dict[str, dict[str, int]] = {}
    for r in responses:
        b = by_topic.setdefault(r["topic_id"], {"correct": 0, "total": 0})
        b["correct"] += int(r["is_correct"])
        b["total"] += 1
    breakdown = [
        TopicBreakdown(topic_id=tid, correct=v["correct"], total=v["total"])
        for tid, v in by_topic.items()
    ]
    # Heuristic readiness seed: simple percentage with a small floor
    readiness_seed = max(0.05, min(0.95, correct / total)) if total else 0.0
    return RevealResponse(
        score_pct=score_pct,
        correct=correct,
        total=total,
        topic_breakdown=breakdown,
        readiness_seed=readiness_seed,
    )


class PersistResponse(BaseModel):
    persisted: bool
    attempt_id: str | None


@router.post("/{token}/persist", response_model=PersistResponse)
async def persist(
    token: str, principal: PrincipalDep, session: SessionDep,
) -> PersistResponse:
    payload = await _store.get(token)
    if payload is None:
        raise HTTPException(status_code=404, detail={"code": "expired", "message": "Screening session expired."})
    # Persist to content_schema.screening_attempts
    from sqlalchemy import text
    import json
    from uuid import uuid4

    attempt_id = str(uuid4())
    correct = sum(1 for r in payload["responses"] if r["is_correct"])
    total = len(payload["responses"])
    score_pct = (correct / total) * 100 if total else 0.0
    by_topic: dict[str, dict[str, int]] = {}
    for r in payload["responses"]:
        b = by_topic.setdefault(r["topic_id"], {"correct": 0, "total": 0})
        b["correct"] += int(r["is_correct"])
        b["total"] += 1

    await session.execute(
        text(
            """
            INSERT INTO content_schema.screening_attempts
              (id, user_id, completed_at, item_responses, score_pct,
               topic_breakdown, readiness_seed, blueprint_version)
            VALUES
              (CAST(:id AS uuid), CAST(:uid AS uuid), now(),
               CAST(:resp AS jsonb), :score,
               CAST(:tb AS jsonb), :seed, '1.0.0')
            """
        ),
        {
            "id": attempt_id,
            "uid": principal.user_id,
            "resp": json.dumps(payload["responses"]),
            "score": score_pct,
            "tb": json.dumps(by_topic),
            "seed": max(0.05, min(0.95, correct / total)) if total else 0.0,
        },
    )
    await session.commit()
    await _store.delete(token)
    return PersistResponse(persisted=True, attempt_id=attempt_id)
