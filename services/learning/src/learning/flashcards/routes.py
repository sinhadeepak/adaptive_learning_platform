"""Phase 1D-8 — Flashcard SRS routes.

Endpoints:
  POST   /content/decks                          — create deck
  GET    /content/decks                          — my decks
  GET    /content/decks/community                — discover published decks
  GET    /content/decks/{id}                     — fetch deck (with access check)
  PUT    /content/decks/{id}                     — update title/desc/visibility
  DELETE /content/decks/{id}                     — owner only
  POST   /content/decks/{id}/subscribe           — subscribe (creates review state)
  DELETE /content/decks/{id}/subscribe           — unsubscribe
  POST   /content/decks/{id}/cards               — add card
  GET    /content/decks/{id}/cards               — list cards
  PUT    /content/cards/{cid}                    — update front/back
  DELETE /content/cards/{cid}                    — delete card
  GET    /content/flashcards/due                 — due-today across subscriptions
  POST   /content/flashcards/{cid}/review        — apply SM-2 update
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.adaptive.config import settings as _adaptive_settings
from learning.content.db import sessionmaker
from learning.content.security import JwtPrincipal, current_principal
from learning.flashcards.srs import ReviewState, sm2_update
import httpx
import logging

_xp_log = logging.getLogger("flashcards.xp")
log = logging.getLogger(__name__)

router = APIRouter(tags=["flashcards"])


async def _session() -> AsyncSession:
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]
PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


class DeckCreate(BaseModel):
    title: str = Field(..., max_length=200)
    description: str | None = Field(None, max_length=1000)
    topicId: str | None = None
    visibility: str = "PRIVATE"
    language: str = "en"


class DeckUpdate(BaseModel):
    title: str | None = Field(None, max_length=200)
    description: str | None = Field(None, max_length=1000)
    visibility: str | None = None


class CardCreate(BaseModel):
    frontMd: str = Field(..., max_length=4096)
    backMd: str = Field(..., max_length=4096)
    position: int = 0


class CardUpdate(BaseModel):
    frontMd: str | None = Field(None, max_length=4096)
    backMd: str | None = Field(None, max_length=4096)
    position: int | None = None


class ReviewRequest(BaseModel):
    quality: int = Field(..., ge=0, le=5)


def _user_can_access_deck(deck: dict, user_id: str) -> bool:
    if deck["owner_user_id"] == user_id:
        return True
    if deck["status"] != "PUBLISHED":
        return False
    if deck["visibility"] == "PUBLIC":
        return True
    return False


# ── Decks ────────────────────────────────────────────────────────────


@router.post("/content/decks", status_code=201)
async def create_deck(
    body: DeckCreate, session: SessionDep, principal: PrincipalDep
) -> dict:
    if body.visibility not in ("PRIVATE", "COHORT", "PUBLIC"):
        raise HTTPException(status_code=400, detail={"code": "bad_visibility"})
    row = (
        await session.execute(
            text(
                """
                INSERT INTO content_schema.decks
                  (owner_user_id, title, description, topic_id, visibility, language)
                VALUES
                  (CAST(:uid AS uuid), :title, :desc, CAST(:tid AS uuid),
                   :vis, :lang)
                RETURNING id::text, status, visibility, created_at::text
                """
            ),
            {
                "uid": principal.user_id,
                "title": body.title,
                "desc": body.description,
                "tid": body.topicId,
                "vis": body.visibility,
                "lang": body.language,
            },
        )
    ).first()
    await session.commit()
    return {"id": row[0], "status": row[1], "visibility": row[2], "createdAt": row[3]}


@router.get("/content/decks")
async def list_my_decks(session: SessionDep, principal: PrincipalDep) -> dict:
    rows = (
        await session.execute(
            text(
                """
                SELECT id::text, owner_user_id::text, title, description,
                       topic_id::text, status, visibility, language,
                       created_at::text,
                       (SELECT COUNT(*) FROM content_schema.flashcards c
                         WHERE c.deck_id = d.id) AS n_cards
                  FROM content_schema.decks d
                 WHERE owner_user_id = CAST(:uid AS uuid)
                 ORDER BY created_at DESC
                """
            ),
            {"uid": principal.user_id},
        )
    ).mappings().all()
    return {
        "items": [
            {
                "id": r["id"],
                "ownerUserId": r["owner_user_id"],
                "title": r["title"],
                "description": r["description"],
                "topicId": r["topic_id"],
                "status": r["status"],
                "visibility": r["visibility"],
                "language": r["language"],
                "createdAt": r["created_at"],
                "nCards": int(r["n_cards"]),
            }
            for r in rows
        ],
    }


@router.get("/content/decks/community")
async def list_community_decks(
    session: SessionDep,
    topicId: str | None = None,
    q: str | None = None,
    sort: str = Query("popular", pattern="^(popular|recent)$"),
    limit: int = Query(50, ge=1, le=200),
) -> dict:
    params: dict = {"lim": limit}
    where = "status = 'PUBLISHED' AND visibility = 'PUBLIC'"
    if topicId:
        where += " AND topic_id = CAST(:tid AS uuid)"
        params["tid"] = topicId
    if q:
        where += " AND (title ILIKE :q OR COALESCE(description,'') ILIKE :q)"
        params["q"] = f"%{q}%"
    order = "(SELECT COUNT(*) FROM content_schema.deck_subscriptions s WHERE s.deck_id = d.id) DESC" \
        if sort == "popular" else "created_at DESC"
    rows = (
        await session.execute(
            text(
                f"""
                SELECT id::text, owner_user_id::text, title, description,
                       topic_id::text, language, created_at::text,
                       (SELECT COUNT(*) FROM content_schema.flashcards c
                         WHERE c.deck_id = d.id) AS n_cards,
                       (SELECT COUNT(*) FROM content_schema.deck_subscriptions s
                         WHERE s.deck_id = d.id) AS n_subscribers
                  FROM content_schema.decks d
                 WHERE {where}
                 ORDER BY {order}
                 LIMIT :lim
                """
            ),
            params,
        )
    ).mappings().all()
    return {
        "items": [
            {
                "id": r["id"],
                "ownerUserId": r["owner_user_id"],
                "title": r["title"],
                "description": r["description"],
                "topicId": r["topic_id"],
                "language": r["language"],
                "createdAt": r["created_at"],
                "nCards": int(r["n_cards"]),
                "nSubscribers": int(r["n_subscribers"]),
            }
            for r in rows
        ],
    }


@router.get("/content/decks/recommended")
async def list_recommended_decks(
    session: SessionDep,
    principal: PrincipalDep,
    limit: int = Query(12, ge=1, le=50),
) -> dict:
    """Published community decks for the caller's WEAKEST topics, ranked so the
    topics you're worst at (and that have a deck) come first — a fast on-ramp
    from "I'm weak here" to "here's a deck to drill it". Weakness comes from the
    engagement mastery signal; ties break on deck popularity."""
    # Caller's mastery (weakest-first). Best-effort: no mastery yet → no recs.
    try:
        from learning.adaptive.clients import fetch_mastery

        mastery = await fetch_mastery(principal.user_id)
    except Exception:
        log.warning("recommended_decks.mastery_fetch_failed user=%s", principal.user_id)
        mastery = []

    # Weak = mastery below "comfortable" (0.6); take the weakest handful to scope
    # the deck query. Unknown/never-attempted (ewa 0) counts as weak.
    weak = sorted(
        (m for m in mastery if float(m.get("ewa", 0.0)) < 0.6),
        key=lambda m: float(m.get("ewa", 0.0)),
    )[:20]
    ewa_by_topic = {m["topicId"]: float(m.get("ewa", 0.0)) for m in weak}
    weak_ids = list(ewa_by_topic.keys())
    if not weak_ids:
        return {"items": []}

    rows = (
        await session.execute(
            text(
                """
                SELECT id::text, owner_user_id::text, title, description,
                       topic_id::text, language, created_at::text,
                       (SELECT COUNT(*) FROM content_schema.flashcards c
                         WHERE c.deck_id = d.id) AS n_cards,
                       (SELECT COUNT(*) FROM content_schema.deck_subscriptions s
                         WHERE s.deck_id = d.id) AS n_subscribers
                  FROM content_schema.decks d
                 WHERE status = 'PUBLISHED' AND visibility = 'PUBLIC'
                   AND topic_id = ANY(CAST(:tids AS uuid[]))
                """
            ),
            {"tids": weak_ids},
        )
    ).mappings().all()

    def _reason(ewa: float) -> str:
        if ewa <= 0.0:
            return "You haven't started this topic yet"
        if ewa < 0.4:
            return f"You're weak here (mastery {ewa:.0%})"
        return f"Room to grow (mastery {ewa:.0%})"

    items = [
        {
            "id": r["id"],
            "ownerUserId": r["owner_user_id"],
            "title": r["title"],
            "description": r["description"],
            "topicId": r["topic_id"],
            "language": r["language"],
            "createdAt": r["created_at"],
            "nCards": int(r["n_cards"]),
            "nSubscribers": int(r["n_subscribers"]),
            "topicEwa": ewa_by_topic.get(r["topic_id"], 0.0),
            "reason": _reason(ewa_by_topic.get(r["topic_id"], 0.0)),
        }
        for r in rows
    ]
    # Weakest topic first; break ties on popularity so a well-loved deck wins.
    items.sort(key=lambda d: (d["topicEwa"], -d["nSubscribers"]))
    return {"items": items[:limit]}


@router.get("/content/decks/{deck_id}")
async def get_deck(
    deck_id: str, session: SessionDep, principal: PrincipalDep
) -> dict:
    row = (
        await session.execute(
            text(
                """
                SELECT id::text, owner_user_id::text, title, description,
                       topic_id::text, status, visibility, language, created_at::text
                  FROM content_schema.decks
                 WHERE id = CAST(:did AS uuid)
                """
            ),
            {"did": deck_id},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    if not _user_can_access_deck(dict(row), principal.user_id):
        raise HTTPException(status_code=403, detail={"code": "forbidden"})
    return dict(row)


@router.put("/content/decks/{deck_id}")
async def update_deck(
    deck_id: str, body: DeckUpdate,
    session: SessionDep, principal: PrincipalDep,
) -> dict:
    head = (
        await session.execute(
            text(
                "SELECT owner_user_id::text FROM content_schema.decks WHERE id = CAST(:d AS uuid)"
            ),
            {"d": deck_id},
        )
    ).first()
    if head is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    if head[0] != principal.user_id:
        raise HTTPException(status_code=403, detail={"code": "not_owner"})
    fields = []
    params: dict = {"d": deck_id}
    if body.title is not None:
        fields.append("title = :title")
        params["title"] = body.title
    if body.description is not None:
        fields.append("description = :desc")
        params["desc"] = body.description
    if body.visibility is not None:
        if body.visibility not in ("PRIVATE", "COHORT", "PUBLIC"):
            raise HTTPException(status_code=400, detail={"code": "bad_visibility"})
        fields.append("visibility = :vis")
        params["vis"] = body.visibility
    if not fields:
        return {"id": deck_id}
    fields.append("updated_at = NOW()")
    await session.execute(
        text(f"UPDATE content_schema.decks SET {', '.join(fields)} WHERE id = CAST(:d AS uuid)"),
        params,
    )
    await session.commit()
    return {"id": deck_id}


# ── Moderation pipeline ──────────────────────────────────────────────


_MOD_ROLES = ("MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN")


def _is_moderator(principal: JwtPrincipal) -> bool:
    return principal.role in _MOD_ROLES


class ReviewDecision(BaseModel):
    decision: str = Field(..., pattern="^(APPROVE|REJECT)$")
    reason: str | None = Field(None, max_length=1000)


@router.post("/content/decks/{deck_id}/submit-for-review")
async def submit_deck_for_review(
    deck_id: str, session: SessionDep, principal: PrincipalDep,
) -> dict:
    """Owner submits a DRAFT deck for moderation. Public-visibility decks
    must clear review before they appear in /content/decks/community."""
    head = (
        await session.execute(
            text(
                """
                SELECT owner_user_id::text, status, visibility,
                       (SELECT COUNT(*) FROM content_schema.flashcards c
                         WHERE c.deck_id = d.id) AS n_cards
                  FROM content_schema.decks d
                 WHERE id = CAST(:d AS uuid)
                """
            ),
            {"d": deck_id},
        )
    ).mappings().first()
    if head is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    if head["owner_user_id"] != principal.user_id:
        raise HTTPException(status_code=403, detail={"code": "not_owner"})
    if head["status"] not in ("DRAFT", "REJECTED"):
        raise HTTPException(
            status_code=409,
            detail={"code": "invalid_status", "message": f"Deck is {head['status']}"},
        )
    if int(head["n_cards"]) < 5:
        raise HTTPException(
            status_code=422,
            detail={"code": "too_few_cards", "message": "Deck needs at least 5 cards before review."},
        )
    await session.execute(
        text(
            """
            UPDATE content_schema.decks
               SET status = 'IN_REVIEW', updated_at = NOW()
             WHERE id = CAST(:d AS uuid)
            """
        ),
        {"d": deck_id},
    )
    await session.commit()
    return {"deckId": deck_id, "status": "IN_REVIEW"}


@router.get("/content/decks/review-queue")
async def deck_review_queue(
    session: SessionDep, principal: PrincipalDep,
    limit: int = Query(50, ge=1, le=200),
) -> dict:
    """Moderator queue: all decks waiting for review."""
    if not _is_moderator(principal):
        raise HTTPException(status_code=403, detail={"code": "forbidden"})
    rows = (
        await session.execute(
            text(
                """
                SELECT d.id::text, d.owner_user_id::text, d.title, d.description,
                       d.topic_id::text, d.visibility, d.language, d.created_at::text,
                       d.updated_at::text,
                       (SELECT COUNT(*) FROM content_schema.flashcards c
                         WHERE c.deck_id = d.id) AS n_cards
                  FROM content_schema.decks d
                 WHERE d.status = 'IN_REVIEW'
                 ORDER BY d.updated_at ASC
                 LIMIT :lim
                """
            ),
            {"lim": limit},
        )
    ).mappings().all()
    return {
        "items": [
            {
                "id": r["id"],
                "ownerUserId": r["owner_user_id"],
                "title": r["title"],
                "description": r["description"],
                "topicId": r["topic_id"],
                "visibility": r["visibility"],
                "language": r["language"],
                "createdAt": r["created_at"],
                "updatedAt": r["updated_at"],
                "nCards": int(r["n_cards"]),
            }
            for r in rows
        ],
    }


@router.post("/content/decks/{deck_id}/review")
async def review_deck(
    deck_id: str, body: ReviewDecision,
    session: SessionDep, principal: PrincipalDep,
) -> dict:
    """Moderator approves or rejects a deck."""
    if not _is_moderator(principal):
        raise HTTPException(status_code=403, detail={"code": "forbidden"})
    head = (
        await session.execute(
            text(
                "SELECT status FROM content_schema.decks WHERE id = CAST(:d AS uuid)"
            ),
            {"d": deck_id},
        )
    ).first()
    if head is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    if head[0] != "IN_REVIEW":
        raise HTTPException(
            status_code=409,
            detail={"code": "not_in_review", "message": f"Deck is {head[0]}"},
        )
    new_status = "PUBLISHED" if body.decision == "APPROVE" else "REJECTED"
    await session.execute(
        text(
            """
            UPDATE content_schema.decks
               SET status = :st, updated_at = NOW()
             WHERE id = CAST(:d AS uuid)
            """
        ),
        {"st": new_status, "d": deck_id},
    )
    await session.commit()
    return {"deckId": deck_id, "status": new_status, "reason": body.reason}


@router.delete("/content/decks/{deck_id}", status_code=204)
async def delete_deck(
    deck_id: str, session: SessionDep, principal: PrincipalDep,
) -> None:
    head = (
        await session.execute(
            text(
                "SELECT owner_user_id::text FROM content_schema.decks WHERE id = CAST(:d AS uuid)"
            ),
            {"d": deck_id},
        )
    ).first()
    if head is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    if head[0] != principal.user_id:
        raise HTTPException(status_code=403, detail={"code": "not_owner"})
    await session.execute(
        text("DELETE FROM content_schema.decks WHERE id = CAST(:d AS uuid)"),
        {"d": deck_id},
    )
    await session.commit()


# ── Subscriptions ────────────────────────────────────────────────────


@router.post("/content/decks/{deck_id}/subscribe", status_code=201)
async def subscribe_deck(
    deck_id: str, session: SessionDep, principal: PrincipalDep,
) -> dict:
    head = (
        await session.execute(
            text(
                """
                SELECT owner_user_id::text, status, visibility
                  FROM content_schema.decks WHERE id = CAST(:d AS uuid)
                """
            ),
            {"d": deck_id},
        )
    ).mappings().first()
    if head is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    if not _user_can_access_deck(dict(head), principal.user_id):
        raise HTTPException(status_code=403, detail={"code": "forbidden"})
    await session.execute(
        text(
            """
            INSERT INTO content_schema.deck_subscriptions (user_id, deck_id)
            VALUES (CAST(:uid AS uuid), CAST(:d AS uuid))
            ON CONFLICT DO NOTHING
            """
        ),
        {"uid": principal.user_id, "d": deck_id},
    )
    # Seed flashcard_review_state rows for each card
    await session.execute(
        text(
            """
            INSERT INTO content_schema.flashcard_review_state (user_id, card_id)
            SELECT CAST(:uid AS uuid), c.id
              FROM content_schema.flashcards c
             WHERE c.deck_id = CAST(:d AS uuid)
            ON CONFLICT DO NOTHING
            """
        ),
        {"uid": principal.user_id, "d": deck_id},
    )
    await session.commit()
    return {"deckId": deck_id, "subscribed": True}


@router.delete("/content/decks/{deck_id}/subscribe", status_code=204)
async def unsubscribe_deck(
    deck_id: str, session: SessionDep, principal: PrincipalDep,
) -> None:
    await session.execute(
        text(
            """
            DELETE FROM content_schema.deck_subscriptions
             WHERE user_id = CAST(:uid AS uuid)
               AND deck_id = CAST(:d AS uuid)
            """
        ),
        {"uid": principal.user_id, "d": deck_id},
    )
    await session.commit()


# ── Cards ────────────────────────────────────────────────────────────


class ImportFromQuestionsBody(BaseModel):
    topicId: str
    limit: int = Field(20, ge=1, le=100)


@router.post("/content/decks/{deck_id}/import-from-questions", status_code=201)
async def import_from_questions(
    deck_id: str,
    body: ImportFromQuestionsBody,
    session: SessionDep, principal: PrincipalDep,
) -> dict:
    """Bulk-create flashcards from PUBLISHED questions in a topic.
    Front = question stem, Back = correct option text + explanation.
    Caller must own the deck.
    """
    head = (
        await session.execute(
            text(
                "SELECT owner_user_id::text FROM content_schema.decks WHERE id = CAST(:d AS uuid)"
            ),
            {"d": deck_id},
        )
    ).first()
    if head is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    if head[0] != principal.user_id:
        raise HTTPException(status_code=403, detail={"code": "not_owner"})

    # Pull questions via cross-DB dblink (questions live in quiz_schema).
    # Pre-MVP: we don't have a direct quiz client here, so use HTTP.
    import httpx
    from learning.adaptive.config import settings as _adp

    qz = _adp.quiz_base_url.rstrip("/")
    fetched: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=4.0) as c:
            r = await c.get(
                f"{qz}/quiz/questions",
                params={"topicId": body.topicId, "limit": body.limit},
            )
            if r.status_code == 200:
                data = r.json()
                fetched = data.get("items") or data.get("questions") or []
    except httpx.HTTPError:
        fetched = []

    if not fetched:
        raise HTTPException(
            status_code=422,
            detail={"code": "no_questions", "message": "No published questions for this topic."},
        )

    next_pos = (
        await session.execute(
            text(
                """
                SELECT COALESCE(MAX(position), -1) + 1
                  FROM content_schema.flashcards
                 WHERE deck_id = CAST(:d AS uuid)
                """
            ),
            {"d": deck_id},
        )
    ).scalar()
    pos = int(next_pos or 0)

    created = 0
    for q in fetched:
        stem = (q.get("stem") or "").strip()
        if not stem:
            continue
        choices = q.get("choices") or []
        correct_idx = q.get("correctIdx")
        explanation = (q.get("explanation") or "").strip()
        correct_text = ""
        if isinstance(choices, list) and isinstance(correct_idx, int) and 0 <= correct_idx < len(choices):
            correct_text = str(choices[correct_idx]).strip()
        front = stem[:4096]
        back_parts = []
        if correct_text:
            back_parts.append(f"**Answer:** {correct_text}")
        if explanation:
            back_parts.append(explanation)
        back = "\n\n".join(back_parts)[:4096] or "—"
        cid = (
            await session.execute(
                text(
                    """
                    INSERT INTO content_schema.flashcards
                      (deck_id, front_md, back_md, position)
                    VALUES
                      (CAST(:d AS uuid), :front, :back, :pos)
                    RETURNING id::text
                    """
                ),
                {"d": deck_id, "front": front, "back": back, "pos": pos},
            )
        ).first()
        if cid is not None:
            # Seed review state for any users already subscribed.
            await session.execute(
                text(
                    """
                    INSERT INTO content_schema.flashcard_review_state (user_id, card_id)
                    SELECT s.user_id, CAST(:cid AS uuid)
                      FROM content_schema.deck_subscriptions s
                     WHERE s.deck_id = CAST(:d AS uuid)
                    ON CONFLICT DO NOTHING
                    """
                ),
                {"d": deck_id, "cid": cid[0]},
            )
            created += 1
            pos += 1
    await session.commit()
    return {"deckId": deck_id, "created": created, "skipped": len(fetched) - created}


@router.post("/content/decks/{deck_id}/cards", status_code=201)
async def add_card(
    deck_id: str, body: CardCreate,
    session: SessionDep, principal: PrincipalDep,
) -> dict:
    head = (
        await session.execute(
            text(
                "SELECT owner_user_id::text FROM content_schema.decks WHERE id = CAST(:d AS uuid)"
            ),
            {"d": deck_id},
        )
    ).first()
    if head is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    if head[0] != principal.user_id:
        raise HTTPException(status_code=403, detail={"code": "not_owner"})
    row = (
        await session.execute(
            text(
                """
                INSERT INTO content_schema.flashcards
                  (deck_id, front_md, back_md, position)
                VALUES
                  (CAST(:d AS uuid), :front, :back, :pos)
                RETURNING id::text
                """
            ),
            {"d": deck_id, "front": body.frontMd, "back": body.backMd, "pos": body.position},
        )
    ).first()
    # Seed review state for any users already subscribed.
    await session.execute(
        text(
            """
            INSERT INTO content_schema.flashcard_review_state (user_id, card_id)
            SELECT s.user_id, CAST(:cid AS uuid)
              FROM content_schema.deck_subscriptions s
             WHERE s.deck_id = CAST(:d AS uuid)
            ON CONFLICT DO NOTHING
            """
        ),
        {"d": deck_id, "cid": row[0]},
    )
    await session.commit()
    return {"id": row[0]}


@router.get("/content/decks/{deck_id}/cards")
async def list_cards(
    deck_id: str, session: SessionDep, principal: PrincipalDep,
) -> dict:
    head = (
        await session.execute(
            text(
                """
                SELECT owner_user_id::text, status, visibility
                  FROM content_schema.decks WHERE id = CAST(:d AS uuid)
                """
            ),
            {"d": deck_id},
        )
    ).mappings().first()
    if head is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    if not _user_can_access_deck(dict(head), principal.user_id):
        raise HTTPException(status_code=403, detail={"code": "forbidden"})
    rows = (
        await session.execute(
            text(
                """
                SELECT id::text, front_md, back_md, position, created_at::text
                  FROM content_schema.flashcards
                 WHERE deck_id = CAST(:d AS uuid)
                 ORDER BY position ASC, created_at ASC
                """
            ),
            {"d": deck_id},
        )
    ).mappings().all()
    return {
        "items": [
            {
                "id": r["id"],
                "frontMd": r["front_md"],
                "backMd": r["back_md"],
                "position": r["position"],
                "createdAt": r["created_at"],
            }
            for r in rows
        ],
    }


@router.put("/content/cards/{card_id}")
async def update_card(
    card_id: str, body: CardUpdate,
    session: SessionDep, principal: PrincipalDep,
) -> dict:
    head = (
        await session.execute(
            text(
                """
                SELECT d.owner_user_id::text
                  FROM content_schema.flashcards c
                  JOIN content_schema.decks d ON d.id = c.deck_id
                 WHERE c.id = CAST(:cid AS uuid)
                """
            ),
            {"cid": card_id},
        )
    ).first()
    if head is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    if head[0] != principal.user_id:
        raise HTTPException(status_code=403, detail={"code": "not_owner"})
    fields = []
    params: dict = {"cid": card_id}
    if body.frontMd is not None:
        fields.append("front_md = :front")
        params["front"] = body.frontMd
    if body.backMd is not None:
        fields.append("back_md = :back")
        params["back"] = body.backMd
    if body.position is not None:
        fields.append("position = :pos")
        params["pos"] = body.position
    if not fields:
        return {"id": card_id}
    await session.execute(
        text(f"UPDATE content_schema.flashcards SET {', '.join(fields)} WHERE id = CAST(:cid AS uuid)"),
        params,
    )
    await session.commit()
    return {"id": card_id}


@router.delete("/content/cards/{card_id}", status_code=204)
async def delete_card(
    card_id: str, session: SessionDep, principal: PrincipalDep,
) -> None:
    head = (
        await session.execute(
            text(
                """
                SELECT d.owner_user_id::text
                  FROM content_schema.flashcards c
                  JOIN content_schema.decks d ON d.id = c.deck_id
                 WHERE c.id = CAST(:cid AS uuid)
                """
            ),
            {"cid": card_id},
        )
    ).first()
    if head is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    if head[0] != principal.user_id:
        raise HTTPException(status_code=403, detail={"code": "not_owner"})
    await session.execute(
        text("DELETE FROM content_schema.flashcards WHERE id = CAST(:cid AS uuid)"),
        {"cid": card_id},
    )
    await session.commit()


# ── Review (SM-2) ────────────────────────────────────────────────────


@router.get("/content/flashcards/due")
async def list_due(
    session: SessionDep, principal: PrincipalDep,
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    rows = (
        await session.execute(
            text(
                """
                SELECT c.id::text  AS card_id,
                       c.deck_id::text AS deck_id,
                       d.title AS deck_title,
                       c.front_md, c.back_md,
                       rs.ease_factor, rs.interval_days, rs.repetitions,
                       rs.due_at::text AS due_at
                  FROM content_schema.flashcard_review_state rs
                  JOIN content_schema.flashcards c ON c.id = rs.card_id
                  JOIN content_schema.decks d ON d.id = c.deck_id
                 WHERE rs.user_id = CAST(:uid AS uuid)
                   AND rs.due_at <= NOW()
                 ORDER BY rs.due_at ASC
                 LIMIT :lim
                """
            ),
            {"uid": principal.user_id, "lim": limit},
        )
    ).mappings().all()
    return {
        "items": [
            {
                "cardId": r["card_id"],
                "deckId": r["deck_id"],
                "deckTitle": r["deck_title"],
                "frontMd": r["front_md"],
                "backMd": r["back_md"],
                "easeFactor": float(r["ease_factor"]),
                "intervalDays": int(r["interval_days"]),
                "repetitions": int(r["repetitions"]),
                "dueAt": r["due_at"],
            }
            for r in rows
        ],
    }


@router.post("/content/flashcards/{card_id}/review")
async def review_card(
    card_id: str, body: ReviewRequest,
    session: SessionDep, principal: PrincipalDep,
) -> dict:
    cur = (
        await session.execute(
            text(
                """
                SELECT ease_factor, interval_days, repetitions, due_at
                  FROM content_schema.flashcard_review_state
                 WHERE user_id = CAST(:uid AS uuid)
                   AND card_id = CAST(:cid AS uuid)
                """
            ),
            {"uid": principal.user_id, "cid": card_id},
        )
    ).first()
    if cur is None:
        raise HTTPException(status_code=404, detail={"code": "not_subscribed"})
    state = ReviewState(
        ease_factor=float(cur[0]),
        interval_days=int(cur[1]),
        repetitions=int(cur[2]),
        due_at=cur[3],
    )
    nxt = sm2_update(state, body.quality, now=datetime.now(timezone.utc))
    await session.execute(
        text(
            """
            UPDATE content_schema.flashcard_review_state
               SET ease_factor = :ef,
                   interval_days = :iv,
                   repetitions = :rp,
                   last_reviewed_at = NOW(),
                   due_at = :due
             WHERE user_id = CAST(:uid AS uuid)
               AND card_id = CAST(:cid AS uuid)
            """
        ),
        {
            "ef": nxt.ease_factor,
            "iv": nxt.interval_days,
            "rp": nxt.repetitions,
            "due": nxt.due_at,
            "uid": principal.user_id,
            "cid": card_id,
        },
    )
    await session.commit()

    # Phase 1D-9 — every 10 reviews, award flashcard_session XP.
    # Cheap dedupe: count reviews today via review_state.last_reviewed_at.
    try:
        cnt_row = (
            await session.execute(
                text(
                    """
                    SELECT COUNT(*) FROM content_schema.flashcard_review_state
                     WHERE user_id = CAST(:uid AS uuid)
                       AND last_reviewed_at::date = NOW()::date
                    """
                ),
                {"uid": principal.user_id},
            )
        ).first()
        cnt = int(cnt_row[0]) if cnt_row else 0
        if cnt > 0 and cnt % 10 == 0:
            await _award_xp_async(
                user_id=principal.user_id,
                event_type="flashcard_session",
                source_id=card_id,
            )
    except Exception:
        _xp_log.exception("flashcard_xp.failed user=%s", principal.user_id)

    return {
        "cardId": card_id,
        "easeFactor": round(nxt.ease_factor, 4),
        "intervalDays": nxt.interval_days,
        "repetitions": nxt.repetitions,
        "dueAt": nxt.due_at.isoformat(),
    }


async def _award_xp_async(*, user_id: str, event_type: str, source_id: str | None) -> None:
    """Fire-and-forget HTTP call to engagement to record an XP event.
    Best-effort — service-down must not break the user-facing action."""
    base = _adaptive_settings.analytics_base_url.rstrip("/")
    url = f"{base}/gamification/users/{user_id}/xp"
    body: dict = {"eventType": event_type}
    if source_id:
        body["sourceId"] = source_id
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(2.0)) as c:
            await c.post(url, json=body)
    except httpx.HTTPError as e:
        _xp_log.warning("xp_post_failed event=%s user=%s err=%s", event_type, user_id, e)
