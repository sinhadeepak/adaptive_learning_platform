# Per-subject AI Topic Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin generate/regenerate topics for a single subject on demand (sync), and fill topics for all empty subjects in one async batch, with a delta-merge diff review before saving.

**Architecture:** Extract the existing per-subject generation (`_fill_topics`) into a reusable service function `generate_topics_for_subject`. Add a synchronous per-subject endpoint and an async bulk endpoint (reusing the `ai_generation_jobs` table via a parameterized `job_repo`). The frontend adds a per-row "Generate/Regenerate topics" button (sync) and a top-level "Fill empty subjects" button (async, inline-polled), both merging results through the existing `diffTopics` so the existing ADDED/MODIFIED/REMOVED + Keep review and Save logic apply unchanged.

**Tech Stack:** Python/FastAPI + SQLAlchemy (services/learning), pytest; React/TS + Vitest (apps/web-admin).

## Global Constraints

- Admin-only: endpoints call `_require_admin(principal)` → 403 for non-`PLATFORM_ADMIN`/`INSTITUTION_ADMIN` (routes.py:53).
- AI provider gate: if `await _list_enabled(s)` is falsy → HTTP 503 `{code:"ai_unavailable", message:...}` (mirror routes.py:486-496).
- Topic generation uses `call_structured(s, system=TOPIC_SYSTEM_PROMPT, user=..., schema_name="subject_topics", schema=TOPICS_SCHEMA)` (routes.py:419-425).
- Topic codes are `ALL_CAPS_SNAKE`, ≤80 chars; titles ≤200 chars (TopicDraft, routes.py:66-69).
- Delta seeding: when existing topics are supplied, append "This subject already has these topics: …. KEEP the same `code` … ADD new … OMIT only genuinely outdated ones." (routes.py:411-417).
- Bounded parallelism for batch: `asyncio.Semaphore(_TOPIC_CONCURRENCY)` where `_TOPIC_CONCURRENCY = 4` (routes.py:330).
- Async jobs persist in `content_schema.ai_generation_jobs`; bulk uses a NEW discriminator `prompt_template_id = "exam_topics_fill"` (research uses `"exam_research"`).
- Generated topics persist only via the existing `POST /admin/exam-builder/save`; no change to save.
- Frontend diff fields `_status`/`_kept` are stripped and removed-not-kept rows dropped on save by the existing `isDropped`/serializer (ExamBuilder.tsx:72-95) — reused unchanged.
- Backend test DB: `learning_test` on `localhost:35432` (auto-provisioned by conftest). Backend test cmd: `cd services/learning && uv run pytest <path> -v`. Frontend test cmd: `cd apps/web-admin && npx vitest run <path>`.

---

### Task 1: Backend — extract `generate_topics_for_subject`

**Files:**
- Modify: `services/learning/src/learning/exam_builder/routes.py` (add module-level fn near `_generate_proposal`; refactor `_fill_topics` closure at ~402-431 to call it)
- Test: `services/learning/tests/exam_builder/test_topic_generation.py` (create)

**Interfaces:**
- Consumes: `call_structured`, `TOPIC_SYSTEM_PROMPT`, `TOPICS_SCHEMA`, `TopicDraft`, `ExistingTopic`, `ResearchError`, `content_sessionmaker` (all in routes.py).
- Produces: `async def generate_topics_for_subject(*, exam_name: str, exam_code: str, level: str, subject_code: str, subject_name: str, existing_topics: list[ExistingTopic], notes: str | None = None, target_year: int | None = None) -> list[TopicDraft]`

- [ ] **Step 1: Write the failing test**

Create `services/learning/tests/exam_builder/test_topic_generation.py`:

```python
"""generate_topics_for_subject — the reusable single-subject topic call."""
from __future__ import annotations

import asyncio

import pytest

from learning.exam_builder import routes as eb
from learning.exam_builder.routes import ExistingTopic, ResearchError, generate_topics_for_subject


def _mock_topics(payload):
    async def _fake(_session, *, system, user, schema_name, schema):
        assert schema_name == "subject_topics"
        return payload
    return _fake


def test_generate_topics_returns_drafts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        eb, "call_structured",
        _mock_topics({"topics": [
            {"code": "T1", "title": "One", "description": None},
            {"code": "T2", "title": "Two", "description": None},
        ]}),
    )
    out = asyncio.run(generate_topics_for_subject(
        exam_name="Test", exam_code="TEST", level="other",
        subject_code="SUB_A", subject_name="Subject A", existing_topics=[],
    ))
    assert [t.code for t in out] == ["T1", "T2"]


def test_generate_topics_seeds_existing_codes(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = {}
    async def _fake(_session, *, system, user, schema_name, schema):
        seen["user"] = user
        return {"topics": [{"code": "T1", "title": "One", "description": None}]}
    monkeypatch.setattr(eb, "call_structured", _fake)
    asyncio.run(generate_topics_for_subject(
        exam_name="Test", exam_code="TEST", level="other",
        subject_code="SUB_A", subject_name="Subject A",
        existing_topics=[ExistingTopic(code="OLD", title="Old Topic")],
    ))
    assert "already has these topics" in seen["user"]
    assert "OLD" in seen["user"]


def test_generate_topics_raises_on_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(eb, "call_structured", _mock_topics(None))
    with pytest.raises(ResearchError):
        asyncio.run(generate_topics_for_subject(
            exam_name="Test", exam_code="TEST", level="other",
            subject_code="SUB_A", subject_name="Subject A", existing_topics=[],
        ))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_topic_generation.py -v`
