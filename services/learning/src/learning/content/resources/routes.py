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

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker
from learning.content.resources import ai_suggest, cache, quotas
from learning.content.resources.repositories import (
    get_resource,
    insert_resource,
    list_resources,
    soft_delete,
    update_status,
)
from learning.content.resources.schemas import (
    AISuggestRequest,
    AISuggestResponse,
    ResourceCreate,
    ResourceDetail,
    ResourceList,
    ResourceStatus,
    ReviewDecision,
    SearchResponse,
    SearchResultItem,
)
from learning.content.resources.youtube_client import (
    extract_video_id,
    get_client,
)
from learning.content.security import JwtPrincipal, current_principal

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
    _require_role(
        principal, "TEACHER", "EXPERT", "MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN"
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
        url=body.url,
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
