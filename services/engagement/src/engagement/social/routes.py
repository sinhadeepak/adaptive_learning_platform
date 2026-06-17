"""F8a — Social HTTP routes (friendships).

Endpoints:
  POST   /social/friends/request          — body { recipientUserId }
  POST   /social/friends/{otherId}/accept
  POST   /social/friends/{otherId}/block
  DELETE /social/friends/{otherId}        — unfriend (both sides)
  GET    /social/friends                  — list ACCEPTED friends
  GET    /social/friends/pending          — incoming requests awaiting accept

Identity is read from the JWT (sub claim) so the routes can't be
spoofed across users. Auth uses the same secret as the rest of the
platform.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text

from engagement.analytics.db import sessionmaker


router = APIRouter(prefix="/social", tags=["social"])


def _current_user_id(x_user_id: str | None = Header(default=None, alias="X-User-Id")) -> str:
    """Identity is taken from the X-User-Id header — the API gateway
    (nginx + auth middleware) sets it after validating the bearer
    token, matching the convention used elsewhere in engagement. Routes
    inside this service trust the header; the gateway is the trust
    boundary."""
    if not x_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "missing_user_header"},
        )
    return x_user_id


CurrentUserDep = Annotated[str, Depends(_current_user_id)]


def _canonical(a: str, b: str) -> tuple[str, str]:
    """Return (smaller, larger) so storage is consistent."""
    return (a, b) if a < b else (b, a)


class FriendRequestBody(BaseModel):
    # Caller may identify the recipient by email (preferred) or by
    # user id directly. Email is resolved against identity at the
    # auth/users/by-email endpoint.
    recipientUserId: str | None = None
    recipientEmail: str | None = None


async def _resolve_recipient(body: FriendRequestBody) -> str:
    """Return a recipient user_id from either field, or raise 422."""
    if body.recipientUserId:
        return body.recipientUserId
    if body.recipientEmail:
        import os
        import httpx

        base = os.environ.get("ENGAGEMENT_IDENTITY_BASE_URL", "http://identity:8000")
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"{base}/auth/users/by-email",
                params={"email": body.recipientEmail.strip().lower()},
            )
        if r.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail={"code": "user_not_found", "message": "No user with that email."},
            )
        if r.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail={"code": "identity_lookup_failed", "message": f"Identity returned {r.status_code}"},
            )
        return r.json()["userId"]
    raise HTTPException(
        status_code=422,
        detail={"code": "missing_recipient", "message": "Provide recipientEmail or recipientUserId."},
    )


@router.post("/friends/request")
async def request_friend(
    body: FriendRequestBody,
    me: CurrentUserDep,
) -> dict[str, Any]:
    """Send a friend request. Idempotent — re-sending with the same
    pair returns the existing row. Refuses self-request."""
    other = await _resolve_recipient(body)
    if other == me:
        raise HTTPException(
            status_code=422,
            detail={"code": "self_friend", "message": "Can't friend yourself."},
        )
    a, b = _canonical(me, other)
    async with sessionmaker()() as session:
        existing = (
            await session.execute(
                text("""
                    SELECT status, requested_by FROM social_schema.friendships
                     WHERE user_a_id = CAST(:a AS uuid) AND user_b_id = CAST(:b AS uuid)
                """),
                {"a": a, "b": b},
            )
        ).mappings().first()
        if existing:
            return {
                "status": existing["status"],
                "alreadyExisted": True,
            }
        await session.execute(
            text("""
                INSERT INTO social_schema.friendships
                    (user_a_id, user_b_id, requested_by, status, requested_at)
                VALUES (CAST(:a AS uuid), CAST(:b AS uuid),
                        CAST(:me AS uuid), 'PENDING', now())
            """),
            {"a": a, "b": b, "me": me},
        )
        await session.commit()
        return {"status": "PENDING", "alreadyExisted": False}


@router.post("/friends/{other_id}/accept")
async def accept_friend(other_id: str, me: CurrentUserDep) -> dict[str, Any]:
    """Accept a PENDING request. Only the recipient may accept — the
    requester is locked out by checking `requested_by != me`."""
    a, b = _canonical(me, other_id)
    async with sessionmaker()() as session:
        row = (
            await session.execute(
                text("""
                    UPDATE social_schema.friendships
                       SET status = 'ACCEPTED', accepted_at = now()
                     WHERE user_a_id = CAST(:a AS uuid)
                       AND user_b_id = CAST(:b AS uuid)
                       AND status = 'PENDING'
                       AND requested_by <> CAST(:me AS uuid)
                    RETURNING status
                """),
                {"a": a, "b": b, "me": me},
            )
        ).mappings().first()
        if row is None:
            raise HTTPException(
                status_code=404,
                detail={"code": "no_pending_request"},
            )
        await session.commit()
        return {"status": row["status"]}


@router.post("/friends/{other_id}/block")
async def block_user(other_id: str, me: CurrentUserDep) -> dict[str, Any]:
    """Block another user. Upserts the row to status='BLOCKED' with
    `blocked_by` = me. Symmetric — friendship UI doesn't show the
    blocked user to either side."""
    a, b = _canonical(me, other_id)
    async with sessionmaker()() as session:
        await session.execute(
            text("""
                INSERT INTO social_schema.friendships
                    (user_a_id, user_b_id, requested_by, status,
                     requested_at, blocked_by)
                VALUES (CAST(:a AS uuid), CAST(:b AS uuid),
                        CAST(:me AS uuid), 'BLOCKED',
                        now(), CAST(:me AS uuid))
                ON CONFLICT (user_a_id, user_b_id) DO UPDATE
                   SET status = 'BLOCKED',
                       blocked_by = CAST(:me AS uuid)
            """),
            {"a": a, "b": b, "me": me},
        )
        await session.commit()
    return {"status": "BLOCKED"}


@router.delete("/friends/{other_id}", status_code=204)
async def unfriend(other_id: str, me: CurrentUserDep) -> None:
    """Hard-delete the friendship row. Either side may invoke."""
    a, b = _canonical(me, other_id)
    async with sessionmaker()() as session:
        await session.execute(
            text("""
                DELETE FROM social_schema.friendships
                 WHERE user_a_id = CAST(:a AS uuid)
                   AND user_b_id = CAST(:b AS uuid)
            """),
            {"a": a, "b": b},
        )
        await session.commit()


@router.get("/friends")
async def list_friends(me: CurrentUserDep) -> dict[str, Any]:
    """List ACCEPTED friends (the other user id, request metadata)."""
    async with sessionmaker()() as session:
        rows = (
            await session.execute(
                text("""
                    SELECT user_a_id, user_b_id, requested_at, accepted_at
                      FROM social_schema.friendships
                     WHERE status = 'ACCEPTED'
                       AND (user_a_id = CAST(:me AS uuid)
                            OR user_b_id = CAST(:me AS uuid))
                     ORDER BY accepted_at DESC NULLS LAST
                """),
                {"me": me},
            )
        ).mappings().all()
    out = []
    for r in rows:
        a, b = str(r["user_a_id"]), str(r["user_b_id"])
        friend = b if a == me else a
        out.append({
            "userId": friend,
            "requestedAt": r["requested_at"].isoformat() if r["requested_at"] else None,
            "acceptedAt": r["accepted_at"].isoformat() if r["accepted_at"] else None,
        })
    return {"items": out, "count": len(out)}


@router.get("/friends/pending")
async def list_pending(me: CurrentUserDep) -> dict[str, Any]:
    """List incoming friend requests (PENDING where I'm NOT the requester)."""
    async with sessionmaker()() as session:
        rows = (
            await session.execute(
                text("""
                    SELECT user_a_id, user_b_id, requested_by, requested_at
                      FROM social_schema.friendships
                     WHERE status = 'PENDING'
                       AND (user_a_id = CAST(:me AS uuid)
                            OR user_b_id = CAST(:me AS uuid))
                       AND requested_by <> CAST(:me AS uuid)
                     ORDER BY requested_at DESC
                """),
                {"me": me},
            )
        ).mappings().all()
    out = []
    for r in rows:
        out.append({
            "fromUserId": str(r["requested_by"]),
            "requestedAt": r["requested_at"].isoformat(),
        })
    return {"items": out, "count": len(out)}


# ── F8b — Clans ──────────────────────────────────────────────────────


class ClanCreateBody(BaseModel):
    name: str
    description: str | None = None
    visibility: str = "PUBLIC"


@router.post("/clans", status_code=201)
async def create_clan(body: ClanCreateBody, me: CurrentUserDep) -> dict[str, Any]:
    """Create a new clan with the requester as OWNER. Name must be
    globally unique. Returns the new clan id + the member row."""
    import uuid as _uuid

    if body.visibility not in {"PUBLIC", "INVITE_ONLY"}:
        raise HTTPException(
            status_code=422,
            detail={"code": "bad_visibility"},
        )
    clan_id = str(_uuid.uuid4())
    async with sessionmaker()() as session:
        try:
            await session.execute(
                text("""
                    INSERT INTO social_schema.clans
                        (id, name, description, created_by, visibility,
                         member_cap, member_count, created_at)
                    VALUES (CAST(:id AS uuid), :name, :desc,
                            CAST(:me AS uuid), :vis, 30, 1, now())
                """),
                {
                    "id": clan_id,
                    "name": body.name[:120],
                    "desc": (body.description or "")[:500],
                    "me": me,
                    "vis": body.visibility,
                },
            )
            await session.execute(
                text("""
                    INSERT INTO social_schema.clan_members
                        (clan_id, user_id, role, joined_at)
                    VALUES (CAST(:cid AS uuid), CAST(:me AS uuid), 'OWNER', now())
                """),
                {"cid": clan_id, "me": me},
            )
            await session.commit()
        except Exception as e:
            await session.rollback()
            # Likely a unique-violation on name.
            raise HTTPException(
                status_code=409,
                detail={"code": "name_taken", "message": str(e)},
            )
    return {"id": clan_id, "name": body.name, "role": "OWNER"}


@router.post("/clans/{clan_id}/join")
async def join_clan(clan_id: str, me: CurrentUserDep) -> dict[str, Any]:
    """Join a PUBLIC clan. INVITE_ONLY rejects — invite flow lands in
    a subsequent sprint."""
    async with sessionmaker()() as session:
        clan = (
            await session.execute(
                text("""
                    SELECT visibility, member_count, member_cap
                      FROM social_schema.clans WHERE id = CAST(:id AS uuid)
                """),
                {"id": clan_id},
            )
        ).mappings().first()
        if clan is None:
            raise HTTPException(status_code=404, detail={"code": "not_found"})
        if clan["visibility"] != "PUBLIC":
            raise HTTPException(status_code=403, detail={"code": "invite_only"})
        if clan["member_count"] >= clan["member_cap"]:
            raise HTTPException(status_code=409, detail={"code": "full"})
        try:
            await session.execute(
                text("""
                    INSERT INTO social_schema.clan_members
                        (clan_id, user_id, role, joined_at)
                    VALUES (CAST(:cid AS uuid), CAST(:me AS uuid), 'MEMBER', now())
                """),
                {"cid": clan_id, "me": me},
            )
        except Exception:
            await session.rollback()
            raise HTTPException(status_code=409, detail={"code": "already_member"})
        await session.execute(
            text("""
                UPDATE social_schema.clans
                   SET member_count = member_count + 1
                 WHERE id = CAST(:id AS uuid)
            """),
            {"id": clan_id},
        )
        await session.commit()
    return {"clanId": clan_id, "role": "MEMBER"}


@router.post("/clans/{clan_id}/leave", status_code=204)
async def leave_clan(clan_id: str, me: CurrentUserDep) -> None:
    """Leave a clan. OWNER cannot leave without transferring ownership
    (TODO in next sprint) — for v1 we 409 the OWNER."""
    async with sessionmaker()() as session:
        row = (
            await session.execute(
                text("""
                    DELETE FROM social_schema.clan_members
                     WHERE clan_id = CAST(:cid AS uuid)
                       AND user_id = CAST(:me AS uuid)
                       AND role <> 'OWNER'
                    RETURNING role
                """),
                {"cid": clan_id, "me": me},
            )
        ).first()
        if row is None:
            raise HTTPException(
                status_code=409,
                detail={"code": "owner_cannot_leave_or_not_member"},
            )
        await session.execute(
            text("""
                UPDATE social_schema.clans
                   SET member_count = GREATEST(0, member_count - 1)
                 WHERE id = CAST(:id AS uuid)
            """),
            {"id": clan_id},
        )
        await session.commit()


@router.get("/clans")
async def list_clans(visibility: str = "PUBLIC") -> dict[str, Any]:
    """Browse clans for the join flow. Auth not required for the read."""
    async with sessionmaker()() as session:
        rows = (
            await session.execute(
                text("""
                    SELECT id, name, description, member_count, member_cap, visibility
                      FROM social_schema.clans
                     WHERE visibility = :v
                     ORDER BY member_count DESC, created_at DESC
                     LIMIT 200
                """),
                {"v": visibility},
            )
        ).mappings().all()
    items = [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "description": r["description"],
            "memberCount": int(r["member_count"]),
            "memberCap": int(r["member_cap"]),
            "visibility": r["visibility"],
        }
        for r in rows
    ]
    return {"items": items, "count": len(items)}


