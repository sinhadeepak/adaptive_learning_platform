"""LLM tagger — turns DRAFT past-paper questions into TAGGED rows.

For each DRAFT paper:
  1. Fetch the catalog's topic + concept tables for this exam.
  2. For every question in the paper, call the `past_paper_tag`
     prompt via the AI Gateway with the question + catalog snippet.
  3. Validate the LLM output against the `PastPaperTag` schema —
     the Gateway already enforces this, we additionally drop any
     topic_id / concept_id the model fabricated that isn't in the
     catalog.
  4. Write the cleaned tag dict into `nlp_tags` and copy the IRT
     difficulty estimate into `irt_b_estimate`.
  5. Flip paper status DRAFT → TAGGED so the content team's
     review queue picks it up.

Per ADR-0019 every LLM call carries explicit prompt_template_id +
version. The content team's review converts `nlp_tags` to
`curated_tags` once they approve.

Cost characteristics: typical past paper is ~30 questions; one
LLM call per question; at ~2k input + 200 output tokens × $0.25/$1.25
per Mtok (gpt-4o-mini) that's ~$0.05 per question = ~$1.50 per paper.
A 10-year exam onboarding (10 papers) costs ~$15.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.ai_gateway import AIGateway
from learning.exam_intel.schemas import PastPaperTag

log = logging.getLogger(__name__)

SCHEMA = "exam_intelligence_schema"

# Max questions to tag in one paper before bailing — avoids runaway
# spend on a malformed upload. Bumped via env if real papers exceed.
MAX_QUESTIONS_PER_PAPER = 200


async def tag_paper(
    session: AsyncSession,
    gateway: AIGateway,
    paper_id: str,
) -> dict[str, Any]:
    """Tag every question in a single paper. Returns a summary
    dict (count tagged, count failed, total cost estimate)."""
    paper = (
        await session.execute(
            text(f"""
                SELECT id, exam_id, status, n_questions
                  FROM {SCHEMA}.exam_past_papers
                 WHERE id = CAST(:pid AS uuid)
            """),
            {"pid": paper_id},
        )
    ).mappings().first()
    if paper is None:
        return {"error": "paper_not_found", "paperId": paper_id}
    if paper["status"] not in {"DRAFT", "TAGGED"}:
        # Allow re-tag only on DRAFT / TAGGED — once REVIEWED the
        # content team has signed off and we must not overwrite.
        return {
            "error": "wrong_status",
            "status": paper["status"],
            "paperId": paper_id,
        }

    # Pull the topic + concept catalogue for this exam in one go so
    # the prompt has the full vocabulary to choose from.
    topic_catalog = await _fetch_topic_catalog(session, str(paper["exam_id"]))
    concept_catalog = await _fetch_concept_catalog(session, str(paper["exam_id"]))
    if not topic_catalog:
        return {"error": "empty_topic_catalog", "examId": str(paper["exam_id"])}

    valid_topic_ids = {t["id"] for t in topic_catalog}
    valid_concept_ids = {c["id"] for c in concept_catalog}

    # Pull every untagged question (curated_tags = null AND nlp_tags = null),
    # OR re-tag everything if status == DRAFT.
    questions = (
        await session.execute(
            text(f"""
                SELECT id, item_idx, stem, choices, correct_answer, question_type
                  FROM {SCHEMA}.exam_past_questions
                 WHERE paper_id = CAST(:pid AS uuid)
                   AND curated_tags IS NULL
                 ORDER BY item_idx
                 LIMIT :lim
            """),
            {"pid": paper_id, "lim": MAX_QUESTIONS_PER_PAPER},
        )
    ).mappings().all()

    topic_catalog_str = "\n".join(
        f"{t['id']} ▸ {t['title']}" for t in topic_catalog[:200]
    )
    concept_catalog_str = "\n".join(
        f"{c['id']} ▸ {c['title']} ▸ {c['topic_id']}"
        for c in concept_catalog[:400]
    )

    n_tagged = 0
    n_failed = 0
    failures: list[dict[str, Any]] = []

    for q in questions:
        try:
            tag = await _tag_question(
                gateway=gateway,
                exam=str(paper["exam_id"]),
                stem=q["stem"],
                choices=q["choices"],
                correct_answer=q["correct_answer"],
                topic_catalog_str=topic_catalog_str,
                concept_catalog_str=concept_catalog_str,
            )
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "tagger.failed",
                extra={
                    "paper_id": paper_id,
                    "item_idx": q["item_idx"],
                    "error": str(exc),
                },
            )
            n_failed += 1
            failures.append({"itemIdx": q["item_idx"], "error": str(exc)})
            continue

        # Defensive: drop any topic_ids / concept_ids the model
        # fabricated that aren't in the live catalogue. A clean tag
        # with zero topics is dropped; the question stays DRAFT-like
        # (curated_tags=null) so a human can intervene.
        clean_topic_ids = [t for t in tag.topic_ids if t in valid_topic_ids]
        clean_concept_ids = [c for c in tag.concept_ids if c in valid_concept_ids]
        if not clean_topic_ids:
            n_failed += 1
            failures.append({
                "itemIdx": q["item_idx"],
                "error": "no_valid_topic_ids",
                "raw": tag.topic_ids,
            })
            continue

        tag_payload = {
            "topic_ids": clean_topic_ids,
            "concept_ids": clean_concept_ids,
            "bloom_level": tag.bloom_level,
            "difficulty_estimate": tag.difficulty_estimate,
            "question_type": tag.question_type,
            "rationale": tag.rationale,
            "confidence": tag.confidence,
        }
        await session.execute(
            text(f"""
                UPDATE {SCHEMA}.exam_past_questions
                   SET nlp_tags = CAST(:tags AS jsonb),
                       irt_b_estimate = :b,
                       question_type = :qt,
                       updated_at = now()
                 WHERE id = CAST(:qid AS uuid)
            """),
            {
                "tags": json.dumps(tag_payload),
                "b": tag.difficulty_estimate,
                "qt": tag.question_type,
                "qid": str(q["id"]),
            },
        )
        n_tagged += 1

    # Flip status to TAGGED when at least half the questions tagged
    # successfully. Otherwise stay DRAFT so the content team can
    # investigate.
    new_status = paper["status"]
    if n_tagged > 0 and n_tagged >= (paper["n_questions"] / 2):
        new_status = "TAGGED"
        await session.execute(
            text(f"""
                UPDATE {SCHEMA}.exam_past_papers
                   SET status = 'TAGGED'
                 WHERE id = CAST(:pid AS uuid)
            """),
            {"pid": paper_id},
        )

    return {
        "paperId": paper_id,
        "tagged": n_tagged,
        "failed": n_failed,
        "skipped": len(questions) - n_tagged - n_failed,
        "newStatus": new_status,
        "failures": failures[:10],  # cap to keep response small
    }


async def tag_all_drafts(
    session: AsyncSession, gateway: AIGateway, exam_id: str
) -> dict[str, Any]:
    """Convenience: tag every DRAFT paper for an exam in one call.
    Useful during the onboarding sweep for a new exam."""
    rows = (
        await session.execute(
            text(f"""
                SELECT id FROM {SCHEMA}.exam_past_papers
                 WHERE exam_id = CAST(:eid AS uuid)
                   AND status = 'DRAFT'
                 ORDER BY year ASC
            """),
            {"eid": exam_id},
        )
    ).mappings().all()

    summaries = []
    for r in rows:
        summary = await tag_paper(session, gateway, str(r["id"]))
        summaries.append(summary)
    return {"examId": exam_id, "papersProcessed": len(summaries), "summaries": summaries}


# ── Internal helpers ────────────────────────────────────────────────


async def _tag_question(
    *,
    gateway: AIGateway,
    exam: str,
    stem: str,
    choices: Any,
    correct_answer: str | None,
    topic_catalog_str: str,
    concept_catalog_str: str,
) -> PastPaperTag:
    """One LLM call per question. Returns validated PastPaperTag."""
    choices_str = ""
    if choices:
        if isinstance(choices, list):
            choices_str = "\n".join(
                f"{chr(65 + i)}. {c}" for i, c in enumerate(choices)
            )
        else:
            choices_str = str(choices)
    return await gateway.call(
        touchpoint="authoring",
        prompt_template_id="past_paper_tag",
        prompt_template_version="1.0.0",
        prompt_inputs={
            "exam": exam,
            "stem": stem,
            "choices": choices_str,
            "correct_answer": correct_answer or "",
            "topic_catalog": topic_catalog_str,
            "concept_catalog": concept_catalog_str,
        },
        schema=PastPaperTag,
    )


async def _fetch_topic_catalog(
    session: AsyncSession, exam_id: str
) -> list[dict[str, str]]:
    """Pull every published topic under this exam from the catalog
    schema. Each row is {id, title}."""
    rows = (
        await session.execute(
            text("""
                SELECT t.id, t.title
                  FROM catalog_schema.topics t
                  JOIN catalog_schema.subjects s ON s.id = t.subject_id
                 WHERE s.exam_id = CAST(:eid AS uuid)
                   AND t.is_published = TRUE
                 ORDER BY s.name, t.title
            """),
            {"eid": exam_id},
        )
    ).mappings().all()
    return [{"id": str(r["id"]), "title": r["title"]} for r in rows]


async def _fetch_concept_catalog(
    session: AsyncSession, exam_id: str
) -> list[dict[str, str]]:
    """Pull every published concept under this exam, each tagged with
    its parent topic_id."""
    rows = (
        await session.execute(
            text("""
                SELECT c.id, c.title, c.topic_id
                  FROM catalog_schema.concepts c
                  JOIN catalog_schema.topics t ON t.id = c.topic_id
                  JOIN catalog_schema.subjects s ON s.id = t.subject_id
                 WHERE s.exam_id = CAST(:eid AS uuid)
                ORDER BY c.title
            """),
            {"eid": exam_id},
        )
    ).mappings().all()
    return [
        {"id": str(r["id"]), "title": r["title"], "topic_id": str(r["topic_id"])}
        for r in rows
    ]
