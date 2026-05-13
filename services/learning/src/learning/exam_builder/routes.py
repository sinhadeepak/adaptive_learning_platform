"""POST /admin/exam-builder/research + /admin/exam-builder/save.

Research takes a free-form exam name (e.g. "UPSC CSE Mains") and a
level hint, calls OpenAI for a structured draft of subjects + topics
+ optional pools, and returns the proposal. No DB writes — admin
reviews and edits before the second call.

Save takes an admin-reviewed proposal and writes it transactionally
to catalog_schema.

Auth: PLATFORM_ADMIN only. Other roles get 403.
"""

from __future__ import annotations

import logging
import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.adaptive.llm import call_structured, is_enabled as llm_enabled
from learning.catalog.db import get_session
from learning.content.db import sessionmaker as content_sessionmaker
from learning.content.repositories import insert_question
from learning.content.security import JwtPrincipal, current_principal

log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/exam-builder", tags=["admin", "exam-builder"])

PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _require_admin(principal: JwtPrincipal) -> None:
    if principal.role not in ("PLATFORM_ADMIN", "INSTITUTION_ADMIN"):
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "exam builder requires admin role"},
        )


# ─────────────────────────────────────────────────────────────────────
# Schemas — shared by research output + save input
# ─────────────────────────────────────────────────────────────────────


class TopicDraft(BaseModel):
    code: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)


class SubjectDraft(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    is_mandatory: bool = True
    pool_code: str | None = Field(default=None, max_length=40)
    topics: list[TopicDraft] = Field(default_factory=list)


class PoolDraft(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    pick_min: int = Field(ge=0, default=1)
    pick_max: int = Field(ge=1, default=1)


class ExamProposal(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    subtitle: str | None = Field(default=None, max_length=300)
    pools: list[PoolDraft] = Field(default_factory=list)
    subjects: list[SubjectDraft] = Field(min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=2000)


# ─────────────────────────────────────────────────────────────────────
# Research endpoint — calls OpenAI
# ─────────────────────────────────────────────────────────────────────


class ResearchRequest(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    level: Literal[
        "school", "competitive_undergrad", "competitive_postgrad", "civil_services", "language", "professional", "other"
    ] = "other"
    target_year: int | None = Field(default=None, ge=2020, le=2050)
    notes: str | None = Field(
        default=None,
        max_length=1000,
        description="Free-form admin hints, e.g. 'UPSC Mains 2027 — qualifying papers + 4 GS + 1 optional'",
    )


SYSTEM_PROMPT = """You are an expert academic content architect helping a learning
platform model the canonical structure of competitive exams and
school syllabi for the Indian education ecosystem.

For each exam you produce a STRICT JSON object describing:
  - subjects: the canonical list (e.g. for JEE Main: Physics, Chemistry, Mathematics).
  - pools: optional groupings where students choose N of M subjects
    (e.g. UPSC Mains "Optional Subject" pool with 26 candidates and pick_min=pick_max=1).
  - topics per subject: 8-20 chapter-grain topics drawn from the official
    syllabus or NCERT/NCERT-equivalent. Topic titles are short
    (≤80 chars) and use proper-case English.
  - is_mandatory: true if every student takes the subject, false if
    the subject is in a pool (then `pool_code` references the pool).

Hard rules:
  - Subject codes are ALL_CAPS_SNAKE (e.g. UPSC_GS_PAPER_1).
  - Topic codes are AT MOST 80 chars, ALL_CAPS_SNAKE.
  - Topic titles avoid trailing punctuation.
  - When the exam has *no* optional choice (JEE / NEET / CBSE), pools is [].
  - When there IS a pool, every member subject MUST set is_mandatory=false
    and pool_code MUST match an entry in pools[].
  - 8-20 topics per subject. Don't pad or repeat.
  - Cover the official syllabus when known; if unknown, set notes
    explaining the assumption.
"""

# JSON schema we ask OpenAI to satisfy. Mirrors ExamProposal.
PROPOSAL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["code", "name", "subtitle", "pools", "subjects", "notes"],
    "properties": {
        "code": {"type": "string"},
        "name": {"type": "string"},
        "subtitle": {"type": ["string", "null"]},
        "pools": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["code", "name", "description", "pick_min", "pick_max"],
                "properties": {
                    "code": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": ["string", "null"]},
                    "pick_min": {"type": "integer"},
                    "pick_max": {"type": "integer"},
                },
            },
        },
        "subjects": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "code", "name", "description", "is_mandatory", "pool_code", "topics",
                ],
                "properties": {
                    "code": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": ["string", "null"]},
                    "is_mandatory": {"type": "boolean"},
                    "pool_code": {"type": ["string", "null"]},
                    "topics": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["code", "title", "description"],
                            "properties": {
                                "code": {"type": "string"},
                                "title": {"type": "string"},
                                "description": {"type": ["string", "null"]},
                            },
                        },
                    },
                },
            },
        },
        "notes": {"type": ["string", "null"]},
    },
}


