"""Sprint 23 (P4-S23) — exam blueprint HTTP routes.

Read endpoints + a compose endpoint that produces a per-user paper from a
blueprint. Admin write paths defer to S25.

Per ADR-0012.
"""

from __future__ import annotations

import random
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.catalog.db import get_session
from learning.exam_blueprints import composer as _composer
from learning.exam_blueprints import repositories as _repo

router = APIRouter(prefix="/catalog/exam-blueprints", tags=["exam-blueprints"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]

_HTTP_TIMEOUT = 5.0


def _quiz_base_url() -> str:
    """Read at request time so test environments can override via env."""
    import os

    return os.environ.get("LEARNING_QUIZ_BASE_URL", "http://quiz:8000")


@router.get("")
async def list_blueprints(session: SessionDep, examId: str) -> dict[str, Any]:
    items = await _repo.list_for_exam(session, examId)
    return {"examId": examId, "items": items}


@router.get("/{blueprint_id}")
async def get_blueprint(blueprint_id: str, session: SessionDep) -> dict[str, Any]:
    bp = await _repo.get_by_id(session, blueprint_id)
    if bp is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Blueprint not found"},
        )
    return bp


async def _candidate_pool_for_section(
    session: AsyncSession, subject_id: str, n_target: int
) -> list[dict[str, Any]]:
    """Pull candidate questions for a section from the Quiz bank.

    Strategy: list topics under the section's subject_id (catalog DB), then
    fetch questions from Quiz HTTP per topic. We over-fetch by 50% so the
    composer has slack to shuffle around within the section.
    """
    rows = (
        await session.execute(
            text("""
                SELECT id FROM catalog_schema.topics WHERE subject_id = :sid
                 ORDER BY sort_order
            """),
            {"sid": subject_id},
        )
    ).mappings().all()
    if not rows:
        return []
    per_topic_target = max(3, (n_target * 3 // 2) // max(1, len(rows)))
    base = _quiz_base_url()
    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        for r in rows:
            topic_id = str(r["id"])
            try:
                resp = await client.get(
                    f"{base}/quiz/questions",
                    params={"topicId": topic_id, "limit": per_topic_target},
                )
                resp.raise_for_status()
            except httpx.HTTPError:
                continue  # skip topic on transient error; honest short-pool
            body = resp.json()
            for q in body.get("items") or []:
                out.append({"id": q["id"], "topic_id": q.get("topicId") or topic_id})
    return out


@router.post("/{blueprint_id}/compose")
async def compose_blueprint(
    blueprint_id: str,
    session: SessionDep,
    userId: str,
    attemptIdx: int = 0,
) -> dict[str, Any]:
    """Compose a paper for (blueprint, user). Returns ordered items with
    section_id propagated. Honestly returns `short=True` when the candidate
    pool is insufficient — UI surfaces this before exam start."""
    bp = await _repo.get_by_id(session, blueprint_id)
    if bp is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Blueprint not found"},
        )
    sections = bp["sections"]
    if not isinstance(sections, list) or not sections:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_blueprint", "message": "Blueprint has no sections"},
        )

    candidates_by_section: dict[str, list[dict[str, Any]]] = {}
    for sec in sections:
        section_id = sec["section_id"]
        subject_id = sec.get("subject_id")
        if not subject_id:
            candidates_by_section[section_id] = []
            continue
        candidates_by_section[section_id] = await _candidate_pool_for_section(
            session, subject_id, int(sec["n_questions"])
        )

    # Per-(blueprint, user, attempt) deterministic seed so retake N+1 differs
    # from retake N but is reproducible for debugging.
    seed = _composer.derive_user_seed(blueprint_id, userId) ^ int(attemptIdx)
    rng = random.Random(seed)
    # The composer expects the snake_case shape used in the seed JSONB.
    bp_for_composer = {
        "id": bp["id"],
        "total_questions": bp["totalQuestions"],
        "sections": sections,
    }
    plan = _composer.compose_paper(bp_for_composer, candidates_by_section, rng=rng)
    plan["blueprintName"] = bp["name"]
    plan["totalMinutes"] = bp["totalMinutes"]
    plan["interSectionNavigation"] = bp["interSectionNavigation"]
    plan["perSectionTimeLocked"] = bp["perSectionTimeLocked"]
    plan["marksCorrect"] = bp["marksCorrect"]
    plan["marksNegative"] = bp["marksNegative"]
    return plan
