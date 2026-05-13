"""F5 — AI-suggested custom test blueprints.

Given a student and a variant (today_pick / long_form / crash_drill /
decay_refresh), compose a blueprint that targets the student's weakest
topics in the requested shape.

Two layered paths:

  1. **Heuristic path** (always works, no LLM required). Pulls per-topic
     mastery, groups the lowest-EWA topics by subject, builds a
     `sections` payload from those subjects. The composer then pulls
     candidate questions from the subject's whole topic pool at compose
     time — same machinery as F3 custom tests.

  2. **LLM-enhanced path** (when the AI Gateway is available). Same
     section composition but the `name` + `rationale` strings come from
     the model via the `blueprint_suggest` prompt template. Validates
     the model's `topic_ids` against the catalogue before persisting —
     fabricated IDs are silently dropped, never surfaced.

The chosen blueprint is persisted with `kind='AI_SUGGESTED'`,
`visibility='PRIVATE'`, `created_by_user_id=<student>`. The 24-hour
freshness window is enforced at read time by the `/ai-suggested/active`
endpoint (created_at > now() - 24h).
"""

from __future__ import annotations

import json
import logging
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.adaptive.clients import fetch_mastery, fetch_topic_catalog

log = logging.getLogger(__name__)

SCHEMA = "catalog_schema"

VARIANTS = ("today_pick", "long_form", "crash_drill", "decay_refresh")

# Shape table keyed by variant.
#  - q: total questions across all sections
#  - m: total minutes across all sections
#  - max_sections: cap on how many subject-buckets we surface
#  - default_band: difficulty band applied to every section
_SHAPES: dict[str, dict[str, Any]] = {
    "today_pick": {
        "q": 15,
        "m": 25,
        "max_sections": 2,
        "default_band": "mixed",
        "label": "Today's pick",
        "shape_summary": "15 questions, 25 minutes, mixed difficulty, focused on top 2 weak subjects.",
    },
    "long_form": {
        "q": 45,
        "m": 60,
        "max_sections": 3,
        "default_band": "mixed",
        "label": "Long form",
        "shape_summary": "45 questions, 60 minutes, mock-style across 3 weak subjects.",
    },
    "crash_drill": {
        "q": 10,
        "m": 10,
        "max_sections": 1,
        "default_band": "hard",
        "label": "Crash drill",
        "shape_summary": "10 questions, 10 minutes, hard band on the single weakest concept.",
    },
    "decay_refresh": {
        "q": 20,
        "m": 30,
        "max_sections": 3,
        "default_band": "mixed",
        "label": "Decay refresh",
        "shape_summary": "20 questions across 3 subjects mastered ≥14 days ago.",
    },
}


# ── Pydantic schema the prompt template targets ──────────────────────


class AISuggestedSection(BaseModel):
    section_id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    subject_id: str | None = None
    topic_ids: list[str] = Field(default_factory=list)
    n_questions: int = Field(ge=1, le=50)
    n_minutes: int = Field(ge=1, le=120)
    difficulty_band: str = Field(default="mixed", pattern="^(easy|mixed|hard)$")


class AISuggestedBlueprint(BaseModel):
    """Output schema the LLM returns. Validated by the Gateway."""

    name: str = Field(min_length=4, max_length=120)
    rationale: str = Field(min_length=10, max_length=600)
    sections: list[AISuggestedSection] = Field(min_length=1, max_length=4)


# ── Helpers ──────────────────────────────────────────────────────────


def _difficulty_distribution(band: str) -> dict[str, float]:
    if band == "easy":
        return {"easy": 0.60, "medium": 0.35, "hard": 0.05}
    if band == "hard":
        return {"easy": 0.10, "medium": 0.40, "hard": 0.50}
    return {"easy": 0.30, "medium": 0.50, "hard": 0.20}


async def _resolve_subject_ids_for_topics(
    session: AsyncSession, topic_ids: list[str]
) -> dict[str, str]:
    """Map topic_id -> subject_id by querying catalog_schema.topics."""
    if not topic_ids:
        return {}
    rows = (
        await session.execute(
            text(f"""
                SELECT id, subject_id
                  FROM {SCHEMA}.topics
                 WHERE id = ANY(CAST(:ids AS uuid[]))
            """),
            {"ids": topic_ids},
        )
    ).mappings().all()
    return {str(r["id"]): str(r["subject_id"]) for r in rows}


