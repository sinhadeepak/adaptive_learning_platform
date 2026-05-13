"""FastAPI router for /catalog/* endpoints — public read-only in Sprint 1."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.catalog.db import get_session
from learning.catalog.flags import premium_enforced
from learning.catalog.repositories import CatalogRepo
from learning.catalog.schemas import (
    CreateAssignmentRequest,
    EducatorAssignment,
    Exam,
    PoolMember,
    Problem,
    Subject,
    SubjectPool,
    Topic,
    TopicDetail,
)
from learning.catalog.security import (
    JwtPrincipal,
    current_principal,
    require_platform_admin,
)
from learning.importance import (
    invalidate_cache as importance_invalidate_cache,
    topic_importance_map,
)

router = APIRouter(prefix="/catalog", tags=["catalog"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _not_found(msg: str) -> HTTPException:
    return HTTPException(status_code=404, detail=Problem(code="not_found", message=msg).model_dump())


@router.get("/exams", response_model=list[Exam])
async def list_exams(session: SessionDep) -> list[Exam]:
    rows = await CatalogRepo(session).list_exams()
    return [
        Exam(
            id=str(r["id"]),
            code=r["code"],
            name=r["name"],
            subtitle=r.get("subtitle"),
            iconKey=r.get("icon_key"),
        )
        for r in rows
    ]


@router.get("/exams/{exam_id}/subjects", response_model=list[Subject])
async def list_subjects(exam_id: str, session: SessionDep) -> list[Subject]:
    rows = await CatalogRepo(session).subjects_for_exam(exam_id)
    return [
        Subject(
            id=str(r["id"]),
            examId=str(r["exam_id"]),
            name=r["name"],
            topicCount=int(r["topic_count"]),
            isMandatory=bool(r.get("is_mandatory", True)),
            poolId=str(r["pool_id"]) if r.get("pool_id") else None,
        )
        for r in rows
    ]


@router.get("/exams/{exam_id}/pools", response_model=list[SubjectPool])
async def list_pools(exam_id: str, session: SessionDep) -> list[SubjectPool]:
    """Onboarding-time view of an exam's optional pools — pick_min /
    pick_max plus member subjects. Empty list for exams with only
    mandatory subjects."""
    rows = await CatalogRepo(session).pools_for_exam(exam_id)
    return [
        SubjectPool(
            id=str(r["id"]),
            examId=str(r["exam_id"]),
            code=r["code"],
            name=r["name"],
            description=r.get("description"),
            pickMin=int(r["pick_min"]),
            pickMax=int(r["pick_max"]),
            members=[
                PoolMember(
                    id=str(m["id"]),
                    code=m["code"],
                    name=m["name"],
                    description=m.get("description"),
                )
                for m in r.get("members", [])
            ],
        )
        for r in rows
    ]


def _projected_tier(stored_tier: str, enforce: bool) -> str:
    """When `premium_tier_enforcement` is OFF (Sprint 1 closed beta), every topic is
    served as FREE regardless of its stored tier — paywall does not apply yet.
    When ON, the stored tier is returned verbatim."""
    return stored_tier if enforce else "FREE"


@router.get("/subjects/{subject_id}/topics", response_model=list[Topic])
async def list_topics(subject_id: str, session: SessionDep) -> list[Topic]:
    rows = await CatalogRepo(session).topics_for_subject(subject_id)
    enforce = await premium_enforced()
    return [
        Topic(
            id=str(r["id"]),
            subjectId=str(r["subject_id"]),
            title=r["title"],
            titleHi=r.get("title_hi"),
            questionCount=int(r["question_count"]),
            tier=_projected_tier(r["tier"], enforce),
        )
        for r in rows
    ]


@router.get("/educators/me/exams", response_model=list[Exam])
async def list_my_exams(
    session: SessionDep,
    principal: Annotated[JwtPrincipal, Depends(current_principal)],
) -> list[Exam]:
    """Exams the calling educator can author questions for.

    PLATFORM_ADMIN sees the full published set (mirrors `/catalog/exams`).
    Anyone else gets only the exams they have an `educator_assignments`
    row for. Roles outside the authoring set (e.g. STUDENT) end up with
    an empty list, which the UI renders as "no exams available".
    """
    repo = CatalogRepo(session)
    rows = (
        await repo.list_exams()
        if principal.is_platform_admin
        else await repo.exams_for_educator(principal.user_id)
    )
    return [
        Exam(
            id=str(r["id"]),
            code=r["code"],
            name=r["name"],
            subtitle=r.get("subtitle"),
            iconKey=r.get("icon_key"),
        )
        for r in rows
    ]


@router.get(
    "/educators/me/exams/{exam_id}/subjects",
    response_model=list[Subject],
)
async def list_my_subjects(
    exam_id: str,
    session: SessionDep,
    principal: Annotated[JwtPrincipal, Depends(current_principal)],
) -> list[Subject]:
    """Subjects under `exam_id` the calling educator can author for.

    PLATFORM_ADMIN bypasses the assignment filter and gets every
    published subject under the exam.
    """
    repo = CatalogRepo(session)
    rows = (
        await repo.subjects_for_exam(exam_id)
        if principal.is_platform_admin
        else await repo.subjects_for_educator_exam(principal.user_id, exam_id)
    )
    return [
        Subject(
            id=str(r["id"]),
            examId=str(r["exam_id"]),
            name=r["name"],
            topicCount=int(r["topic_count"]),
        )
        for r in rows
    ]


@router.get(
    "/educators/me/topics/{topic_id}/authorize",
    status_code=204,
    responses={
        403: {"model": Problem},
        404: {"model": Problem},
    },
)
async def authorize_topic(
    topic_id: str,
    session: SessionDep,
    principal: Annotated[JwtPrincipal, Depends(current_principal)],
) -> Response:
    """204 if the calling educator can author against this topic.

    Used by content service's POST /content/questions to enforce the
    same scope server-side that the cascading-dropdown UI presents to
    the user. Without this, a hand-crafted request with any topic_id
    would bypass the picker entirely.

    PLATFORM_ADMIN bypasses the assignment check (still 404s on a
    missing topic). Anyone else gets 403 if their assignments don't
    cover the topic's exam.
    """
    repo = CatalogRepo(session)
    if principal.is_platform_admin:
        topic = await repo.topic(topic_id)
        if topic is None:
            raise _not_found(f"Topic {topic_id} not found")
        return Response(status_code=204)
    can = await repo.can_author_topic(principal.user_id, topic_id)
    if can is None:
        raise _not_found(f"Topic {topic_id} not found")
    if not can:
        raise HTTPException(
            status_code=403,
            detail=Problem(
                code="not_assigned",
                message="You are not assigned to author for this topic.",
            ).model_dump(),
        )
    return Response(status_code=204)


def _assignment_to_schema(row: dict) -> EducatorAssignment:
    return EducatorAssignment(
        id=str(row["id"]),
        educatorId=str(row["educator_id"]),
        examId=str(row["exam_id"]),
        subjectId=str(row["subject_id"]) if row.get("subject_id") else None,
        createdAt=row["created_at"].isoformat() if row.get("created_at") else "",
        createdBy=str(row["created_by"]) if row.get("created_by") else None,
    )


@router.get(
    "/admin/educators/{educator_id}/assignments",
    response_model=list[EducatorAssignment],
)
async def admin_list_assignments(
    educator_id: str,
    session: SessionDep,
    _admin: Annotated[JwtPrincipal, Depends(require_platform_admin)],
) -> list[EducatorAssignment]:
    rows = await CatalogRepo(session).list_assignments_for_educator(educator_id)
    return [_assignment_to_schema(r) for r in rows]


@router.post(
    "/admin/educators/{educator_id}/assignments",
    response_model=EducatorAssignment,
    status_code=201,
    responses={409: {"model": Problem}},
)
async def admin_create_assignment(
    educator_id: str,
    body: CreateAssignmentRequest,
    session: SessionDep,
    admin: Annotated[JwtPrincipal, Depends(require_platform_admin)],
) -> EducatorAssignment:
    row = await CatalogRepo(session).insert_assignment(
        educator_id=educator_id,
        exam_id=body.examId,
        subject_id=body.subjectId,
        created_by=admin.user_id,
    )
    if row is None:
        raise HTTPException(
            status_code=409,
            detail=Problem(
                code="duplicate_assignment",
                message="This educator already has that grant.",
            ).model_dump(),
        )
    return _assignment_to_schema(row)


@router.delete(
    "/admin/educators/assignments/{assignment_id}",
    status_code=204,
    responses={404: {"model": Problem}},
)
async def admin_delete_assignment(
    assignment_id: str,
    session: SessionDep,
    _admin: Annotated[JwtPrincipal, Depends(require_platform_admin)],
) -> None:
    deleted = await CatalogRepo(session).delete_assignment(assignment_id)
    if not deleted:
        raise _not_found(f"Assignment {assignment_id} not found")


@router.get("/topics/bulk")
async def topics_bulk_route(
    session: SessionDep,
    ids: Annotated[list[str], Query()] = [],
) -> dict:
    """Phase 5 (P5-S37.5) — bulk topic lookup by id.

    Used by alp-engagement's `learning_catalog_client` in place of
    cross-DB JOINs against `catalog_schema.topics`. Returns
    `{topics: [{id, title, titleHi, subjectId, examId}]}`. Missing ids
    are absent from the result (no error). Caller passes ids via
    repeated `?ids=…&ids=…`. Supports up to 200 ids per call.
    """
    if len(ids) > 200:
        raise HTTPException(
            status_code=400,
            detail=Problem(code="too_many_ids", message="ids cap is 200").model_dump(),
        )
    rows = await CatalogRepo(session).topics_bulk(ids)
    return {
        "topics": [
            {
                "id": str(r["id"]),
                "title": r["title"],
                "titleHi": r.get("title_hi"),
                "subjectId": str(r["subject_id"]),
                "subjectName": r.get("subject_name"),
                "examId": str(r["exam_id"]),
                "examCode": r.get("exam_code"),
                "examName": r.get("exam_name"),
            }
            for r in rows
        ]
    }


@router.get("/topics/{topic_id}", response_model=TopicDetail)
async def topic_detail(topic_id: str, session: SessionDep) -> TopicDetail:
    row = await CatalogRepo(session).topic(topic_id)
    if row is None:
        raise _not_found(f"Topic {topic_id} not found")
    enforce = await premium_enforced()
    return TopicDetail(
        id=str(row["id"]),
        subjectId=str(row["subject_id"]),
        title=row["title"],
        titleHi=row.get("title_hi"),
        questionCount=int(row["question_count"]),
        tier=_projected_tier(row["tier"], enforce),
        description=row.get("description"),
        objectives=row.get("objectives", []),
        prerequisites=row.get("prerequisites", []),
    )


# ── Topic importance ────────────────────────────────────────────────────


class ImportanceTopicOut(BaseModel):
    topicId: str
    topicTitle: str | None = None
    weight: float
    hidden: bool
    source: str
    confidence: float
    sampleSize: int


class ImportanceMapOut(BaseModel):
    examId: str
    topics: list[ImportanceTopicOut]
    sourceSummary: dict[str, int]


@router.get("/topic-importance", response_model=ImportanceMapOut)
async def get_topic_importance(
    examId: Annotated[str, Query()],
    session: SessionDep,
    includeHidden: Annotated[bool, Query()] = False,
) -> ImportanceMapOut:
    """Public read — returns topic-level importance for an exam.

    Hidden topics excluded by default; admins pass ?includeHidden=true.
    """
    weights = await topic_importance_map(session, examId)
    titles = await _topic_titles(session, list(weights.keys()))
    summary: dict[str, int] = {}
    out: list[ImportanceTopicOut] = []
    for tid, w in weights.items():
        if w.hidden and not includeHidden:
            continue
        summary[w.source] = summary.get(w.source, 0) + 1
        out.append(
            ImportanceTopicOut(
                topicId=tid,
                topicTitle=titles.get(tid),
                weight=w.weight,
                hidden=w.hidden,
                source=w.source,
                confidence=w.confidence,
                sampleSize=w.sample_size,
            )
        )
    out.sort(key=lambda t: -t.weight)
    return ImportanceMapOut(examId=examId, topics=out, sourceSummary=summary)


@router.get("/admin/topic-importance/{exam_id}", response_model=ImportanceMapOut)
async def admin_topic_importance(
    exam_id: str,
    session: SessionDep,
    _principal: Annotated[JwtPrincipal, Depends(require_platform_admin)],
) -> ImportanceMapOut:
    """Admin view — always includes hidden + every syllabus topic."""
    weights = await topic_importance_map(session, exam_id)
    titles = await _topic_titles(session, list(weights.keys()))
    summary: dict[str, int] = {}
    out = [
        ImportanceTopicOut(
            topicId=tid,
            topicTitle=titles.get(tid),
            weight=w.weight,
            hidden=w.hidden,
            source=w.source,
            confidence=w.confidence,
            sampleSize=w.sample_size,
        )
        for tid, w in weights.items()
    ]
    for t in out:
        summary[t.source] = summary.get(t.source, 0) + 1
    out.sort(key=lambda t: -t.weight)
    return ImportanceMapOut(examId=exam_id, topics=out, sourceSummary=summary)


class ImportanceOverrideRequest(BaseModel):
    weight: float = Field(ge=0.0, le=1.0)
    hidden: bool = False
    reason: str | None = None


@router.put("/admin/topic-importance/{exam_id}/{topic_id}", status_code=204)
async def put_topic_importance_override(
    exam_id: str,
    topic_id: str,
    body: ImportanceOverrideRequest,
    session: SessionDep,
    principal: Annotated[JwtPrincipal, Depends(require_platform_admin)],
) -> Response:
    await session.execute(
        text(
            """
            INSERT INTO catalog_schema.topic_importance_overrides
              (exam_id, topic_id, weight, hidden, reason, set_by, set_at)
            VALUES (CAST(:eid AS uuid), CAST(:tid AS uuid), :w, :h, :r, CAST(:by AS uuid), NOW())
            ON CONFLICT (exam_id, topic_id) DO UPDATE
              SET weight = EXCLUDED.weight,
                  hidden = EXCLUDED.hidden,
                  reason = EXCLUDED.reason,
                  set_by = EXCLUDED.set_by,
                  set_at = NOW()
            """
        ),
        {
            "eid": exam_id,
            "tid": topic_id,
            "w": body.weight,
            "h": body.hidden,
            "r": body.reason,
            "by": principal.user_id,
        },
    )
    await session.commit()
    importance_invalidate_cache(exam_id)
    return Response(status_code=204)


@router.delete("/admin/topic-importance/{exam_id}/{topic_id}", status_code=204)
async def delete_topic_importance_override(
    exam_id: str,
    topic_id: str,
    session: SessionDep,
    _principal: Annotated[JwtPrincipal, Depends(require_platform_admin)],
) -> Response:
    await session.execute(
        text(
            """
            DELETE FROM catalog_schema.topic_importance_overrides
             WHERE exam_id = CAST(:eid AS uuid) AND topic_id = CAST(:tid AS uuid)
            """
        ),
        {"eid": exam_id, "tid": topic_id},
    )
    await session.commit()
    importance_invalidate_cache(exam_id)
    return Response(status_code=204)


@router.get("/exams/{exam_id}/subjects-with-topics")
async def get_exam_subjects_with_topics(
    exam_id: str, session: SessionDep
) -> dict:
    """Bulk fetch — every subject and every topic for an exam, in one
    round trip. Used by engagement.analytics.drill to resolve subject
    rollups for an exam without N+1 HTTP calls."""
    rows = (
        await session.execute(
            text(
                """
                SELECT t.id::text AS topic_id, t.title AS topic_title,
                       s.id::text AS subject_id, s.name AS subject_name,
                       e.id::text AS exam_id, e.code AS exam_code, e.name AS exam_name
                  FROM catalog_schema.topics t
                  JOIN catalog_schema.subjects s ON s.id = t.subject_id
                  JOIN catalog_schema.exams e ON e.id = s.exam_id
                 WHERE e.id = CAST(:eid AS uuid)
                """
            ),
            {"eid": exam_id},
        )
    ).mappings().all()
    return {
        "examId": exam_id,
        "topics": [
            {
                "id": r["topic_id"],
                "title": r["topic_title"],
                "subjectId": r["subject_id"],
                "subjectName": r["subject_name"],
                "examId": r["exam_id"],
                "examCode": r["exam_code"],
                "examName": r["exam_name"],
            }
            for r in rows
        ],
    }


async def _topic_titles(
    session: AsyncSession, topic_ids: list[str]
) -> dict[str, str]:
    if not topic_ids:
        return {}
    rows = (
        await session.execute(
            text(
                """
                SELECT id::text AS id, title
                  FROM catalog_schema.topics
                 WHERE id = ANY(CAST(:ids AS uuid[]))
                """
            ),
            {"ids": topic_ids},
        )
    ).all()
    return {r[0]: r[1] for r in rows}