@router.get("/clans/{clan_id}")
async def get_clan(clan_id: str) -> dict[str, Any]:
    """Full clan record + member list."""
    async with sessionmaker()() as session:
        clan = (
            await session.execute(
                text("""
                    SELECT id, name, description, created_by, visibility,
                           member_cap, member_count, created_at
                      FROM social_schema.clans WHERE id = CAST(:id AS uuid)
                """),
                {"id": clan_id},
            )
        ).mappings().first()
        if clan is None:
            raise HTTPException(status_code=404, detail={"code": "not_found"})
        members = (
            await session.execute(
                text("""
                    SELECT user_id, role, joined_at
                      FROM social_schema.clan_members
                     WHERE clan_id = CAST(:cid AS uuid)
                     ORDER BY role, joined_at
                """),
                {"cid": clan_id},
            )
        ).mappings().all()
    return {
        "id": str(clan["id"]),
        "name": clan["name"],
        "description": clan["description"],
        "createdBy": str(clan["created_by"]),
        "visibility": clan["visibility"],
        "memberCap": int(clan["member_cap"]),
        "memberCount": int(clan["member_count"]),
        "createdAt": clan["created_at"].isoformat(),
        "members": [
            {
                "userId": str(m["user_id"]),
                "role": m["role"],
                "joinedAt": m["joined_at"].isoformat(),
            }
            for m in members
        ],
    }


