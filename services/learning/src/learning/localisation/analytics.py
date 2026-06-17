"""Translation analytics — per ADR-0019 quality metrics targets.

Pure-function aggregators + DB readers over content_artifact_translations
(S37 schema) + localisation_glossary. Surfaced via /localisation/analytics
for the S48 dashboard.

Six metrics from the plan §"Quality metrics":
  - AI translation acceptance rate (no edits)        target > 70%
  - Edit distance per translation                    lower is better
  - Re-translation rate                              target < 10%
  - Cultural flag rate                               per-language, panel-staffing input
  - Translation lead time                            < 36 h HI p95
  - Glossary hit rate                                growing over time

Ratings + thresholds are surfaced in the response so the UI can render
the quality bar without re-implementing the targets client-side.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, UTC
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CONTENT_SCHEMA = "content_schema"

# Targets from ADR-0019 §"Quality metrics".
ACCEPTANCE_RATE_TARGET = 0.70
RETRANSLATION_RATE_CEILING = 0.10
LEAD_TIME_P95_HOURS = 36


@dataclass
class TranslationAnalyticsRow:
    language: str
    translations_total: int
    translations_published: int
    translations_draft: int
    translations_in_review: int
    avg_ai_confidence: float | None
    acceptance_rate: float | None
    retranslation_rate: float | None
    cultural_flag_rate: float | None
    lead_time_p50_hours: float | None
    lead_time_p95_hours: float | None


def _percentile(values: list[float], pct: float) -> float | None:
    """Naive nearest-rank percentile. pct in [0, 100]."""
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    k = max(0, min(len(s) - 1, int(round((pct / 100.0) * (len(s) - 1)))))
    return s[k]


def _safe_div(num: float, den: float) -> float | None:
    return None if den == 0 else round(num / den, 4)


async def per_language_summary(
    session: AsyncSession,
    *,
    weeks: int = 12,
) -> list[TranslationAnalyticsRow]:
    """One row per language with the 6 metrics + counts.

    Acceptance rate proxy: translations PUBLISHED with ai_confidence ≥
    0.85 (high-confidence AI output that the reviewer didn't downgrade).
    True "no-edits" metric needs the per-field edit_distance on the
    reviewer's commit; lands when the moderation queue audit-log writes
    that. v1 uses confidence-as-proxy.

    Lead time = updated_at - created_at for PUBLISHED rows.

    Re-translation rate = `version > 1` rows / all rows per language.
    """
    cutoff = datetime.now(tz=UTC) - timedelta(weeks=weeks)

    rows = (
        await session.execute(
            text(f"""
                SELECT language,
                       status,
                       version,
                       ai_confidence,
                       created_at,
                       updated_at
                  FROM {CONTENT_SCHEMA}.content_artifact_translations
                 WHERE created_at >= :cutoff
            """),
            {"cutoff": cutoff},
        )
    ).mappings().all()

    by_lang: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        by_lang.setdefault(r["language"], []).append(dict(r))

    out: list[TranslationAnalyticsRow] = []
    for lang, items in sorted(by_lang.items()):
        total = len(items)
        published = sum(1 for r in items if r["status"] == "PUBLISHED")
        draft = sum(1 for r in items if r["status"] == "DRAFT")
        in_review = sum(1 for r in items if r["status"] == "IN_REVIEW")
        confidences = [
            float(r["ai_confidence"])
            for r in items
            if r["ai_confidence"] is not None
        ]
        avg_conf = (
            round(sum(confidences) / len(confidences), 4) if confidences else None
        )

        accepted = sum(
            1 for r in items
            if r["status"] == "PUBLISHED"
            and r["ai_confidence"] is not None
            and float(r["ai_confidence"]) >= 0.85
        )
        acceptance_rate = _safe_div(accepted, max(published, 0))

        retrans_count = sum(1 for r in items if int(r["version"] or 1) > 1)
        retrans_rate = _safe_div(retrans_count, total)

        # Cultural flag rate: not directly captured in the schema; v1
        # reports None until the cultural_flags JSONB column lands. The
        # translator currently surfaces flags on the in-memory draft.
        cultural_flag_rate = None

        lead_hours: list[float] = []
        for r in items:
            if r["status"] != "PUBLISHED":
                continue
            if r["created_at"] is None or r["updated_at"] is None:
                continue
            delta = r["updated_at"] - r["created_at"]
            lead_hours.append(delta.total_seconds() / 3600.0)
        p50 = _percentile(lead_hours, 50)
        p95 = _percentile(lead_hours, 95)

        out.append(
            TranslationAnalyticsRow(
                language=lang,
                translations_total=total,
                translations_published=published,
                translations_draft=draft,
                translations_in_review=in_review,
                avg_ai_confidence=avg_conf,
                acceptance_rate=acceptance_rate,
                retranslation_rate=retrans_rate,
                cultural_flag_rate=cultural_flag_rate,
                lead_time_p50_hours=round(p50, 2) if p50 is not None else None,
                lead_time_p95_hours=round(p95, 2) if p95 is not None else None,
            )
        )
    return out


async def glossary_size_per_lang_pair(
    session: AsyncSession,
) -> list[dict[str, Any]]:
    """Glossary size per (subject, source_lang, target_lang). Hint at
    'glossary growth' velocity; the dashboard pairs this with the
    weekly trend coming from the audit log."""
    rows = (
        await session.execute(
            text(f"""
                SELECT subject, source_lang, target_lang, COUNT(*) AS n
                  FROM {CONTENT_SCHEMA}.localisation_glossary
                 GROUP BY subject, source_lang, target_lang
                 ORDER BY subject, source_lang, target_lang
            """)
        )
    ).mappings().all()
    return [
        {
            "subject": r["subject"],
            "sourceLang": r["source_lang"],
            "targetLang": r["target_lang"],
            "entryCount": int(r["n"]),
        }
        for r in rows
    ]
