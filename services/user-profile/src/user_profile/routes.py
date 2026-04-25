"""FastAPI router for /profile/* endpoints — matches openapi/phase1.yaml."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from user_profile.db import get_session
from user_profile.repositories import ExamRepo, ProfileRepo
from user_profile.schemas import (
    ExamPatchRequest,
    ExamPutRequest,
    ExamSelection,
    Preferences,
    PreferencesPatch,
    Problem,
    Profile,
    ProfileUpdate,
    UserIdentity,
)
from user_profile.security import JwtPrincipal, current_principal

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
        exams=[ExamSelection(examId=str(e["exam_id"]), targetDate=e["target_date"]) for e in exams],
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
    updated = await ExamRepo(session).set_target_date(
        user_id=principal.user_id, exam_id=exam_id, target=body.targetDate
    )
    if not updated:
        raise _problem("exam_not_selected", "Exam is not in the user's selection", http_status=404)
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


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def delete_avatar(session: SessionDep, principal: PrincipalDep) -> None:
    # Stubbed until S3 avatar upload lands in Sprint 3.
    await session.commit()
    return None


# ---- /internal/profile/{user_id} — service-to-service lookup ----


@internal_router.get("/{user_id}", response_model=UserIdentity)
async def get_profile_internal(user_id: str, session: SessionDep) -> UserIdentity:
    """Service-to-service lookup of the minimal user shape (id, names, email,
    onboarding state). Used by Notification's outbound dispatcher to resolve
    `to:` addresses without threading email through every event payload.

    No JWT here — protected by network reachability (compose network in
    local, K8s NetworkPolicy in staging+prod). Sprint 4 hardens with
    mTLS via the service mesh.
    """
    row = await ProfileRepo(session).by_user_id(user_id)
    if row is None:
        raise _problem("profile_not_found", "Profile not found", http_status=404)
    await session.commit()
    return UserIdentity(
        id=user_id,
        email=row.get("email") or "",
        firstName=row["first_name"],
        lastName=row["last_name"],
        role="STUDENT",
        tenantId=row.get("tenant_id"),
        onboardingState=row["onboarding_state"],
    )
