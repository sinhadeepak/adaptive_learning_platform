"""Hybrid topic-importance compute.

Algorithm (per exam, bulk):
  1. Read every override from `catalog_schema.topic_importance_overrides`.
  2. Compute PYQ-derived weights via `chapter_frequency()`. Sum across
     years per topic; normalise. Confidence scaled by years observed.
  3. For exam-syllabus topics absent from PYQ data, fall back to
     `exam_blueprints.sections` JSONB section-share / topics-in-section.
  4. Final fallback: uniform 1/N. Confidence=0.2.
  5. Apply overrides last — replace weight + hidden flag, source=
     `override`. Do NOT re-normalise: overrides are explicit signals.

Cache: per-process, TTL 24h. `invalidate_cache(exam_id)` busts on
admin override write. Promote to Redis when horizontal scale matters.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ImportanceSource = Literal["override", "pyq", "blueprint", "uniform"]


@dataclass(frozen=True)
class ImportanceWeight:
    weight: float           # [0, 1]
    hidden: bool            # admin can hide a topic without zero-weighting
    source: ImportanceSource
    confidence: float       # [0, 1] — UI surface for "trust this number"
    sample_size: int        # PYQ count or N topics in fallback


_TTL_SECONDS = 24 * 60 * 60
_cache: dict[str, tuple[float, dict[str, ImportanceWeight]]] = {}


def invalidate_cache(exam_id: str) -> None:
    _cache.pop(str(exam_id), None)


async def topic_importance_map(
    session: AsyncSession, exam_id: str
) -> dict[str, ImportanceWeight]:
    """Bulk weights for every topic in an exam's syllabus."""
    cached = _cache.get(str(exam_id))
    now = time.time()
    if cached and (now - cached[0]) < _TTL_SECONDS:
        return cached[1]

    syllabus_topics = await _exam_syllabus_topics(session, exam_id)
    if not syllabus_topics:
        result: dict[str, ImportanceWeight] = {}
        _cache[str(exam_id)] = (now, result)
        return result

    overrides = await _load_overrides(session, exam_id)
    pyq_counts = await _pyq_counts_by_topic(session, exam_id)
    pyq_years = await _pyq_year_breadth(session, exam_id)
    section_shares = await _blueprint_section_shares(session, exam_id)

    n_topics = len(syllabus_topics)
    total_pyq = sum(pyq_counts.values())

    result = {}
    for topic_id, subject_id in syllabus_topics.items():
        if total_pyq > 0 and topic_id in pyq_counts:
            weight = pyq_counts[topic_id] / total_pyq
            sample = pyq_counts[topic_id]
            years = pyq_years.get(topic_id, 1)
            confidence = min(1.0, years / 5.0)
            result[topic_id] = ImportanceWeight(
                weight=round(weight, 4),
                hidden=False,
                source="pyq",
                confidence=round(confidence, 2),
                sample_size=sample,
            )
        elif subject_id in section_shares:
            section = section_shares[subject_id]
            n_topics_in_section = max(1, section["n_topics_in_section"])
            weight = section["share"] / n_topics_in_section
            result[topic_id] = ImportanceWeight(
                weight=round(weight, 4),
                hidden=False,
                source="blueprint",
                confidence=0.6,
                sample_size=section["n_questions"],
            )
        else:
            result[topic_id] = ImportanceWeight(
                weight=round(1.0 / n_topics, 4),
                hidden=False,
                source="uniform",
                confidence=0.2,
                sample_size=n_topics,
            )

    # Apply overrides last — replace, don't re-normalise.
    for topic_id, ov in overrides.items():
        result[topic_id] = ImportanceWeight(
            weight=round(ov["weight"], 4),
            hidden=ov["hidden"],
            source="override",
            confidence=1.0,
            sample_size=0,
        )

    _cache[str(exam_id)] = (now, result)
    return result


async def topic_importance(
    session: AsyncSession, exam_id: str, topic_id: str
) -> ImportanceWeight | None:
    m = await topic_importance_map(session, exam_id)
    return m.get(str(topic_id))


# ── Internal helpers ────────────────────────────────────────────────────


