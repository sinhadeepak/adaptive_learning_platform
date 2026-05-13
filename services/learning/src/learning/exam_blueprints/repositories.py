"""Read helpers for catalog_schema.exam_blueprints (Sprint 23, P4-S23).

Admin write paths (insert/update/delete) ship in Sprint 25.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "catalog_schema"


def _row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "examId": str(row["exam_id"]),
        "name": row["name"],
        "totalQuestions": int(row["total_questions"]),
        "totalMinutes": int(row["total_minutes"]),
        "marksCorrect": int(row["marks_correct"]),
        "marksNegative": float(row["marks_negative"]),
        "sections": row["sections"],  # JSONB returns native dict/list
        "interSectionNavigation": bool(row["inter_section_navigation"]),
        "perSectionTimeLocked": bool(row["per_section_time_locked"]),
        # F3 extensions (mostly absent on OFFICIAL rows).
        "kind": row.get("kind") or "OFFICIAL",
        "visibility": row.get("visibility") or "PUBLIC",
        "status": row.get("status") or "PUBLISHED",
        "createdByUserId": str(row["created_by_user_id"])
        if row.get("created_by_user_id") is not None
        else None,
        "shareSlug": row.get("share_slug"),
        "createdAt": row["created_at"].isoformat()
        if row.get("created_at") is not None
        else None,
        "updatedAt": row["updated_at"].isoformat()
        if row.get("updated_at") is not None
        else None,
        "publishedAt": row["published_at"].isoformat()
        if row.get("published_at") is not None
        else None,
    }


_SELECT_COLS = """
    id, exam_id, name, total_questions, total_minutes,
    marks_correct, marks_negative, sections,
    inter_section_navigation, per_section_time_locked,
    kind, visibility, status, created_by_user_id, share_slug,
    created_at, updated_at, published_at
"""


async def list_for_exam(
    session: AsyncSession, exam_id: str
) -> list[dict[str, Any]]:
    """List OFFICIAL + CURATED-PUBLISHED blueprints for an exam.
    CUSTOM blueprints are owner-scoped; use list_for_user instead.
    """
    rows = (
        await session.execute(
            text(f"""
                SELECT {_SELECT_COLS}
                  FROM {SCHEMA}.exam_blueprints
                 WHERE exam_id = :eid
                   AND visibility = 'PUBLIC'
                   AND status = 'PUBLISHED'
                 ORDER BY kind, name
            """),
            {"eid": exam_id},
        )
    ).mappings().all()
    return [_row_to_dict(r) for r in rows]


async def get_by_id(
    session: AsyncSession, blueprint_id: str
) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(f"""
                SELECT {_SELECT_COLS}
                  FROM {SCHEMA}.exam_blueprints
                 WHERE id = :bid
            """),
            {"bid": blueprint_id},
        )
    ).mappings().first()
    return _row_to_dict(row) if row else None


# ── F3 — Custom test builder helpers ─────────────────────────────────


async def list_for_user(
    session: AsyncSession,
    user_id: str,
    *,
    kinds: list[str] | None = None,
    include_retired: bool = False,
) -> list[dict[str, Any]]:
    """Return blueprints the given user authored. By default surfaces
    CUSTOM + AI_SUGGESTED + SHARED (still owner-listable after share);
    `kinds=` overrides for the curated-authoring queues.
    """
    kinds = kinds or ["CUSTOM", "AI_SUGGESTED", "SHARED"]
    status_clause = (
        "" if include_retired else " AND status <> 'RETIRED'"
    )
    rows = (
        await session.execute(
            text(f"""
                SELECT {_SELECT_COLS}
                  FROM {SCHEMA}.exam_blueprints
                 WHERE created_by_user_id = :uid
                   AND kind = ANY(:kinds)
                   {status_clause}
                 ORDER BY created_at DESC
            """),
            {"uid": user_id, "kinds": kinds},
        )
    ).mappings().all()
    return [_row_to_dict(r) for r in rows]


async def get_for_user(
    session: AsyncSession, blueprint_id: str, user_id: str,
) -> dict[str, Any] | None:
    """Fetch a blueprint only if it's public OR owned by `user_id`.
    Returns None on miss (avoids leaking existence). Used by the
    Quiz Go session-start flow to gate access to private blueprints.
    """
    row = (
        await session.execute(
            text(f"""
                SELECT {_SELECT_COLS}
                  FROM {SCHEMA}.exam_blueprints
                 WHERE id = :bid
                   AND (
                        (visibility = 'PUBLIC' AND status = 'PUBLISHED')
                     OR  created_by_user_id = :uid
                     OR  visibility = 'UNLISTED'
                   )
            """),
            {"bid": blueprint_id, "uid": user_id},
        )
    ).mappings().first()
    return _row_to_dict(row) if row else None


async def create_custom(
    session: AsyncSession,
    *,
    user_id: str,
    exam_id: str,
    name: str,
    sections: list[dict[str, Any]],
    total_minutes: int,
    marks_correct: int,
    marks_negative: float,
    inter_section_nav: bool,
    per_section_time_locked: bool,
) -> dict[str, Any]:
    """Insert a new CUSTOM blueprint owned by `user_id`. Returns the
    serialised row ready for the client. Callers compute `sections`
    inline (subject + topic_ids + n_questions + n_minutes + difficulty).
    """
    import json
    import uuid

    bp_id = str(uuid.uuid4())
    total_q = sum(int(s.get("n_questions", 0) or 0) for s in sections)
    if total_q <= 0:
        raise ValueError("Custom blueprint needs at least one question across sections")
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.exam_blueprints
                (id, exam_id, name, total_questions, total_minutes,
                 marks_correct, marks_negative, sections,
                 inter_section_navigation, per_section_time_locked,
                 kind, visibility, status, created_by_user_id,
                 created_at, updated_at, published_at)
            VALUES
                (CAST(:id AS uuid), CAST(:eid AS uuid), :name, :tq, :tm,
                 :mc, :mn, CAST(:secs AS jsonb),
                 :nav, :slock,
                 'CUSTOM', 'PRIVATE', 'PUBLISHED', CAST(:uid AS uuid),
                 now(), now(), now())
        """),
        {
            "id": bp_id,
            "eid": exam_id,
            "name": name[:200],
            "tq": total_q,
            "tm": int(total_minutes),
            "mc": int(marks_correct),
            "mn": float(marks_negative),
            "secs": json.dumps(sections),
            "nav": bool(inter_section_nav),
            "slock": bool(per_section_time_locked),
            "uid": user_id,
        },
    )
    out = await get_by_id(session, bp_id)
    assert out is not None
    return out


