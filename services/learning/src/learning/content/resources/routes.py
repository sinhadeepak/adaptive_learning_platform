"""FastAPI router for /content/resources/*.

Endpoints (R-S1):
  GET    /content/resources/search    — proxy YouTube Data API v3
  POST   /content/resources           — pin a video / URL to a scope
  GET    /content/resources           — list (filtered by scope + status)
  GET    /content/resources/{rid}     — fetch single
  POST   /content/resources/{rid}/review  — MODERATOR+ approve/reject
  DELETE /content/resources/{rid}     — soft-delete (author or moderator)
"""

from __future__ import annotations

import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.config import settings as content_settings
from learning.content.db import sessionmaker
from learning.content.resources import ai_suggest, cache, quotas
from learning.content.resources.repositories import (
    get_resource,
    insert_resource,
    insert_view_event,
    list_resources,
    list_resources_by_exam,
    soft_delete,
    update_status,
    watch_summary_for_user,
)
from learning.content.resources.schemas import (
    AISuggestRequest,
    AISuggestResponse,
    ExamContentTree,
    ResourceCreate,
    ResourceDetail,
    ResourceList,
    ResourceStatus,
    ReviewDecision,
    SearchResponse,
    SearchResultItem,
    SubjectContent,
    TopicContent,
    ViewEventCreate,
    WatchSummary,
)
from learning.content.resources.youtube_client import (
    extract_video_id,
    get_client,
)
from learning.content.security import JwtPrincipal, current_principal
from learning.storage import verify_upload_claim

router = APIRouter(prefix="/content/resources", tags=["content-resources"])


PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


async def _session() -> AsyncSession:  # type: ignore[return-value]
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]


def _require_role(p: JwtPrincipal, *roles: str) -> None:
    if p.role not in roles:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "forbidden",
                "message": f"Role {p.role} not allowed (requires one of {roles}).",
            },
        )


# ─────────────────────────────────────────────────────────────────────────
# Search — proxies the YouTube Data API v3 with per-creator quota + 24h cache
# ─────────────────────────────────────────────────────────────────────────


@router.get("/search", response_model=SearchResponse)
async def search(
    principal: PrincipalDep,
    q: Annotated[str, Query(min_length=2, max_length=200)],
    max_results: Annotated[int, Query(ge=1, le=20)] = 10,
    language: Annotated[str, Query(pattern="^(en|hi|ta|te|bn|mr)$")] = "en",
) -> SearchResponse:
    _require_role(
        principal, "TEACHER", "EXPERT", "MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN"
    )
    client = get_client()
    if not client.is_configured:
        return SearchResponse(
            items=[],
            source="stub",
            note=(
                "YouTube search is not configured (YOUTUBE_DATA_API_KEY unset). "
                "Paste a video URL directly into the pin form to attach a "
                "specific clip — the server will fetch its metadata via the "
                "video ID. Search returns to live mode once the operator sets "
                "the API key."
            ),
        )

    cached = await cache.get_or_none(language, q)
    if cached is not None:
        items = [SearchResultItem.model_validate(it) for it in cached]
        remaining = await quotas.remaining(principal.user_id, role=principal.role)
        return SearchResponse(
            items=items,
            source="cache",
            daily_quota_remaining=remaining,
        )

    try:
        used, limit = await quotas.consume(principal.user_id, role=principal.role)
    except quotas.QuotaExceeded as e:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "search_quota_exceeded",
                "message": (
                    f"Daily search quota reached ({e.used}/{e.limit}). "
                    "Resets at midnight UTC. You can still pin videos by URL."
                ),
            },
        ) from e

    items = await client.search(q, max_results=max_results, language=language)
    await cache.put(language, q, [it.model_dump(mode="json") for it in items])
    return SearchResponse(
        items=items,
        source="live",
        daily_quota_remaining=max(0, limit - used),
    )


# ─────────────────────────────────────────────────────────────────────────
# AI suggestions — LLM proposes 4-6 search queries for the topic
# ─────────────────────────────────────────────────────────────────────────


