"""Language registry repo — single source of truth for which languages
exist and which are translatable targets. Replaces the hardcoded
SUPPORTED_LANGS list (P5-S43)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CONTENT_SCHEMA = "content_schema"


def _to_dict(r: Any) -> dict[str, Any]:
    return {
        "code": r["code"],
        "name": r["name"],
        "nativeName": r["native_name"],
        "script": r["script"],
        "enabled": r["enabled"],
        "isSource": r["is_source"],
        "sortOrder": r["sort_order"],
    }


async def list_languages(session: AsyncSession, *, include_disabled: bool = False) -> list[dict]:
    where = "" if include_disabled else "WHERE enabled = TRUE"
    rows = (await session.execute(text(f"""
        SELECT code, name, native_name, script, enabled, is_source, sort_order
          FROM {CONTENT_SCHEMA}.supported_languages
          {where}
         ORDER BY sort_order, code
    """))).mappings().all()
    return [_to_dict(r) for r in rows]


async def get_language(session: AsyncSession, code: str) -> dict | None:
    rows = (await session.execute(text(f"""
        SELECT code, name, native_name, script, enabled, is_source, sort_order
          FROM {CONTENT_SCHEMA}.supported_languages WHERE code = :c
    """), {"c": code})).mappings().all()
    return _to_dict(rows[0]) if rows else None


async def upsert_language(
    session: AsyncSession, *, code: str, name: str, native_name: str,
    script: str | None = None, enabled: bool = True, sort_order: int = 100,
) -> None:
    await session.execute(text(f"""
        INSERT INTO {CONTENT_SCHEMA}.supported_languages
          (code, name, native_name, script, enabled, is_source, sort_order, updated_at)
        VALUES (:code, :name, :native, :script, :enabled, FALSE, :sort, now())
        ON CONFLICT (code) DO UPDATE
          SET name = EXCLUDED.name, native_name = EXCLUDED.native_name,
              script = EXCLUDED.script, enabled = EXCLUDED.enabled,
              sort_order = EXCLUDED.sort_order, updated_at = now()
    """), {"code": code, "name": name, "native": native_name,
           "script": script, "enabled": enabled, "sort": sort_order})


async def set_enabled(session: AsyncSession, *, code: str, enabled: bool) -> bool:
    res = await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.supported_languages
           SET enabled = :en, updated_at = now()
         WHERE code = :c
    """), {"en": enabled, "c": code})
    return res.rowcount > 0


async def enabled_target_codes(session: AsyncSession) -> set[str]:
    rows = (await session.execute(text(f"""
        SELECT code FROM {CONTENT_SCHEMA}.supported_languages
         WHERE enabled = TRUE AND is_source = FALSE
    """))).mappings().all()
    return {r["code"] for r in rows}