# ── F4 — Test Sharing ────────────────────────────────────────────────


def _mint_slug() -> str:
    """6-char URL-safe random slug. Collision probability ~1 in 56B at
    62^6; on a unique-constraint violation the caller retries."""
    import secrets
    import string

    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))


async def share_blueprint(
    session: AsyncSession, blueprint_id: str, user_id: str,
) -> dict[str, Any] | None:
    """Mint a share_slug + flip visibility to UNLISTED + kind to SHARED.
    Idempotent: returns the same slug if the blueprint is already shared.
    Returns None when the blueprint doesn't exist or isn't owned by `user_id`
    (security: don't leak existence to non-owners).
    """
    current = await get_for_user(session, blueprint_id, user_id)
    if current is None or current.get("createdByUserId") != user_id:
        return None
    if current.get("shareSlug"):
        # Already shared — return existing state.
        return current
    # Retry on slug collision (rare).
    from sqlalchemy.exc import IntegrityError

    for _ in range(5):
        slug = _mint_slug()
        try:
            await session.execute(
                text(f"""
                    UPDATE {SCHEMA}.exam_blueprints
                       SET share_slug = :slug,
                           visibility = 'UNLISTED',
                           kind = 'SHARED',
                           updated_at = now()
                     WHERE id = :bid
                       AND created_by_user_id = :uid
                """),
                {"slug": slug, "bid": blueprint_id, "uid": user_id},
            )
            return await get_for_user(session, blueprint_id, user_id)
        except IntegrityError:
            await session.rollback()
            continue
    return None


