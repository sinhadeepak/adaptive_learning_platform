"""Data access for institution_schema flag tables."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class FlagRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def list_flags(self) -> list[dict[str, Any]]:
        rows = (
            await self.s.execute(
                text(
                    "SELECT f.name, f.description, f.default_value, f.danger_critical, f.owner, "
                    "       f.blast_radius, f.updated_at, "
                    "       (SELECT COUNT(*) FROM institution_schema.feature_flag_overrides o "
                    "        WHERE o.flag_name = f.name) AS override_count "
                    "FROM institution_schema.feature_flags f ORDER BY f.name"
                )
            )
        ).mappings().all()
        return [dict(r) for r in rows]

    async def get_flag(self, name: str) -> dict[str, Any] | None:
        row = (
            await self.s.execute(
                text(
                    "SELECT f.name, f.description, f.default_value, f.danger_critical, f.owner, "
                    "       f.blast_radius, f.updated_at "
                    "FROM institution_schema.feature_flags f WHERE f.name = :n"
                ),
                {"n": name},
            )
        ).mappings().first()
        return dict(row) if row else None

    async def overrides_for(self, flag_name: str) -> list[dict[str, Any]]:
        rows = (
            await self.s.execute(
                text(
                    "SELECT tenant_id, value, set_by_user_id, set_at "
                    "FROM institution_schema.feature_flag_overrides "
                    "WHERE flag_name = :n ORDER BY set_at DESC"
                ),
                {"n": flag_name},
            )
        ).mappings().all()
        return [dict(r) for r in rows]

    async def audit_for(self, flag_name: str, limit: int = 100) -> list[dict[str, Any]]:
        rows = (
            await self.s.execute(
                text(
                    "SELECT ts, flag_name, scope, tenant_id, old_value, new_value, actor_user_id, rationale "
                    "FROM institution_schema.feature_flag_audit "
                    "WHERE flag_name = :n ORDER BY ts DESC LIMIT :lim"
                ),
                {"n": flag_name, "lim": limit},
            )
        ).mappings().all()
        return [dict(r) for r in rows]

    async def set_default(
        self,
        *,
        name: str,
        value: bool,
        actor_user_id: str | None,
        rationale: str | None,
    ) -> tuple[dict[str, Any] | None, bool | None]:
        """Returns (updated_flag_or_None, old_value_or_None) so the caller can publish to NATS."""
        existing = await self.get_flag(name)
        if existing is None:
            return None, None
        old_value: bool = existing["default_value"]
        await self.s.execute(
            text(
                "UPDATE institution_schema.feature_flags "
                "SET default_value = :v, updated_at = NOW() WHERE name = :n"
            ),
            {"n": name, "v": value},
        )
        await self.s.execute(
            text(
                "INSERT INTO institution_schema.feature_flag_audit "
                "(flag_name, scope, old_value, new_value, actor_user_id, rationale) "
                "VALUES (:n, 'GLOBAL', :ov, :nv, :actor, :rationale)"
            ),
            {"n": name, "ov": old_value, "nv": value, "actor": actor_user_id, "rationale": rationale},
        )
        return await self.get_flag(name), old_value

    async def set_override(
        self,
        *,
        flag_name: str,
        tenant_id: str,
        value: bool,
        actor_user_id: str | None,
        rationale: str | None,
    ) -> tuple[bool, bool | None]:
        """Returns (success, old_override_value_or_None)."""
        flag = await self.get_flag(flag_name)
        if flag is None:
            return False, None
        # Get old override value if any.
        old_row = (
            await self.s.execute(
                text(
                    "SELECT value FROM institution_schema.feature_flag_overrides "
                    "WHERE flag_name = :n AND tenant_id = :t"
                ),
                {"n": flag_name, "t": tenant_id},
            )
        ).mappings().first()
        old_value = old_row["value"] if old_row else None

        await self.s.execute(
            text(
                "INSERT INTO institution_schema.feature_flag_overrides "
                "(flag_name, tenant_id, value, set_by_user_id, rationale) "
                "VALUES (:n, :t, :v, :u, :r) "
                "ON CONFLICT (flag_name, tenant_id) DO UPDATE SET "
                "value = EXCLUDED.value, set_by_user_id = EXCLUDED.set_by_user_id, "
                "rationale = EXCLUDED.rationale, set_at = NOW()"
            ),
            {
                "n": flag_name,
                "t": tenant_id,
                "v": value,
                "u": actor_user_id,
                "r": rationale,
            },
        )
        await self.s.execute(
            text(
                "INSERT INTO institution_schema.feature_flag_audit "
                "(flag_name, scope, tenant_id, old_value, new_value, actor_user_id, rationale) "
                "VALUES (:n, 'TENANT', :t, :ov, :nv, :actor, :rationale)"
            ),
            {
                "n": flag_name,
                "t": tenant_id,
                "ov": old_value,
                "nv": value,
                "actor": actor_user_id,
                "rationale": rationale,
            },
        )
        return True, old_value
