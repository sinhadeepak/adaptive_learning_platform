"""FastAPI router for /profile/* endpoints — matches openapi/phase1.yaml."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

from identity.profile.db import get_session
from identity.profile.repositories import (
    AchievementsRepo,
    BookmarksRepo,
    ExamRepo,
    MockAttemptsRepo,
    ProfileRepo,
    QuestionFeedbackRepo,
)
from identity.profile.schemas import (
    Achievement,
    AchievementGrant,
    AchievementList,
    AvatarUpdate,
    Bookmark,
    BookmarkCreate,
    BookmarkList,
    ExamPatchRequest,
    ExamPutRequest,
    ExamSelection,
    InternalProfile,
    MockAttempt,
    MockAttemptCreate,
    MockAttemptList,
    NotificationPrefsPatch,
    Preferences,
    GoalsPatch,
    PreferencesPatch,
    Problem,
    Profile,
    ProfileUpdate,
    QuestionFeedback,
    QuestionFeedbackCreate,
    UserIdentity,
)
from identity.profile.security import JwtPrincipal, current_principal

router = APIRouter(prefix="/profile", tags=["profile"])

# Service-to-service router. Mounted under a separate prefix so we can
# tighten access via NetworkPolicy in Sprint 4 without disturbing the
# JWT-protected /profile/* surface used by web/mobile clients.
internal_router = APIRouter(prefix="/internal/profile", tags=["internal"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]


def _problem(code: str, message: str, *, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail=Problem(code=code, message=message).model_dump(),
    )


async def _build_profile(
    *,
    session: AsyncSession,
    principal: JwtPrincipal,
    lazy_create: bool = True,
) -> Profile:
    profiles = ProfileRepo(session)
    exams_repo = ExamRepo(session)
    row = await profiles.by_user_id(principal.user_id)
    if row is None:
        if not lazy_create:
            raise _problem("profile_not_found", "Profile not found", http_status=404)
        # Seed from the JWT; names come from a future NATS `user.created` event.
        row = await profiles.ensure(
            user_id=principal.user_id,
            first_name=principal.claims.get("first_name", ""),
            last_name=principal.claims.get("last_name", ""),
        )
    exams = await exams_repo.list_for_user(principal.user_id)
    return Profile(
        user=UserIdentity(
            id=principal.user_id,
            email=principal.claims.get("email", ""),
            firstName=row["first_name"],
            lastName=row["last_name"],
            role=principal.role,
            tenantId=principal.tenant_id,
            onboardingState=row["onboarding_state"],
        ),
        avatarUrl=row.get("avatar_url"),
        preferences=Preferences(
            language=row["language_pref"],
            dailyGoalMinutes=row.get("daily_goal_minutes"),
        ),
        exams=[
            ExamSelection(
                examId=str(e["exam_id"]),
                targetDate=e["target_date"],
                options=e.get("options"),
            )
            for e in exams
        ],
        notificationPrefs=row.get("notification_prefs") or {},
    )


@router.get("/me", response_model=Profile)
async def get_me(session: SessionDep, principal: PrincipalDep) -> Profile:
    profile = await _build_profile(session=session, principal=principal)
    await session.commit()
    return profile


@router.patch("/me", response_model=Profile)
async def patch_me(body: ProfileUpdate, session: SessionDep, principal: PrincipalDep) -> Profile:
    profiles = ProfileRepo(session)
    if await profiles.by_user_id(principal.user_id) is None:
        await profiles.ensure(
            user_id=principal.user_id,
            first_name=body.firstName or "User",
            last_name=body.lastName or "Student",
        )
    await profiles.patch(
        user_id=principal.user_id,
        first_name=body.firstName,
        last_name=body.lastName,
    )
    profile = await _build_profile(session=session, principal=principal)
    await session.commit()
    return profile


# ── Phase 1D-7 — National leaderboard opt-in ────────────────────────


@router.patch("/me/leaderboard-opt-in")
async def patch_leaderboard_opt_in(
    body: dict,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict:
    """Toggle the user's opt-in flag for the national mock leaderboard.
    Body: {"optIn": bool, "publicDisplayName"?: str | null}.
    """
    from sqlalchemy import text as _t

    opt_in = bool(body.get("optIn", False))
    name = body.get("publicDisplayName")
    await session.execute(
        _t(
            """
            UPDATE auth_schema.users
               SET opt_in_national_leaderboard = :opt,
                   public_display_name = :name
             WHERE id = CAST(:uid AS uuid)
            """
        ),
        {"opt": opt_in, "name": name, "uid": principal.user_id},
    )
    await session.commit()
    return {"optIn": opt_in, "publicDisplayName": name}


@router.get("/me/leaderboard-opt-in")
async def get_leaderboard_opt_in(
    session: SessionDep,
    principal: PrincipalDep,
) -> dict:
    from sqlalchemy import text as _t

    row = (
        await session.execute(
            _t(
                """
                SELECT opt_in_national_leaderboard, public_display_name
                  FROM auth_schema.users
                 WHERE id = CAST(:uid AS uuid)
                """
            ),
            {"uid": principal.user_id},
        )
    ).first()
    return {
        "optIn": bool(row[0]) if row else False,
        "publicDisplayName": row[1] if row else None,
    }


@router.put("/exams", response_model=Profile)
async def put_exam(body: ExamPutRequest, session: SessionDep, principal: PrincipalDep) -> Profile:
    profiles = ProfileRepo(session)
    await profiles.ensure(
        user_id=principal.user_id,
        first_name=principal.claims.get("first_name", ""),
        last_name=principal.claims.get("last_name", ""),
    )
    await ExamRepo(session).upsert(user_id=principal.user_id, exam_id=body.examId)
    await profiles.advance_to_exam_selected(principal.user_id)
    profile = await _build_profile(session=session, principal=principal)
    await session.commit()
    return profile


@router.patch("/exams/{exam_id}", response_model=Profile)
async def patch_exam(
    exam_id: str,
    body: ExamPatchRequest,
    session: SessionDep,
    principal: PrincipalDep,
) -> Profile:
    """PATCH supports two independent fields:
      - targetDate: when the user has set/changed their exam date.
      - options: per-pool picks (Phase 7).

    Either or both can be set in the same call. Pool picks land via
    ExamRepo.set_options; we don't validate pick_min/pick_max here
    (catalog lives in another DB) — the caller's UI validates.
    """
    repo = ExamRepo(session)

    # targetDate flow — preserve old behaviour if only targetDate is sent.
    target_updated = False
    if body.targetDate is not None or "targetDate" in body.model_fields_set:
        target_updated = await repo.set_target_date(
            user_id=principal.user_id, exam_id=exam_id, target=body.targetDate
        )

    options_updated = False
    if "options" in body.model_fields_set:
        options_updated = await repo.set_options(
            user_id=principal.user_id, exam_id=exam_id, options=body.options
        )

    if not (target_updated or options_updated):
        raise _problem(
            "exam_not_selected",
            "Exam is not in the user's selection",
            http_status=404,
        )
    profile = await _build_profile(session=session, principal=principal)
    await session.commit()
    return profile


@router.patch("/preferences", response_model=Profile)
async def patch_preferences(
    body: PreferencesPatch,
    session: SessionDep,
    principal: PrincipalDep,
) -> Profile:
    profiles = ProfileRepo(session)
    await profiles.ensure(
        user_id=principal.user_id,
        first_name=principal.claims.get("first_name", ""),
        last_name=principal.claims.get("last_name", ""),
    )
    await profiles.patch_preferences(
        user_id=principal.user_id,
        language=body.language,
        daily_goal_minutes=body.dailyGoalMinutes,
    )
    profile = await _build_profile(session=session, principal=principal)
    await session.commit()
    return profile


# Sprint 30 (P4-S30) — exam-prep target goals.
@router.patch("/me/goals")
async def patch_goals(
    body: GoalsPatch,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict:
    """Partial update of `target_exam_id` / `target_exam_date` /
    `target_rank` on the user's profile. Returns the row's current goal
    fields. Used by the closed-loop study plan + pre-mock revision
    sprint mode.
    """
    profiles = ProfileRepo(session)
    await profiles.ensure(
        user_id=principal.user_id,
        first_name=principal.claims.get("first_name", ""),
        last_name=principal.claims.get("last_name", ""),
    )
    await profiles.patch_goals(
        user_id=principal.user_id,
        target_exam_id=body.targetExamId,
        target_exam_date=body.targetExamDate,
        target_rank=body.targetRank,
    )
    row = await profiles.by_user_id(principal.user_id)
    await session.commit()
    return {
        "userId": str(principal.user_id),
        "targetExamId": str(row["target_exam_id"]) if row and row.get("target_exam_id") else None,
        "targetExamDate": row["target_exam_date"].isoformat()
        if row and row.get("target_exam_date") else None,
        "targetRank": int(row["target_rank"]) if row and row.get("target_rank") is not None else None,
    }


# F2b — diagnostic FSM transitions.
@router.post("/me/diagnostic-complete", response_model=Profile)
async def diagnostic_complete(
    session: SessionDep,
    principal: PrincipalDep,
) -> Profile:
    """Marks the user's onboarding diagnostic as complete. Transitions
    onboarding_state EXAM_SELECTED → DIAGNOSTIC_DONE. Called by the
    screening flow's /screening/{token}/persist hook on the client side
    after the IRT prior has been written. Idempotent — re-calling on a
    user already past EXAM_SELECTED is a no-op.
    """
    profiles = ProfileRepo(session)
    await profiles.mark_diagnostic_complete(principal.user_id)
    profile = await _build_profile(session=session, principal=principal)
    await session.commit()
    return profile


@router.get("/me/onboarding-routing")
async def onboarding_routing(
    session: SessionDep,
    principal: PrincipalDep,
) -> dict:
    """F2b — client-side onboarding redirector helper. Tells the web
    + mobile app what state the user is in + whether their tenant
    requires the in-FSM diagnostic step. The client uses this to pick
    the next screen after exam selection without having to look up
    tenant config separately.
    """
    profiles = ProfileRepo(session)
    row = await profiles.by_user_id(principal.user_id)
    state = row["onboarding_state"] if row else "NEW"
    tenant_id = row.get("tenant_id") if row else None
    requires = await profiles.tenant_requires_diagnostic(tenant_id)
    diag_waived = bool(row.get("diagnostic_waived")) if row else False
    return {
        "onboardingState": state,
        "tenantId": str(tenant_id) if tenant_id else None,
        "requiresDiagnostic": requires and not diag_waived,
        "diagnosticWaived": diag_waived,
    }


@router.put("/me/avatar", response_model=Profile)
async def put_avatar(
    body: AvatarUpdate,
    session: SessionDep,
    principal: PrincipalDep,
) -> Profile:
    """Stash a base64 data URL avatar inline. Clients should downscale to
    ~256×256 before upload (Pydantic caps at 400KB to keep the row size
    sane). Real S3+CDN upload lands later — this gives the UI a working
    surface without standing up that infra now."""
    avatar = body.avatarUrl.strip()
    if not avatar.startswith("data:image/"):
        raise _problem("invalid_avatar", "Avatar must be a base64 image data URL", http_status=400)
    profiles = ProfileRepo(session)
    await profiles.ensure(
        user_id=principal.user_id,
        first_name=principal.claims.get("first_name", ""),
        last_name=principal.claims.get("last_name", ""),
    )
    await profiles.set_avatar(principal.user_id, avatar)
    profile = await _build_profile(session=session, principal=principal)
    await session.commit()
    return profile


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def delete_avatar(session: SessionDep, principal: PrincipalDep) -> None:
    profiles = ProfileRepo(session)
    if await profiles.by_user_id(principal.user_id) is not None:
        await profiles.set_avatar(principal.user_id, None)
    await session.commit()
    return None


# ---- /profile/bookmarks — student-facing question bookmarks ----


@router.post("/bookmarks", response_model=Bookmark, status_code=status.HTTP_201_CREATED)
async def add_bookmark(
    body: BookmarkCreate,
    session: SessionDep,
    principal: PrincipalDep,
) -> Bookmark:
    repo = BookmarksRepo(session)
    row = await repo.add(
        user_id=principal.user_id,
        question_id=body.questionId,
        topic_id=body.topicId,
        topic_title=body.topicTitle,
        stem=body.stem,
        note=body.note,
    )
    await session.commit()
    return Bookmark(
        userId=str(row["user_id"]),
        questionId=str(row["question_id"]),
        topicId=str(row["topic_id"]) if row.get("topic_id") else None,
        topicTitle=row.get("topic_title"),
        stem=row.get("stem"),
        note=row.get("note"),
        createdAt=row["created_at"],
    )


@router.get("/bookmarks", response_model=BookmarkList)
async def list_bookmarks(session: SessionDep, principal: PrincipalDep) -> BookmarkList:
    repo = BookmarksRepo(session)
    rows = await repo.list_for_user(principal.user_id)
    return BookmarkList(
        items=[
            Bookmark(
                userId=str(r["user_id"]),
                questionId=str(r["question_id"]),
                topicId=str(r["topic_id"]) if r.get("topic_id") else None,
                topicTitle=r.get("topic_title"),
                stem=r.get("stem"),
                note=r.get("note"),
                createdAt=r["created_at"],
            )
            for r in rows
        ]
    )


@router.delete("/bookmarks/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_bookmark(
    question_id: str,
    session: SessionDep,
    principal: PrincipalDep,
) -> None:
    repo = BookmarksRepo(session)
    ok = await repo.remove(user_id=principal.user_id, question_id=question_id)
    if not ok:
        raise _problem("bookmark_not_found", "Bookmark not found", http_status=404)
    await session.commit()
    return None


# ---- /profile/notification-prefs — per-type mute map ----


@router.patch("/notification-prefs", response_model=Profile)
async def patch_notification_prefs(
    body: NotificationPrefsPatch,
    session: SessionDep,
    principal: PrincipalDep,
) -> Profile:
    """Merge-update the user's notification mute map. Pass {type: false} to
    mute, {type: true} to re-enable. Server-side filtering: producers consult
    the user's prefs (via /internal/profile) before posting to the inbox, so
    a muted type never shows up in the bell."""
    profiles = ProfileRepo(session)
    await profiles.ensure(
        user_id=principal.user_id,
        first_name=principal.claims.get("first_name", ""),
        last_name=principal.claims.get("last_name", ""),
    )
    await profiles.patch_notification_prefs(principal.user_id, body.prefs)
    profile = await _build_profile(session=session, principal=principal)
    await session.commit()
    return profile


# ---- /profile/mock-attempts — durable mock test scoreboard ----


def _mock_attempt_to_schema(row: dict) -> MockAttempt:
    return MockAttempt(
        id=str(row["id"]),
        mockId=row.get("mock_id") if row.get("mock_id") else None,
        examCode=row["exam_code"],
        examName=row.get("exam_name"),
        rawScore=int(row["raw_score"]),
        maxMarks=int(row["max_marks"]),
        accuracy=float(row["accuracy"]),
        totalQuestions=int(row["total_questions"]),
        nCorrect=int(row["n_correct"]),
        nWrong=int(row["n_wrong"]),
        nUnanswered=int(row["n_unanswered"]),
        percentile=float(row["percentile"]) if row.get("percentile") is not None else None,
        projectedRank=int(row["projected_rank"]) if row.get("projected_rank") is not None else None,
        confidence=row.get("confidence"),
        sections=row.get("sections") or [],
        createdAt=row["created_at"],
    )


@router.get("/mock-attempts", response_model=MockAttemptList)
async def list_mock_attempts(session: SessionDep, principal: PrincipalDep) -> MockAttemptList:
    repo = MockAttemptsRepo(session)
    rows = await repo.list_for_user(principal.user_id)
    return MockAttemptList(items=[_mock_attempt_to_schema(r) for r in rows])


# Service-to-service: adaptive-engine POSTs after /adaptive/mock/score finishes.
# No JWT here — guarded by network reachability (compose network locally,
# K8s NetworkPolicy in staging+prod). Kept separate from the JWT-gated
# /profile/* surface so a stolen token can't manufacture mock results.
@internal_router.get("/{user_id}/mock-attempts/count")
async def get_mock_attempt_count_internal(user_id: str, session: SessionDep) -> dict:
    """Service-to-service counter — adaptive-engine pings this after a
    mock score to decide whether to award `mocks_5` / `mocks_10` / etc."""
    repo = MockAttemptsRepo(session)
    count = await repo.count_for_user(user_id)
    return {"userId": user_id, "count": count}


@internal_router.post("/mock-attempts", response_model=MockAttempt)
async def post_mock_attempt_internal(
    body: MockAttemptCreate,
    session: SessionDep,
) -> MockAttempt:
    repo = MockAttemptsRepo(session)
    row = await repo.insert(
        user_id=body.userId,
        mock_id=body.mockId,
        exam_code=body.examCode,
        exam_name=body.examName,
        raw_score=body.rawScore,
        max_marks=body.maxMarks,
        accuracy=body.accuracy,
        total_questions=body.totalQuestions,
        n_correct=body.nCorrect,
        n_wrong=body.nWrong,
        n_unanswered=body.nUnanswered,
        percentile=body.percentile,
        projected_rank=body.projectedRank,
        confidence=body.confidence,
        sections=body.sections,
    )
    await session.commit()
    return _mock_attempt_to_schema(row)


# ---- /profile/achievements — gamification badges ----


def _achievement_to_schema(row: dict) -> Achievement:
    return Achievement(
        id=str(row["id"]),
        kind=row["kind"],
        payload=row.get("payload") or {},
        awardedAt=row["awarded_at"],
    )


@router.get("/achievements", response_model=AchievementList)
async def list_achievements(session: SessionDep, principal: PrincipalDep) -> AchievementList:
    repo = AchievementsRepo(session)
    rows = await repo.list_for_user(principal.user_id)
    return AchievementList(items=[_achievement_to_schema(r) for r in rows])


# Service-to-service: analytics calls this when a streak threshold crosses,
# adaptive-engine calls this on first mock completion, etc. Idempotent on
# (user_id, kind) — re-emit is a no-op. Side-effect: when the grant
# actually awards a NEW badge (vs duplicate), fires an inbox notification
# so the bell pings the student.
@internal_router.post("/achievements", response_model=Achievement)
async def post_achievement_internal(
    body: AchievementGrant, session: SessionDep
) -> Achievement:
    repo = AchievementsRepo(session)
    row, created = await repo.grant(
        user_id=body.userId, kind=body.kind, payload=body.payload
    )
    await session.commit()
    if created:
        try:
            await _post_achievement_notification(
                user_id=body.userId, kind=body.kind, payload=body.payload
            )
        except Exception:
            log.exception("achievement.unlocked notification failed")
    return _achievement_to_schema(row)


async def _post_achievement_notification(
    *, user_id: str, kind: str, payload: dict
) -> None:
    from identity.profile.config import settings

    base = (settings.notification_base_url or "").rstrip("/")
    if not base:
        return
    import httpx

    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            f"{base}/notifications/inbox",
            json={
                "userId": user_id,
                "type": "achievement.unlocked",
                "payload": {"kind": kind, **payload},
            },
        )


# ---- /profile/feedback — student-reported question issues ----


@router.post("/feedback", response_model=QuestionFeedback, status_code=status.HTTP_201_CREATED)
async def post_feedback(
    body: QuestionFeedbackCreate,
    session: SessionDep,
    principal: PrincipalDep,
) -> QuestionFeedback:
    """Record a student's flag against a question (ambiguous / wrong / typo).
    Idempotent on (user, question, kind) so a double-tap is a no-op rather
    than two identical rows clogging the moderator queue."""
    repo = QuestionFeedbackRepo(session)
    row = await repo.create(
        user_id=principal.user_id,
        question_id=body.questionId,
        kind=body.kind,
        note=body.note,
    )
    await session.commit()
    return QuestionFeedback(
        id=str(row["id"]),
        questionId=str(row["question_id"]),
        kind=row["kind"],
        note=row.get("note"),
        createdAt=row["created_at"],
    )


# ── Phase 1D-7 — Internal opted-in lookup (must be before /{user_id}) ──


@internal_router.get("/opted-in-leaderboard")
async def list_opted_in_leaderboard(
    session: SessionDep,
    examCode: str | None = None,
) -> dict:
    """Return all users with `opt_in_national_leaderboard = true`.
    `examCode` reserved for future per-exam scoping; v1 returns all opted-in.
    """
    from sqlalchemy import text as _t

    rows = (
        await session.execute(
            _t(
                """
                SELECT id::text AS user_id, public_display_name
                  FROM auth_schema.users
                 WHERE opt_in_national_leaderboard = TRUE
                   AND COALESCE(is_deleted, FALSE) = FALSE
                """
            )
        )
    ).mappings().all()
    return {
        "users": [
            {"userId": r["user_id"], "publicDisplayName": r["public_display_name"]}
            for r in rows
        ],
    }


# ---- /internal/profile/{user_id} — service-to-service lookup ----


@internal_router.get("/{user_id}", response_model=InternalProfile)
async def get_profile_internal(user_id: str, session: SessionDep) -> InternalProfile:
    """Service-to-service lookup of the user's identity + preferences.

    Used by Notification's outbound dispatcher to resolve `to:` addresses
    without threading email through every event payload, and by Analytics
    to detect daily-goal crossings without bloating the quiz event payload.

    No JWT here — protected by network reachability (compose network in
    local, K8s NetworkPolicy in staging+prod). Sprint 4 hardens with
    mTLS via the service mesh.
    """
    row = await ProfileRepo(session).by_user_id(user_id)
    if row is None:
        raise _problem("profile_not_found", "Profile not found", http_status=404)
    await session.commit()
    return InternalProfile(
        id=user_id,
        email=row.get("email") or "",
        firstName=row["first_name"],
        lastName=row["last_name"],
        role="STUDENT",
        tenantId=row.get("tenant_id"),
        onboardingState=row["onboarding_state"],
        language=row["language_pref"],
        dailyGoalMinutes=row.get("daily_goal_minutes"),
        notificationPrefs=row.get("notification_prefs") or {},
    )


# Phase 1D-7 internal lookup moved earlier in the router (before /{user_id}).