async def unshare_blueprint(
    session: AsyncSession, blueprint_id: str, user_id: str,
) -> dict[str, Any] | None:
    """Reverse a previous share: clear the slug, return to PRIVATE +
    kind=CUSTOM. Existing /t/<slug> links break (by design)."""
    current = await get_for_user(session, blueprint_id, user_id)
    if current is None or current.get("createdByUserId") != user_id:
        return None
    await session.execute(
        text(f"""
            UPDATE {SCHEMA}.exam_blueprints
               SET share_slug = NULL,
                   visibility = 'PRIVATE',
                   kind = 'CUSTOM',
                   updated_at = now()
             WHERE id = :bid AND created_by_user_id = :uid
        """),
        {"bid": blueprint_id, "uid": user_id},
    )
    return await get_for_user(session, blueprint_id, user_id)


async def get_by_slug(
    session: AsyncSession, slug: str,
) -> dict[str, Any] | None:
    """Lookup a shared blueprint by slug. Returns None on miss (no
    existence leak — receiver clients see 404)."""
    row = (
        await session.execute(
            text(f"""
                SELECT {_SELECT_COLS}
                  FROM {SCHEMA}.exam_blueprints
                 WHERE share_slug = :slug
                   AND visibility IN ('UNLISTED', 'PUBLIC')
                   AND status = 'PUBLISHED'
            """),
            {"slug": slug},
        )
    ).mappings().first()
    return _row_to_dict(row) if row else None


async def upsert_rating(
    session: AsyncSession,
    *,
    blueprint_id: str,
    user_id: str,
    stars: int,
    comment: str | None,
) -> None:
    """Insert or update a (blueprint, user) rating row. Owners can
    technically rate their own test — caller can gate that if desired.
    """
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.blueprint_ratings
                (blueprint_id, user_id, stars, comment, created_at, updated_at)
            VALUES
                (CAST(:bid AS uuid), CAST(:uid AS uuid), :stars, :comment, now(), now())
            ON CONFLICT (blueprint_id, user_id) DO UPDATE
              SET stars = EXCLUDED.stars,
                  comment = EXCLUDED.comment,
                  updated_at = now()
        """),
        {
            "bid": blueprint_id,
            "uid": user_id,
            "stars": stars,
            "comment": (comment or None),
        },
    )


async def rating_summary(
    session: AsyncSession, blueprint_id: str,
) -> dict[str, Any]:
    """Aggregated rating block for the share landing + owner's MyTests
    row. Always returns a dict (even on zero ratings).
    """
    row = (
        await session.execute(
            text(f"""
                SELECT COUNT(*) AS n,
                       AVG(stars)::FLOAT AS avg_stars
                  FROM {SCHEMA}.blueprint_ratings
                 WHERE blueprint_id = CAST(:bid AS uuid)
            """),
            {"bid": blueprint_id},
        )
    ).mappings().first()
    if row is None or (row.get("n") or 0) == 0:
        return {"count": 0, "avgStars": None}
    return {
        "count": int(row["n"]),
        "avgStars": float(row["avg_stars"]),
    }


# ── F6 — Curated Test Library ────────────────────────────────────────


async def create_curated(
    session: AsyncSession,
    *,
    author_user_id: str,
    exam_id: str,
    name: str,
    sections: list[dict[str, Any]],
    total_minutes: int,
    marks_correct: int,
    marks_negative: float,
    inter_section_nav: bool,
    per_section_time_locked: bool,
) -> dict[str, Any]:
    """Insert a new CURATED blueprint authored by staff. Starts in
    `status='PENDING_REVIEW'` + `visibility='PRIVATE'`; a platform
    admin's `/approve` call flips it to `PUBLISHED` + `PUBLIC`. Until
    then the row is invisible to the student library.
    """
    import json
    import uuid

    bp_id = str(uuid.uuid4())
    total_q = sum(int(s.get("n_questions", 0) or 0) for s in sections)
    if total_q <= 0:
        raise ValueError("Curated blueprint needs at least one question across sections")
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.exam_blueprints
                (id, exam_id, name, total_questions, total_minutes,
                 marks_correct, marks_negative, sections,
                 inter_section_navigation, per_section_time_locked,
                 kind, visibility, status, created_by_user_id,
                 created_at, updated_at)
            VALUES
                (CAST(:id AS uuid), CAST(:eid AS uuid), :name, :tq, :tm,
                 :mc, :mn, CAST(:secs AS jsonb),
                 :nav, :slock,
                 'CURATED', 'PRIVATE', 'PENDING_REVIEW', CAST(:uid AS uuid),
                 now(), now())
        """),
        {
            "id": bp_id,
            "eid": exam_id,
            "name": name[:200],
            "tq": total_q,
            "tm": int(total_minutes),
            "mc": int(marks_correct),
            "mn": float(marks_negative),
            "secs": json.dumps(sections),
            "nav": bool(inter_section_nav),
            "slock": bool(per_section_time_locked),
            "uid": author_user_id,
        },
    )
    out = await get_by_id(session, bp_id)
    assert out is not None
    return out