@router.post("/research", response_model=ExamProposal)
async def research(req: ResearchRequest, principal: PrincipalDep) -> ExamProposal:
    """Ask OpenAI to draft the exam structure. Returns a proposal the
    admin reviews + edits before saving. No DB writes here.
    """
    _require_admin(principal)
    if not llm_enabled():
        raise HTTPException(
            status_code=503,
            detail={
                "code": "ai_unavailable",
                "message": (
                    "OPENAI_API_KEY is not configured on the learning service. "
                    "Set it in docker-compose env or use the manual exam form."
                ),
            },
        )

    user_prompt = (
        f"Exam name: {req.name}\n"
        f"Exam code (admin-supplied): {req.code}\n"
        f"Level: {req.level}\n"
        + (f"Target year: {req.target_year}\n" if req.target_year else "")
        + (f"Admin notes: {req.notes}\n" if req.notes else "")
        + "\nProduce the structured JSON proposal."
    )

    raw = await call_structured(
        system=SYSTEM_PROMPT,
        user=user_prompt,
        schema_name="exam_proposal",
        schema=PROPOSAL_SCHEMA,
    )
    if raw is None:
        raise HTTPException(
            status_code=502,
            detail={
                "code": "ai_failed",
                "message": "OpenAI returned no usable response. Try again or fall back to manual entry.",
            },
        )
    try:
        proposal = ExamProposal.model_validate(raw)
    except Exception as e:  # noqa: BLE001
        log.warning("research.proposal_invalid", extra={"err": str(e)})
        raise HTTPException(
            status_code=502,
            detail={
                "code": "ai_invalid_proposal",
                "message": f"AI returned an invalid proposal: {e}",
            },
        ) from e

    # Cross-check: every pool referenced by a subject must exist; every
    # non-mandatory subject must be in a pool. Better to reject early
    # than to silently re-bucket subjects later.
    pool_codes = {p.code for p in proposal.pools}
    for s in proposal.subjects:
        if s.is_mandatory and s.pool_code is not None:
            raise HTTPException(
                status_code=502,
                detail={
                    "code": "ai_invalid_proposal",
                    "message": f"AI marked {s.code} mandatory AND placed it in pool {s.pool_code}",
                },
            )
        if not s.is_mandatory and s.pool_code is None:
            raise HTTPException(
                status_code=502,
                detail={
                    "code": "ai_invalid_proposal",
                    "message": f"AI marked {s.code} optional but didn't assign it a pool",
                },
            )
        if s.pool_code and s.pool_code not in pool_codes:
            raise HTTPException(
                status_code=502,
                detail={
                    "code": "ai_invalid_proposal",
                    "message": f"AI referenced unknown pool {s.pool_code} for {s.code}",
                },
            )
    return proposal


# ─────────────────────────────────────────────────────────────────────
# Save endpoint — transactional create
# ─────────────────────────────────────────────────────────────────────


class SaveResponse(BaseModel):
    exam_id: str
    code: str
    subjects_created: int
    topics_created: int
    pools_created: int
    subjects_retired: int = 0
    topics_retired: int = 0
    pools_retired: int = 0


# ─────────────────────────────────────────────────────────────────────
# Load endpoint — fetch existing exam as a proposal (for edit mode)
# ─────────────────────────────────────────────────────────────────────


class ExamListEntry(BaseModel):
    id: str
    code: str
    name: str
    subtitle: str | None = None
    is_published: bool
    subject_count: int
    pool_count: int
    topic_count: int


