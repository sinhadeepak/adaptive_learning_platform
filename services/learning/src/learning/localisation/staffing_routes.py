"""Reviewer staffing routes (P5-S63).

Operations dashboard primitives for AIM §4.5:

  GET  /localisation/staffing            -> per-language config + queue depth
  GET  /localisation/staffing/{lang}     -> drill-down (queue depth + SLA)
  POST /localisation/staffing/{lang}     -> upsert reviewer count / model

Queue depth + SLA breach count are derived live from
content_artifact_translations; the staffing table is the
operator-facing config (reviewer count, SLA targets).
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker as content_sessionmaker

router = APIRouter(prefix="/localisation/staffing", tags=["staffing"])

CONTENT_SCHEMA = "content_schema"


async def _content_session() -> AsyncSession:
    async with content_sessionmaker()() as s:
        yield s


# ── List + per-language drill-down ─────────────────────────────────────────


class StaffingRow(BaseModel):
    language: str
    reviewer_count: int
    sla_first_review_hours: int
    sla_resolution_hours: int
    cultural_sla_hours: int
    staffing_model: str
    notes: str | None
    # Derived fields (queue depth + SLA stats)
    pending_review_count: int
    cultural_pending_count: int
    breach_count: int  # past 7 days


@router.get("", response_model=list[StaffingRow])
async def list_staffing(
    session: AsyncSession = Depends(_content_session),
) -> list[StaffingRow]:
    """All languages — staffing config + live queue depth."""
    rows = (
        await session.execute(
            text(f"""
                SELECT s.language, s.reviewer_count, s.sla_first_review_hours,
                       s.sla_resolution_hours, s.cultural_sla_hours,
                       s.staffing_model, s.notes,
                       COALESCE(t.pending_count, 0)            AS pending_count,
                       COALESCE(t.cultural_pending_count, 0)   AS cultural_pending_count,
                       COALESCE(t.breach_count, 0)             AS breach_count
                  FROM {CONTENT_SCHEMA}.reviewer_staffing s
                  LEFT JOIN (
                    SELECT language,
                           COUNT(*) FILTER (
                             WHERE status IN ('DRAFT','IN_REVIEW')
                           ) AS pending_count,
                           COUNT(*) FILTER (
                             WHERE jsonb_array_length(cultural_flags) > 0
                               AND (cultural_review_status IS NULL
                                    OR cultural_review_status = 'PENDING')
                           ) AS cultural_pending_count,
                           COUNT(*) FILTER (
                             WHERE status IN ('DRAFT','IN_REVIEW')
                               AND created_at < now() - interval '48 hours'
                           ) AS breach_count
                      FROM {CONTENT_SCHEMA}.content_artifact_translations
                      WHERE created_at >= now() - interval '7 days'
                      GROUP BY language
                  ) t ON t.language = s.language
                 ORDER BY s.language
            """)
        )
    ).mappings().all()
    return [StaffingRow(**r) for r in rows]


@router.get("/{lang}", response_model=StaffingRow)
async def get_one(
    lang: str,
    session: AsyncSession = Depends(_content_session),
) -> StaffingRow:
    rows = (
        await session.execute(
            text(f"""
                SELECT s.language, s.reviewer_count, s.sla_first_review_hours,
                       s.sla_resolution_hours, s.cultural_sla_hours,
                       s.staffing_model, s.notes,
                       COALESCE(p.pending_count, 0) AS pending_count,
                       COALESCE(p.cultural_pending_count, 0) AS cultural_pending_count,
                       COALESCE(p.breach_count, 0) AS breach_count
                  FROM {CONTENT_SCHEMA}.reviewer_staffing s
                  LEFT JOIN (
                    SELECT language,
                           COUNT(*) FILTER (WHERE status IN ('DRAFT','IN_REVIEW')) AS pending_count,
                           COUNT(*) FILTER (
                             WHERE jsonb_array_length(cultural_flags) > 0
                               AND (cultural_review_status IS NULL
                                    OR cultural_review_status = 'PENDING')
                           ) AS cultural_pending_count,
                           COUNT(*) FILTER (
                             WHERE status IN ('DRAFT','IN_REVIEW')
                               AND created_at < now() - interval '48 hours'
                           ) AS breach_count
                      FROM {CONTENT_SCHEMA}.content_artifact_translations
                     WHERE language = :lang
                       AND created_at >= now() - interval '7 days'
                     GROUP BY language
                  ) p ON p.language = s.language
                 WHERE s.language = :lang
            """),
            {"lang": lang},
        )
    ).mappings().all()
    if not rows:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "language_not_configured",
                "message": f"language={lang!r} has no staffing row",
            },
        )
    return StaffingRow(**rows[0])


# ── Upsert ─────────────────────────────────────────────────────────────────


class StaffingUpsert(BaseModel):
    reviewer_count: int = Field(ge=0, le=200)
    sla_first_review_hours: int = Field(ge=1, le=240)
    sla_resolution_hours: int = Field(ge=1, le=480)
    cultural_sla_hours: int = Field(ge=24, le=480)
    staffing_model: Literal[
        "internal_panel", "mix_internal_freelance", "external_agency",
    ]
    notes: str | None = Field(default=None, max_length=1000)


@router.post("/{lang}", response_model=dict)
async def upsert_staffing(
    lang: str,
    body: StaffingUpsert,
    session: AsyncSession = Depends(_content_session),
) -> dict:
    """Admin-only — operations updates per-language staffing config."""
    await session.execute(
        text(f"""
            INSERT INTO {CONTENT_SCHEMA}.reviewer_staffing
              (language, reviewer_count, sla_first_review_hours,
               sla_resolution_hours, cultural_sla_hours,
               staffing_model, notes)
            VALUES (:lang, :rc, :sla1, :sla2, :csla, :model, :notes)
            ON CONFLICT (language) DO UPDATE
              SET reviewer_count          = EXCLUDED.reviewer_count,
                  sla_first_review_hours  = EXCLUDED.sla_first_review_hours,
                  sla_resolution_hours    = EXCLUDED.sla_resolution_hours,
                  cultural_sla_hours      = EXCLUDED.cultural_sla_hours,
                  staffing_model          = EXCLUDED.staffing_model,
                  notes                   = EXCLUDED.notes,
                  updated_at              = now()
        """),
        {
            "lang": lang,
            "rc": body.reviewer_count,
            "sla1": body.sla_first_review_hours,
            "sla2": body.sla_resolution_hours,
            "csla": body.cultural_sla_hours,
            "model": body.staffing_model,
            "notes": body.notes,
        },
    )
    await session.commit()
    return {"language": lang, "status": "upserted"}