@router.post("/ai-suggest", response_model=AISuggestResponse)
async def ai_suggest_queries(
    body: AISuggestRequest,
    principal: PrincipalDep,
) -> AISuggestResponse:
    """Generate search-query suggestions for the curating teacher.

    Calls the LLM via the standard adaptive.llm.call_structured path
    (versioned prompt template, schema-validated output). Falls back
    to a deterministic heuristic when OPENAI_API_KEY is unset, so the
    UI keeps working in dev without a key.
    """
    _require_role(
        principal, "TEACHER", "EXPERT", "MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN"
    )
    out = await ai_suggest.suggest_queries(
        topic_title=body.topic_title,
        topic_description=body.topic_description,
        language=body.language,
        weak_concept=body.weak_concept,
        exam=body.exam,
    )
    return AISuggestResponse.model_validate(out)


# ─────────────────────────────────────────────────────────────────────────
# Pin — TEACHER+ creates a row; lifecycle starts at DRAFT
# (MODERATOR+ go straight to PUBLISHED for fast curation)
# ─────────────────────────────────────────────────────────────────────────


@router.post("", response_model=ResourceDetail, status_code=201)
async def create_resource(
    body: ResourceCreate,
    session: SessionDep,
    principal: PrincipalDep,
) -> ResourceDetail:
    # Documents may be uploaded by students too (the Study Materials hub
    # lets learners contribute their own notes/PDFs, which still flow
    # through moderation). Every other resource type stays curator-only.
    if body.resource_type == "document":
        _require_role(
            principal, "STUDENT", "TEACHER", "EXPERT", "MODERATOR",
            "INSTITUTION_ADMIN", "PLATFORM_ADMIN",
        )
    else:
        _require_role(
            principal, "TEACHER", "EXPERT", "MODERATOR",
            "INSTITUTION_ADMIN", "PLATFORM_ADMIN",
        )

    initial_status = (
        "PUBLISHED"
        if principal.role in ("MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN")
        else "DRAFT"
    )

    # If the operator pasted a YouTube URL but didn't fill metadata,
    # try to fetch it server-side. Title is the only required
    # client-side field, so the others are best-effort.
    title = body.title
    description = body.description
    channel_name = body.channel_name
    duration_seconds = body.duration_seconds
    thumbnail_url = body.thumbnail_url
    external_id = body.external_id
    # Documents store their S3 key in url so the existing list/detail
    # projections keep working; the viewer re-signs a fresh GET at view
    # time via /uploads/sign (the key itself is not directly fetchable).
    url = body.url or (body.doc_object_key if body.resource_type == "document" else "")

    # Anti-IDOR: prove the caller actually uploaded doc_object_key. Without
    # this a user could pin someone else's object key and exfiltrate it via
    # the public /uploads/sign for study-materials. The claim is an HMAC
    # over (object_key, user_id, exp) issued by /uploads/presign.
    if body.resource_type == "document":
        if not body.upload_claim or not verify_upload_claim(
            body.upload_claim,
            body.doc_object_key or "",
            principal.user_id,
            content_settings.jwt_secret,
        ):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "invalid_upload_claim",
                    "message": "Document upload claim missing or invalid; re-upload the file.",
                },
            )

    if body.resource_type == "youtube_video":
        if not external_id:
            external_id = extract_video_id(body.url)
        if external_id:
            client = get_client()
            try:
                meta = await client.get_video_metadata(external_id)
            except Exception:  # noqa: BLE001
                meta = None
            if meta is not None:
                title = title or meta.title
                description = description or meta.description
                channel_name = channel_name or meta.channel_name
                duration_seconds = duration_seconds or meta.duration_seconds
                thumbnail_url = thumbnail_url or meta.thumbnail_url

    row = await insert_resource(
        session,
        topic_id=body.topic_id,
        concept_id=body.concept_id,
        question_id=body.question_id,
        resource_type=body.resource_type,
        external_id=external_id,
        url=url,
        title=title,
        description=description,
        channel_name=channel_name,
        duration_seconds=duration_seconds,
        thumbnail_url=thumbnail_url,
        language=body.language,
        difficulty=body.difficulty,
        position=body.position,
        added_by=UUID(principal.user_id),
        initial_status=initial_status,
        doc_object_key=body.doc_object_key,
        doc_mime_type=body.doc_mime_type,
        doc_size_bytes=body.doc_size_bytes,
        doc_page_count=body.doc_page_count,
    )
    await session.commit()
    return ResourceDetail.model_validate(row)