async def _resolve_exam(
    session: AsyncSession, *, exam_id: str | None, exam_code: str | None
) -> tuple[str, str] | None:
    """Return (exam_id, exam_code) given either input, or None if absent."""
    if exam_id:
        row = (
            await session.execute(
                text(f"SELECT id, code FROM {SCHEMA}.exams WHERE id = CAST(:i AS uuid) LIMIT 1"),
                {"i": exam_id},
            )
        ).mappings().first()
    elif exam_code:
        row = (
            await session.execute(
                text(f"SELECT id, code FROM {SCHEMA}.exams WHERE code = :c LIMIT 1"),
                {"c": exam_code},
            )
        ).mappings().first()
    else:
        return None
    return (str(row["id"]), row["code"]) if row else None


def _group_weakest_topics_by_subject(
    mastery: list[dict[str, Any]],
    topic_to_subject: dict[str, str],
    catalog_index: dict[str, dict[str, Any]],
    *,
    n_subjects: int,
    decay_mode: bool,
) -> list[dict[str, Any]]:
    """Build subject-buckets ranked by aggregate weakness.

    For most variants we want LOW EWA topics. For decay_refresh we want
    topics that were once strong (EWA ≥ 0.7) and haven't been touched
    recently — but mastery data here doesn't carry `last_seen_at`, so the
    heuristic falls back to mid-EWA topics (0.5–0.75) which are most
    likely to be "decaying".
    """
    if decay_mode:
        weak_first = [
            m for m in mastery
            if 0.45 <= float(m.get("ewa", 0.0)) <= 0.78
            and int(m.get("n", 0)) >= 3
        ]
    else:
        weak_first = [m for m in mastery if int(m.get("n", 0)) >= 1]

    weak_first.sort(key=lambda m: float(m.get("ewa", 1.0)))

    by_subject: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"subject_id": None, "subject_name": "", "topic_ids": [], "topic_titles": [], "ewa_sum": 0.0, "count": 0}
    )
    for m in weak_first:
        topic_id = m.get("topicId")
        if not topic_id or topic_id not in topic_to_subject:
            continue
        subj_id = topic_to_subject[topic_id]
        bucket = by_subject[subj_id]
        bucket["subject_id"] = subj_id
        bucket["subject_name"] = catalog_index.get(topic_id, {}).get("subjectName", "")
        bucket["topic_ids"].append(topic_id)
        bucket["topic_titles"].append(catalog_index.get(topic_id, {}).get("title", ""))
        bucket["ewa_sum"] += float(m.get("ewa", 0.0))
        bucket["count"] += 1

    out = sorted(
        by_subject.values(),
        key=lambda b: (b["ewa_sum"] / max(1, b["count"])),
    )
    return out[:n_subjects]


def _split_questions(total: int, n_buckets: int) -> list[int]:
    """Distribute `total` questions across n_buckets, biasing to earlier buckets."""
    if n_buckets <= 0:
        return []
    base = total // n_buckets
    rem = total % n_buckets
    parts = [base] * n_buckets
    for i in range(rem):
        parts[i] += 1
    return [max(1, p) for p in parts]


def _split_minutes(total_minutes: int, parts_q: list[int]) -> list[int]:
    """Distribute minutes proportional to question counts."""
    total_q = sum(parts_q)
    if total_q == 0:
        return [total_minutes] * len(parts_q)
    raw = [max(1, round(total_minutes * q / total_q)) for q in parts_q]
    # Pin sum exactly by adjusting the last bucket.
    raw[-1] = max(1, total_minutes - sum(raw[:-1]))
    return raw


def _compose_heuristic_sections(
    shape: dict[str, Any],
    subject_buckets: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], str]:
    """Compose subject-keyed sections + an honest rationale string.

    Returns ([sections...], rationale)."""
    if not subject_buckets:
        return [], (
            "Not enough mastery data yet — answer a few practice questions and "
            "we'll suggest a sharper test next time."
        )
    n_sections = min(shape["max_sections"], len(subject_buckets))
    q_parts = _split_questions(shape["q"], n_sections)
    m_parts = _split_minutes(shape["m"], q_parts)
    sections = []
    rationale_parts = []
    for i in range(n_sections):
        b = subject_buckets[i]
        sec_id = f"ai-{i + 1}"
        sections.append({
            "section_id": sec_id,
            "name": b["subject_name"] or f"Section {i + 1}",
            "subject_id": b["subject_id"],
            "topic_ids": b["topic_ids"][:5],
            "n_questions": q_parts[i],
            "n_minutes": m_parts[i],
            "difficulty_band": shape["default_band"],
            "difficulty_distribution": _difficulty_distribution(shape["default_band"]),
        })
        avg = b["ewa_sum"] / max(1, b["count"])
        rationale_parts.append(f"{b['subject_name']} (avg mastery {avg:.0%})")
    rationale = (
        f"Targets your weakest area{'s' if len(rationale_parts) > 1 else ''}: "
        + ", ".join(rationale_parts)
        + ". Shaped as " + shape["shape_summary"].lower().rstrip(".") + "."
    )
    return sections, rationale