Expected: FAIL — `ImportError: cannot import name 'generate_topics_for_subject'`.

- [ ] **Step 3: Write minimal implementation**

In `routes.py`, add this module-level function immediately ABOVE `async def _generate_proposal` (~line 339):

```python
async def generate_topics_for_subject(
    *,
    exam_name: str,
    exam_code: str,
    level: str,
    subject_code: str,
    subject_name: str,
    existing_topics: list[ExistingTopic],
    notes: str | None = None,
    target_year: int | None = None,
) -> list[TopicDraft]:
    """Generate the canonical topic list for ONE subject. Delta-seeds the
    prompt with existing topic codes so re-runs preserve codes (clean diff).
    Raises ResearchError on empty/invalid output. Shared by the full-exam
    research flow, the sync per-subject endpoint, and the bulk fill worker.
    """
    base_ctx = (
        f"Exam name: {exam_name}\n"
        f"Exam code (admin-supplied): {exam_code}\n"
        f"Level: {level}\n"
        + (f"Target year: {target_year}\n" if target_year else "")
        + (f"Admin notes: {notes}\n" if notes else "")
    )
    user = (
        base_ctx
        + f"\nSubject: {subject_name} (code {subject_code})\n"
        + "List 8-20 canonical chapter-grain topics for THIS subject only."
    )
    if existing_topics:
        current = "; ".join(f"{t.code} ({t.title or t.code})" for t in existing_topics)
        user += (
            f"\n\nThis subject already has these topics: {current}. "
            "KEEP the same `code` for topics that still belong, ADD new "
            "ones, and OMIT only genuinely outdated ones."
        )
    async with content_sessionmaker()() as s:
        raw = await call_structured(
            s, system=TOPIC_SYSTEM_PROMPT, user=user,
            schema_name="subject_topics", schema=TOPICS_SCHEMA,
        )
    if raw is None:
        raise ResearchError(f"AI returned no topics for subject {subject_code}.")
    try:
        return [TopicDraft.model_validate(t) for t in raw.get("topics", [])]
    except Exception as e:  # noqa: BLE001
        raise ResearchError(f"AI returned invalid topics for {subject_code}: {e}") from e
```

Then refactor the `_fill_topics` closure inside `_generate_proposal` (routes.py:402-431) to delegate (preserving the bounded-parallel `sema`):

```python
    async def _fill_topics(subject: SubjectDraft) -> None:
        ex = existing_by_code.get(subject.code)
        existing_topics = ex.topics if ex else []
        async with sema:
            subject.topics = await generate_topics_for_subject(
                exam_name=req.name,
                exam_code=req.code,
                level=req.level,
                subject_code=subject.code,
                subject_name=subject.name,
                existing_topics=existing_topics,
                notes=req.notes,
                target_year=req.target_year,
            )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_topic_generation.py tests/exam_builder/test_research_jobs.py -v`
Expected: PASS — new tests green AND the existing research-job tests still pass (the refactor preserves full-exam behavior).

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/exam_builder/routes.py services/learning/tests/exam_builder/test_topic_generation.py
git commit -m "refactor(exam-builder): extract reusable generate_topics_for_subject"
```

---

### Task 2: Backend — sync per-subject endpoint

**Files:**
- Modify: `services/learning/src/learning/exam_builder/routes.py` (add request/response models + endpoint after the research endpoints, ~line 533)
- Test: `services/learning/tests/exam_builder/test_subject_topics.py` (create)

**Interfaces:**
- Consumes: `generate_topics_for_subject` (Task 1), `_require_admin`, `_list_enabled`, `content_sessionmaker`, `ExistingTopic`, `TopicDraft`, `PrincipalDep`.
- Produces: `POST /admin/exam-builder/subjects/topics` → `{ topics: [TopicDraft] }`.

- [ ] **Step 1: Write the failing test**

Create `services/learning/tests/exam_builder/test_subject_topics.py`:

```python
"""POST /admin/exam-builder/subjects/topics — synchronous single-subject gen."""
from __future__ import annotations