# ─────────────────────────────────────────────────────────────────────────
# List — students see only PUBLISHED; teachers see their own DRAFT/REVIEW too
# ─────────────────────────────────────────────────────────────────────────


@router.get("", response_model=ResourceList)
async def list_resources_endpoint(
    session: SessionDep,
    principal: PrincipalDep,
    topic_id: UUID | None = None,
    concept_id: UUID | None = None,
    question_id: UUID | None = None,
    status_filter: Annotated[ResourceStatus | None, Query(alias="status")] = None,
    language: str | None = None,
    scope: Annotated[str, Query(pattern="^(student|mine|all)$")] = "student",
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ResourceList:
    """
    scope=student (default) — returns only PUBLISHED rows. Safe for
        both students and teachers; what a learner would see.
    scope=mine — adds the caller's own DRAFT and IN_REVIEW rows.
    scope=all — every row regardless of status; MODERATOR+ only.
    """
    statuses: list[str] | None
    added_by: UUID | None = None
    if scope == "all":
        _require_role(
            principal, "MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN"
        )
        statuses = [status_filter] if status_filter else None
    elif scope == "mine":
        statuses = (
            [status_filter]
            if status_filter
            else ["DRAFT", "IN_REVIEW", "PUBLISHED", "REJECTED"]
        )
        added_by = UUID(principal.user_id)
    else:
        statuses = ["PUBLISHED"]

    rows, total = await list_resources(
        session,
        topic_id=topic_id,
        concept_id=concept_id,
        question_id=question_id,
        statuses=statuses,
        language=language,
        added_by=added_by,
        limit=limit,
        offset=offset,
    )
    return ResourceList(
        items=[ResourceDetail.model_validate(r) for r in rows],
        total=total,
    )


# ─────────────────────────────────────────────────────────────────────────
# Study Materials hub — exam-wide content tree + per-user watch summary.
# Declared BEFORE GET /{rid} so the literal paths aren't captured by the
# {rid} param route (Starlette matches in declaration order).
# ─────────────────────────────────────────────────────────────────────────


def _build_tree(exam_id: UUID, rows: list[dict]) -> ExamContentTree:
    """Group flat (subject, topic, resource) rows into the nested tree."""
    subjects: dict[str, SubjectContent] = {}
    topics: dict[tuple[str, str], TopicContent] = {}
    for r in rows:
        sid = r.pop("subject_id")
        sname = r.pop("subject_name")
        ttitle = r.pop("topic_title")
        tid = r["topic_id"]
        if sid not in subjects:
            subjects[sid] = SubjectContent(
                subject_id=UUID(sid), subject_name=sname, topics=[]
            )
        key = (sid, tid)
        if key not in topics:
            tc = TopicContent(topic_id=UUID(tid), topic_title=ttitle, resources=[], counts={})
            topics[key] = tc
            subjects[sid].topics.append(tc)
        tc = topics[key]
        tc.resources.append(ResourceDetail.model_validate(r))
        bucket = "video" if r["resource_type"].startswith("youtube") else r["resource_type"]
        tc.counts[bucket] = tc.counts.get(bucket, 0) + 1
    return ExamContentTree(exam_id=exam_id, subjects=list(subjects.values()))


@router.get("/by-exam/{exam_id}", response_model=ExamContentTree)
async def list_resources_by_exam_endpoint(
    exam_id: UUID,
    session: SessionDep,
    principal: PrincipalDep,
    language: str | None = None,
    scope: Annotated[str, Query(pattern="^(student|all)$")] = "student",
) -> ExamContentTree:
    """Every content item for an exam, grouped subject → topic, in one call.

    scope=student (default) returns PUBLISHED only; scope=all (MODERATOR+)
    returns every status for curation review.
    """
    if scope == "all":
        _require_role(principal, "MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN")
        statuses: list[str] = []
    else:
        statuses = ["PUBLISHED"]
    rows = await list_resources_by_exam(
        session, exam_id=exam_id, statuses=statuses, language=language
    )
    return _build_tree(exam_id, rows)


@router.get("/watch-summary", response_model=WatchSummary)
async def watch_summary_endpoint(
    exam_id: UUID,
    session: SessionDep,
    principal: PrincipalDep,
) -> WatchSummary:
    """This caller's watch progress for an exam — per-resource resume
    position + per-topic minutes. User comes from the JWT (own data only)."""
    data = await watch_summary_for_user(
        session, user_id=UUID(principal.user_id), exam_id=exam_id
    )
    return WatchSummary(
        user_id=UUID(principal.user_id),
        exam_id=exam_id,
        perResource=data["perResource"],
        perTopic=data["perTopic"],
    )


@router.get("/watch-summary/internal", response_model=WatchSummary)
async def watch_summary_internal_endpoint(
    exam_id: UUID,
    user_id: UUID,
    session: SessionDep,
    x_internal_token: Annotated[str | None, Header()] = None,
) -> WatchSummary:
    """Service-to-service variant: the engagement study-readiness endpoint
    fuses this with revision + mastery. Carries no user bearer, so it
    requires a shared internal-service token (defence-in-depth — safe even
    if the gateway's network rules regress). Without this an attacker on the
    internal network could read any user's watch data by passing user_id."""
    expected = content_settings.internal_service_token
    if not x_internal_token or not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(
            status_code=401,
            detail={"code": "internal_token_required", "message": "Invalid internal token."},
        )
    data = await watch_summary_for_user(session, user_id=user_id, exam_id=exam_id)
    return WatchSummary(
        user_id=user_id,
        exam_id=exam_id,
        perResource=data["perResource"],
        perTopic=data["perTopic"],
    )


@router.get("/{rid}", response_model=ResourceDetail)
async def get_resource_endpoint(
    rid: UUID, session: SessionDep, principal: PrincipalDep
) -> ResourceDetail:
    row = await get_resource(session, rid)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Resource not found."},
        )
    # Authors see their own; MODERATOR+ see anything; others must
    # see only PUBLISHED.
    if (
        row["status"] != "PUBLISHED"
        and row["added_by"] != principal.user_id
        and principal.role
        not in ("MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN")
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "forbidden",
                "message": "Resource is not yet published.",
            },
        )
    return ResourceDetail.model_validate(row)