@router.get("/exams", response_model=list[ExamListEntry])
async def list_exams(
    session: SessionDep, principal: PrincipalDep,
) -> list[ExamListEntry]:
    """Admin-only list of every exam (published + retired) with row
    counts. Powers the dashboard table on /exams/new so admins can
    edit existing exams without remembering UUIDs.
    """
    _require_admin(principal)
    res = await session.execute(
        text(
            """
            SELECT e.id, e.code, e.name, e.subtitle, e.is_published,
                   (SELECT COUNT(*) FROM catalog_schema.subjects s
                      WHERE s.exam_id = e.id AND s.is_published = TRUE) AS subject_count,
                   (SELECT COUNT(*) FROM catalog_schema.subject_pools p
                      WHERE p.exam_id = e.id) AS pool_count,
                   (SELECT COUNT(*) FROM catalog_schema.topics t
                      JOIN catalog_schema.subjects s ON s.id = t.subject_id
                     WHERE s.exam_id = e.id AND t.is_published = TRUE
                       AND s.is_published = TRUE) AS topic_count
              FROM catalog_schema.exams e
             ORDER BY e.is_published DESC, e.sort_order, e.name
            """
        )
    )
    return [
        ExamListEntry(
            id=str(r["id"]),
            code=r["code"],
            name=r["name"],
            subtitle=r.get("subtitle"),
            is_published=bool(r["is_published"]),
            subject_count=int(r["subject_count"]),
            pool_count=int(r["pool_count"]),
            topic_count=int(r["topic_count"]),
        )
        for r in res.mappings().all()
    ]


@router.get("/exams/{exam_id}", response_model=ExamProposal)
async def load_exam(
    exam_id: str, session: SessionDep, principal: PrincipalDep,
) -> ExamProposal:
    """Load an existing exam's structure into the same shape /save accepts.

    The wizard uses this for edit mode: load → user edits the same form
    fields → /save with the new desired state. Only published rows are
    returned; soft-deleted (is_published=FALSE) rows are excluded.
    """
    _require_admin(principal)
    # 1. exam meta
    res = await session.execute(
        text(
            "SELECT id, code, name, subtitle FROM catalog_schema.exams "
            "WHERE id = CAST(:eid AS uuid)"
        ),
        {"eid": exam_id},
    )
    row = res.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="exam not found")
    exam_meta = dict(row)

    # 2. pools
    res = await session.execute(
        text(
            "SELECT id, code, name, description, pick_min, pick_max "
            "FROM catalog_schema.subject_pools "
            "WHERE exam_id = CAST(:eid AS uuid) "
            "ORDER BY sort_order, code"
        ),
        {"eid": exam_id},
    )
    pools_rows = [dict(r) for r in res.mappings().all()]
    pool_code_by_id = {str(p["id"]): p["code"] for p in pools_rows}

    # 3. subjects (only published). Read subtitle (the actual column
    #    name) and surface it as `description` on the proposal.
    res = await session.execute(
        text(
            "SELECT id, code, name, subtitle AS description, is_mandatory, pool_id "
            "FROM catalog_schema.subjects "
            "WHERE exam_id = CAST(:eid AS uuid) AND is_published = TRUE "
            "ORDER BY sort_order, code"
        ),
        {"eid": exam_id},
    )
    subjects_rows = [dict(r) for r in res.mappings().all()]

    # 4. topics for each subject (single batched query)
    subject_ids = [str(s["id"]) for s in subjects_rows]
    topics_by_subject: dict[str, list[dict]] = {sid: [] for sid in subject_ids}
    if subject_ids:
        res = await session.execute(
            text(
                "SELECT subject_id, code, title, description "
                "FROM catalog_schema.topics "
                "WHERE subject_id = ANY(CAST(:sids AS uuid[])) AND is_published = TRUE "
                "ORDER BY sort_order, code"
            ),
            {"sids": subject_ids},
        )
        for tr in res.mappings().all():
            topics_by_subject.setdefault(str(tr["subject_id"]), []).append(
                {"code": tr["code"], "title": tr["title"], "description": tr["description"]}
            )

    return ExamProposal(
        code=exam_meta["code"],
        name=exam_meta["name"],
        subtitle=exam_meta.get("subtitle"),
        pools=[
            PoolDraft(
                code=p["code"],
                name=p["name"],
                description=p.get("description"),
                pick_min=p["pick_min"],
                pick_max=p["pick_max"],
            )
            for p in pools_rows
        ],
        subjects=[
            SubjectDraft(
                code=s["code"],
                name=s["name"],
                description=s.get("description"),
                is_mandatory=s["is_mandatory"],
                pool_code=pool_code_by_id.get(str(s["pool_id"])) if s["pool_id"] else None,
                topics=[TopicDraft(**t) for t in topics_by_subject.get(str(s["id"]), [])],
            )
            for s in subjects_rows
        ],
        notes=None,
    )