import time
from collections.abc import Iterator
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from learning.content.config import settings
from learning.exam_builder import routes as eb_routes
from learning.main import app

PREFIX = "/admin/exam-builder"


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    async def _enabled(_session):
        return [{"kind": "claude_code", "model": "sonnet"}]
    monkeypatch.setattr(eb_routes, "_list_enabled", _enabled)
    with TestClient(app) as c:
        yield c


def _auth(role: str) -> dict[str, str]:
    tok = jwt.encode(
        {"sub": str(uuid4()), "role": role, "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret, algorithm="HS256",
    )
    return {"authorization": f"Bearer {tok}"}


def _body() -> dict:
    return {
        "code": "TEST_EXAM", "name": "Test Exam", "level": "other",
        "subject": {"code": "SUB_A", "name": "Subject A"}, "existing": [],
    }


def _mock_topics(payload):
    async def _fake(_session, *, system, user, schema_name, schema):
        return payload
    return _fake


def test_requires_admin(client: TestClient) -> None:
    r = client.post(f"{PREFIX}/subjects/topics", headers=_auth("STUDENT"), json=_body())
    assert r.status_code == 403


def test_returns_topics(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(eb_routes, "call_structured", _mock_topics(
        {"topics": [{"code": "T1", "title": "One", "description": None}]}))
    r = client.post(f"{PREFIX}/subjects/topics", headers=_auth("PLATFORM_ADMIN"), json=_body())
    assert r.status_code == 200
    assert [t["code"] for t in r.json()["topics"]] == ["T1"]


def test_503_when_no_provider(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def _none(_session):
        return []
    monkeypatch.setattr(eb_routes, "_list_enabled", _none)
    r = client.post(f"{PREFIX}/subjects/topics", headers=_auth("PLATFORM_ADMIN"), json=_body())
    assert r.status_code == 503
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_subject_topics.py -v`
Expected: FAIL — 404 (route not defined) on the 200/503 tests.

- [ ] **Step 3: Write minimal implementation**

In `routes.py`, after the `get_job` research endpoint (~line 533, before the Save section), add:

```python
# ─────────────────────────────────────────────────────────────────────
# Per-subject topic generation — synchronous (one fast LLM call)
# ─────────────────────────────────────────────────────────────────────


class SubjectRef(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)


class SubjectTopicsRequest(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    level: str = "other"
    subject: SubjectRef
    existing: list[ExistingTopic] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=1000)
    target_year: int | None = Field(default=None, ge=2020, le=2050)


class SubjectTopicsResponse(BaseModel):
    topics: list[TopicDraft]


@router.post("/subjects/topics", response_model=SubjectTopicsResponse)
async def generate_subject_topics(
    req: SubjectTopicsRequest, principal: PrincipalDep
) -> SubjectTopicsResponse:
    """Generate (or regenerate) the topic list for ONE subject, synchronously.
    A single LLM call — fast enough to await inline. The result is returned to
    the editor; nothing is persisted until the admin saves the exam."""
    _require_admin(principal)
    async with content_sessionmaker()() as s:
        if not await _list_enabled(s):
            raise HTTPException(
                status_code=503,
                detail={"code": "ai_unavailable", "message": (
                    "No AI provider is enabled. Configure one on the AI "
                    "Providers screen, or add topics manually.")},
            )
    try:
        topics = await generate_topics_for_subject(
            exam_name=req.name, exam_code=req.code, level=req.level,
            subject_code=req.subject.code, subject_name=req.subject.name,
            existing_topics=req.existing, notes=req.notes, target_year=req.target_year,
        )
    except ResearchError as e:
        raise HTTPException(
            status_code=502,
            detail={"code": "ai_failed", "message": str(e)},
        ) from e
    return SubjectTopicsResponse(topics=topics)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_subject_topics.py -v`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/exam_builder/routes.py services/learning/tests/exam_builder/test_subject_topics.py
git commit -m "feat(exam-builder): sync per-subject topic generation endpoint"
```

---

### Task 3: Backend — parameterize `job_repo` for a second job kind

**Files:**
- Modify: `services/learning/src/learning/exam_builder/job_repo.py` (add `template_id` param to create/get/list)
- Test: `services/learning/tests/exam_builder/test_job_repo_kinds.py` (create)

**Interfaces:**
- Produces: `create_research_job(..., template_id: str = TEMPLATE_ID)`, `get_research_job(..., template_id: str = TEMPLATE_ID)`, `list_research_jobs(..., template_id: str = TEMPLATE_ID)`. Existing callers (default arg) unaffected.

- [ ] **Step 1: Write the failing test**

Create `services/learning/tests/exam_builder/test_job_repo_kinds.py`:

```python
"""job_repo round-trips a second job kind via the template_id param."""
from __future__ import annotations

import asyncio
from uuid import uuid4

import asyncpg
import pytest

from learning.content.db import sessionmaker
from learning.exam_builder import job_repo


@pytest.fixture(autouse=True)
def _clean() -> None:
    async def _t() -> None:
        c = await asyncpg.connect(host="localhost", port=35432, user="postgres",
                                  password="postgres", database="learning_test")
        try:
            await c.execute("TRUNCATE content_schema.ai_generation_jobs")
        finally:
            await c.close()
    asyncio.run(_t())


def test_custom_template_id_round_trips() -> None:
    admin = str(uuid4())

    async def _run() -> dict:
        async with sessionmaker()() as s:
            jid = await job_repo.create_research_job(
                s, request_input={"code": "X"}, requested_by=admin,
                template_id="exam_topics_fill",
            )
            await s.commit()
        async with sessionmaker()() as s:
            # Default kind does NOT see it (scoped by template_id).
            miss = await job_repo.get_research_job(s, job_id=jid, requested_by=admin)
            hit = await job_repo.get_research_job(
                s, job_id=jid, requested_by=admin, template_id="exam_topics_fill")
        return {"miss": miss, "hit": hit}

    out = asyncio.run(_run())
    assert out["miss"] is None
    assert out["hit"] is not None and out["hit"]["status"] == "pending"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_job_repo_kinds.py -v`
Expected: FAIL — `create_research_job() got an unexpected keyword argument 'template_id'`.

- [ ] **Step 3: Write minimal implementation**

In `job_repo.py`:
- `create_research_job` signature → add `template_id: str = TEMPLATE_ID`, and use `"tid": template_id` instead of `"tid": TEMPLATE_ID` in the params dict (line 57).
- `get_research_job` signature → add `template_id: str = TEMPLATE_ID`, replace `"tid": TEMPLATE_ID` with `"tid": template_id` (line 121).
- `list_research_jobs` signature → add `template_id: str = TEMPLATE_ID`, replace `"tid": TEMPLATE_ID` with `"tid": template_id` (line 157).

(`complete_research_job`/`fail_research_job` update by id only — no change.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_job_repo_kinds.py tests/exam_builder/test_research_jobs.py -v`
Expected: PASS — new test green and existing research-job tests unaffected (default `template_id`).

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/exam_builder/job_repo.py services/learning/tests/exam_builder/test_job_repo_kinds.py
git commit -m "refactor(exam-builder): parameterize job_repo by template_id"
```

---

### Task 4: Backend — async bulk fill-empty endpoint + worker + poller

**Files:**
- Modify: `services/learning/src/learning/exam_builder/routes.py` (models + worker + 2 endpoints, after Task 2's endpoint)
- Test: `services/learning/tests/exam_builder/test_topics_fill.py` (create)

**Interfaces:**
- Consumes: `generate_topics_for_subject` (Task 1), parameterized `job_repo` (Task 3), `BackgroundTasks`, `_TOPIC_CONCURRENCY`, `ExistingTopic`.
- Produces: `POST /admin/exam-builder/topics/fill-empty` → `202 {jobId, status}`; `GET /admin/exam-builder/topics/fill-empty/{job_id}` → `{jobId, status, result?: {subjects:[{code, topics, error?}]}, error?}`.

- [ ] **Step 1: Write the failing test**

Create `services/learning/tests/exam_builder/test_topics_fill.py`:

```python
"""Async bulk fill-empty: 202 + poll + per-subject partial failure."""
from __future__ import annotations

import asyncio
import time
from collections.abc import Iterator
from uuid import uuid4

import asyncpg
import jwt
import pytest
from fastapi.testclient import TestClient

from learning.content.config import settings
from learning.exam_builder import routes as eb_routes
from learning.main import app

PREFIX = "/admin/exam-builder"


@pytest.fixture(autouse=True)
def _clean() -> Iterator[None]:
    async def _t() -> None:
        c = await asyncpg.connect(host="localhost", port=35432, user="postgres",
                                  password="postgres", database="learning_test")
        try:
            await c.execute("TRUNCATE content_schema.ai_generation_jobs")
        finally:
            await c.close()
    asyncio.run(_t())
    yield


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    async def _enabled(_session):
        return [{"kind": "claude_code", "model": "sonnet"}]
    monkeypatch.setattr(eb_routes, "_list_enabled", _enabled)
    with TestClient(app) as c:
        yield c


def _auth(uid: str, role: str) -> dict[str, str]:
    tok = jwt.encode(
        {"sub": uid, "role": role, "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret, algorithm="HS256")
    return {"authorization": f"Bearer {tok}"}


def _body() -> dict:
    return {
        "code": "TEST_EXAM", "name": "Test Exam", "level": "other",
        "subjects": [
            {"code": "SUB_A", "name": "Subject A", "existing": []},
            {"code": "SUB_B", "name": "Subject B", "existing": []},
        ],
    }


def test_requires_admin(client: TestClient) -> None:
    r = client.post(f"{PREFIX}/topics/fill-empty", headers=_auth(str(uuid4()), "STUDENT"), json=_body())
    assert r.status_code == 403


def test_partial_failure(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # SUB_B's call returns None → that subject records an error; SUB_A succeeds.
    async def _fake(_session, *, system, user, schema_name, schema):
        if "code SUB_B" in user:
            return None
        return {"topics": [{"code": "T1", "title": "One", "description": None}]}
    monkeypatch.setattr(eb_routes, "call_structured", _fake)
    admin = str(uuid4())
    jid = client.post(f"{PREFIX}/topics/fill-empty", headers=_auth(admin, "PLATFORM_ADMIN"), json=_body())
    assert jid.status_code == 202
    job_id = jid.json()["jobId"]
    got = client.get(f"{PREFIX}/topics/fill-empty/{job_id}", headers=_auth(admin, "PLATFORM_ADMIN")).json()
    assert got["status"] == "succeeded"
    by_code = {s["code"]: s for s in got["result"]["subjects"]}
    assert [t["code"] for t in by_code["SUB_A"]["topics"]] == ["T1"]
    assert by_code["SUB_B"]["error"]
    assert by_code["SUB_B"]["topics"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_topics_fill.py -v`
Expected: FAIL — 404 (routes not defined).

- [ ] **Step 3: Write minimal implementation**

In `routes.py`, add the import alias for the fill template id near the top job_repo import block (extend the existing import from Task 3's repo) and add models + worker + endpoints after the sync endpoint:

```python
TOPICS_FILL_TEMPLATE_ID = "exam_topics_fill"


class FillSubject(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    existing: list[ExistingTopic] = Field(default_factory=list)


class TopicsFillRequest(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    level: str = "other"
    subjects: list[FillSubject] = Field(min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)
    target_year: int | None = Field(default=None, ge=2020, le=2050)


async def run_topics_fill_job(job_id: str, req: TopicsFillRequest) -> None:
    """Background worker: generate topics for each requested subject in
    bounded parallel. Partial-failure tolerant — a subject whose call fails
    records a per-subject error rather than failing the whole batch."""
    sema = asyncio.Semaphore(_TOPIC_CONCURRENCY)

    async def _one(sub: FillSubject) -> dict[str, Any]:
        async with sema:
            try:
                topics = await generate_topics_for_subject(
                    exam_name=req.name, exam_code=req.code, level=req.level,
                    subject_code=sub.code, subject_name=sub.name,
                    existing_topics=sub.existing, notes=req.notes,
                    target_year=req.target_year,
                )
                return {"code": sub.code, "topics": [t.model_dump() for t in topics]}
            except Exception as e:  # noqa: BLE001
                return {"code": sub.code, "topics": [], "error": str(e)[:300]}

    try:
        results = await asyncio.gather(*(_one(s) for s in req.subjects))
        async with content_sessionmaker()() as s:
            await complete_research_job(s, job_id=job_id, output={"subjects": results})
            await s.commit()
    except Exception as e:  # noqa: BLE001
        async with content_sessionmaker()() as s:
            await fail_research_job(s, job_id=job_id, error=str(e) or e.__class__.__name__)
            await s.commit()


@router.post("/topics/fill-empty", status_code=202, response_model=ResearchJobRef)
async def fill_empty_topics(
    req: TopicsFillRequest, principal: PrincipalDep, background: BackgroundTasks
) -> ResearchJobRef:
    """Enqueue a background job that generates topics for the given subjects
    (typically those with 0 topics). Returns a job id to poll."""
    _require_admin(principal)
    async with content_sessionmaker()() as s:
        if not await _list_enabled(s):
            raise HTTPException(
                status_code=503,
                detail={"code": "ai_unavailable", "message": (
                    "No AI provider is enabled. Configure one on the AI "
                    "Providers screen, or add topics manually.")},
            )
        job_id = await create_research_job(
            s, request_input=req.model_dump(), requested_by=principal.user_id,
            template_id=TOPICS_FILL_TEMPLATE_ID,
        )
        await s.commit()
    background.add_task(run_topics_fill_job, job_id, req)
    return ResearchJobRef(jobId=job_id, status="pending")


@router.get("/topics/fill-empty/{job_id}", response_model=ResearchJobResult)
async def get_fill_job(job_id: str, principal: PrincipalDep) -> ResearchJobResult:
    """Status + per-subject result for one bulk fill job."""
    _require_admin(principal)
    async with content_sessionmaker()() as s:
        job = await get_research_job(
            s, job_id=job_id, requested_by=principal.user_id,
            template_id=TOPICS_FILL_TEMPLATE_ID,
        )
    if job is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "No such job."})
    return ResearchJobResult(
        jobId=job["jobId"], status=job["status"],
        result=job["result"], error=job["error"],
    )
```

NOTE: `ResearchJobResult.result` is typed `ExamProposal | None`. Change its annotation to `dict[str, Any] | None` (routes.py:113) so it carries the fill payload too — verify the research `get_job` still returns the proposal as a dict (it passes `ExamProposal.model_validate(...)`; change that call to pass `job["result"]` raw dict, since FastAPI serializes the dict identically). Re-run the research tests in Step 4 to confirm no regression.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && uv run pytest tests/exam_builder/ -v`
Expected: PASS — fill tests green AND all existing exam_builder tests still pass (research result still serializes correctly).

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/exam_builder/routes.py services/learning/tests/exam_builder/test_topics_fill.py
git commit -m "feat(exam-builder): async bulk fill-empty topics endpoint + worker"
```

---

### Task 5: Frontend — export `diffTopics` + `mergeRegeneratedTopics` helper

**Files:**
- Modify: `apps/web-admin/src/lib/examDiff.ts`
- Test: `apps/web-admin/src/lib/examDiff.test.ts` (extend)

**Interfaces:**
- Produces: `export function diffTopics(baseline: TopicDraft[], next: TopicDraft[]): TopicDiff[]`; `export function mergeRegeneratedTopics(current: TopicDiff[], aiTopics: TopicDraft[]): TopicDiff[]`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web-admin/src/lib/examDiff.test.ts`:

```ts
import { mergeRegeneratedTopics } from "./examDiff";

describe("mergeRegeneratedTopics", () => {
  it("tags added / modified / unchanged / removed vs current", () => {
    const current = [
      { code: "KEEP", title: "Keep", description: null, _status: "unchanged" as const },
      { code: "GONE", title: "Gone", description: null, _status: "unchanged" as const },
    ];
    const ai = [
      { code: "KEEP", title: "Keep Renamed", description: null },
      { code: "NEW", title: "New", description: null },
    ];
    const out = mergeRegeneratedTopics(current, ai);
    const byCode = Object.fromEntries(out.map((t) => [t.code, t._status]));
    expect(byCode).toEqual({ KEEP: "modified", NEW: "added", GONE: "removed" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-admin && npx vitest run src/lib/examDiff.test.ts`
Expected: FAIL — `mergeRegeneratedTopics` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `examDiff.ts`: change `function diffTopics` (line 66) to `export function diffTopics`. Then add at the end of the file:

```ts
// Merge a freshly AI-generated topic list into a subject's CURRENT topics
// (which may already carry diff fields). Strips diff-only fields from the
// current list to form a clean baseline, then diffs — so a per-subject
// regenerate produces the same added/modified/removed/Keep review as a
// full re-analyze.
export function mergeRegeneratedTopics(
  current: Array<TopicDraft & { _status?: DiffStatus; _kept?: boolean }>,
  aiTopics: TopicDraft[],
): TopicDiff[] {
  const baseline: TopicDraft[] = current.map((t) => ({
    code: t.code,
    title: t.title,
    description: t.description ?? null,
  }));
  return diffTopics(baseline, aiTopics);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web-admin && npx vitest run src/lib/examDiff.test.ts`
Expected: PASS — existing examDiff tests + the new merge test green.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/src/lib/examDiff.ts apps/web-admin/src/lib/examDiff.test.ts
git commit -m "feat(web-admin): mergeRegeneratedTopics diff helper for topic regen"
```

---

### Task 6: Frontend — per-subject "Generate/Regenerate topics" button

**Files:**
- Modify: `apps/web-admin/src/pages/ExamBuilder.tsx` (add handler + thread prop into `SubjectRow`; add button in the expanded topic area ~line 1206)

**Interfaces:**
- Consumes: `mergeRegeneratedTopics` (Task 5), `POST /admin/exam-builder/subjects/topics` (Task 2), existing `patchSubject(i, p)`, `level`, `proposal`, `auth.fetch`, `safeDetail`.
- Produces: per-row regenerate behavior.

- [ ] **Step 1: Add the parent handler**

In `ExamBuilder.tsx`, near `reanalyze` (~line 231), add (and a `regenSubject` busy-state `useState<string | null>(null)` alongside the other `useState`s):

```tsx
  const [regenSubject, setRegenSubject] = useState<string | null>(null);

  async function regenerateSubjectTopics(index: number) {
    if (!proposal) return;
    const subject = proposal.subjects[index];
    setRegenSubject(subject.code);
    setError(null);
    try {
      const res = await auth.fetch("/api/v1/admin/exam-builder/subjects/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: proposal.code,
          name: proposal.name,
          level,
          subject: { code: subject.code, name: subject.name },
          existing: subject.topics.map((t) => ({ code: t.code, title: t.title })),
        }),
      });
      if (!res.ok) {
        const detail = await safeDetail(res);
        throw new Error(detail || `Generate failed (HTTP ${res.status})`);
      }
      const body = (await res.json()) as { topics: { code: string; title: string; description: string | null }[] };
      patchSubject(index, { topics: mergeRegeneratedTopics(subject.topics, body.topics) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setRegenSubject(null);
    }
  }
```

Add the import at the top: `import { diffExam, mergeRegeneratedTopics, type DiffStatus } from "../lib/examDiff";` (extend the existing line 21 import).

- [ ] **Step 2: Thread the prop into SubjectRow**

At the `<SubjectRow ...>` instantiation (~line 944), add:

```tsx
            <SubjectRow
              key={s.code}
              subject={s}
              poolOptions={poolOptions}
              onPatch={(p) => patchSubject(i, p)}
              onRemove={() => removeSubject(i)}
              onRegenerate={() => regenerateSubjectTopics(i)}
              regenerating={regenSubject === s.code}
            />
```

Update the `SubjectRow` signature (line 988) and its prop type:

```tsx
function SubjectRow({
  subject,
  poolOptions,
  onPatch,
  onRemove,
  onRegenerate,
  regenerating,
}: {
  subject: SubjectDraft;
  poolOptions: string[];
  onPatch: (p: Partial<SubjectDraft>) => void;
  onRemove: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
```

- [ ] **Step 3: Add the button**

In `SubjectRow`'s expanded area, immediately AFTER the `+ Add topic` button (~line 1237, inside the `{open && (...)}` block), add:

```tsx
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            style={{
              marginTop: 10,
              marginLeft: 8,
              background: "transparent",
              border: "1px dashed var(--accent)",
              borderRadius: 6,
              padding: "6px 10px",
              color: "var(--accent)",
              fontSize: 11,
              fontWeight: 600,
              cursor: regenerating ? "default" : "pointer",
              opacity: regenerating ? 0.6 : 1,
            }}
          >
            {regenerating
              ? "Generating…"
              : subject.topics.length === 0
                ? "↻ Generate topics (AI)"
                : "↻ Regenerate topics (AI)"}
          </button>
```

- [ ] **Step 4: Verify typecheck + tests**

Run: `cd apps/web-admin && npx tsc --noEmit && npx vitest run src/lib/examDiff.test.ts`
Expected: tsc clean; merge-helper tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/src/pages/ExamBuilder.tsx
git commit -m "feat(web-admin): per-subject Generate/Regenerate topics button"
```

---

### Task 7: Frontend — top-level "Fill topics for empty subjects" (async + inline poll)

**Files:**
- Modify: `apps/web-admin/src/pages/ExamBuilder.tsx` (add bulk handler + inline poll + merge; add button near the Re-analyze button ~line 775)

**Interfaces:**
- Consumes: `mergeRegeneratedTopics` (Task 5), `POST /admin/exam-builder/topics/fill-empty` + `GET .../{job_id}` (Task 4), `patchSubject`, `proposal`, `setProposal`.

DESIGN NOTE: the bulk job is initiated and consumed on this edit screen, so it is polled INLINE here (mirroring the existing research `?job=` poll effect) rather than via the global research toaster — no cross-cutting toaster change. The async backend job still guarantees it survives the 24-subject runtime.

- [ ] **Step 1: Add the bulk handler with inline polling**

In `ExamBuilder.tsx`, add a busy state `const [fillingEmpty, setFillingEmpty] = useState(false);` and this handler near `regenerateSubjectTopics`:

```tsx
  async function fillEmptySubjects() {
    if (!proposal) return;
    const empties = proposal.subjects.filter((s) => s.topics.length === 0);
    if (empties.length === 0) {
      setError("No empty subjects — every subject already has topics.");
      return;
    }
    setFillingEmpty(true);
    setError(null);
    try {
      const res = await auth.fetch("/api/v1/admin/exam-builder/topics/fill-empty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: proposal.code,
          name: proposal.name,
          level,
          subjects: empties.map((s) => ({ code: s.code, name: s.name, existing: [] })),
        }),
      });
      if (!res.ok) {
        const detail = await safeDetail(res);
        throw new Error(detail || `Fill failed (HTTP ${res.status})`);
      }
      const { jobId } = (await res.json()) as { jobId: string };

      // Poll the job until it finishes (~once/2s), then merge per-subject.
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        const pr = await auth.fetch(
          `/api/v1/admin/exam-builder/topics/fill-empty/${encodeURIComponent(jobId)}`,
        );
        if (!pr.ok) throw new Error(`Poll failed (HTTP ${pr.status})`);
        const body = (await pr.json()) as {
          status: string;
          result: { subjects: { code: string; topics: { code: string; title: string; description: string | null }[]; error?: string }[] } | null;
          error: string | null;
        };
        if (body.status === "failed") throw new Error(body.error || "Fill job failed.");
        if (body.status === "succeeded" && body.result) {
          const byCode = new Map(body.result.subjects.map((s) => [s.code, s]));
          let failed = 0;
          setProposal((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              subjects: prev.subjects.map((s) => {
                const r = byCode.get(s.code);
                if (!r) return s;
                if (r.error) { failed += 1; return s; }
                return { ...s, topics: mergeRegeneratedTopics(s.topics, r.topics) };
              }),
            };
          });
          const ok = body.result.subjects.length - failed;
          if (failed > 0) setError(`${ok}/${body.result.subjects.length} subjects filled — ${failed} failed, retry those individually.`);
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fill failed");
    } finally {
      setFillingEmpty(false);
    }
  }
```

- [ ] **Step 2: Add the button**

Next to the "⟳ Re-analyze with AI" button (~line 775), add:

```tsx
          <button
            type="button"
            onClick={fillEmptySubjects}
            disabled={fillingEmpty}
            style={{
              background: "transparent",
              border: "1px solid var(--accent)",
              borderRadius: 6,
              padding: "8px 14px",
              color: "var(--accent)",
              fontSize: 13,
              fontWeight: 600,
              cursor: fillingEmpty ? "default" : "pointer",
              opacity: fillingEmpty ? 0.6 : 1,
            }}
          >
            {fillingEmpty ? "Filling empty subjects…" : "✦ Fill topics for empty subjects"}
          </button>
```

- [ ] **Step 3: Verify typecheck + tests**

Run: `cd apps/web-admin && npx tsc --noEmit && npx vitest run`
Expected: tsc clean; existing web-admin tests pass (no new failures).

- [ ] **Step 4: Commit**

```bash
git add apps/web-admin/src/pages/ExamBuilder.tsx
git commit -m "feat(web-admin): bulk fill topics for empty subjects (async + inline poll)"
```

---

## Deployment

After all tasks: rebuild + restart the affected containers, then apply no new migrations (none added):

```bash
cd infrastructure/docker
docker compose build learning web-admin && docker compose up -d learning web-admin
```

Manual verification: open `/exams/edit/11111111-0000-0000-0000-000000000003`, confirm a `↻ Generate topics (AI)` button on each empty optional subject (click one → topics appear with ADDED markers), and a top-level `✦ Fill topics for empty subjects` that fills all 24 optionals; then "Save exam to catalog" and confirm the counts update from 0.

## Self-Review

**Spec coverage:**
- Reusable single-subject service → Task 1. ✓
- Sync per-subject endpoint → Task 2. ✓
- Async bulk fill-empty (job + worker + poller, partial-failure tolerant) → Tasks 3–4. ✓
- Delta-merge with diff review (reuse diffTopics + ADDED/MODIFIED/REMOVED + Keep) → Tasks 5–7 (merge helper) + existing render/save. ✓
- Per-subject button + top-level bulk button → Tasks 6–7. ✓
- Provider 503 / admin 403 / partial failure error handling → Tasks 2, 4, 7. ✓
- Save semantics unchanged (topics persist on existing Save) → no save task; verified in Deployment. ✓
- Testing (backend unit+endpoint, frontend diff) → each task's tests. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `generate_topics_for_subject(...)` signature identical across Tasks 1/2/4; `mergeRegeneratedTopics(current, aiTopics)` identical across Tasks 5/6/7; `template_id` param name consistent (Tasks 3/4); endpoint paths consistent (`/subjects/topics`, `/topics/fill-empty`, `/topics/fill-empty/{job_id}`).

**Deviation from spec (flagged):** bulk job is polled inline on the edit screen rather than via the global research toaster — justified in Task 7's design note (screen-local action); the async backend job still meets the durability requirement.
