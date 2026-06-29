# Exam Retire & Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin retire (soft, reversible) any exam from the web-admin catalog, restore a retired exam, and permanently delete a content-free exam behind a type-the-code confirmation.

**Architecture:** Three new admin endpoints in `services/learning` (`POST …/{id}/retire`, `POST …/{id}/restore`, `DELETE …/{id}`) reuse the existing soft-delete (`is_published=FALSE`) convention; the DELETE endpoint is guarded by a learning-service-only check (0 authored questions AND 0 blueprints) and performs an FK-safe transactional delete. The `GET …/exams` list endpoint is extended with `question_count` + `blueprint_count` so the React `ExamsList` table can enable/disable the per-row Delete action without a probe; a new `ConfirmDeleteModal` is the final UI backstop.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy async (raw `text()` SQL) / asyncpg test harness against `learning_test` (localhost:35432); React 18 + TypeScript / Vitest; web-admin served via nginx Docker container.

## Global Constraints

- All three new endpoints call `_require_admin(principal)` (PLATFORM_ADMIN / INSTITUTION_ADMIN → else **403** `{"code":"forbidden", …}`) — `services/learning/src/learning/exam_builder/routes.py:53`.
- **404** `{"code":"not_found", "message":"exam not found"}` when the exam id does not exist, on all three endpoints.
- Permanent-delete guard is **learning-service-only**: `question_count` (content questions under the exam's topics) and `blueprint_count` (`catalog_schema.exam_blueprints`). If `question_count > 0 OR blueprint_count > 0` → **409** with body `{"code":"exam_in_use", "questionCount": <int>, "blueprintCount": <int>, "message":"Exam has N questions and M blueprints — retire it instead."}`.
- All schema-qualified SQL uses `catalog_schema.*` (exams, subjects, topics, subject_pools, exam_blueprints, educator_assignments, topic_importance_overrides) and `content_schema.questions`.
- Soft-delete = flip `is_published`; never `DELETE` rows for retire/restore. Retire/restore are idempotent.
- Hard delete is one transaction (all-or-nothing), FK-safe order.
- Endpoints live under the existing router `prefix="/admin/exam-builder"`; the browser calls them under `/api/v1/admin/exam-builder/…` (nginx strips `/api/v1`).
- Frontend fetches via `auth.fetch("/api/v1/admin/exam-builder/…")` (see `apps/web-admin/src/pages/ExamsList.tsx`).
- Backend tests: `cd services/learning && uv run pytest <path> -v`. Frontend tests: `cd apps/web-admin && npx vitest run`. TypeScript gate: `cd apps/web-admin && npx tsc --noEmit`.

---

## File Structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `services/learning/src/learning/exam_builder/routes.py` | retire/restore/delete endpoints + extend `list_exams` + `ExamListEntry` | T1, T2, T3, T4 |
| `services/learning/tests/exam_builder/test_exam_lifecycle.py` (new) | DB-backed tests for retire/restore/delete | T1, T2, T3 |
| `services/learning/tests/exam_builder/test_exam_list_counts.py` (new) | DB-backed test for the two new list counts | T4 |
| `apps/web-admin/src/lib/examActions.ts` (new) | pure `isDeletable(row)` helper | T5 |
| `apps/web-admin/src/lib/examActions.test.ts` (new) | unit test for `isDeletable` | T5 |
| `apps/web-admin/src/components/ConfirmDeleteModal.tsx` (new) | type-the-code confirm dialog | T6 |
| `apps/web-admin/src/components/ConfirmDeleteModal.test.tsx` (new) | unit test for the modal gate | T6 |
| `apps/web-admin/src/pages/ExamsList.tsx` | row actions (Retire/Restore/Delete) + modal wiring + `ExamListEntry` fields | T7 |

**Task order & dependencies:** T1→T2→T3 (backend lifecycle, share a DB seed helper), T4 (list counts, independent of T1-3), T5 (pure helper), T6 (modal), T7 (wiring — consumes T4's response fields, T5's helper, T6's modal). T7 is last.

---

## Test harness reference (read before T1)

The `exam_builder` tests use FastAPI `TestClient` plus a direct `asyncpg` connection to the test DB. There is **no** `conftest.py` in this directory — every fixture/helper is defined inline per file (see `tests/exam_builder/test_research_jobs.py`). DB-backed tests connect with:

```python
await asyncpg.connect(host="localhost", port=35432, user="postgres",
                      password="postgres", database="learning_test")
```

Relevant table columns (from `alembic/catalog/versions/001_create_catalog_schema.py`, `009_exam_blueprints.py`, `024_topic_importance_overrides.py`, `alembic/content/versions/001_create_content_schema.py`):

- `catalog_schema.exams(id, code UNIQUE, name, subtitle, is_published, sort_order)`
- `catalog_schema.subjects(id, exam_id→exams, code, name, is_published, pool_id→subject_pools ON DELETE SET NULL)`
- `catalog_schema.topics(id, subject_id→subjects, code, title, is_published)`
- `catalog_schema.exam_blueprints(id, exam_id→exams ON DELETE CASCADE, name, total_questions>0, total_minutes>0, marks_correct, sections JSONB)`
- `catalog_schema.educator_assignments(id, educator_id, exam_id→exams, subject_id→subjects)`
- `catalog_schema.topic_importance_overrides(exam_id, topic_id, weight, PK(exam_id,topic_id))` — no FKs
- `content_schema.questions(id, topic_id NOT NULL [no FK], stem, choices JSONB, correct_idx>=0, created_by, status)`

**FK-safe delete order (used in T3):** topic_importance_overrides → educator_assignments → topics → subjects → subject_pools → exam_blueprints → exams.

---

### Task 1: Backend — retire endpoint

**Files:**
- Modify: `services/learning/src/learning/exam_builder/routes.py` (add endpoint near `list_exams`, ~line 785)
- Test: `services/learning/tests/exam_builder/test_exam_lifecycle.py` (create)

**Interfaces:**
- Consumes: `_require_admin` (routes.py:53), `SessionDep`, `PrincipalDep`, `router` (prefix `/admin/exam-builder`), `text` from sqlalchemy, `HTTPException`, `BaseModel`/`Field`.
- Produces: `POST /admin/exam-builder/exams/{exam_id}/retire` → `RetireResponse{exam_id:str, code:str, subjects_retired:int, topics_retired:int}`. Class name `RetireResponse` is reused by no other task.

- [ ] **Step 1: Write the failing test**

Create `services/learning/tests/exam_builder/test_exam_lifecycle.py`:

```python
"""Exam lifecycle — retire / restore / delete (DB-backed)."""
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
from learning.main import app

PREFIX = "/admin/exam-builder"


def _auth(role: str = "PLATFORM_ADMIN") -> dict[str, str]:
    tok = jwt.encode(
        {"sub": str(uuid4()), "role": role, "iat": int(time.time()),
         "exp": int(time.time()) + 3600},
        settings.jwt_secret, algorithm="HS256",
    )
    return {"authorization": f"Bearer {tok}"}


async def _connect() -> asyncpg.Connection:
    return await asyncpg.connect(host="localhost", port=35432, user="postgres",
                                 password="postgres", database="learning_test")


async def _seed_exam(*, published: bool = True, with_topics: bool = True,
                     with_blueprint: bool = False, with_question: bool = False,
                     with_cross_refs: bool = False) -> dict:
    """Insert an exam (+subjects/topics, optionally a blueprint, a content
    question, and cross-ref rows). Returns ids + code for assertions."""
    conn = await _connect()
    try:
        exam_id = uuid4()
        code = f"LIFE_{uuid4().hex[:8].upper()}"
        await conn.execute(
            "INSERT INTO catalog_schema.exams (id, code, name, is_published) "
            "VALUES ($1, $2, $3, $4)", exam_id, code, "Lifecycle Exam", published)
        subject_id = uuid4()
        await conn.execute(
            "INSERT INTO catalog_schema.subjects (id, exam_id, code, name, is_published) "
            "VALUES ($1, $2, $3, $4, $5)",
            subject_id, exam_id, "SUB_A", "Subject A", published)
        topic_id = uuid4()
        if with_topics:
            await conn.execute(
                "INSERT INTO catalog_schema.topics (id, subject_id, code, title, is_published) "
                "VALUES ($1, $2, $3, $4, $5)",
                topic_id, subject_id, "T1", "Topic One", published)
        if with_blueprint:
            await conn.execute(
                "INSERT INTO catalog_schema.exam_blueprints "
                "(id, exam_id, name, total_questions, total_minutes, marks_correct, sections) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)",
                uuid4(), exam_id, "BP", 10, 30, 4, "[]")
        if with_question:
            await conn.execute(
                "INSERT INTO content_schema.questions "
                "(id, topic_id, stem, choices, correct_idx, created_by, status) "
                "VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)",
                uuid4(), topic_id, "Stem?", '["a","b"]', 0, uuid4(), "DRAFT")
        if with_cross_refs:
            await conn.execute(
                "INSERT INTO catalog_schema.educator_assignments (id, educator_id, exam_id) "
                "VALUES ($1, $2, $3)", uuid4(), uuid4(), exam_id)
            await conn.execute(
                "INSERT INTO catalog_schema.topic_importance_overrides "
                "(exam_id, topic_id, weight) VALUES ($1, $2, $3)",
                exam_id, topic_id, 0.5)
        return {"exam_id": str(exam_id), "code": code,
                "subject_id": str(subject_id), "topic_id": str(topic_id)}
    finally:
        await conn.close()


async def _cleanup(exam_id: str) -> None:
    conn = await _connect()
    try:
        eid = exam_id
        await conn.execute("DELETE FROM catalog_schema.topic_importance_overrides WHERE exam_id=$1::uuid", eid)
        await conn.execute("DELETE FROM catalog_schema.educator_assignments WHERE exam_id=$1::uuid", eid)
        await conn.execute(
            "DELETE FROM content_schema.questions WHERE topic_id IN "
            "(SELECT t.id FROM catalog_schema.topics t JOIN catalog_schema.subjects s "
            " ON s.id=t.subject_id WHERE s.exam_id=$1::uuid)", eid)
        await conn.execute(
            "DELETE FROM catalog_schema.topics WHERE subject_id IN "
            "(SELECT id FROM catalog_schema.subjects WHERE exam_id=$1::uuid)", eid)
        await conn.execute("DELETE FROM catalog_schema.subjects WHERE exam_id=$1::uuid", eid)
        await conn.execute("DELETE FROM catalog_schema.subject_pools WHERE exam_id=$1::uuid", eid)
        await conn.execute("DELETE FROM catalog_schema.exam_blueprints WHERE exam_id=$1::uuid", eid)
        await conn.execute("DELETE FROM catalog_schema.exams WHERE id=$1::uuid", eid)
    finally:
        await conn.close()


async def _published_flags(exam_id: str) -> dict:
    conn = await _connect()
    try:
        e = await conn.fetchval("SELECT is_published FROM catalog_schema.exams WHERE id=$1::uuid", exam_id)
        s = await conn.fetchval("SELECT bool_and(is_published) FROM catalog_schema.subjects WHERE exam_id=$1::uuid", exam_id)
        t = await conn.fetchval(
            "SELECT bool_and(is_published) FROM catalog_schema.topics WHERE subject_id IN "
            "(SELECT id FROM catalog_schema.subjects WHERE exam_id=$1::uuid)", exam_id)
        return {"exam": e, "subjects": s, "topics": t}
    finally:
        await conn.close()


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def test_retire_requires_admin(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam())
    try:
        r = client.post(f"{PREFIX}/exams/{seed['exam_id']}/retire", headers=_auth("STUDENT"))
        assert r.status_code == 403
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))


def test_retire_unknown_exam_404(client: TestClient) -> None:
    r = client.post(f"{PREFIX}/exams/{uuid4()}/retire", headers=_auth())
    assert r.status_code == 404


def test_retire_flips_published_false(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam(published=True))
    try:
        r = client.post(f"{PREFIX}/exams/{seed['exam_id']}/retire", headers=_auth())
        assert r.status_code == 200
        body = r.json()
        assert body["code"] == seed["code"]
        assert body["subjects_retired"] == 1
        assert body["topics_retired"] == 1
        flags = asyncio.run(_published_flags(seed["exam_id"]))
        assert flags == {"exam": False, "subjects": False, "topics": False}
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_exam_lifecycle.py -v`
Expected: FAIL — the retire route returns 404/405 (endpoint not defined) so `test_retire_flips_published_false` fails the 200 assertion.

- [ ] **Step 3: Write minimal implementation**

In `services/learning/src/learning/exam_builder/routes.py`, after the `list_exams` handler (after line 784) add:

```python
# ─────────────────────────────────────────────────────────────────────
# Lifecycle — retire / restore / delete an exam
# ─────────────────────────────────────────────────────────────────────


class RetireResponse(BaseModel):
    exam_id: str
    code: str
    subjects_retired: int
    topics_retired: int


@router.post("/exams/{exam_id}/retire", response_model=RetireResponse)
async def retire_exam(
    exam_id: str, session: SessionDep, principal: PrincipalDep,
) -> RetireResponse:
    """Soft-delete: set is_published=FALSE on the exam + its subjects + topics.
    Idempotent. All rows preserved so FK references stay intact."""
    _require_admin(principal)
    row = (await session.execute(
        text("SELECT code FROM catalog_schema.exams WHERE id = CAST(:eid AS uuid)"),
        {"eid": exam_id},
    )).mappings().first()
    if row is None:
        raise HTTPException(status_code=404,
                            detail={"code": "not_found", "message": "exam not found"})
    subj = await session.execute(
        text("UPDATE catalog_schema.subjects SET is_published = FALSE "
             "WHERE exam_id = CAST(:eid AS uuid) AND is_published = TRUE"),
        {"eid": exam_id})
    top = await session.execute(
        text("UPDATE catalog_schema.topics SET is_published = FALSE "
             "WHERE subject_id IN (SELECT id FROM catalog_schema.subjects "
             "WHERE exam_id = CAST(:eid AS uuid)) AND is_published = TRUE"),
        {"eid": exam_id})
    await session.execute(
        text("UPDATE catalog_schema.exams SET is_published = FALSE "
             "WHERE id = CAST(:eid AS uuid)"),
        {"eid": exam_id})
    await session.commit()
    return RetireResponse(
        exam_id=exam_id, code=row["code"],
        subjects_retired=subj.rowcount or 0, topics_retired=top.rowcount or 0)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_exam_lifecycle.py -v`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/exam_builder/routes.py services/learning/tests/exam_builder/test_exam_lifecycle.py
git commit -m "feat(exam-builder): retire (soft-delete) exam endpoint"
```

---

### Task 2: Backend — restore endpoint

**Files:**
- Modify: `services/learning/src/learning/exam_builder/routes.py` (after `retire_exam`)
- Test: `services/learning/tests/exam_builder/test_exam_lifecycle.py` (append)

**Interfaces:**
- Consumes: same as Task 1; the `_seed_exam` / `_cleanup` / `_published_flags` / `_auth` / `client` helpers already exist in the test file.
- Produces: `POST /admin/exam-builder/exams/{exam_id}/restore` → `RestoreResponse{exam_id:str, code:str, subjects_restored:int, topics_restored:int}`.

- [ ] **Step 1: Write the failing test**

Append to `services/learning/tests/exam_builder/test_exam_lifecycle.py`:

```python
def test_restore_unknown_exam_404(client: TestClient) -> None:
    r = client.post(f"{PREFIX}/exams/{uuid4()}/restore", headers=_auth())
    assert r.status_code == 404


def test_restore_reverses_retire(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam(published=False))
    try:
        r = client.post(f"{PREFIX}/exams/{seed['exam_id']}/restore", headers=_auth())
        assert r.status_code == 200
        body = r.json()
        assert body["subjects_restored"] == 1
        assert body["topics_restored"] == 1
        flags = asyncio.run(_published_flags(seed["exam_id"]))
        assert flags == {"exam": True, "subjects": True, "topics": True}
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_exam_lifecycle.py::test_restore_reverses_retire -v`
Expected: FAIL — restore route not defined (404).

- [ ] **Step 3: Write minimal implementation**

In `routes.py`, after `retire_exam`:

```python
class RestoreResponse(BaseModel):
    exam_id: str
    code: str
    subjects_restored: int
    topics_restored: int


@router.post("/exams/{exam_id}/restore", response_model=RestoreResponse)
async def restore_exam(
    exam_id: str, session: SessionDep, principal: PrincipalDep,
) -> RestoreResponse:
    """Re-publish: set is_published=TRUE on the exam + its subjects + topics."""
    _require_admin(principal)
    row = (await session.execute(
        text("SELECT code FROM catalog_schema.exams WHERE id = CAST(:eid AS uuid)"),
        {"eid": exam_id},
    )).mappings().first()
    if row is None:
        raise HTTPException(status_code=404,
                            detail={"code": "not_found", "message": "exam not found"})
    subj = await session.execute(
        text("UPDATE catalog_schema.subjects SET is_published = TRUE "
             "WHERE exam_id = CAST(:eid AS uuid) AND is_published = FALSE"),
        {"eid": exam_id})
    top = await session.execute(
        text("UPDATE catalog_schema.topics SET is_published = TRUE "
             "WHERE subject_id IN (SELECT id FROM catalog_schema.subjects "
             "WHERE exam_id = CAST(:eid AS uuid)) AND is_published = FALSE"),
        {"eid": exam_id})
    await session.execute(
        text("UPDATE catalog_schema.exams SET is_published = TRUE "
             "WHERE id = CAST(:eid AS uuid)"),
        {"eid": exam_id})
    await session.commit()
    return RestoreResponse(
        exam_id=exam_id, code=row["code"],
        subjects_restored=subj.rowcount or 0, topics_restored=top.rowcount or 0)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_exam_lifecycle.py -v`
Expected: PASS — all lifecycle tests so far green.

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/exam_builder/routes.py services/learning/tests/exam_builder/test_exam_lifecycle.py
git commit -m "feat(exam-builder): restore (re-publish) exam endpoint"
```

---

### Task 3: Backend — guarded permanent DELETE endpoint

**Files:**
- Modify: `services/learning/src/learning/exam_builder/routes.py` (after `restore_exam`)
- Test: `services/learning/tests/exam_builder/test_exam_lifecycle.py` (append)

**Interfaces:**
- Consumes: same helpers as Tasks 1-2.
- Produces: `DELETE /admin/exam-builder/exams/{exam_id}` → `DeleteResponse{exam_id:str, code:str, subjects_deleted:int, topics_deleted:int, pools_deleted:int, blueprints_deleted:int}`; on guard violation returns **409** with body `{"code":"exam_in_use", "questionCount":int, "blueprintCount":int, "message":str}`.

- [ ] **Step 1: Write the failing test**

Append to `services/learning/tests/exam_builder/test_exam_lifecycle.py`:

```python
async def _exam_exists(exam_id: str) -> bool:
    conn = await _connect()
    try:
        v = await conn.fetchval("SELECT 1 FROM catalog_schema.exams WHERE id=$1::uuid", exam_id)
        return v is not None
    finally:
        await conn.close()


async def _row_counts(exam_id: str) -> dict:
    conn = await _connect()
    try:
        subj = await conn.fetchval("SELECT COUNT(*) FROM catalog_schema.subjects WHERE exam_id=$1::uuid", exam_id)
        top = await conn.fetchval(
            "SELECT COUNT(*) FROM catalog_schema.topics WHERE subject_id IN "
            "(SELECT id FROM catalog_schema.subjects WHERE exam_id=$1::uuid)", exam_id)
        ea = await conn.fetchval("SELECT COUNT(*) FROM catalog_schema.educator_assignments WHERE exam_id=$1::uuid", exam_id)
        tio = await conn.fetchval("SELECT COUNT(*) FROM catalog_schema.topic_importance_overrides WHERE exam_id=$1::uuid", exam_id)
        return {"subjects": subj, "topics": top, "educator_assignments": ea, "importance": tio}
    finally:
        await conn.close()


def test_delete_requires_admin(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam())
    try:
        r = client.delete(f"{PREFIX}/exams/{seed['exam_id']}", headers=_auth("STUDENT"))
        assert r.status_code == 403
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))


def test_delete_unknown_exam_404(client: TestClient) -> None:
    r = client.delete(f"{PREFIX}/exams/{uuid4()}", headers=_auth())
    assert r.status_code == 404


def test_delete_blocked_by_blueprint_409(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam(with_blueprint=True))
    try:
        r = client.delete(f"{PREFIX}/exams/{seed['exam_id']}", headers=_auth())
        assert r.status_code == 409
        body = r.json()["detail"]
        assert body["code"] == "exam_in_use"
        assert body["blueprintCount"] == 1
        assert body["questionCount"] == 0
        assert asyncio.run(_exam_exists(seed["exam_id"])) is True  # nothing deleted
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))


def test_delete_blocked_by_question_409(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam(with_question=True))
    try:
        r = client.delete(f"{PREFIX}/exams/{seed['exam_id']}", headers=_auth())
        assert r.status_code == 409
        body = r.json()["detail"]
        assert body["questionCount"] == 1
        assert asyncio.run(_exam_exists(seed["exam_id"])) is True
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))


def test_delete_clean_exam_removes_all_rows(client: TestClient) -> None:
    seed = asyncio.run(_seed_exam(with_cross_refs=True))
    try:
        r = client.delete(f"{PREFIX}/exams/{seed['exam_id']}", headers=_auth())
        assert r.status_code == 200
        body = r.json()
        assert body["code"] == seed["code"]
        assert body["subjects_deleted"] == 1
        assert body["topics_deleted"] == 1
        assert asyncio.run(_exam_exists(seed["exam_id"])) is False
        counts = asyncio.run(_row_counts(seed["exam_id"]))
        assert counts == {"subjects": 0, "topics": 0,
                          "educator_assignments": 0, "importance": 0}
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_exam_lifecycle.py -k delete -v`
Expected: FAIL — DELETE route not defined.

- [ ] **Step 3: Write minimal implementation**

In `routes.py`, after `restore_exam`:

```python
class DeleteResponse(BaseModel):
    exam_id: str
    code: str
    subjects_deleted: int
    topics_deleted: int
    pools_deleted: int
    blueprints_deleted: int


@router.delete("/exams/{exam_id}", response_model=DeleteResponse)
async def delete_exam(
    exam_id: str, session: SessionDep, principal: PrincipalDep,
) -> DeleteResponse:
    """Permanently delete a content-free exam. Guarded: refuses (409) if the
    exam has any authored questions or blueprints. FK-safe single transaction."""
    _require_admin(principal)
    row = (await session.execute(
        text("SELECT code FROM catalog_schema.exams WHERE id = CAST(:eid AS uuid)"),
        {"eid": exam_id},
    )).mappings().first()
    if row is None:
        raise HTTPException(status_code=404,
                            detail={"code": "not_found", "message": "exam not found"})

    question_count = (await session.execute(
        text("SELECT COUNT(*) FROM content_schema.questions WHERE topic_id IN "
             "(SELECT t.id FROM catalog_schema.topics t "
             " JOIN catalog_schema.subjects s ON s.id = t.subject_id "
             " WHERE s.exam_id = CAST(:eid AS uuid))"),
        {"eid": exam_id})).scalar_one()
    blueprint_count = (await session.execute(
        text("SELECT COUNT(*) FROM catalog_schema.exam_blueprints "
             "WHERE exam_id = CAST(:eid AS uuid)"),
        {"eid": exam_id})).scalar_one()

    if question_count > 0 or blueprint_count > 0:
        raise HTTPException(status_code=409, detail={
            "code": "exam_in_use",
            "questionCount": int(question_count),
            "blueprintCount": int(blueprint_count),
            "message": (f"Exam has {question_count} questions and "
                        f"{blueprint_count} blueprints — retire it instead."),
        })

    eid = {"eid": exam_id}
    # FK-safe order: cross-ref tables → topics → subjects → pools → blueprints → exam.
    await session.execute(text(
        "DELETE FROM catalog_schema.topic_importance_overrides "
        "WHERE exam_id = CAST(:eid AS uuid)"), eid)
    await session.execute(text(
        "DELETE FROM catalog_schema.educator_assignments "
        "WHERE exam_id = CAST(:eid AS uuid)"), eid)
    top = await session.execute(text(
        "DELETE FROM catalog_schema.topics WHERE subject_id IN "
        "(SELECT id FROM catalog_schema.subjects WHERE exam_id = CAST(:eid AS uuid))"), eid)
    subj = await session.execute(text(
        "DELETE FROM catalog_schema.subjects WHERE exam_id = CAST(:eid AS uuid)"), eid)
    pools = await session.execute(text(
        "DELETE FROM catalog_schema.subject_pools WHERE exam_id = CAST(:eid AS uuid)"), eid)
    bps = await session.execute(text(
        "DELETE FROM catalog_schema.exam_blueprints WHERE exam_id = CAST(:eid AS uuid)"), eid)
    await session.execute(text(
        "DELETE FROM catalog_schema.exams WHERE id = CAST(:eid AS uuid)"), eid)
    await session.commit()
    return DeleteResponse(
        exam_id=exam_id, code=row["code"],
        subjects_deleted=subj.rowcount or 0, topics_deleted=top.rowcount or 0,
        pools_deleted=pools.rowcount or 0, blueprints_deleted=bps.rowcount or 0)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_exam_lifecycle.py -v`
Expected: PASS — every lifecycle test green.

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/exam_builder/routes.py services/learning/tests/exam_builder/test_exam_lifecycle.py
git commit -m "feat(exam-builder): guarded permanent delete exam endpoint"
```

---

### Task 4: Backend — extend list endpoint with question_count + blueprint_count

**Files:**
- Modify: `services/learning/src/learning/exam_builder/routes.py` — `ExamListEntry` (lines 735-743) and `list_exams` (lines 746-784)
- Test: `services/learning/tests/exam_builder/test_exam_list_counts.py` (create)

**Interfaces:**
- Consumes: existing `list_exams` query + `ExamListEntry`.
- Produces: `ExamListEntry` gains `question_count: int` and `blueprint_count: int`; `GET /admin/exam-builder/exams` returns them per row.

- [ ] **Step 1: Write the failing test**

Create `services/learning/tests/exam_builder/test_exam_list_counts.py`:

```python
"""GET /admin/exam-builder/exams — question_count + blueprint_count fields."""
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
from learning.main import app

PREFIX = "/admin/exam-builder"


def _auth(role: str = "PLATFORM_ADMIN") -> dict[str, str]:
    tok = jwt.encode(
        {"sub": str(uuid4()), "role": role, "iat": int(time.time()),
         "exp": int(time.time()) + 3600},
        settings.jwt_secret, algorithm="HS256")
    return {"authorization": f"Bearer {tok}"}


async def _connect() -> asyncpg.Connection:
    return await asyncpg.connect(host="localhost", port=35432, user="postgres",
                                 password="postgres", database="learning_test")


async def _seed() -> dict:
    conn = await _connect()
    try:
        exam_id, subject_id, topic_id = uuid4(), uuid4(), uuid4()
        code = f"CNT_{uuid4().hex[:8].upper()}"
        await conn.execute("INSERT INTO catalog_schema.exams (id, code, name) VALUES ($1,$2,$3)",
                           exam_id, code, "Counts Exam")
        await conn.execute("INSERT INTO catalog_schema.subjects (id, exam_id, code, name) VALUES ($1,$2,$3,$4)",
                           subject_id, exam_id, "SUB_A", "Subject A")
        await conn.execute("INSERT INTO catalog_schema.topics (id, subject_id, code, title) VALUES ($1,$2,$3,$4)",
                           topic_id, subject_id, "T1", "Topic One")
        await conn.execute(
            "INSERT INTO content_schema.questions (id, topic_id, stem, choices, correct_idx, created_by, status) "
            "VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)",
            uuid4(), topic_id, "Q?", '["a","b"]', 0, uuid4(), "DRAFT")
        await conn.execute(
            "INSERT INTO catalog_schema.exam_blueprints "
            "(id, exam_id, name, total_questions, total_minutes, marks_correct, sections) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)", uuid4(), exam_id, "BP", 10, 30, 4, "[]")
        return {"exam_id": str(exam_id), "code": code}
    finally:
        await conn.close()


async def _cleanup(exam_id: str) -> None:
    conn = await _connect()
    try:
        await conn.execute(
            "DELETE FROM content_schema.questions WHERE topic_id IN "
            "(SELECT t.id FROM catalog_schema.topics t JOIN catalog_schema.subjects s "
            " ON s.id=t.subject_id WHERE s.exam_id=$1::uuid)", exam_id)
        await conn.execute("DELETE FROM catalog_schema.exam_blueprints WHERE exam_id=$1::uuid", exam_id)
        await conn.execute(
            "DELETE FROM catalog_schema.topics WHERE subject_id IN "
            "(SELECT id FROM catalog_schema.subjects WHERE exam_id=$1::uuid)", exam_id)
        await conn.execute("DELETE FROM catalog_schema.subjects WHERE exam_id=$1::uuid", exam_id)
        await conn.execute("DELETE FROM catalog_schema.exams WHERE id=$1::uuid", exam_id)
    finally:
        await conn.close()


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def test_list_includes_question_and_blueprint_counts(client: TestClient) -> None:
    seed = asyncio.run(_seed())
    try:
        r = client.get(f"{PREFIX}/exams", headers=_auth())
        assert r.status_code == 200
        entry = next(e for e in r.json() if e["id"] == seed["exam_id"])
        assert entry["question_count"] == 1
        assert entry["blueprint_count"] == 1
    finally:
        asyncio.run(_cleanup(seed["exam_id"]))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_exam_list_counts.py -v`
Expected: FAIL — `KeyError: 'question_count'` (field not in response).

- [ ] **Step 3: Write minimal implementation**

In `routes.py`, extend `ExamListEntry` (after `topic_count: int`, line 743):

```python
    topic_count: int
    question_count: int
    blueprint_count: int
```

In the `list_exams` SQL (lines 757-769), add two subqueries after the `topic_count` subquery (before `FROM catalog_schema.exams e`):

```python
            """
            SELECT e.id, e.code, e.name, e.subtitle, e.is_published,
                   (SELECT COUNT(*) FROM catalog_schema.subjects s
                      WHERE s.exam_id = e.id AND s.is_published = TRUE) AS subject_count,
                   (SELECT COUNT(*) FROM catalog_schema.subject_pools p
                      WHERE p.exam_id = e.id) AS pool_count,
                   (SELECT COUNT(*) FROM catalog_schema.topics t
                      JOIN catalog_schema.subjects s ON s.id = t.subject_id
                     WHERE s.exam_id = e.id AND t.is_published = TRUE
                       AND s.is_published = TRUE) AS topic_count,
                   (SELECT COUNT(*) FROM content_schema.questions q
                     WHERE q.topic_id IN (
                       SELECT t.id FROM catalog_schema.topics t
                         JOIN catalog_schema.subjects s ON s.id = t.subject_id
                        WHERE s.exam_id = e.id)) AS question_count,
                   (SELECT COUNT(*) FROM catalog_schema.exam_blueprints b
                      WHERE b.exam_id = e.id) AS blueprint_count
              FROM catalog_schema.exams e
             ORDER BY e.is_published DESC, e.sort_order, e.name
            """
```

In the return comprehension (lines 772-782), add the two fields:

```python
            topic_count=int(r["topic_count"]),
            question_count=int(r["question_count"]),
            blueprint_count=int(r["blueprint_count"]),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && uv run pytest tests/exam_builder/test_exam_list_counts.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/exam_builder/routes.py services/learning/tests/exam_builder/test_exam_list_counts.py
git commit -m "feat(exam-builder): add question_count + blueprint_count to exam list"
```

---

### Task 5: Frontend — `isDeletable` pure helper

**Files:**
- Create: `apps/web-admin/src/lib/examActions.ts`
- Test: `apps/web-admin/src/lib/examActions.test.ts`

**Interfaces:**
- Produces: `isDeletable(row: { question_count: number; blueprint_count: number }): boolean` — true only when both counts are 0. Consumed by Task 7.

- [ ] **Step 1: Write the failing test**

Create `apps/web-admin/src/lib/examActions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isDeletable } from "./examActions";

describe("isDeletable", () => {
  it("is true when both counts are zero", () => {
    expect(isDeletable({ question_count: 0, blueprint_count: 0 })).toBe(true);
  });
  it("is false when questions exist", () => {
    expect(isDeletable({ question_count: 3, blueprint_count: 0 })).toBe(false);
  });
  it("is false when blueprints exist", () => {
    expect(isDeletable({ question_count: 0, blueprint_count: 2 })).toBe(false);
  });
  it("is false when both exist", () => {
    expect(isDeletable({ question_count: 5, blueprint_count: 1 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-admin && npx vitest run src/lib/examActions.test.ts`
Expected: FAIL — cannot resolve `./examActions`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web-admin/src/lib/examActions.ts`:

```ts
// Pure guards for the exam catalog row actions (web-admin /exams).

export interface ExamCounts {
  question_count: number;
  blueprint_count: number;
}

/** An exam may be permanently deleted only when it is content-free:
 *  no authored questions and no blueprints. Mirrors the server guard. */
export function isDeletable(row: ExamCounts): boolean {
  return row.question_count === 0 && row.blueprint_count === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web-admin && npx vitest run src/lib/examActions.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/src/lib/examActions.ts apps/web-admin/src/lib/examActions.test.ts
git commit -m "feat(web-admin): isDeletable guard for exam catalog"
```

---

### Task 6: Frontend — `ConfirmDeleteModal` component

**Files:**
- Create: `apps/web-admin/src/components/ConfirmDeleteModal.tsx`
- Test: `apps/web-admin/src/components/ConfirmDeleteModal.test.tsx`

**Interfaces:**
- Produces: `ConfirmDeleteModal` with props `{ examName: string; examCode: string; busy?: boolean; error?: string | null; onConfirm: () => void; onCancel: () => void }`. The Delete button is disabled until the typed input strictly equals `examCode`. Consumed by Task 7.

- [ ] **Step 1: Write the failing test**

Create `apps/web-admin/src/components/ConfirmDeleteModal.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

describe("ConfirmDeleteModal", () => {
  it("keeps Delete disabled until the code is typed exactly", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteModal examName="Class 7" examCode="CLASS7"
        onConfirm={onConfirm} onCancel={() => {}} />,
    );
    const btn = screen.getByRole("button", { name: /delete permanently/i });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type the exam code/i), {
      target: { value: "wrong" },
    });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type the exam code/i), {
      target: { value: "CLASS7" },
    });
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("invokes onCancel from the Cancel button", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDeleteModal examName="Class 7" examCode="CLASS7"
        onConfirm={() => {}} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
```

> **Note:** This project already uses `@testing-library/react` + `vitest` with a jsdom environment for component tests (the `*.test.tsx` files under `apps/web-admin/src`). If the runner reports a missing matcher like `toBeDisabled`, confirm `@testing-library/jest-dom` is imported in the existing vitest setup file; do not add new test infra — follow the existing pattern in the repo's other `*.test.tsx`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-admin && npx vitest run src/components/ConfirmDeleteModal.test.tsx`
Expected: FAIL — cannot resolve `./ConfirmDeleteModal`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web-admin/src/components/ConfirmDeleteModal.tsx`:

```tsx
// Type-the-code confirmation for permanent exam deletion (web-admin /exams).
import { useState } from "react";

interface Props {
  examName: string;
  examCode: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  examName, examCode, busy = false, error = null, onConfirm, onCancel,
}: Props) {
  const [typed, setTyped] = useState("");
  const matches = typed === examCode;

  return (
    <div className="admin-modal__backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal">
        <h2 className="admin-modal__title">Delete exam permanently</h2>
        <p className="admin-modal__body">
          This permanently deletes <strong>{examName}</strong> and all of its
          subjects, topics and pools. This cannot be undone.
        </p>
        <label className="admin-modal__label" htmlFor="confirm-code">
          Type the exam code <code>{examCode}</code> to confirm:
        </label>
        <input
          id="confirm-code"
          className="admin-modal__input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          disabled={busy}
        />
        {error ? (
          <div className="vidya-auth__error" role="alert"><span>{error}</span></div>
        ) : null}
        <div className="admin-modal__actions">
          <button className="admin-btn admin-btn--link" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="admin-btn admin-btn--danger"
            onClick={onConfirm}
            disabled={!matches || busy}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web-admin && npx vitest run src/components/ConfirmDeleteModal.test.tsx`
Expected: PASS — 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/src/components/ConfirmDeleteModal.tsx apps/web-admin/src/components/ConfirmDeleteModal.test.tsx
git commit -m "feat(web-admin): ConfirmDeleteModal type-the-code dialog"
```

---

### Task 7: Frontend — wire row actions into `ExamsList`

**Files:**
- Modify: `apps/web-admin/src/pages/ExamsList.tsx`

**Interfaces:**
- Consumes: `isDeletable` (Task 5), `ConfirmDeleteModal` (Task 6), the extended `GET …/exams` response (Task 4: `question_count`, `blueprint_count`), and the three endpoints (Tasks 1-3).
- Produces: the catalog table's per-row Retire / Restore / Delete actions plus a refetch + modal.

- [ ] **Step 1: Add the count fields to the interface + a refetch + action state**

In `apps/web-admin/src/pages/ExamsList.tsx`, extend `ExamListEntry` (after `topic_count: number;`, line 19):

```tsx
  topic_count: number;
  question_count: number;
  blueprint_count: number;
```

Add the helper import and modal import at the top (after the `auth` import, line 9):

```tsx
import { isDeletable } from "../lib/examActions";
import { ConfirmDeleteModal } from "../components/ConfirmDeleteModal";
```

Replace the existing `useEffect` data load (lines 29-40) with a reusable `load` callback plus action state:

```tsx
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ExamListEntry | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await auth.fetch("/api/v1/admin/exam-builder/exams");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setExams(Array.isArray(body) ? (body as ExamListEntry[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load exams");
    }
  };

  useEffect(() => {
    void load();
  }, []);
```

- [ ] **Step 2: Add the retire/restore handlers**

After the `load` callback (still inside the component), add:

```tsx
  const retire = async (e: ExamListEntry) => {
    if (!window.confirm(`Retire "${e.name}"? Students will no longer see it. You can restore it later.`)) return;
    setBusyId(e.id);
    try {
      const res = await auth.fetch(`/api/v1/admin/exam-builder/exams/${e.id}/retire`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retire failed");
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (e: ExamListEntry) => {
    if (!window.confirm(`Restore "${e.name}" to Published?`)) return;
    setBusyId(e.id);
    try {
      const res = await auth.fetch(`/api/v1/admin/exam-builder/exams/${e.id}/restore`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    setDeleteError(null);
    try {
      const res = await auth.fetch(`/api/v1/admin/exam-builder/exams/${toDelete.id}`, { method: "DELETE" });
      if (res.status === 409) {
        const body = await res.json();
        setDeleteError(body?.detail?.message ?? "Exam is in use — retire it instead.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setToDelete(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };
```

- [ ] **Step 3: Replace the single row action cell with the action set**

Replace the row-action `<td>` (lines 123-127) with:

```tsx
                  <td style={{ textAlign: "right" }}>
                    <Link to={`/exams/edit/${e.id}`} className="admin-btn admin-btn--link">
                      Edit →
                    </Link>
                    {e.is_published ? (
                      <button className="admin-btn admin-btn--link" disabled={busyId === e.id}
                        onClick={() => retire(e)}>
                        Retire
                      </button>
                    ) : (
                      <button className="admin-btn admin-btn--link" disabled={busyId === e.id}
                        onClick={() => restore(e)}>
                        Restore
                      </button>
                    )}
                    <button
                      className="admin-btn admin-btn--link admin-btn--danger"
                      disabled={!isDeletable(e) || busyId === e.id}
                      title={
                        isDeletable(e)
                          ? "Permanently delete this exam"
                          : `Has ${e.question_count} questions / ${e.blueprint_count} blueprints — retire instead`
                      }
                      onClick={() => { setDeleteError(null); setToDelete(e); }}
                    >
                      Delete
                    </button>
                  </td>
```

- [ ] **Step 4: Render the modal**

Immediately before the closing `</AdminShell>` tag (line 134), add:

```tsx
      {toDelete ? (
        <ConfirmDeleteModal
          examName={toDelete.name}
          examCode={toDelete.code}
          busy={busyId === toDelete.id}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => { setToDelete(null); setDeleteError(null); }}
        />
      ) : null}
```

- [ ] **Step 5: Type-check + run the full web-admin suite**

Run: `cd apps/web-admin && npx tsc --noEmit && npx vitest run`
Expected: tsc clean; vitest shows the new `examActions` + `ConfirmDeleteModal` tests passing and no new failures vs the prior baseline.

- [ ] **Step 6: Commit**

```bash
git add apps/web-admin/src/pages/ExamsList.tsx
git commit -m "feat(web-admin): retire/restore/delete actions on exam catalog"
```

---

## Deployment (after all tasks pass review)

Rebuild + recreate the affected containers so the built bundles pick up the changes (local apps are served by nginx from a built bundle, not a vite dev server):

```bash
cd infrastructure/docker
docker compose build learning web-admin
docker compose up -d learning web-admin
```

Then hard-refresh `/exams`, confirm: a Published row shows Retire (→ moves to Retired tab); a Retired row shows Restore; Delete is enabled only for a content-free exam and opens the type-the-code modal; deleting a junk exam removes it; attempting to delete an exam with questions/blueprints surfaces the 409 message.

> Verify the exact compose service names (`learning`, `web-admin`) against `infrastructure/docker/docker-compose*.yml` before running — adjust if they differ.

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| `POST …/{id}/retire` soft-deletes exam+subjects+topics, idempotent, 404 | T1 |
| `POST …/{id}/restore` re-publishes, 404 | T2 |
| `DELETE …/{id}` lean guard (questions+blueprints), 409 `exam_in_use`, FK-safe txn, 404 | T3 |
| All endpoints `_require_admin` → 403 | T1/T2/T3 (tests assert) |
| Extend list with `question_count`+`blueprint_count` | T4 |
| `ExamListEntry` frontend gains the two counts | T7 step 1 |
| Per-row Retire (published) / Restore (retired) | T7 |
| Delete enabled only when both counts 0, else disabled + tooltip | T7 (uses T5 `isDeletable`) |
| `ConfirmDeleteModal` type-the-code, Delete enabled only on exact match | T6 |
| `isDeletable(row)` pure + unit-testable | T5 |
| 409 surfaces returned message in UI | T7 step 2 `confirmDelete` |
| Backend tests: retire/restore flips, delete 409 w/ counts, clean delete removes rows, 403, 404 | T1-T4 |
| Frontend tests: `isDeletable` both-zero only; modal enables on exact code | T5, T6 |

All spec sections map to a task. No gaps.

**2. Placeholder scan:** No TBD/TODO/"handle errors"/"similar to" — every code step contains complete code. ✓

**3. Type consistency:** `isDeletable(ExamCounts)` used in T7 with `ExamListEntry` (a structural superset — has both `question_count` and `blueprint_count`). `ConfirmDeleteModal` prop names (`examName`, `examCode`, `busy`, `error`, `onConfirm`, `onCancel`) match between T6 definition and T7 usage. Response field names (`question_count`/`blueprint_count`) match between T4 (backend) and T7 (frontend). 409 body path `detail.message` matches T3 (`HTTPException(detail={...})` nests under `detail`) and T7's `body?.detail?.message`. ✓

**Out of scope (per spec):** cross-service enrollment/attempt checks, orphan cleanup, bulk multi-select delete, audit-log entry. Not planned. ✓