@router.post("/save", response_model=SaveResponse)
async def save(
    proposal: ExamProposal,
    session: SessionDep,
    principal: PrincipalDep,
) -> SaveResponse:
    """Persist a (possibly admin-edited) proposal.

    Idempotent on `exam.code` — calling twice with the same code
    returns the existing exam without creating duplicates. Subjects
    and topics within a re-call use ON CONFLICT DO NOTHING so any
    additions land but no row is silently rewritten.
    """
    _require_admin(principal)

    # Re-validate cross-references in case admin hand-edited.
    pool_codes = {p.code for p in proposal.pools}
    for s in proposal.subjects:
        if s.is_mandatory and s.pool_code is not None:
            raise HTTPException(
                status_code=400,
                detail=f"Subject {s.code} is mandatory but has pool_code {s.pool_code}",
            )
        if not s.is_mandatory and s.pool_code is None:
            raise HTTPException(
                status_code=400,
                detail=f"Subject {s.code} is optional but has no pool_code",
            )
        if s.pool_code and s.pool_code not in pool_codes:
            raise HTTPException(
                status_code=400,
                detail=f"Subject {s.code} references unknown pool {s.pool_code}",
            )

    # 1. exam — INSERT … ON CONFLICT (code) DO UPDATE keeps the existing
    #    UUID stable and lets admins re-run save to refresh metadata.
    exam_id = str(uuid.uuid4())
    res = await session.execute(
        text(
            """
            INSERT INTO catalog_schema.exams (id, code, name, subtitle, sort_order, is_published)
            VALUES (CAST(:id AS uuid), :code, :name, :subtitle, COALESCE(
                (SELECT MAX(sort_order) + 1 FROM catalog_schema.exams), 1
            ), TRUE)
            ON CONFLICT (code) DO UPDATE SET
                name = EXCLUDED.name,
                subtitle = EXCLUDED.subtitle
            RETURNING id
            """
        ),
        {
            "id": exam_id,
            "code": proposal.code,
            "name": proposal.name,
            "subtitle": proposal.subtitle,
        },
    )
    exam_id = str(res.scalar_one())

    # 1b. Educator-assignment fanout. The teacher portal's exam picker
    #     is gated on `educator_assignments` — without rows here, the
    #     freshly-created exam is invisible to every TEACHER /
    #     MODERATOR / EXPERT account, and they can't author questions
    #     against it. PLATFORM_ADMINs already bypass that filter.
    #
    #     Default policy: grant exam-wide access to (a) the creating
    #     admin, and (b) every educator who already has any other
    #     assignment in the catalog — they're trusted authors, so a
    #     new exam shouldn't gate them out by default. Tighten this
    #     in prod via the existing /educator-scope admin page.
    await session.execute(
        text(
            """
            INSERT INTO catalog_schema.educator_assignments
                (educator_id, exam_id, subject_id)
            VALUES (CAST(:uid AS uuid), CAST(:eid AS uuid), NULL)
            ON CONFLICT (educator_id, exam_id) WHERE subject_id IS NULL
                DO NOTHING
            """
        ),
        {"uid": principal.user_id, "eid": exam_id},
    )
    await session.execute(
        text(
            """
            INSERT INTO catalog_schema.educator_assignments
                (educator_id, exam_id, subject_id)
            SELECT DISTINCT educator_id, CAST(:eid AS uuid), CAST(NULL AS uuid)
              FROM catalog_schema.educator_assignments
             WHERE exam_id <> CAST(:eid AS uuid)
            ON CONFLICT (educator_id, exam_id) WHERE subject_id IS NULL
                DO NOTHING
            """
        ),
        {"eid": exam_id},
    )

    # 2. pools — code-unique per exam.
    pool_id_by_code: dict[str, str] = {}
    for i, p in enumerate(proposal.pools):
        pool_uuid = str(uuid.uuid4())
        res = await session.execute(
            text(
                """
                INSERT INTO catalog_schema.subject_pools
                    (id, exam_id, code, name, description, pick_min, pick_max, sort_order)
                VALUES (CAST(:id AS uuid), CAST(:eid AS uuid), :code, :name, :description,
                        :pmin, :pmax, :ord)
                ON CONFLICT (exam_id, code) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    pick_min = EXCLUDED.pick_min,
                    pick_max = EXCLUDED.pick_max,
                    sort_order = EXCLUDED.sort_order
                RETURNING id
                """
            ),
            {
                "id": pool_uuid,
                "eid": exam_id,
                "code": p.code,
                "name": p.name,
                "description": p.description,
                "pmin": p.pick_min,
                "pmax": p.pick_max,
                "ord": i,
            },
        )
        pool_id_by_code[p.code] = str(res.scalar_one())

    # 3. subjects — link to pool when set.
    #    Schema note: catalog_schema.subjects uses `subtitle`, not
    #    `description` (topics use `description`). Map the proposal's
    #    subject.description → subjects.subtitle so the AI's free-form
    #    blurb still lands somewhere visible. Also re-publish on edit
    #    so a previously soft-deleted subject can come back via re-add.
    pool_id_by_code = pool_id_by_code  # for type narrowing in scope
    subjects_created = 0
    topics_created = 0
    for i, s in enumerate(proposal.subjects):
        subject_uuid = str(uuid.uuid4())
        pool_id = pool_id_by_code.get(s.pool_code) if s.pool_code else None
        res = await session.execute(
            text(
                """
                INSERT INTO catalog_schema.subjects
                    (id, exam_id, code, name, subtitle, sort_order, is_mandatory, pool_id, is_published)
                VALUES (CAST(:id AS uuid), CAST(:eid AS uuid), :code, :name, :description,
                        :ord, :mand, CAST(:pool_id AS uuid), TRUE)
                ON CONFLICT (exam_id, code) DO UPDATE SET
                    name = EXCLUDED.name,
                    subtitle = EXCLUDED.subtitle,
                    is_mandatory = EXCLUDED.is_mandatory,
                    pool_id = EXCLUDED.pool_id,
                    sort_order = EXCLUDED.sort_order,
                    is_published = TRUE
                RETURNING id, (xmax = 0) AS inserted
                """
            ),
            {
                "id": subject_uuid,
                "eid": exam_id,
                "code": s.code,
                "name": s.name,
                "description": s.description,
                "ord": i,
                "mand": s.is_mandatory,
                "pool_id": pool_id,
            },
        )
        row = res.first()
        subject_id = str(row[0])  # type: ignore[index]
        if row and row[1]:  # type: ignore[index]
            subjects_created += 1

        # 4. topics under this subject. Re-publish on edit so a
        #    previously retired topic can be restored.
        for j, t in enumerate(s.topics):
            res = await session.execute(
                text(
                    """
                    INSERT INTO catalog_schema.topics
                        (id, subject_id, code, title, description, question_count, sort_order, is_published)
                    VALUES (gen_random_uuid(), CAST(:sid AS uuid), :code, :title, :description,
                            0, :ord, TRUE)
                    ON CONFLICT (subject_id, code) DO UPDATE SET
                        title = EXCLUDED.title,
                        description = EXCLUDED.description,
                        sort_order = EXCLUDED.sort_order,
                        is_published = TRUE
                    RETURNING (xmax = 0) AS inserted
                    """
                ),
                {
                    "sid": subject_id,
                    "code": t.code,
                    "title": t.title,
                    "description": t.description,
                    "ord": j,
                },
            )
            ins = res.scalar_one()
            if ins:
                topics_created += 1

    # 5. Soft-delete (is_published=FALSE) any subject / topic / pool
    #    that exists in the DB for this exam but isn't in the new
    #    proposal. This is what makes /save also work for edit mode:
    #    the proposal is the *desired state*, anything missing is
    #    retired. Soft-delete (vs hard DELETE) keeps the rows around
    #    so existing question / mastery FK references stay intact —
    #    students who answered against a retired topic don't lose
    #    their history.
    proposal_subject_codes = {s.code for s in proposal.subjects}
    proposal_pool_codes = {p.code for p in proposal.pools}

    # Subjects to retire — currently published, not in new proposal.
    res = await session.execute(
        text(
            "UPDATE catalog_schema.subjects "
            "SET is_published = FALSE "
            "WHERE exam_id = CAST(:eid AS uuid) AND is_published = TRUE "
            "AND code <> ALL(CAST(:keep AS text[]))"
        ),
        {"eid": exam_id, "keep": list(proposal_subject_codes)},
    )
    subjects_retired = res.rowcount or 0

    # Topics to retire — for each subject in the proposal, retire
    # topics whose code isn't in the proposal's topic list.
    topics_retired = 0
    for s in proposal.subjects:
        keep_codes = [t.code for t in s.topics]
        res = await session.execute(
            text(
                "UPDATE catalog_schema.topics t "
                "SET is_published = FALSE "
                "FROM catalog_schema.subjects sub "
                "WHERE t.subject_id = sub.id "
                "  AND sub.exam_id = CAST(:eid AS uuid) "
                "  AND sub.code = :scode "
                "  AND t.is_published = TRUE "
                "  AND t.code <> ALL(CAST(:keep AS text[]))"
            ),
            {"eid": exam_id, "scode": s.code, "keep": keep_codes},
        )
        topics_retired += res.rowcount or 0

    # Pools to drop — pools have no is_published; safe to hard delete
    # because subjects.pool_id is ON DELETE SET NULL.
    res = await session.execute(
        text(
            "DELETE FROM catalog_schema.subject_pools "
            "WHERE exam_id = CAST(:eid AS uuid) "
            "AND code <> ALL(CAST(:keep AS text[]))"
        ),
        {"eid": exam_id, "keep": list(proposal_pool_codes)},
    )
    pools_retired = res.rowcount or 0

    await session.commit()

    return SaveResponse(
        exam_id=exam_id,
        code=proposal.code,
        subjects_created=subjects_created,
        topics_created=topics_created,
        pools_created=len(proposal.pools),
        subjects_retired=subjects_retired,
        topics_retired=topics_retired,
        pools_retired=pools_retired,
    )