# ─────────────────────────────────────────────────────────────────────────
# Review — MODERATOR+ approves DRAFT/IN_REVIEW → PUBLISHED, or rejects
# ─────────────────────────────────────────────────────────────────────────


@router.post("/{rid}/review", response_model=ResourceDetail)
async def review_resource(
    rid: UUID,
    body: ReviewDecision,
    session: SessionDep,
    principal: PrincipalDep,
) -> ResourceDetail:
    _require_role(principal, "MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN")
    new_status = "PUBLISHED" if body.approve else "REJECTED"
    row = await update_status(
        session,
        resource_id=rid,
        status=new_status,
        approved_by=UUID(principal.user_id),
        notes=body.notes,
    )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Resource not found."},
        )
    await session.commit()
    return ResourceDetail.model_validate(row)


# ─────────────────────────────────────────────────────────────────────────
# Submit-for-review (TEACHER moves their own DRAFT → IN_REVIEW)
# ─────────────────────────────────────────────────────────────────────────


@router.post("/{rid}/submit", response_model=ResourceDetail)
async def submit_resource(
    rid: UUID, session: SessionDep, principal: PrincipalDep
) -> ResourceDetail:
    row = await get_resource(session, rid)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Resource not found."},
        )
    if row["added_by"] != principal.user_id:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "forbidden",
                "message": "Only the author may submit for review.",
            },
        )
    if row["status"] != "DRAFT":
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_state",
                "message": f"Resource is in status {row['status']}; expected DRAFT.",
            },
        )
    updated = await update_status(session, resource_id=rid, status="IN_REVIEW")
    await session.commit()
    return ResourceDetail.model_validate(updated)


