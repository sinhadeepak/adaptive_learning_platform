"""Phase 3.5 — AI revision capsule for a topic.

GET /content/topics/{topic_id}/revision-capsule[?refresh=true]

Returns a cached one-page summary, generating (and caching) it on first view.
Any authenticated learner may read a capsule — it's topic-scoped public study
material, not per-user data.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from learning.ai_gateway import AIGateway, AIGatewayError
from learning.content import revision_capsule as capsule_mod
from learning.content.db import sessionmaker
from learning.content.security import JwtPrincipal, current_principal

router = APIRouter(prefix="/content", tags=["content-revision-capsule"])

PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


def _gateway(request: Request) -> AIGateway:
    gw = getattr(request.app.state, "ai_gateway", None)
    if gw is None:
        raise HTTPException(
            status_code=503,
            detail={"code": "ai_gateway_unavailable", "message": "AI capsules are unavailable."},
        )
    return gw


@router.get("/topics/{topic_id}/revision-capsule")
async def get_revision_capsule(
    topic_id: str,
    _principal: PrincipalDep,
    request: Request,
    refresh: bool = Query(False, description="Force regeneration, bypassing the cache."),
) -> dict:
    async with sessionmaker()() as session:
        if not refresh:
            cached = await capsule_mod.get_cached(session, topic_id)
            if cached is not None:
                return cached

        title = await capsule_mod.topic_title(session, topic_id)
        if title is None:
            raise HTTPException(
                status_code=404,
                detail={"code": "topic_not_found", "message": "Unknown topic."},
            )
        material, count = await capsule_mod.gather_material(session, topic_id)
        if count == 0:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "no_material",
                    "message": "No published questions on this topic yet — can't build a capsule.",
                },
            )

        gateway = _gateway(request)
        try:
            capsule = await capsule_mod.generate(gateway, topic=title, material=material)
        except AIGatewayError as e:
            raise HTTPException(
                status_code=503,
                detail={"code": "capsule_generation_failed", "message": str(e)},
            ) from e

        payload = capsule.model_dump()
        model = getattr(gateway, "last_model", None)
        await capsule_mod.upsert_cache(
            session, topic_id=topic_id, capsule=payload, source_count=count, model=model
        )
        await session.commit()

    return {
        "capsule": payload,
        "sourceCount": count,
        "cached": False,
    }
