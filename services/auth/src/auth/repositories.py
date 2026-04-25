"""Data access — thin wrapper over SQLAlchemy Core queries against auth_schema."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class UserRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def by_email(self, email: str) -> dict[str, Any] | None:
        row = (
            await self.s.execute(
                text(
                    "SELECT id, email, password_hash, full_name, role, admin_access_level, "
                    "account_status, onboarding_status, institution_id, is_deleted "
                    "FROM auth_schema.users WHERE email = :email"
                ),
                {"email": email.lower()},
            )
        ).mappings().first()
        return dict(row) if row else None

    async def by_id(self, user_id: UUID | str) -> dict[str, Any] | None:
        row = (
            await self.s.execute(
                text(
                    "SELECT id, email, password_hash, full_name, role, admin_access_level, "
                    "account_status, onboarding_status, institution_id, is_deleted "
                    "FROM auth_schema.users WHERE id = :id"
                ),
                {"id": str(user_id)},
            )
        ).mappings().first()
        return dict(row) if row else None

    async def insert(self, *, email: str, password_hash: str, full_name: str) -> dict[str, Any]:
        row = (
            await self.s.execute(
                text(
                    "INSERT INTO auth_schema.users (email, password_hash, full_name, account_status) "
                    "VALUES (:email, :password_hash, :full_name, 'PENDING_VERIFICATION') "
                    "RETURNING id, email, full_name, role, admin_access_level, account_status, "
                    "onboarding_status, institution_id"
                ),
                {"email": email.lower(), "password_hash": password_hash, "full_name": full_name},
            )
        ).mappings().first()
        assert row is not None
        return dict(row)

    async def activate(self, user_id: UUID | str) -> None:
        await self.s.execute(
            text(
                "UPDATE auth_schema.users SET account_status='ACTIVE', updated_at=NOW() "
                "WHERE id=:id AND account_status='PENDING_VERIFICATION'"
            ),
            {"id": str(user_id)},
        )


class OtpRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def create(self, *, contact: str, otp_hash: str, expires_at: datetime) -> None:
        await self.s.execute(
            text(
                "INSERT INTO auth_schema.otp_tokens (contact, otp_hash, expires_at) "
                "VALUES (:contact, :otp_hash, :expires_at)"
            ),
            {"contact": contact, "otp_hash": otp_hash, "expires_at": expires_at},
        )

    async def latest_active(self, contact: str) -> dict[str, Any] | None:
        row = (
            await self.s.execute(
                text(
                    "SELECT id, otp_hash, attempts, expires_at, used_at "
                    "FROM auth_schema.otp_tokens "
                    "WHERE contact = :contact AND used_at IS NULL AND expires_at > NOW() "
                    "ORDER BY created_at DESC LIMIT 1"
                ),
                {"contact": contact},
            )
        ).mappings().first()
        return dict(row) if row else None

    async def increment_attempts(self, otp_id: UUID | str) -> int:
        row = (
            await self.s.execute(
                text(
                    "UPDATE auth_schema.otp_tokens SET attempts = attempts + 1 "
                    "WHERE id = :id RETURNING attempts"
                ),
                {"id": str(otp_id)},
            )
        ).mappings().first()
        return int(row["attempts"]) if row else 0

    async def mark_used(self, otp_id: UUID | str) -> None:
        await self.s.execute(
            text("UPDATE auth_schema.otp_tokens SET used_at = NOW() WHERE id = :id"),
            {"id": str(otp_id)},
        )


class PasswordResetRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def create(
        self,
        *,
        user_id: UUID | str,
        token_hash: str,
        expires_at: datetime,
    ) -> None:
        await self.s.execute(
            text(
                "INSERT INTO auth_schema.password_reset_tokens (user_id, token_hash, expires_at) "
                "VALUES (:uid, :h, :exp)"
            ),
            {"uid": str(user_id), "h": token_hash, "exp": expires_at},
        )

    async def consume(self, token_hash: str) -> dict[str, Any] | None:
        row = (
            await self.s.execute(
                text(
                    "SELECT id, user_id FROM auth_schema.password_reset_tokens "
                    "WHERE token_hash = :h AND used_at IS NULL AND expires_at > NOW() "
                    "FOR UPDATE"
                ),
                {"h": token_hash},
            )
        ).mappings().first()
        if not row:
            return None
        await self.s.execute(
            text("UPDATE auth_schema.password_reset_tokens SET used_at = NOW() WHERE id = :id"),
            {"id": str(row["id"])},
        )
        return dict(row)

    async def update_password_hash(self, *, user_id: UUID | str, password_hash: str) -> None:
        await self.s.execute(
            text(
                "UPDATE auth_schema.users SET password_hash = :h, updated_at = NOW() "
                "WHERE id = :uid"
            ),
            {"uid": str(user_id), "h": password_hash},
        )


class RefreshTokenRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def store(self, *, user_id: UUID | str, token_hash: str, expires_at: datetime) -> None:
        await self.s.execute(
            text(
                "INSERT INTO auth_schema.refresh_tokens (user_id, token_hash, expires_at) "
                "VALUES (:user_id, :token_hash, :expires_at)"
            ),
            {"user_id": str(user_id), "token_hash": token_hash, "expires_at": expires_at},
        )

    async def by_hash_active(self, token_hash: str) -> dict[str, Any] | None:
        row = (
            await self.s.execute(
                text(
                    "SELECT id, user_id, token_hash, expires_at, revoked_at "
                    "FROM auth_schema.refresh_tokens "
                    "WHERE token_hash = :h AND revoked_at IS NULL AND expires_at > NOW()"
                ),
                {"h": token_hash},
            )
        ).mappings().first()
        return dict(row) if row else None

    async def revoke(self, token_hash: str) -> None:
        await self.s.execute(
            text(
                "UPDATE auth_schema.refresh_tokens SET revoked_at = :now "
                "WHERE token_hash = :h AND revoked_at IS NULL"
            ),
            {"h": token_hash, "now": datetime.now(tz=timezone.utc)},
        )

    async def revoke_all_for_user(self, user_id: UUID | str) -> None:
        await self.s.execute(
            text(
                "UPDATE auth_schema.refresh_tokens SET revoked_at = NOW() "
                "WHERE user_id = :uid AND revoked_at IS NULL"
            ),
            {"uid": str(user_id)},
        )