# ─────────────────────────────────────────────────────────────────────────
# Soft-delete (author or moderator+)
# ─────────────────────────────────────────────────────────────────────────


@router.delete("/{rid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    rid: UUID, session: SessionDep, principal: PrincipalDep
) -> None:
    row = await get_resource(session, rid)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Resource not found."},
        )
    if row["added_by"] != principal.user_id and principal.role not in (
        "MODERATOR",
        "INSTITUTION_ADMIN",
        "PLATFORM_ADMIN",
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "forbidden",
                "message": "Only the author or a moderator may delete this resource.",
            },
        )
    await soft_delete(session, rid)
    await session.commit()
    return None


# ─────────────────────────────────────────────────────────────────────────
# View tracking — fired by the yt-nocookie embed on the student web app
# ─────────────────────────────────────────────────────────────────────────


# ── Phase 1D-6 — Resource engagement aggregations ────────────────────


@router.get("/my-views")
async def list_my_resource_views(
    session: SessionDep,
    principal: PrincipalDep,
    limit: int = Query(50, ge=1, le=200),
) -> dict:
    """Per-user watch history: which resources viewed, when, last
    progress event."""
    rows = (
        await session.execute(
            text(
                """
                SELECT v.resource_id::text AS resource_id,
                       MAX(v.event_type) AS last_event,
                       MAX(v.occurred_at) AS last_seen,
                       COUNT(*) AS event_count,
                       MAX(v.position_seconds) AS max_position_seconds,
                       r.title AS title,
                       r.url AS url,
                       r.topic_id::text AS topic_id
                  FROM content_schema.resource_view_events v
                  JOIN content_schema.concept_resources r ON r.id = v.resource_id
                 WHERE v.user_id = CAST(:uid AS uuid)
                 GROUP BY v.resource_id, r.title, r.url, r.topic_id
                 ORDER BY last_seen DESC
                 LIMIT :lim
                """
            ),
            {"uid": principal.user_id, "lim": limit},
        )
    ).mappings().all()
    return {
        "items": [
            {
                "resourceId": r["resource_id"],
                "title": r["title"],
                "url": r["url"],
                "topicId": r["topic_id"],
                "lastEvent": r["last_event"],
                "lastSeenAt": r["last_seen"].isoformat() if r["last_seen"] else None,
                "eventCount": int(r["event_count"]),
                "maxPositionSeconds": int(r["max_position_seconds"] or 0),
                "completed": r["last_event"] == "completed",
            }
            for r in rows
        ],
    }