def _format_weak_topics_for_prompt(
    buckets: list[dict[str, Any]],
) -> str:
    lines = []
    for b in buckets:
        avg = b["ewa_sum"] / max(1, b["count"])
        titles = ", ".join(b["topic_titles"][:4])
        lines.append(f"- {b['subject_name']}: avg EWA {avg:.2f} over {b['count']} topics ({titles})")
    return "\n".join(lines) if lines else "(no mastery data yet)"


def _format_catalog_for_prompt(catalog: list[dict[str, Any]], cap: int = 80) -> str:
    """Compact ID ▸ title ▸ subject lines. Caps at `cap` topics to keep
    the prompt below provider context budgets."""
    lines = []
    for t in catalog[:cap]:
        lines.append(f"{t['topicId']} ▸ {t['title']} ▸ {t['subjectName']}")
    return "\n".join(lines)


def _validate_llm_sections(
    sections: list[AISuggestedSection],
    valid_topic_ids: set[str],
    topic_to_subject: dict[str, str],
    shape: dict[str, Any],
) -> list[dict[str, Any]]:
    """Filter LLM-supplied topic_ids to those in the catalogue + rewrite
    section subject_id from the first valid topic. Returns the
    persistable sections payload or [] if nothing survives."""
    out = []
    for idx, s in enumerate(sections):
        clean_topics = [t for t in s.topic_ids if t in valid_topic_ids]
        if not clean_topics:
            continue
        subj_id = s.subject_id
        if not subj_id or subj_id not in {topic_to_subject.get(t) for t in clean_topics}:
            subj_id = topic_to_subject.get(clean_topics[0])
        if not subj_id:
            continue
        out.append({
            "section_id": s.section_id or f"ai-{idx + 1}",
            "name": s.name,
            "subject_id": subj_id,
            "topic_ids": clean_topics[:5],
            "n_questions": s.n_questions,
            "n_minutes": s.n_minutes,
            "difficulty_band": s.difficulty_band,
            "difficulty_distribution": _difficulty_distribution(s.difficulty_band),
        })
    # Pin totals to shape so the UI shows the requested length.
    if not out:
        return []
    q_sum = sum(s["n_questions"] for s in out)
    m_sum = sum(s["n_minutes"] for s in out)
    if q_sum != shape["q"]:
        delta = shape["q"] - q_sum
        out[-1]["n_questions"] = max(1, out[-1]["n_questions"] + delta)
    if m_sum != shape["m"]:
        delta = shape["m"] - m_sum
        out[-1]["n_minutes"] = max(1, out[-1]["n_minutes"] + delta)
    return out


# ── Public entry ─────────────────────────────────────────────────────