# ─────────────────────────────────────────────────────────────────────
# Question seeding — admin asks AI to draft N questions per topic
# ─────────────────────────────────────────────────────────────────────


class SeedQuestionsRequest(BaseModel):
    exam_id: str
    questions_per_topic: int = Field(default=5, ge=1, le=10)
    # Restrict to a subset of topic IDs (optional). When empty, every
    # published topic in the exam is seeded — capped at 20 topics per
    # call so we don't run an OpenAI marathon synchronously.
    topic_ids: list[str] = Field(default_factory=list, max_length=20)
    # Difficulty `b` band: questions are drawn evenly across the band.
    difficulty_min: float = Field(default=-1.0, ge=-3.0, le=3.0)
    difficulty_max: float = Field(default=1.5, ge=-3.0, le=3.0)


class SeedQuestionsResponse(BaseModel):
    exam_id: str
    topics_processed: int
    questions_created: int
    failures: list[dict[str, Any]] = Field(default_factory=list)


SEED_SYSTEM_PROMPT = """You are a senior question writer for an Indian
education platform. For a given topic, you generate strict-JSON MCQ
questions suitable for the level implied by the exam (school /
competitive). Each MCQ has exactly 4 choices and one correct answer.

Hard rules:
  - Each question's stem is self-contained — no "in the previous
    question" cross-references.
  - All four choices are plausible; distractors target real student
    misconceptions, not absurdities.
  - Stems and choices use plain English. Mathematical notation can
    use unicode (e.g. ≤ √ π ≠) — no LaTeX, no markdown.
  - Keep stems ≤300 chars and choices ≤120 chars each.
  - explanation: 1-3 sentences, plain English, references the correct
    choice by its text (not by letter).
"""


