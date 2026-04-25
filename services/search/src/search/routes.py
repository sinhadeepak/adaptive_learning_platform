"""FastAPI router for /search/* + /admin/reindex."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from search.config import settings
from search.index import client as os_client
from search.reindex import reindex_all
from search.schemas import ReindexResult, SearchHit, SearchResults, TypeaheadHit
from search.security import JwtPrincipal, require_admin

router = APIRouter()


def _hit_path(hit_type: str, hit_id: str) -> str:
    if hit_type == "topic":
        return f"/catalog/topic/{hit_id}"
    return f"/{hit_type}/{hit_id}"


@router.get("/search", response_model=SearchResults, tags=["search"])
async def search(
    q: Annotated[str, Query(min_length=1, max_length=120)],
    type: Annotated[str | None, Query(pattern="^(topic|lesson|question)$")] = None,
    page: Annotated[int, Query(ge=1, le=100)] = 1,
    perPage: Annotated[int, Query(ge=1, le=50)] = 20,
) -> SearchResults:
    # Bilingual: query both English-analyzed and Hindi-analyzed views of the
    # title in parallel (same source, two analyzed fields per topics_v2 mapping).
    # Description carries the Hinglish alias, so cross-script queries like
    # "yantriki" hit via English analyzer's standard tokenizer.
    must: list[dict[str, Any]] = [
        {
            "multi_match": {
                "query": q,
                "fields": [
                    "title^3",
                    "title_hi^3",
                    "subtitle",
                    "description",
                ],
                "fuzziness": "AUTO",
            }
        },
    ]
    if type:
        must.append({"term": {"type": type}})

    body = {
        "from": (page - 1) * perPage,
        "size": perPage,
        "query": {"bool": {"must": must}},
        "track_total_hits": True,
    }
    response = await os_client().search(index=settings.topics_index, body=body)
    hits = response.get("hits", {})
    total = (
        hits.get("total", {}).get("value", 0)
        if isinstance(hits.get("total"), dict)
        else hits.get("total", 0)
    )
    results = [
        SearchHit(
            type=h["_source"]["type"],
            id=h["_source"]["id"],
            title=h["_source"]["title"],
            subtitle=h["_source"].get("subtitle"),
            path=_hit_path(h["_source"]["type"], h["_source"]["id"]),
            score=h.get("_score"),
        )
        for h in hits.get("hits", [])
    ]
    return SearchResults(
        results=results,
        total=total,
        page=page,
        perPage=perPage,
        tookMs=response.get("took"),
    )


@router.get("/search/typeahead", response_model=list[TypeaheadHit], tags=["search"])
async def typeahead(q: Annotated[str, Query(min_length=1, max_length=60)]) -> list[TypeaheadHit]:
    body = {
        "suggest": {
            "title-suggest": {
                "prefix": q,
                "completion": {"field": "title_suggest", "size": 8, "skip_duplicates": True},
            }
        }
    }
    response = await os_client().search(index=settings.topics_index, body=body)
    options = response.get("suggest", {}).get("title-suggest", [{}])[0].get("options", [])
    return [
        TypeaheadHit(
            type=opt["_source"]["type"],
            id=opt["_source"]["id"],
            title=opt["text"],
            path=_hit_path(opt["_source"]["type"], opt["_source"]["id"]),
        )
        for opt in options
    ]


@router.post(
    "/admin/reindex",
    response_model=ReindexResult,
    tags=["admin"],
)
async def admin_reindex(_admin: Annotated[JwtPrincipal, Depends(require_admin)]) -> ReindexResult:
    result = await reindex_all()
    return ReindexResult(**result)