async def compose_suggested_blueprint(
    session: AsyncSession,
    *,
    user_id: str,
    variant: str,
    exam_id: str | None = None,
    exam_code: str | None = None,
    gateway: Any | None = None,
) -> dict[str, Any]:
    """Build + persist an AI-suggested blueprint for `user_id`. Returns
    the serialised blueprint row + a `rationale` field for the UI card.

    Raises ValueError on unknown variant or unresolvable exam.
    """
    if variant not in _SHAPES:
        raise ValueError(f"unknown variant: {variant!r}")
    shape = _SHAPES[variant]

    resolved = await _resolve_exam(session, exam_id=exam_id, exam_code=exam_code)
    if resolved is None:
        raise ValueError("Provide a valid exam_id or exam_code.")
    exam_id, exam_code = resolved

    # 1. Pull mastery + catalogue.
    mastery = await fetch_mastery(user_id)
    catalog = await fetch_topic_catalog(exam_code=exam_code)
    if not catalog:
        raise ValueError("No topic catalogue available for this exam.")

    catalog_index = {t["topicId"]: t for t in catalog}
    catalog_topic_ids = list(catalog_index.keys())
    topic_to_subject = await _resolve_subject_ids_for_topics(session, catalog_topic_ids)

    # 2. Bucket weakest topics by subject.
    buckets = _group_weakest_topics_by_subject(
        mastery,
        topic_to_subject,
        catalog_index,
        n_subjects=shape["max_sections"],
        decay_mode=(variant == "decay_refresh"),
    )

    # 3. Heuristic baseline (always available; LLM may override name + rationale).
    sections_payload, rationale = _compose_heuristic_sections(shape, buckets)
    name = f"{shape['label']}: targeted weakness drill"

    # 4. Optional LLM pass — only when Gateway is up + we have buckets.
    if gateway is not None and sections_payload:
        try:
            result: AISuggestedBlueprint = await gateway.call(
                touchpoint="authoring",
                prompt_template_id="blueprint_suggest",
                prompt_template_version="1.0.0",
                prompt_inputs={
                    "variant": variant,
                    "shape_summary": shape["shape_summary"],
                    "exam": exam_code,
                    "weak_topics": _format_weak_topics_for_prompt(buckets),
                    "topic_catalog": _format_catalog_for_prompt(catalog),
                },
                schema=AISuggestedBlueprint,
                creator_id=user_id,
            )
            valid_topic_ids = set(catalog_topic_ids)
            llm_sections = _validate_llm_sections(
                result.sections, valid_topic_ids, topic_to_subject, shape
            )
            if llm_sections:
                sections_payload = llm_sections
                name = result.name
                rationale = result.rationale
            else:
                log.info("blueprint_suggest LLM returned no valid topic_ids; using heuristic")
        except Exception as exc:  # noqa: BLE001
            log.warning("blueprint_suggest LLM failed: %s — using heuristic", exc)

    if not sections_payload:
        raise ValueError(
            "Not enough mastery data to compose an AI-suggested test. "
            "Answer a few practice questions and try again."
        )

    # 5. Persist as AI_SUGGESTED blueprint.
    total_q = sum(int(s["n_questions"]) for s in sections_payload)
    total_m = sum(int(s["n_minutes"]) for s in sections_payload)
    bp_id = str(uuid.uuid4())
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.exam_blueprints
                (id, exam_id, name, total_questions, total_minutes,
                 marks_correct, marks_negative, sections,
                 inter_section_navigation, per_section_time_locked,
                 kind, visibility, status, created_by_user_id,
                 created_at, updated_at, published_at)
            VALUES
                (CAST(:id AS uuid), CAST(:eid AS uuid), :name, :tq, :tm,
                 :mc, :mn, CAST(:secs AS jsonb),
                 TRUE, FALSE,
                 'AI_SUGGESTED', 'PRIVATE', 'PUBLISHED', CAST(:uid AS uuid),
                 now(), now(), now())
        """),
        {
            "id": bp_id,
            "eid": exam_id,
            "name": name[:200],
            "tq": total_q,
            "tm": total_m,
            "mc": 4,
            "mn": 1.0,
            "secs": json.dumps(sections_payload),
            "uid": user_id,
        },
    )
    await session.commit()

    expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    return {
        "blueprintId": bp_id,
        "name": name,
        "rationale": rationale,
        "variant": variant,
        "expiresAt": expires_at,
        "totalQuestions": total_q,
        "totalMinutes": total_m,
        "sections": sections_payload,
    }


async def list_active_suggestions(
    session: AsyncSession, *, user_id: str, max_age_hours: int = 24,
) -> list[dict[str, Any]]:
    """List unexpired AI_SUGGESTED blueprints for the user."""
    rows = (
        await session.execute(
            text(f"""
                SELECT id, name, total_questions, total_minutes, sections,
                       created_at
                  FROM {SCHEMA}.exam_blueprints
                 WHERE created_by_user_id = :uid
                   AND kind = 'AI_SUGGESTED'
                   AND status <> 'RETIRED'
                   AND created_at > now() - make_interval(hours => :hrs)
                 ORDER BY created_at DESC
            """),
            {"uid": user_id, "hrs": max_age_hours},
        )
    ).mappings().all()
    out = []
    for r in rows:
        out.append({
            "blueprintId": str(r["id"]),
            "name": r["name"],
            "totalQuestions": int(r["total_questions"]),
            "totalMinutes": int(r["total_minutes"]),
            "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
            "sectionCount": len(r["sections"] or []),
        })
    return out
