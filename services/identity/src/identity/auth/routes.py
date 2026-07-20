"""FastAPI router for /auth/* endpoints. Matches openapi/phase1.yaml."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from identity.auth import lockout, rate_limit
from identity.auth.config import settings
from identity.auth.db import get_session
from identity.auth.events import publish_user_created
from identity.auth.flags import client as flags_client
from identity.auth.mailer import send_otp_email, send_password_reset_email
from identity.auth.repositories import OtpRepo, PasswordResetRepo, RefreshTokenRepo, UserRepo
from identity.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    OtpResendRequest,
    OtpVerifyRequest,
    Problem,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    Session,
    Tokens,
    User,
)
from identity.auth.security import (
    effective_role,
    generate_otp,
    generate_refresh_token,
    hash_otp,
    hash_password,
    hash_refresh_token,
    issue_access_token,
    refresh_expires_at,
    verify_password,
)

log = logging.getLogger(__name__)


async def _email_enabled() -> bool:
    try:
        return await flags_client().evaluate("email_channel_enabled")
    except Exception:  # noqa: BLE001 — flag failures must never block auth
        return True  # safest default for transactional auth email


async def _send_otp_if_enabled(*, to: str, otp: str) -> None:
    """Gate outbound OTP email on `email_channel_enabled` flag (GAP-16).

    When OFF: OTP row is still written to DB so /auth/otp/verify continues to work
    for ops paths; we just don't dispatch SMTP. Logged for incident review.
    """
    if not await _email_enabled():
        log.warning("auth.otp.email_skipped — email_channel_enabled=false (recipient=%s)", to)
        return
    await send_otp_email(to=to, otp=otp)


async def _send_reset_if_enabled(*, to: str, reset_url: str) -> None:
    if not await _email_enabled():
        log.warning("auth.password_reset.email_skipped — email_channel_enabled=false (recipient=%s)", to)
        return
    await send_password_reset_email(to=to, reset_url=reset_url)


router = APIRouter(prefix="/auth", tags=["auth"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _problem(code: str, message: str, *, http_status: int) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail=Problem(code=code, message=message).model_dump(),
    )


def _row_to_user(row: dict) -> User:
    # full_name stores "First Last"; split for the response shape. We'll migrate
    # to first_name/last_name columns in a later migration once frontend is stable.
    full = row.get("full_name") or ""
    first, _, last = full.partition(" ")
    # Sprint 8 R-1 — STUDENT with active subscription → STUDENT_PREMIUM in JWT.
    role = effective_role(row["role"], row.get("premium_until"))
    return User(
        id=str(row["id"]),
        email=row["email"],
        firstName=first or full,
        lastName=last,
        role=role,
        tenantId=str(row["institution_id"]) if row.get("institution_id") else None,
        onboardingState={"PENDING": "NEW", "COMPLETE": "ONBOARDED"}.get(row["onboarding_status"], "NEW"),
    )


REFRESH_COOKIE = "alp_refresh"


def _set_refresh_cookie(response: Response, token: str, *, remember: bool) -> None:
    """Persist the refresh token in an HttpOnly cookie so JS (and therefore
    any XSS) can never read it. Secure is on outside local/test; SameSite=Lax
    keeps it working across the OAuth redirect while blocking cross-site POSTs."""
    max_age = (
        settings.jwt_refresh_ttl_seconds_remember if remember else settings.jwt_refresh_ttl_seconds
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=settings.environment not in ("local", "test"),
        samesite="lax",
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE, path="/", httponly=True, samesite="lax")


async def _issue_session(session: AsyncSession, row: dict, *, remember: bool) -> Session:
    # Sprint 9 A-1 — staleness fallback: if `premium_until IS NULL` (the
    # user looks free), check Payment service in case a NATS message was
    # dropped. Premium users with a stored period stay on the fast path.
    if row.get("premium_until") is None and row.get("role") == "STUDENT":
        from identity.auth.payment_fallback import fallback_premium_until

        provisional = await fallback_premium_until(str(row["id"]))
        if provisional is not None:
            await UserRepo(session).set_premium_until(str(row["id"]), provisional)
            await session.commit()
            row = {**row, "premium_until": provisional}
    user = _row_to_user(row)
    access, expires_at = issue_access_token(
        user_id=user.id,
        role=user.role,
        tenant_id=user.tenantId,
        onboarding_state=user.onboardingState,
    )
    refresh = generate_refresh_token()
    await RefreshTokenRepo(session).store(
        user_id=user.id,
        token_hash=hash_refresh_token(refresh),
        expires_at=refresh_expires_at(remember=remember),
    )
    return Session(user=user, tokens=Tokens(accessToken=access, refreshToken=refresh, expiresAt=expires_at))


@router.post(
    "/register",
    response_model=RegisterResponse,
    responses={409: {"model": Problem}, 429: {"model": Problem}},
)
async def register(req: RegisterRequest, request: Request, session: SessionDep) -> RegisterResponse:
    await rate_limit.enforce(rate_limit.REGISTER, request)
    users = UserRepo(session)
    existing = await users.by_email(req.email)
    if existing:
        raise _problem("email_taken", "Email is already registered", http_status=409)

    full_name = f"{req.firstName} {req.lastName}".strip()
    user = await users.insert(
        email=req.email,
        password_hash=hash_password(req.password),
        full_name=full_name,
    )

    # Issue email OTP.
    otp = generate_otp()
    expires = datetime.now(tz=timezone.utc)
    expires = expires.replace(microsecond=0)
    from datetime import timedelta

    expires = expires + timedelta(seconds=settings.otp_ttl_seconds)
    await OtpRepo(session).create(contact=req.email.lower(), otp_hash=hash_otp(otp), expires_at=expires)
    await session.commit()
    await _send_otp_if_enabled(to=req.email, otp=otp)

    return RegisterResponse(userId=str(user["id"]), otpChannel="email")


@router.post(
    "/otp/verify",
    response_model=Session,
    responses={400: {"model": Problem}, 410: {"model": Problem}},
)
async def verify_otp(req: OtpVerifyRequest, response: Response, session: SessionDep) -> Session:
    users = UserRepo(session)
    user = await users.by_id(req.userId)
    if not user:
        raise _problem("user_not_found", "User not found", http_status=400)

    contact = user["email"] if req.channel == "email" else None
    if contact is None:
        raise _problem("unsupported_channel", "SMS OTP not enabled yet", http_status=400)

    otps = OtpRepo(session)
    otp_row = await otps.latest_active(contact)
    if not otp_row:
        raise _problem("otp_expired", "No active OTP — request a new one", http_status=410)

    if otp_row["attempts"] >= 3:
        raise _problem("otp_too_many_attempts", "Too many attempts — request a new code", http_status=400)

    if hash_otp(req.code) != otp_row["otp_hash"]:
        await otps.increment_attempts(otp_row["id"])
        await session.commit()
        raise _problem("otp_invalid", "Incorrect code", http_status=400)

    await otps.mark_used(otp_row["id"])
    await users.activate(req.userId)
    # Re-read the now-active user.
    refreshed = await users.by_id(req.userId)
    assert refreshed is not None
    session_obj = await _issue_session(session, refreshed, remember=False)
    await session.commit()

    # Publish user.created event so Profile (and other downstream services) can seed
    # their projection of the user. Best-effort — never blocks the verification response.
    full = refreshed.get("full_name") or ""
    first, _, last = full.partition(" ")
    await publish_user_created(
        user_id=str(refreshed["id"]),
        email=refreshed["email"],
        first_name=first or full,
        last_name=last,
        role=refreshed["role"],
    )
    _set_refresh_cookie(response, session_obj.tokens.refreshToken, remember=False)
    return session_obj


@router.post(
    "/otp/resend",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={429: {"model": Problem}},
)
async def resend_otp(req: OtpResendRequest, request: Request, session: SessionDep) -> Response:
    await rate_limit.enforce(rate_limit.OTP_RESEND, request)
    users = UserRepo(session)
    user = await users.by_id(req.userId)
    if not user:
        # Enumeration-safe: always return 204 even if user not found.
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    if req.channel != "email":
        raise _problem("unsupported_channel", "SMS OTP not enabled yet", http_status=400)

    otp = generate_otp()
    from datetime import timedelta

    expires = datetime.now(tz=timezone.utc) + timedelta(seconds=settings.otp_ttl_seconds)
    await OtpRepo(session).create(contact=user["email"], otp_hash=hash_otp(otp), expires_at=expires)
    await session.commit()
    await _send_otp_if_enabled(to=user["email"], otp=otp)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/login",
    response_model=Session,
    responses={401: {"model": Problem}, 423: {"model": Problem}},
)
async def login(req: LoginRequest, request: Request, response: Response, session: SessionDep) -> Session:
    await rate_limit.enforce(rate_limit.LOGIN, request)
    # Lockout check first — short-circuits even valid creds during the cool-down window.
    locked_for = await lockout.is_locked(req.email)
    if locked_for > 0:
        raise _problem(
            "account_locked",
            f"Too many failed attempts. Try again in {max(1, locked_for // 60)} minute(s).",
            http_status=423,
        )

    users = UserRepo(session)
    row = await users.by_email(req.email)
    if not row:
        await lockout.record_failure(req.email)
        raise _problem("invalid_credentials", "Email or password is incorrect", http_status=401)
    if row["is_deleted"]:
        raise _problem("invalid_credentials", "Email or password is incorrect", http_status=401)
    if row["account_status"] == "SUSPENDED" or row["account_status"] == "BANNED":
        raise _problem("account_locked", "Account is suspended", http_status=423)
    if row["account_status"] != "ACTIVE":
        raise _problem("not_verified", "Verify your email to log in", http_status=401)
    if not row["password_hash"] or not verify_password(req.password, row["password_hash"]):
        await lockout.record_failure(req.email)
        raise _problem("invalid_credentials", "Email or password is incorrect", http_status=401)

    # Successful login — clear lockout counter.
    await lockout.reset(req.email)

    result = await _issue_session(session, row, remember=req.remember)
    await session.commit()
    _set_refresh_cookie(response, result.tokens.refreshToken, remember=req.remember)
    return result


@router.post(
    "/refresh",
    response_model=Tokens,
    responses={401: {"model": Problem}},
)
async def refresh(
    req: RefreshRequest, request: Request, response: Response, session: SessionDep
) -> Tokens:
    # Prefer the HttpOnly cookie; fall back to the legacy request body.
    token = request.cookies.get(REFRESH_COOKIE) or req.refreshToken
    if not token:
        raise _problem("invalid_refresh", "Refresh token is invalid or expired", http_status=401)
    rt_hash = hash_refresh_token(token)
    rts = RefreshTokenRepo(session)
    existing = await rts.by_hash_active(rt_hash)
    if not existing:
        raise _problem("invalid_refresh", "Refresh token is invalid or expired", http_status=401)

    users = UserRepo(session)
    row = await users.by_id(existing["user_id"])
    if not row or row["is_deleted"]:
        raise _problem("invalid_refresh", "Refresh token is invalid or expired", http_status=401)

    # Rotate: revoke old, issue new pair. Access TTL always short; refresh retains original remember policy
    # (we don't know the original flag — default to non-remember for safety).
    await rts.revoke(rt_hash)
    new_session = await _issue_session(session, row, remember=False)
    await session.commit()
    _set_refresh_cookie(response, new_session.tokens.refreshToken, remember=False)
    return new_session.tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(req: LogoutRequest, request: Request, session: SessionDep) -> Response:
    token = request.cookies.get(REFRESH_COOKIE) or req.refreshToken
    if token:
        await RefreshTokenRepo(session).revoke(hash_refresh_token(token))
        await session.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


@router.post("/password/forgot", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(req: ForgotPasswordRequest, request: Request, session: SessionDep) -> Response:
    """Always returns 204 — does not reveal whether the email exists (enumeration-safe)."""
    await rate_limit.enforce(rate_limit.PASSWORD_FORGOT, request)
    users = UserRepo(session)
    user = await users.by_email(req.email)
    if user is not None and not user["is_deleted"] and user["account_status"] != "BANNED":
        from datetime import timedelta

        token = generate_refresh_token()  # 32+ char URL-safe; reuse the helper
        expires = datetime.now(tz=timezone.utc) + timedelta(seconds=settings.password_reset_ttl_seconds)
        await PasswordResetRepo(session).create(
            user_id=user["id"], token_hash=hash_refresh_token(token), expires_at=expires
        )
        await session.commit()
        url = settings.password_reset_url_template.format(token=token)
        await _send_reset_if_enabled(to=user["email"], reset_url=url)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/password/reset", responses={410: {"model": Problem}})
async def reset_password(req: ResetPasswordRequest, session: SessionDep) -> Response:
    repo = PasswordResetRepo(session)
    consumed = await repo.consume(hash_refresh_token(req.token))
    if consumed is None:
        raise _problem("token_invalid_or_expired", "Reset link is invalid or has expired", http_status=410)
    await repo.update_password_hash(
        user_id=consumed["user_id"], password_hash=hash_password(req.newPassword)
    )
    # Revoke ALL active refresh tokens for the user — security-critical on password change.
    await RefreshTokenRepo(session).revoke_all_for_user(consumed["user_id"])
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# F8a — batch id→display-name resolution. Leaderboards/Friends/Clans
# show user ids that mean nothing to a human — this resolves up to
# 100 ids in one round-trip to `{userId, displayName, email}` rows.
@router.post("/users/lookup")
async def lookup_users_by_ids(
    body: dict,
    session: SessionDep,
) -> dict:
    """Resolve a list of user ids to display names + emails. Quietly
    drops ids that don't exist or are deleted/banned — the response is
    a sparse list, callers must tolerate missing rows."""
    ids = body.get("userIds") or []
    if not isinstance(ids, list) or len(ids) > 100:
        raise _problem("bad_request", "userIds: list of ≤100 uuids", http_status=422)
    repo = UserRepo(session)
    out = []
    for uid in ids:
        if not isinstance(uid, str):
            continue
        row = await repo.by_id(uid)
        if row is None or row.get("is_deleted") or row.get("account_status") == "BANNED":
            continue
        out.append({
            "userId": str(row["id"]),
            "displayName": row.get("full_name") or row["email"].split("@")[0],
            "email": row["email"],
        })
    return {"users": out}


# F8a — minimal email→userId lookup so the Friends page can resolve a
# friend's email to an id without exposing the admin search endpoint.
# Returns only the public-safe fields (id, displayName). Auth required
# to discourage scraping; rate-limit at the gateway.
@router.get("/users/by-email")
async def lookup_user_by_email(
    email: str,
    session: SessionDep,
) -> dict[str, str]:
    """Resolve an email to its user id. Returns 404 if not found —
    intentionally identical for non-existent and deleted/banned users
    to avoid an enumeration channel."""
    if "@" not in email or len(email) > 320:
        raise _problem("bad_email", "Not a valid email.", http_status=422)
    row = await UserRepo(session).by_email(email.strip().lower())
    if row is None or row.get("is_deleted") or row.get("account_status") == "BANNED":
        raise _problem("not_found", "No user with that email.", http_status=404)
    return {
        "userId": str(row["id"]),
        "displayName": row.get("full_name") or row["email"].split("@")[0],
        "email": row["email"],
    }