async def approve_curated(
    session: AsyncSession, blueprint_id: str,
) -> dict[str, Any] | None:
    """Flip a PENDING_REVIEW curated blueprint to PUBLISHED + PUBLIC.
    Idempotent — re-approving an already-published row is a no-op.
    Returns None if no curated row with this id exists.
    """
    res = await session.execute(
        text(f"""
            UPDATE {SCHEMA}.exam_blueprints
               SET status = 'PUBLISHED',
                   visibility = 'PUBLIC',
                   published_at = COALESCE(published_at, now()),
                   updated_at = now()
             WHERE id = :bid
               AND kind = 'CURATED'
        """),
        {"bid": blueprint_id},
    )
    if (res.rowcount or 0) == 0:
        return None
    return await get_by_id(session, blueprint_id)


async def reject_curated(
    session: AsyncSession, blueprint_id: str,
) -> dict[str, Any] | None:
    """Reject a pending curated blueprint — sets status='RETIRED'."""
    res = await session.execute(
        text(f"""
            UPDATE {SCHEMA}.exam_blueprints
               SET status = 'RETIRED', updated_at = now()
             WHERE id = :bid
               AND kind = 'CURATED'
               AND status = 'PENDING_REVIEW'
        """),
        {"bid": blueprint_id},
    )
    if (res.rowcount or 0) == 0:
        return None
    return await get_by_id(session, blueprint_id)


async def list_pending_curated(session: AsyncSession) -> list[dict[str, Any]]:
    """Admin-facing review queue."""
    rows = (
        await session.execute(
            text(f"""
                SELECT {_SELECT_COLS}
                  FROM {SCHEMA}.exam_blueprints
                 WHERE kind = 'CURATED'
                   AND status = 'PENDING_REVIEW'
                 ORDER BY created_at ASC
            """),
        )
    ).mappings().all()
    return [_row_to_dict(r) for r in rows]


async def list_library(
    session: AsyncSession,
    *,
    exam_id: str | None = None,
    max_minutes: int | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Student-facing browse — curated PUBLISHED+PUBLIC blueprints only.
    Filterable by exam + duration cap. Newest first."""
    clauses = [
        "kind = 'CURATED'",
        "status = 'PUBLISHED'",
        "visibility = 'PUBLIC'",
    ]
    params: dict[str, Any] = {"lim": int(limit)}
    if exam_id:
        clauses.append("exam_id = CAST(:eid AS uuid)")
        params["eid"] = exam_id
    if max_minutes is not None:
        clauses.append("total_minutes <= :mxm")
        params["mxm"] = int(max_minutes)
    where = " AND ".join(clauses)
    rows = (
        await session.execute(
            text(f"""
                SELECT {_SELECT_COLS}
                  FROM {SCHEMA}.exam_blueprints
                 WHERE {where}
                 ORDER BY COALESCE(published_at, created_at) DESC
                 LIMIT :lim
            """),
            params,
        )
    ).mappings().all()
    return [_row_to_dict(r) for r in rows]


async def delete_custom(
    session: AsyncSession, blueprint_id: str, user_id: str,
) -> bool:
    """Soft-delete: marks status='RETIRED' for the owner's CUSTOM /
    AI_SUGGESTED / SHARED blueprints. Returns True if a row was
    affected. Never deletes OFFICIAL or CURATED rows.
    """
    res = await session.execute(
        text(f"""
            UPDATE {SCHEMA}.exam_blueprints
               SET status = 'RETIRED', updated_at = now()
             WHERE id = :bid
               AND created_by_user_id = :uid
               AND kind IN ('CUSTOM','AI_SUGGESTED','SHARED')
        """),
        {"bid": blueprint_id, "uid": user_id},
    )
    return (res.rowcount or 0) > 0