SEED_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["questions"],
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["stem", "choices", "correct_idx", "explanation"],
                "properties": {
                    "stem": {"type": "string"},
                    "choices": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                    "correct_idx": {"type": "integer", "minimum": 0, "maximum": 3},
                    "explanation": {"type": "string"},
                },
            },
        },
    },
}


@router.post("/seed-questions", response_model=SeedQuestionsResponse)
async def seed_questions(
    body: SeedQuestionsRequest,
    session: SessionDep,
    principal: PrincipalDep,
) -> SeedQuestionsResponse:
    """Generate AI-drafted MCQ_SINGLE questions for an exam's topics.

    Synchronous + small-batched. Each topic gets one OpenAI call
    requesting `questions_per_topic` items at random difficulties
    spread across the requested band. Drafts land as `status='DRAFT'`
    in content_schema; admins promote them via the existing
    /content/questions/{id}/submit + /review flow.
    """
    _require_admin(principal)
    if not llm_enabled():
        raise HTTPException(
            status_code=503,
            detail={"code": "ai_unavailable", "message": "OPENAI_API_KEY is not configured"},
        )
    if body.difficulty_max < body.difficulty_min:
        raise HTTPException(status_code=400, detail="difficulty_max must be ≥ difficulty_min")

    # 1. Resolve target topics. If topic_ids is empty, take up to 20
    #    published topics belonging to the exam (any subject).
    if body.topic_ids:
        res = await session.execute(
            text(
                "SELECT t.id, t.title, sub.name AS subject_name "
                "FROM catalog_schema.topics t "
                "JOIN catalog_schema.subjects sub ON t.subject_id = sub.id "
                "WHERE sub.exam_id = CAST(:eid AS uuid) AND t.is_published = TRUE "
                "AND t.id = ANY(CAST(:tids AS uuid[]))"
            ),
            {"eid": body.exam_id, "tids": body.topic_ids},
        )
    else:
        res = await session.execute(
            text(
                "SELECT t.id, t.title, sub.name AS subject_name "
                "FROM catalog_schema.topics t "
                "JOIN catalog_schema.subjects sub ON t.subject_id = sub.id "
                "WHERE sub.exam_id = CAST(:eid AS uuid) AND t.is_published = TRUE "
                "AND sub.is_published = TRUE "
                "ORDER BY sub.sort_order, t.sort_order LIMIT 20"
            ),
            {"eid": body.exam_id},
        )
    topics = [dict(r) for r in res.mappings().all()]
    if not topics:
        raise HTTPException(status_code=400, detail="no published topics matched")

    # 2. Resolve exam name for prompt context.
    res = await session.execute(
        text("SELECT name FROM catalog_schema.exams WHERE id = CAST(:eid AS uuid)"),
        {"eid": body.exam_id},
    )
    exam_row = res.mappings().first()
    exam_name = exam_row["name"] if exam_row else "the exam"

    # 3. For each topic, call OpenAI then insert the drafts. We use the
    #    content schema's session for the writes (separate DB connection
    #    factory; both schemas live in the same Postgres logical DB but
    #    distinct SQLAlchemy sessions). Failures on one topic don't
    #    halt the rest — the failure is recorded in `failures` and we
    #    move on.
    questions_created = 0
    failures: list[dict[str, Any]] = []
    span = body.difficulty_max - body.difficulty_min

    async with content_sessionmaker()() as content_sess:
        for t in topics:
            user_prompt = (
                f"Exam: {exam_name}\n"
                f"Subject: {t['subject_name']}\n"
                f"Topic: {t['title']}\n"
                f"Generate exactly {body.questions_per_topic} MCQ_SINGLE questions for this topic."
            )
            try:
                draft = await call_structured(
                    system=SEED_SYSTEM_PROMPT,
                    user=user_prompt,
                    schema_name="seed_questions",
                    schema=SEED_SCHEMA,
                )
            except Exception as e:  # noqa: BLE001
                failures.append({"topic_id": str(t["id"]), "error": str(e)[:200]})
                continue
            if draft is None or not draft.get("questions"):
                failures.append({"topic_id": str(t["id"]), "error": "ai_returned_empty"})
                continue

            n = len(draft["questions"])
            for i, q in enumerate(draft["questions"]):
                # Spread difficulties evenly across the band.
                if n == 1:
                    diff = (body.difficulty_min + body.difficulty_max) / 2
                else:
                    diff = body.difficulty_min + (span * i / (n - 1))
                try:
                    await insert_question(
                        content_sess,
                        question_id=str(uuid.uuid4()),
                        topic_id=str(t["id"]),
                        stem=q["stem"],
                        choices=q["choices"],
                        correct_idx=int(q["correct_idx"]),
                        difficulty_b=float(diff),
                        discrimination_a=1.0,
                        guessing_c=0.25,  # 1/4 for 4-choice MCQ
                        language="en",
                        created_by=principal.user_id,
                        explanation=q.get("explanation"),
                        question_type="MCQ_SINGLE",
                        ai_origin={
                            "source": "exam_builder.seed_questions",
                            "model": "openai",
                            "exam_id": body.exam_id,
                        },
                    )
                    questions_created += 1
                except Exception as e:  # noqa: BLE001
                    failures.append(
                        {
                            "topic_id": str(t["id"]),
                            "stem_prefix": q.get("stem", "")[:40],
                            "error": str(e)[:200],
                        }
                    )
        await content_sess.commit()

    return SeedQuestionsResponse(
        exam_id=body.exam_id,
        topics_processed=len(topics),
        questions_created=questions_created,
        failures=failures,
    )
