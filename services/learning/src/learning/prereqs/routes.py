"""Sprint 26 (P4-S26) — prereq HTTP routes.

`GET /catalog/topics/{id}/prereqs` — pure topology view (no user data).
`GET /catalog/topics/{id}/gate?userId=X` — joins prereq topology with the
user's mastery (fetched from alp-engagement) to compute the gate state.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from learning.adaptive.clients import fetch_mastery
from learning.catalog.db import get_session
from learning.prereqs import repositories as _repo
from learning.prereqs import traversal as _traversal

router = APIRouter(prefix="/catalog/topics", tags=["prereqs"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _enrich_with_titles(
    ids: list[str], titles: dict[str, str]
) -> list[dict[str, str]]:
    return [{"topicId": tid, "title": titles.get(tid, "")} for tid in ids]


@router.get("/{topic_id}/prereqs")
async def topic_prereqs_route(
    topic_id: str, session: SessionDep
) -> dict[str, Any]:
    graph = await _repo.load_graph(session)
    if topic_id not in graph:
        raise HTTPException(
            status_code=404,
            detail={"code": "topic_not_found", "message": "Topic not found"},
        )
    direct = _traversal.direct_prereqs(graph, topic_id)
    transitive = _traversal.transitive_prereqs(graph, topic_id)
    titles = await _repo.load_topic_titles(session, list({*direct, *transitive}))
    return {
        "topicId": topic_id,
        "directPrereqs": _enrich_with_titles(direct, titles),
        "transitivePrereqs": _enrich_with_titles(transitive, titles),
    }


@router.get("/{topic_id}/prerequisite-graph")
async def topic_prerequisite_graph_route(
    topic_id: str,
    session: SessionDep,
    userId: Annotated[str | None, Query()] = None,
    depth: Annotated[int, Query(ge=1, le=5)] = 3,
) -> dict[str, Any]:
    """Phase 1D-2 — local prerequisite subgraph (3-hop neighborhood) for
    react-flow viz. Each node carries the user's mastery if userId is given.
    """
    graph = await _repo.load_graph(session)
    if topic_id not in graph:
        raise HTTPException(
            status_code=404,
            detail={"code": "topic_not_found", "message": "Topic not found"},
        )

    # BFS walk both directions up to `depth` hops. `graph` maps
    # topic_id -> list of prereq topic_ids, so we follow prereqs upward
    # (into what this topic depends on).
    seen: set[str] = {topic_id}
    edges: list[tuple[str, str]] = []
    frontier: set[str] = {topic_id}
    for _ in range(depth):
        next_frontier: set[str] = set()
        for node in frontier:
            for prereq in graph.get(node, []):
                edges.append((node, prereq))
                if prereq not in seen:
                    seen.add(prereq)
                    next_frontier.add(prereq)
        if not next_frontier:
            break
        frontier = next_frontier

    # Also include direct dependents (topics that have THIS topic as a prereq)
    # one hop down so the user sees what unlocks next.
    for src, prereqs in graph.items():
        if topic_id in prereqs and src not in seen:
            seen.add(src)
            edges.append((src, topic_id))

    titles = await _repo.load_topic_titles(session, list(seen))
    mastery_map: dict[str, float] = {}
    if userId:
        mastery_rows = await fetch_mastery(userId)
        mastery_map = {
            str(row.get("topicId") or row.get("topic_id")): float(row.get("ewa") or 0.0)
            for row in mastery_rows
        }

    nodes = [
        {
            "id": tid,
            "title": titles.get(tid, ""),
            "mastery": mastery_map.get(tid),
            "isFocus": tid == topic_id,
        }
        for tid in seen
    ]
    edge_rows = [
        {"from": src, "to": dst, "type": "is_prerequisite_of"}
        for src, dst in edges
    ]
    return {
        "rootTopicId": topic_id,
        "depth": depth,
        "nodes": nodes,
        "edges": edge_rows,
    }


@router.get("/{topic_id}/gate")
async def topic_gate_route(
    topic_id: str,
    session: SessionDep,
    userId: Annotated[str, Query()],
) -> dict[str, Any]:
    graph = await _repo.load_graph(session)
    if topic_id not in graph:
        raise HTTPException(
            status_code=404,
            detail={"code": "topic_not_found", "message": "Topic not found"},
        )
    # Mastery from alp-engagement. Empty list on cold-start or service-down
    # — fail-soft: gate returns "missing all prereqs" rather than blocking.
    mastery_rows = await fetch_mastery(userId)
    mastery = {
        str(row.get("topicId") or row.get("topic_id")): float(row.get("ewa") or 0.0)
        for row in mastery_rows
    }
    state = _traversal.gate_state(graph, topic_id, mastery)
    titles = await _repo.load_topic_titles(
        session, list({*state["missing"], *state["mastered"]})
    )
    return {
        "topicId": topic_id,
        "userId": userId,
        "canAttempt": state["can_attempt"],
        "missing": _enrich_with_titles(state["missing"], titles),
        "mastered": _enrich_with_titles(state["mastered"], titles),
    }