@router.get("/cohort-engagement/{cohort_id}")
async def cohort_resource_engagement(
    cohort_id: str,
    session: SessionDep,
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    """Per-cohort: most-watched resources by members. Aggregates view
    events scoped to the user list returned from institution service."""
    import httpx
    from learning.adaptive.config import settings as _adp

    base = _adp.institution_base_url.rstrip("/")
    user_ids: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{base}/institution/cohorts/{cohort_id}/members")
            if r.status_code == 200:
                user_ids = [
                    m["userId"]
                    for m in r.json()
                    if (m.get("role") or "STUDENT") == "STUDENT"
                ]
    except httpx.HTTPError:
        pass

    if not user_ids:
        return {"cohortId": cohort_id, "items": []}

    rows = (
        await session.execute(
            text(
                """
                SELECT v.resource_id::text AS resource_id,
                       r.title, r.url, r.topic_id::text AS topic_id,
                       COUNT(DISTINCT v.user_id) AS n_viewers,
                       COUNT(*) FILTER (WHERE v.event_type = 'completed') AS n_completed,
                       COUNT(*) AS n_events
                  FROM content_schema.resource_view_events v
                  JOIN content_schema.concept_resources r ON r.id = v.resource_id
                 WHERE v.user_id = ANY(CAST(:uids AS uuid[]))
                 GROUP BY v.resource_id, r.title, r.url, r.topic_id
                 ORDER BY n_viewers DESC, n_events DESC
                 LIMIT :lim
                """
            ),
            {"uids": user_ids, "lim": limit},
        )
    ).mappings().all()
    return {
        "cohortId": cohort_id,
        "nMembers": len(user_ids),
        "items": [
            {
                "resourceId": r["resource_id"],
                "title": r["title"],
                "url": r["url"],
                "topicId": r["topic_id"],
                "nViewers": int(r["n_viewers"]),
                "nCompleted": int(r["n_completed"]),
                "nEvents": int(r["n_events"]),
                "completionRate": round(
                    int(r["n_completed"]) / int(r["n_viewers"]), 4
                ) if int(r["n_viewers"]) > 0 else 0.0,
            }
            for r in rows
        ],
    }


@router.get("/platform-effectiveness")
async def platform_resource_effectiveness(
    session: SessionDep,
    limit: int = Query(25, ge=1, le=100),
) -> dict:
    """Top resources platform-wide ranked by completion rate × viewer count."""
    rows = (
        await session.execute(
            text(
                """
                SELECT v.resource_id::text AS resource_id,
                       r.title, r.url, r.topic_id::text AS topic_id,
                       COUNT(DISTINCT v.user_id) AS n_viewers,
                       COUNT(*) FILTER (WHERE v.event_type = 'completed') AS n_completed,
                       COUNT(*) AS n_events
                  FROM content_schema.resource_view_events v
                  JOIN content_schema.concept_resources r ON r.id = v.resource_id
                 WHERE r.status = 'PUBLISHED'
                 GROUP BY v.resource_id, r.title, r.url, r.topic_id
                HAVING COUNT(DISTINCT v.user_id) >= 5
                 ORDER BY (
                   COUNT(*) FILTER (WHERE v.event_type = 'completed')::float
                   / NULLIF(COUNT(DISTINCT v.user_id), 0)
                 ) DESC NULLS LAST,
                  COUNT(DISTINCT v.user_id) DESC
                 LIMIT :lim
                """
            ),
            {"lim": limit},
        )
    ).mappings().all()
    return {
        "items": [
            {
                "resourceId": r["resource_id"],
                "title": r["title"],
                "url": r["url"],
                "topicId": r["topic_id"],
                "nViewers": int(r["n_viewers"]),
                "nCompleted": int(r["n_completed"]),
                "nEvents": int(r["n_events"]),
                "completionRate": round(
                    int(r["n_completed"]) / int(r["n_viewers"]), 4
                ) if int(r["n_viewers"]) > 0 else 0.0,
            }
            for r in rows
        ],
    }


@router.post("/{rid}/view", status_code=204)
async def record_view(
    rid: UUID,
    body: ViewEventCreate,
    session: SessionDep,
    principal: PrincipalDep,
) -> None:
    """Record a view-event for telemetry. Append-only.

    Any authenticated principal may post — students record their own
    watch progress via the player. The resource must exist and be
    visible to the caller (PUBLISHED, or owned by them); we don't
    silently drop unknown ids so the client can detect stale embeds.
    """
    row = await get_resource(session, rid)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Resource not found."},
        )
    # Visibility check — students should only ever fire events
    # against PUBLISHED rows, but admins / authors may exercise the
    # player on their own DRAFTs while curating.
    if (
        row["status"] != "PUBLISHED"
        and row["added_by"] != principal.user_id
        and principal.role
        not in ("MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN")
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "forbidden",
                "message": "Resource is not yet published.",
            },
        )
    await insert_view_event(
        session,
        resource_id=rid,
        user_id=UUID(principal.user_id),
        event_type=body.event_type,
        position_seconds=body.position_seconds,
        session_id=body.session_id,
    )
    await session.commit()
    return None
