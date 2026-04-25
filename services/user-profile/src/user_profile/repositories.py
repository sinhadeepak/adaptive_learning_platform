"""Data access for profile_schema.profiles + exam_selections."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class ProfileRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def by_user_id(self, user_id: UUID | str) -> dict[str, Any] | None:
        row = (
            await self.s.execute(
                text(
                    "SELECT user_id, first_name, last_name, email, avatar_url, locale, language_pref, "
                    "daily_goal_minutes, onboarding_state, timezone, tenant_id "
                    "FROM profile_schema.profiles WHERE user_id = :uid"
                ),
                {"uid": str(user_id)},
            )
        ).mappings().first()
        return dict(row) if row else None

    async def ensure(
        self,
        *,
        user_id: UUID | str,
        first_name: str,
        last_name: str,
    ) -> dict[str, Any]:
        """Lazy-create profile on first access. Auth → Profile NATS event flow replaces this in Sprint 1 Day 3+."""
        await self.s.execute(
            text(
                "INSERT INTO profile_schema.profiles (user_id, first_name, last_name) "
                "VALUES (:uid, :fn, :ln) ON CONFLICT (user_id) DO NOTHING"
            ),
            {"uid": str(user_id), "fn": first_name or "User", "ln": last_name or "Student"},
        )
        row = await self.by_user_id(user_id)
        assert row is not None
        return row

    async def patch(
        self,
        *,
        user_id: UUID | str,
        first_name: str | None = None,
        last_name: str | None = None,
    ) -> dict[str, Any]:
        await self.s.execute(
            text(
                "UPDATE profile_schema.profiles SET "
                "first_name = COALESCE(:fn, first_name), "
                "last_name = COALESCE(:ln, last_name), "
                "updated_at = NOW() "
                "WHERE user_id = :uid"
            ),
            {"uid": str(user_id), "fn": first_name, "ln": last_name},
        )
        row = await self.by_user_id(user_id)
        assert row is not None
        return row

    async def patch_preferences(
        self,
        *,
        user_id: UUID | str,
        language: str | None = None,
        daily_goal_minutes: int | None = None,
    ) -> dict[str, Any]:
        await self.s.execute(
            text(
                "UPDATE profile_schema.profiles SET "
                "language_pref = COALESCE(:lang, language_pref), "
                "daily_goal_minutes = COALESCE(:goal, daily_goal_minutes), "
                "updated_at = NOW() "
                "WHERE user_id = :uid"
            ),
            {"uid": str(user_id), "lang": language, "goal": daily_goal_minutes},
        )
        # Advance onboarding FSM on daily-goal set (terminal step).
        if daily_goal_minutes is not None:
            await self.s.execute(
                text(
                    "UPDATE profile_schema.profiles SET onboarding_state = 'ONBOARDED', updated_at = NOW() "
                    "WHERE user_id = :uid AND onboarding_state = 'EXAM_SELECTED'"
                ),
                {"uid": str(user_id)},
            )
        row = await self.by_user_id(user_id)
        assert row is not None
        return row

    async def advance_to_exam_selected(self, user_id: UUID | str) -> None:
        await self.s.execute(
            text(
                "UPDATE profile_schema.profiles SET onboarding_state = 'EXAM_SELECTED', updated_at = NOW() "
                "WHERE user_id = :uid AND onboarding_state = 'NEW'"
            ),
            {"uid": str(user_id)},
        )


class ExamRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def list_for_user(self, user_id: UUID | str) -> list[dict[str, Any]]:
        rows = (
            await self.s.execute(
                text(
                    "SELECT exam_id, target_date FROM profile_schema.exam_selections "
                    "WHERE user_id = :uid AND removed_at IS NULL ORDER BY selected_at"
                ),
                {"uid": str(user_id)},
            )
        ).mappings().all()
        return [dict(r) for r in rows]

    async def upsert(self, *, user_id: UUID | str, exam_id: str) -> None:
        await self.s.execute(
            text(
                "INSERT INTO profile_schema.exam_selections (user_id, exam_id) "
                "VALUES (:uid, :eid) "
                "ON CONFLICT (user_id, exam_id) DO UPDATE SET removed_at = NULL"
            ),
            {"uid": str(user_id), "eid": exam_id},
        )

    async def set_target_date(self, *, user_id: UUID | str, exam_id: str, target: date | None) -> bool:
        result = await self.s.execute(
            text(
                "UPDATE profile_schema.exam_selections SET target_date = :td "
                "WHERE user_id = :uid AND exam_id = :eid AND removed_at IS NULL"
            ),
            {"uid": str(user_id), "eid": exam_id, "td": target},
        )
        return bool(result.rowcount)