async def _exam_syllabus_topics(
    session: AsyncSession, exam_id: str
) -> dict[str, str]:
    """Returns {topic_id: subject_id} for every topic in the exam."""
    rows = (
        await session.execute(
            text(
                """
                SELECT t.id::text AS topic_id, s.id::text AS subject_id
                  FROM catalog_schema.topics t
                  JOIN catalog_schema.subjects s ON s.id = t.subject_id
                 WHERE s.exam_id = :eid
                """
            ),
            {"eid": exam_id},
        )
    ).all()
    return {r[0]: r[1] for r in rows}


async def _load_overrides(
    session: AsyncSession, exam_id: str
) -> dict[str, dict]:
    rows = (
        await session.execute(
            text(
                """
                SELECT topic_id::text, weight, hidden, reason
                  FROM catalog_schema.topic_importance_overrides
                 WHERE exam_id = :eid
                """
            ),
            {"eid": exam_id},
        )
    ).mappings().all()
    return {r["topic_id"]: dict(r) for r in rows}


async def _pyq_counts_by_topic(
    session: AsyncSession, exam_id: str
) -> dict[str, int]:
    """Total PYQ count per topic_id (summed across years)."""
    rows = (
        await session.execute(
            text(
                """
                SELECT t.id::text AS topic_id, COUNT(*)::int AS n
                  FROM content_schema.questions q
                  JOIN catalog_schema.topics t ON t.id = q.topic_id
                  JOIN catalog_schema.subjects s ON s.id = t.subject_id
                 WHERE s.exam_id = :eid
                   AND q.pyq_flag = TRUE
                   AND q.status = 'PUBLISHED'
                 GROUP BY t.id
                """
            ),
            {"eid": exam_id},
        )
    ).all()
    return {r[0]: r[1] for r in rows}


async def _pyq_year_breadth(
    session: AsyncSession, exam_id: str
) -> dict[str, int]:
    """Distinct PYQ years per topic — drives the confidence score."""
    rows = (
        await session.execute(
            text(
                """
                SELECT t.id::text AS topic_id, COUNT(DISTINCT q.exam_year)::int AS n_years
                  FROM content_schema.questions q
                  JOIN catalog_schema.topics t ON t.id = q.topic_id
                  JOIN catalog_schema.subjects s ON s.id = t.subject_id
                 WHERE s.exam_id = :eid
                   AND q.pyq_flag = TRUE
                   AND q.exam_year IS NOT NULL
                   AND q.status = 'PUBLISHED'
                 GROUP BY t.id
                """
            ),
            {"eid": exam_id},
        )
    ).all()
    return {r[0]: r[1] for r in rows}


async def _blueprint_section_shares(
    session: AsyncSession, exam_id: str
) -> dict[str, dict]:
    """Per-subject blueprint share. {subject_id: {share, n_questions, n_topics_in_section}}."""
    bps = (
        await session.execute(
            text(
                """
                SELECT total_questions, sections
                  FROM catalog_schema.exam_blueprints
                 WHERE exam_id = :eid
                 ORDER BY created_at ASC
                 LIMIT 1
                """
            ),
            {"eid": exam_id},
        )
    ).mappings().first()

    if not bps or not bps["sections"]:
        return {}

    total = bps["total_questions"] or sum(
        s.get("n_questions", 0) for s in bps["sections"]
    )
    if total <= 0:
        return {}

    # Topics per subject — needed to divide section share evenly.
    topic_counts = (
        await session.execute(
            text(
                """
                SELECT s.id::text AS subject_id, COUNT(t.id)::int AS n_topics
                  FROM catalog_schema.subjects s
                  LEFT JOIN catalog_schema.topics t ON t.subject_id = s.id
                 WHERE s.exam_id = :eid
                 GROUP BY s.id
                """
            ),
            {"eid": exam_id},
        )
    ).all()
    topics_per_subject = {r[0]: r[1] for r in topic_counts}

    shares: dict[str, dict] = {}
    for sec in bps["sections"]:
        sub_id = sec.get("subject_id")
        if not sub_id:
            continue
        n_q = int(sec.get("n_questions", 0))
        if n_q <= 0:
            continue
        shares[str(sub_id)] = {
            "share": n_q / total,
            "n_questions": n_q,
            "n_topics_in_section": topics_per_subject.get(str(sub_id), 1),
        }
    return shares
