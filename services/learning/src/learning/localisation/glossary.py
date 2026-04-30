"""Glossary repository — terminology consistency per (subject, lang pair).

Per ADR-0019. CRUD on `content_schema.localisation_glossary` (S37
schema). 5 categories: platform / subject / exam / locked / cultural.
The translation pipeline injects relevant entries into every Gateway
call so AI translations stay glossary-consistent.
"""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "content_schema"

GlossaryCategory = Literal["platform", "subject", "exam", "locked", "cultural"]


class GlossaryEntryIn(BaseModel):
    """Input shape for upsert."""

    subject: str = Field(min_length=1, max_length=80)
    source_lang: str = Field(min_length=2, max_length=8)
    target_lang: str = Field(min_length=2, max_length=8)
    source_term: str = Field(min_length=1, max_length=200)
    target_term: str = Field(min_length=1, max_length=200)
    category: GlossaryCategory
    case_sensitive: bool = False
    context_hint: str | None = Field(default=None, max_length=500)
    alt_translations: list[str] | None = None


class GlossaryEntry(BaseModel):
    """Persisted shape (read side)."""

    id: str
    subject: str
    source_lang: str
    target_lang: str
    source_term: str
    target_term: str
    category: GlossaryCategory
    case_sensitive: bool = False
    context_hint: str | None = None
    alt_translations: list[str] | None = None


async def upsert_entry(
    session: AsyncSession, entry: GlossaryEntryIn,
    added_by: str | None = None,
) -> str:
    """Insert or update a glossary entry. Returns the entry id."""
    entry_id = str(uuid.uuid4())
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.localisation_glossary
              (id, subject, source_lang, target_lang, source_term, target_term,
               category, case_sensitive, context_hint, alt_translations, added_by)
            VALUES (:id, :sub, :src, :tgt, :sterm, :tterm,
                    :cat, :cs, :hint, :alts, :by)
            ON CONFLICT (subject, source_lang, target_lang, source_term)
            DO UPDATE SET
              target_term       = EXCLUDED.target_term,
              category          = EXCLUDED.category,
              case_sensitive    = EXCLUDED.case_sensitive,
              context_hint      = EXCLUDED.context_hint,
              alt_translations  = EXCLUDED.alt_translations
        """),
        {
            "id": entry_id,
            "sub": entry.subject,
            "src": entry.source_lang,
            "tgt": entry.target_lang,
            "sterm": entry.source_term,
            "tterm": entry.target_term,
            "cat": entry.category,
            "cs": entry.case_sensitive,
            "hint": entry.context_hint,
            "alts": entry.alt_translations,
            "by": added_by,
        },
    )
    return entry_id


async def list_for_lookup(
    session: AsyncSession,
    *,
    subject: str,
    source_lang: str,
    target_lang: str,
    text_to_match: str | None = None,
) -> list[GlossaryEntry]:
    """Return glossary entries relevant to a (subject, lang-pair).

    When `text_to_match` is supplied, filters to entries whose
    `source_term` appears in the text — keeps the AI prompt fragment
    short by skipping irrelevant terms. Case-folded substring match.
    """
    rows = (
        await session.execute(
            text(f"""
                SELECT id, subject, source_lang, target_lang,
                       source_term, target_term, category,
                       case_sensitive, context_hint, alt_translations
                  FROM {SCHEMA}.localisation_glossary
                 WHERE subject = :sub
                   AND source_lang = :src
                   AND target_lang = :tgt
                 ORDER BY category, source_term
            """),
            {"sub": subject, "src": source_lang, "tgt": target_lang},
        )
    ).mappings().all()

    out: list[GlossaryEntry] = []
    for r in rows:
        e = GlossaryEntry(
            id=str(r["id"]),
            subject=r["subject"],
            source_lang=r["source_lang"],
            target_lang=r["target_lang"],
            source_term=r["source_term"],
            target_term=r["target_term"],
            category=r["category"],
            case_sensitive=r["case_sensitive"],
            context_hint=r["context_hint"],
            alt_translations=r["alt_translations"],
        )
        if text_to_match is None:
            out.append(e)
            continue
        # Case-folded substring match for relevance filter.
        if e.source_term.lower() in text_to_match.lower():
            out.append(e)
    return out