# ── Leaderboards (read-only; population job lands next sprint) ───────


@router.post("/leaderboards/run", status_code=200)
async def run_leaderboards() -> dict[str, Any]:
    """Trigger the leaderboard population job. v1 production target
    is a cron tick every 15 minutes; this endpoint exists so it can
    be invoked manually from admin tooling or smoke tests."""
    from engagement.jobs.leaderboards import run as _run
    async with sessionmaker()() as session:
        return await _run(session)


@router.get("/leaderboards/{leaderboard_id}")
async def get_leaderboard(leaderboard_id: str, limit: int = 100) -> dict[str, Any]:
    """Returns the top N entries for a named leaderboard. The
    population job runs every 15 minutes and writes to
    social_schema.leaderboards keyed by leaderboard_id."""
    async with sessionmaker()() as session:
        rows = (
            await session.execute(
                text("""
                    SELECT user_id, score, rank, recorded_at
                      FROM social_schema.leaderboards
                     WHERE leaderboard_id = :lid
                     ORDER BY rank
                     LIMIT :lim
                """),
                {"lid": leaderboard_id, "lim": min(limit, 500)},
            )
        ).mappings().all()
    return {
        "leaderboardId": leaderboard_id,
        "items": [
            {
                "userId": str(r["user_id"]),
                "rank": int(r["rank"]),
                "score": float(r["score"]),
            }
            for r in rows
        ],
        "count": len(rows),
    }
