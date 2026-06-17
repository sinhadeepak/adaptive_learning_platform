# Bulk Translation Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins manage the set of available languages, batch-translate selected questions into selected languages via a background job, and bulk verify/edit/publish the resulting drafts.

**Architecture:** A new DB-backed **language registry** replaces the hardcoded `SUPPORTED_LANGS`. A **batch engine** (two tables + a `BackgroundTasks` worker) fans out (question × language) tasks and reuses the existing `translate_artifact` → `upsert_translation_draft` pipeline. A **bulk review** API + screen surfaces drafts with side-by-side diff, inline edit (new version), and bulk approve&publish (existing `approve_translation`, DRAFT→PUBLISHED). All migrations are additive; no change to `content_artifact_translations` columns.

**Tech Stack:** Backend — Python 3.11, FastAPI, SQLAlchemy (async, raw `text()` SQL), Alembic, pytest/pytest-asyncio. Frontend — React 18, Vite, TypeScript, React Router 6, Vitest + React Testing Library.

## Global Constraints

- Backend service: `services/learning`. Frontend app: `apps/web-admin`.
- DB schema for all new tables: `content_schema`.
- New migration revision id: `043`, `down_revision = "042"` (current head). File: `services/learning/alembic/content/versions/043_translation_workbench.py`.
- All new translation-pipeline languages are validated against the **registry** (`enabled = TRUE AND is_source = FALSE`), never against the hardcoded list.
- Disabling or deleting a language MUST NOT delete existing translations.
- "Confirm" = approve = DRAFT→PUBLISHED in one step (reuse existing `approve_translation`).
- Inline edits write a **new version** via `upsert_translation_draft` (status stays DRAFT); never mutate in place.
- Admin routes use the existing `adminRoute(...)` wrapper (ProtectedRoute + AdminGate).
- Frontend HTTP uses `auth.fetch` from `apps/web-admin/src/lib/api.ts` and `env.apiBaseUrl` from `lib/env.ts`.
- `scope=all` question reads require role MODERATOR+ (already enforced by the existing endpoint).
- Run backend tests with: `cd services/learning && python -m pytest <path> -v`.
- Run frontend tests with: `cd apps/web-admin && npx vitest run <path>`.

### Deliberate simplifications (deviations from spec, intentional — YAGNI)

1. **Registry cache:** spec mentioned a ~60s in-process cache. Deferred — registry reads hit the DB directly (a tiny table; correctness over a micro-optimisation, and avoids time-based test flake). Revisit only if profiling shows it matters.
2. **Select-all-matching resolution:** the batch endpoint accepts an explicit `questionIds` array only (cap 1000). "Select all N matching" is resolved **client-side** by paging the existing `/content/questions` list endpoint (cap 500, surfaced in the UI). This avoids re-implementing the question filter query inside the batch endpoint.

---

## File Structure

**Backend (create):**
- `services/learning/alembic/content/versions/043_translation_workbench.py` — three tables + language seed.
- `services/learning/src/learning/localisation/language_registry.py` — registry repo.
- `services/learning/src/learning/localisation/language_routes.py` — registry HTTP routes.
- `services/learning/src/learning/localisation/artifact_payload.py` — payload helpers moved out of `translation_routes.py` (shared by worker + endpoint).
- `services/learning/src/learning/localisation/translate_one.py` — shared single-artifact translate core.
- `services/learning/src/learning/localisation/batch_repo.py` — batch + task DB writers/readers.
- `services/learning/src/learning/localisation/batch_worker.py` — background drain loop.
- `services/learning/src/learning/localisation/batch_routes.py` — batch HTTP routes.
- `services/learning/src/learning/localisation/review_queue.py` — review-queue repo (list + bulk decisions).
- Tests under `services/learning/tests/localisation/`.

**Backend (modify):**
- `src/learning/localisation/translator.py` — relax hardcoded guard (add `allowed_langs` param).
- `src/learning/localisation/routes.py` — registry-backed validation in `/translate`.
- `src/learning/content/translation_routes.py` — move payload helpers out; registry validation; add versioned-edit `PUT`; refactor `request_translation` to call shared core.
- `src/learning/main.py` — register `language_router`, `batch_router`, `review_queue_router`.

**Frontend (create):**
- `apps/web-admin/src/lib/translation-workbench-api.ts` — API client (languages, batches, review queue, edit).
- `apps/web-admin/src/components/PayloadDiff.tsx` — path-driven, editable source↔translation diff for the verify screen (new; `TranslationReview.tsx` keeps its own recursive read-only diff — see deviation #3).
- `apps/web-admin/src/pages/TranslationBatch.tsx` — batch progress page.
- `apps/web-admin/src/pages/TranslationBatches.tsx` — recent batches list.
- `apps/web-admin/src/pages/TranslationVerify.tsx` — bulk verification screen.
- `apps/web-admin/src/pages/Languages.tsx` — registry CRUD page.
- Tests under `apps/web-admin/src/**/__tests__/` (Vitest).

**Frontend (modify):**
- `apps/web-admin/src/pages/TranslationsList.tsx` — checkbox selection + sticky action bar.
- `apps/web-admin/src/routes.tsx` — new routes.
- `apps/web-admin/src/components/AdminShell.tsx` — nav entries.

### Deviation #3 — no `TranslationReview` refactor

The spec (§5) suggested extracting `TranslationReview`'s `PayloadDiff` into a shared component. On inspection, that component recursively walks `{stem, choices}` source vs. a `SingleTranslation` and is **read-only**, whereas the verify screen needs a **path-driven, editable** diff keyed off `translatablePaths`. These are different components with different data shapes. To avoid a risky refactor of working review code, `TranslationReview.tsx` is left untouched and the new `components/PayloadDiff.tsx` serves the verify screen only.

---

## Task 1: Migration 043 — registry + batch tables + seed

**Files:**
- Create: `services/learning/alembic/content/versions/043_translation_workbench.py`
- Test: `services/learning/tests/localisation/test_migration_043.py`

**Interfaces:**
- Produces: tables `content_schema.supported_languages`, `content_schema.translation_batches`, `content_schema.translation_batch_tasks`; seed rows `en`(is_source) + `hi,ta,te,bn,mr`(enabled).

- [ ] **Step 1: Write the failing test**

```python
# services/learning/tests/localisation/test_migration_043.py
import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_supported_languages_seeded(content_session):
    rows = (await content_session.execute(
        text("SELECT code, enabled, is_source FROM content_schema.supported_languages ORDER BY code")
    )).mappings().all()
    by_code = {r["code"]: r for r in rows}
    assert by_code["en"]["is_source"] is True
    assert {"hi", "ta", "te", "bn", "mr"}.issubset(by_code.keys())
    assert by_code["hi"]["enabled"] is True


@pytest.mark.asyncio
async def test_batch_tables_exist(content_session):
    # Insert a batch + task to prove the tables + FK exist.
    await content_session.execute(text("""
        INSERT INTO content_schema.translation_batches
          (id, created_by, status, total_tasks, target_langs)
        VALUES ('00000000-0000-0000-0000-0000000000b1', NULL, 'QUEUED', 1, ARRAY['hi'])
    """))
    await content_session.execute(text("""
        INSERT INTO content_schema.translation_batch_tasks
          (id, batch_id, question_id, language, status)
        VALUES ('00000000-0000-0000-0000-0000000000c1',
                '00000000-0000-0000-0000-0000000000b1',
                '00000000-0000-0000-0000-0000000000d1', 'hi', 'PENDING')
    """))
    n = (await content_session.execute(
        text("SELECT count(*) FROM content_schema.translation_batch_tasks WHERE batch_id = :b"),
        {"b": "00000000-0000-0000-0000-0000000000b1"},
    )).scalar()
    assert n == 1
```

> NOTE: `content_session` is the existing async session fixture used by other `tests/localisation/` tests. If it does not exist, mirror the fixture from a sibling test (e.g. `tests/localisation/test_repositories.py`) — it yields an `AsyncSession` bound to a migrated `content_schema` test DB.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && python -m pytest tests/localisation/test_migration_043.py -v`
Expected: FAIL — relation `content_schema.supported_languages` does not exist.

- [ ] **Step 3: Write the migration**

```python
# services/learning/alembic/content/versions/043_translation_workbench.py
"""Translation workbench: language registry + batch engine tables.

Revision ID: 043
Revises: 042
Create Date: 2026-06-17
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "043"
down_revision: str | None = "042"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    # ── Language registry ────────────────────────────────────────────────
    op.execute(f"""
        CREATE TABLE {SCHEMA}.supported_languages (
            code         TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            native_name  TEXT NOT NULL,
            script       TEXT NULL,
            enabled      BOOLEAN NOT NULL DEFAULT TRUE,
            is_source    BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order   INTEGER NOT NULL DEFAULT 100,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    # At most one source language.
    op.execute(f"""
        CREATE UNIQUE INDEX uq_supported_languages_single_source
        ON {SCHEMA}.supported_languages (is_source)
        WHERE is_source = TRUE
    """)
    op.execute(f"""
        INSERT INTO {SCHEMA}.supported_languages
          (code, name, native_name, script, enabled, is_source, sort_order)
        VALUES
          ('en', 'English',  'English', 'Latin',      TRUE, TRUE,  0),
          ('hi', 'Hindi',    'हिन्दी',   'Devanagari', TRUE, FALSE, 10),
          ('ta', 'Tamil',    'தமிழ்',    'Tamil',      TRUE, FALSE, 20),
          ('te', 'Telugu',   'తెలుగు',   'Telugu',     TRUE, FALSE, 30),
          ('bn', 'Bengali',  'বাংলা',     'Bengali',    TRUE, FALSE, 40),
          ('mr', 'Marathi',  'मराठी',    'Devanagari', TRUE, FALSE, 50)
    """)

    # ── Batch header ─────────────────────────────────────────────────────
    op.execute(f"""
        CREATE TABLE {SCHEMA}.translation_batches (
            id                 UUID PRIMARY KEY,
            created_by         UUID NULL,
            status             TEXT NOT NULL DEFAULT 'QUEUED'
                               CHECK (status IN ('QUEUED','RUNNING','DONE','DONE_WITH_ERRORS')),
            total_tasks        INTEGER NOT NULL DEFAULT 0,
            done_tasks         INTEGER NOT NULL DEFAULT 0,
            failed_tasks       INTEGER NOT NULL DEFAULT 0,
            target_langs       TEXT[] NOT NULL DEFAULT '{{}}',
            subject            TEXT NOT NULL DEFAULT 'general',
            overwrite_existing BOOLEAN NOT NULL DEFAULT FALSE,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            finished_at        TIMESTAMPTZ NULL
        )
    """)

    # ── Per (question, language) task ────────────────────────────────────
    op.execute(f"""
        CREATE TABLE {SCHEMA}.translation_batch_tasks (
            id           UUID PRIMARY KEY,
            batch_id     UUID NOT NULL REFERENCES {SCHEMA}.translation_batches(id) ON DELETE CASCADE,
            question_id  UUID NOT NULL,
            language     TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED','SKIPPED')),
            error        TEXT NULL,
            version      INTEGER NULL,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (batch_id, question_id, language)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_batch_tasks_batch_status "
        f"ON {SCHEMA}.translation_batch_tasks (batch_id, status)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.translation_batch_tasks")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.translation_batches")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.supported_languages")
```

- [ ] **Step 4: Apply migration to the test DB and run the test**

The test harness applies migrations automatically (same as other `tests/localisation/`). If migrations are applied manually in this repo, run the project's standard content-migration command first.
Run: `cd services/learning && python -m pytest tests/localisation/test_migration_043.py -v`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add services/learning/alembic/content/versions/043_translation_workbench.py services/learning/tests/localisation/test_migration_043.py
git commit -m "feat(learning): migration 043 — language registry + translation batch tables"
```

---

## Task 2: Language registry repo

**Files:**
- Create: `services/learning/src/learning/localisation/language_registry.py`
- Test: `services/learning/tests/localisation/test_language_registry.py`

**Interfaces:**
- Consumes: `content_schema.supported_languages` (Task 1).
- Produces:
  - `async def list_languages(session, *, include_disabled: bool = False) -> list[dict]`
  - `async def get_language(session, code: str) -> dict | None`
  - `async def upsert_language(session, *, code, name, native_name, script=None, enabled=True, sort_order=100) -> None`
  - `async def set_enabled(session, *, code: str, enabled: bool) -> bool`
  - `async def enabled_target_codes(session) -> set[str]`  (enabled AND NOT is_source)
  - Row dict keys: `code, name, nativeName, script, enabled, isSource, sortOrder`.

- [ ] **Step 1: Write the failing test**

```python
# services/learning/tests/localisation/test_language_registry.py
import pytest

from learning.localisation import language_registry as reg


@pytest.mark.asyncio
async def test_list_excludes_disabled_by_default(content_session):
    await reg.upsert_language(content_session, code="kn", name="Kannada",
                              native_name="ಕನ್ನಡ", script="Kannada",
                              enabled=False, sort_order=60)
    await content_session.commit()
    codes_default = {r["code"] for r in await reg.list_languages(content_session)}
    codes_all = {r["code"] for r in await reg.list_languages(content_session, include_disabled=True)}
    assert "kn" not in codes_default
    assert "kn" in codes_all


@pytest.mark.asyncio
async def test_enabled_target_codes_excludes_source(content_session):
    codes = await reg.enabled_target_codes(content_session)
    assert "hi" in codes
    assert "en" not in codes  # en is_source


@pytest.mark.asyncio
async def test_set_enabled_toggles(content_session):
    ok = await reg.set_enabled(content_session, code="ta", enabled=False)
    await content_session.commit()
    assert ok is True
    assert "ta" not in await reg.enabled_target_codes(content_session)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && python -m pytest tests/localisation/test_language_registry.py -v`
Expected: FAIL — `ModuleNotFoundError: learning.localisation.language_registry`.

- [ ] **Step 3: Write the implementation**

```python
# services/learning/src/learning/localisation/language_registry.py
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && python -m pytest tests/localisation/test_language_registry.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/localisation/language_registry.py services/learning/tests/localisation/test_language_registry.py
git commit -m "feat(learning): language registry repo"
```

---

## Task 3: Registry-backed validation + language routes

Relax the hardcoded guard in `translate_artifact`, validate against the registry at the route layer, add the language CRUD routes, and register the router.

**Files:**
- Modify: `services/learning/src/learning/localisation/translator.py:226-231`
- Modify: `services/learning/src/learning/localisation/routes.py:80-100` (the `/translate` guard)
- Create: `services/learning/src/learning/localisation/language_routes.py`
- Modify: `services/learning/src/learning/main.py` (register router)
- Test: `services/learning/tests/localisation/test_language_routes.py`

**Interfaces:**
- Consumes: `enabled_target_codes` (Task 2).
- Produces:
  - `translate_artifact(..., allowed_langs: set[str] | None = None)` — guard only fires when `allowed_langs` is provided.
  - Routes: `GET /localisation/languages?includeDisabled=`, `POST /localisation/languages`, `PATCH /localisation/languages/{code}`.

- [ ] **Step 1: Write the failing test**

```python
# services/learning/tests/localisation/test_language_routes.py
import pytest
from httpx import ASGITransport, AsyncClient

from learning.main import app


@pytest.mark.asyncio
async def test_list_languages_returns_seeded(admin_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/localisation/languages", headers=admin_headers)
    assert r.status_code == 200
    codes = {row["code"] for row in r.json()["languages"]}
    assert {"en", "hi", "ta"}.issubset(codes)


@pytest.mark.asyncio
async def test_add_and_disable_language(admin_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/localisation/languages", headers=admin_headers, json={
            "code": "gu", "name": "Gujarati", "nativeName": "ગુજરાતી",
            "script": "Gujarati", "enabled": True, "sortOrder": 55,
        })
        assert r.status_code == 200
        r2 = await c.patch("/localisation/languages/gu", headers=admin_headers,
                           json={"enabled": False})
        assert r2.status_code == 200
        r3 = await c.get("/localisation/languages?includeDisabled=true", headers=admin_headers)
        gu = next(x for x in r3.json()["languages"] if x["code"] == "gu")
        assert gu["enabled"] is False
```

> NOTE: `admin_headers` is the existing fixture that yields auth headers for a PLATFORM_ADMIN principal (used by other route tests, e.g. `tests/content/`). Reuse it; if absent in `tests/localisation/`, import/copy the conftest fixture.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && python -m pytest tests/localisation/test_language_routes.py -v`
Expected: FAIL — 404 (routes not registered).

- [ ] **Step 3a: Relax the guard in `translator.py`**

Replace lines 226-231 (the `if target_lang not in SUPPORTED_LANGS:` block inside `translate_artifact`). Find the function signature and add the param. Change:

```python
# OLD (around line 207-231):
async def translate_artifact(
    gateway: AIGateway,
    *,
    artifact_id: str,
    target_lang: str,
    payload: dict[str, Any],
    translatable_paths: list[str],
    glossary: list["GlossaryEntry"] | None = None,
    source_lang: str = "en",
    prompt_template_version: str = "1.0.0",
) -> TranslationDraft:
    ...
    if target_lang not in SUPPORTED_LANGS:
        raise ValueError(
            f"target_lang={target_lang!r} not in supported set {SUPPORTED_LANGS}"
        )
```

to:

```python
async def translate_artifact(
    gateway: AIGateway,
    *,
    artifact_id: str,
    target_lang: str,
    payload: dict[str, Any],
    translatable_paths: list[str],
    glossary: list["GlossaryEntry"] | None = None,
    source_lang: str = "en",
    prompt_template_version: str = "1.0.0",
    allowed_langs: set[str] | None = None,
) -> TranslationDraft:
    ...
    if allowed_langs is not None and target_lang not in allowed_langs:
        raise ValueError(
            f"target_lang={target_lang!r} not in allowed set {sorted(allowed_langs)}"
        )
```

(Keep the `SUPPORTED_LANGS` constant defined for backward-compatible imports; it is no longer the gate.)

- [ ] **Step 3b: Registry-backed validation in `routes.py` `/translate`**

In `routes.py`, replace the guard at lines 89-95:

```python
# OLD:
    if req.targetLang not in SUPPORTED_LANGS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "unsupported_language",
                "message": f"target_lang={req.targetLang!r} not in {SUPPORTED_LANGS}",
            },
        )
```

with:

```python
    from learning.localisation.language_registry import enabled_target_codes
    allowed = await enabled_target_codes(session)
    if req.targetLang not in allowed:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "unsupported_language",
                "message": f"target_lang={req.targetLang!r} not an enabled target language",
            },
        )
```

- [ ] **Step 3c: Write `language_routes.py`**

```python
# services/learning/src/learning/localisation/language_routes.py
"""Language registry CRUD routes (admin)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker as content_sessionmaker
from learning.localisation import language_registry as reg

router = APIRouter(prefix="/localisation", tags=["localisation_languages"])


async def _session() -> AsyncSession:
    async with content_sessionmaker()() as s:
        yield s


class LanguageIn(BaseModel):
    code: str = Field(min_length=2, max_length=8)
    name: str = Field(min_length=1)
    nativeName: str = Field(min_length=1)
    script: str | None = None
    enabled: bool = True
    sortOrder: int = 100


class LanguagePatch(BaseModel):
    enabled: bool | None = None
    sortOrder: int | None = None


@router.get("/languages")
async def list_languages(
    includeDisabled: bool = Query(default=False),
    session: AsyncSession = Depends(_session),
) -> dict:
    return {"languages": await reg.list_languages(session, include_disabled=includeDisabled)}


@router.post("/languages")
async def upsert_language(body: LanguageIn, session: AsyncSession = Depends(_session)) -> dict:
    await reg.upsert_language(
        session, code=body.code, name=body.name, native_name=body.nativeName,
        script=body.script, enabled=body.enabled, sort_order=body.sortOrder,
    )
    await session.commit()
    return await reg.get_language(session, body.code)  # type: ignore[return-value]


@router.patch("/languages/{code}")
async def patch_language(
    code: str, body: LanguagePatch, session: AsyncSession = Depends(_session),
) -> dict:
    current = await reg.get_language(session, code)
    if current is None:
        raise HTTPException(status_code=404, detail={"code": "language_not_found", "message": code})
    if body.enabled is not None:
        await reg.set_enabled(session, code=code, enabled=body.enabled)
    if body.sortOrder is not None:
        await reg.upsert_language(
            session, code=code, name=current["name"], native_name=current["nativeName"],
            script=current["script"],
            enabled=body.enabled if body.enabled is not None else current["enabled"],
            sort_order=body.sortOrder,
        )
    await session.commit()
    return await reg.get_language(session, code)  # type: ignore[return-value]
```

- [ ] **Step 3d: Register the router in `main.py`**

Add near the other localisation imports (around line 50) and `include_router` calls (around line 332):

```python
from learning.localisation.language_routes import router as language_router
...
app.include_router(language_router)   # Translation workbench — language registry
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && python -m pytest tests/localisation/test_language_routes.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/localisation/translator.py services/learning/src/learning/localisation/routes.py services/learning/src/learning/localisation/language_routes.py services/learning/src/learning/main.py services/learning/tests/localisation/test_language_routes.py
git commit -m "feat(learning): registry-backed lang validation + language CRUD routes"
```

---

## Task 4: Batch repo (DB writers/readers)

**Files:**
- Create: `services/learning/src/learning/localisation/batch_repo.py`
- Test: `services/learning/tests/localisation/test_batch_repo.py`

**Interfaces:**
- Consumes: tables from Task 1; `content_artifact_translations` (existing) for skip-existing.
- Produces:
  - `async def create_batch(session, *, created_by, question_ids: list[str], target_langs: list[str], subject="general", overwrite_existing=False) -> dict` → `{"batchId": str, "totalTasks": int, "skipped": int}`. Pairs already PUBLISHED (unless overwrite) inserted as `SKIPPED`.
  - `async def get_batch(session, batch_id) -> dict | None` → `{"batch": {...}, "tasks": [...]}` (tasks joined to `questions.stem`).
  - `async def list_batches(session, *, limit=20, offset=0) -> dict` → `{"batches": [...]}`.
  - `async def next_pending_task(session, batch_id) -> dict | None` → claims one task (PENDING→RUNNING) atomically, returns `{id, questionId, language}`.
  - `async def complete_task(session, *, task_id, version) -> None` (SUCCEEDED).
  - `async def fail_task(session, *, task_id, error) -> None` (FAILED).
  - `async def retry_task(session, *, batch_id, task_id) -> bool` (FAILED→PENDING; bumps batch back to RUNNING).
  - `async def finalize_batch_if_done(session, batch_id) -> None` (sets DONE / DONE_WITH_ERRORS + finished_at when no PENDING/RUNNING remain).

- [ ] **Step 1: Write the failing test**

```python
# services/learning/tests/localisation/test_batch_repo.py
import pytest
from sqlalchemy import text

from learning.localisation import batch_repo


async def _seed_question(session, qid: str) -> None:
    await session.execute(text("""
        INSERT INTO content_schema.questions
          (id, topic_id, stem, choices, correct_idx, language, status, created_by, question_type)
        VALUES (:id, :id, 'Stem text', '["a","b"]'::jsonb, 0, 'en', 'PUBLISHED', :id, 'MCQ_SINGLE')
        ON CONFLICT (id) DO NOTHING
    """), {"id": qid})


@pytest.mark.asyncio
async def test_create_batch_fans_out_tasks(content_session):
    q1 = "00000000-0000-0000-0000-0000000a0001"
    q2 = "00000000-0000-0000-0000-0000000a0002"
    await _seed_question(content_session, q1)
    await _seed_question(content_session, q2)
    out = await batch_repo.create_batch(
        content_session, created_by=None, question_ids=[q1, q2],
        target_langs=["hi", "ta"], overwrite_existing=False)
    await content_session.commit()
    assert out["totalTasks"] == 4  # 2 questions × 2 langs
    got = await batch_repo.get_batch(content_session, out["batchId"])
    assert len(got["tasks"]) == 4
    assert got["tasks"][0]["stem"] == "Stem text"


@pytest.mark.asyncio
async def test_skip_existing_published(content_session):
    q = "00000000-0000-0000-0000-0000000a0003"
    await _seed_question(content_session, q)
    await content_session.execute(text("""
        INSERT INTO content_schema.content_artifact_translations
          (artifact_id, language, payload_translation, status, version)
        VALUES (:q, 'hi', '{}'::jsonb, 'PUBLISHED', 1)
        ON CONFLICT (artifact_id, language) DO UPDATE SET status='PUBLISHED'
    """), {"q": q})
    out = await batch_repo.create_batch(
        content_session, created_by=None, question_ids=[q],
        target_langs=["hi", "ta"], overwrite_existing=False)
    await content_session.commit()
    got = await batch_repo.get_batch(content_session, out["batchId"])
    statuses = {(t["language"], t["status"]) for t in got["tasks"]}
    assert ("hi", "SKIPPED") in statuses
    assert ("ta", "PENDING") in statuses


@pytest.mark.asyncio
async def test_claim_complete_and_finalize(content_session):
    q = "00000000-0000-0000-0000-0000000a0004"
    await _seed_question(content_session, q)
    out = await batch_repo.create_batch(
        content_session, created_by=None, question_ids=[q], target_langs=["hi"])
    await content_session.commit()
    task = await batch_repo.next_pending_task(content_session, out["batchId"])
    assert task["language"] == "hi"
    await batch_repo.complete_task(content_session, task_id=task["id"], version=1)
    await batch_repo.finalize_batch_if_done(content_session, out["batchId"])
    await content_session.commit()
    got = await batch_repo.get_batch(content_session, out["batchId"])
    assert got["batch"]["status"] == "DONE"
    assert got["batch"]["doneTasks"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && python -m pytest tests/localisation/test_batch_repo.py -v`
Expected: FAIL — `ModuleNotFoundError: learning.localisation.batch_repo`.

- [ ] **Step 3: Write the implementation**

```python
# services/learning/src/learning/localisation/batch_repo.py
"""Translation batch engine — DB writers/readers.

A batch fans out to one task per (question, language). Tasks are
idempotent on (batch_id, question_id, language). The worker claims
PENDING tasks one at a time (PENDING->RUNNING) so a restart resumes
cleanly. Pairs already PUBLISHED are SKIPPED unless overwrite_existing."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CONTENT_SCHEMA = "content_schema"


async def create_batch(
    session: AsyncSession, *, created_by: str | None,
    question_ids: list[str], target_langs: list[str],
    subject: str = "general", overwrite_existing: bool = False,
) -> dict[str, Any]:
    batch_id = str(uuid.uuid4())
    # Existing PUBLISHED (question, lang) pairs to skip.
    published: set[tuple[str, str]] = set()
    if not overwrite_existing and question_ids and target_langs:
        rows = (await session.execute(text(f"""
            SELECT artifact_id::text AS qid, language
              FROM {CONTENT_SCHEMA}.content_artifact_translations
             WHERE status = 'PUBLISHED'
               AND artifact_id = ANY(CAST(:qids AS uuid[]))
               AND language = ANY(:langs)
        """), {"qids": question_ids, "langs": target_langs})).mappings().all()
        published = {(r["qid"], r["language"]) for r in rows}

    await session.execute(text(f"""
        INSERT INTO {CONTENT_SCHEMA}.translation_batches
          (id, created_by, status, total_tasks, target_langs, subject, overwrite_existing)
        VALUES (:id, :by, 'QUEUED', 0, :langs, :subj, :ow)
    """), {"id": batch_id, "by": created_by, "langs": target_langs,
           "subj": subject, "ow": overwrite_existing})

    total = 0
    skipped = 0
    for qid in question_ids:
        for lang in target_langs:
            is_skip = (qid, lang) in published
            await session.execute(text(f"""
                INSERT INTO {CONTENT_SCHEMA}.translation_batch_tasks
                  (id, batch_id, question_id, language, status)
                VALUES (:id, :bid, :qid, :lang, :st)
                ON CONFLICT (batch_id, question_id, language) DO NOTHING
            """), {"id": str(uuid.uuid4()), "bid": batch_id, "qid": qid,
                   "lang": lang, "st": "SKIPPED" if is_skip else "PENDING"})
            total += 1
            if is_skip:
                skipped += 1

    status = "QUEUED" if total - skipped > 0 else "DONE"
    await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batches
           SET total_tasks = :total, status = :st,
               finished_at = CASE WHEN :st = 'DONE' THEN now() ELSE NULL END
         WHERE id = :id
    """), {"total": total, "st": status, "id": batch_id})
    return {"batchId": batch_id, "totalTasks": total, "skipped": skipped}


def _batch_dict(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]), "status": r["status"],
        "totalTasks": r["total_tasks"], "doneTasks": r["done_tasks"],
        "failedTasks": r["failed_tasks"], "targetLangs": list(r["target_langs"]),
        "subject": r["subject"], "createdAt": r["created_at"].isoformat(),
        "finishedAt": r["finished_at"].isoformat() if r["finished_at"] else None,
    }


async def get_batch(session: AsyncSession, batch_id: str) -> dict | None:
    brows = (await session.execute(text(f"""
        SELECT * FROM {CONTENT_SCHEMA}.translation_batches WHERE id = :id
    """), {"id": batch_id})).mappings().all()
    if not brows:
        return None
    trows = (await session.execute(text(f"""
        SELECT t.id, t.question_id, t.language, t.status, t.error, t.version, q.stem
          FROM {CONTENT_SCHEMA}.translation_batch_tasks t
          LEFT JOIN {CONTENT_SCHEMA}.questions q ON q.id = t.question_id
         WHERE t.batch_id = :id
         ORDER BY t.created_at, t.language
    """), {"id": batch_id})).mappings().all()
    tasks = [{
        "id": str(t["id"]), "questionId": str(t["question_id"]),
        "language": t["language"], "status": t["status"], "error": t["error"],
        "version": t["version"], "stem": t["stem"],
    } for t in trows]
    return {"batch": _batch_dict(brows[0]), "tasks": tasks}


async def list_batches(session: AsyncSession, *, limit: int = 20, offset: int = 0) -> dict:
    rows = (await session.execute(text(f"""
        SELECT * FROM {CONTENT_SCHEMA}.translation_batches
         ORDER BY created_at DESC LIMIT :lim OFFSET :off
    """), {"lim": limit, "off": offset})).mappings().all()
    return {"batches": [_batch_dict(r) for r in rows]}


async def next_pending_task(session: AsyncSession, batch_id: str) -> dict | None:
    rows = (await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batch_tasks
           SET status = 'RUNNING', updated_at = now()
         WHERE id = (
             SELECT id FROM {CONTENT_SCHEMA}.translation_batch_tasks
              WHERE batch_id = :bid AND status = 'PENDING'
              ORDER BY created_at
              FOR UPDATE SKIP LOCKED
              LIMIT 1)
        RETURNING id, question_id, language
    """), {"bid": batch_id})).mappings().all()
    if not rows:
        return None
    await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batches SET status = 'RUNNING'
         WHERE id = :bid AND status = 'QUEUED'
    """), {"bid": batch_id})
    r = rows[0]
    return {"id": str(r["id"]), "questionId": str(r["question_id"]), "language": r["language"]}


async def complete_task(session: AsyncSession, *, task_id: str, version: int) -> None:
    await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batch_tasks
           SET status = 'SUCCEEDED', version = :v, error = NULL, updated_at = now()
         WHERE id = :id
    """), {"v": version, "id": task_id})
    await _recount(session, task_id=task_id)


async def fail_task(session: AsyncSession, *, task_id: str, error: str) -> None:
    await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batch_tasks
           SET status = 'FAILED', error = :e, updated_at = now()
         WHERE id = :id
    """), {"e": error[:2000], "id": task_id})
    await _recount(session, task_id=task_id)


async def _recount(session: AsyncSession, *, task_id: str) -> None:
    await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batches b
           SET done_tasks = sub.done, failed_tasks = sub.failed
          FROM (
            SELECT batch_id,
                   count(*) FILTER (WHERE status = 'SUCCEEDED') AS done,
                   count(*) FILTER (WHERE status = 'FAILED') AS failed
              FROM {CONTENT_SCHEMA}.translation_batch_tasks
             WHERE batch_id = (SELECT batch_id FROM {CONTENT_SCHEMA}.translation_batch_tasks WHERE id = :id)
             GROUP BY batch_id
          ) sub
         WHERE b.id = sub.batch_id
    """), {"id": task_id})


async def finalize_batch_if_done(session: AsyncSession, batch_id: str) -> None:
    pending = (await session.execute(text(f"""
        SELECT count(*) FROM {CONTENT_SCHEMA}.translation_batch_tasks
         WHERE batch_id = :bid AND status IN ('PENDING','RUNNING')
    """), {"bid": batch_id})).scalar()
    if pending and pending > 0:
        return
    await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batches
           SET status = CASE WHEN failed_tasks > 0 THEN 'DONE_WITH_ERRORS' ELSE 'DONE' END,
               finished_at = now()
         WHERE id = :bid
    """), {"bid": batch_id})


async def retry_task(session: AsyncSession, *, batch_id: str, task_id: str) -> bool:
    res = await session.execute(text(f"""
        UPDATE {CONTENT_SCHEMA}.translation_batch_tasks
           SET status = 'PENDING', error = NULL, updated_at = now()
         WHERE id = :id AND batch_id = :bid AND status = 'FAILED'
    """), {"id": task_id, "bid": batch_id})
    if res.rowcount > 0:
        await session.execute(text(f"""
            UPDATE {CONTENT_SCHEMA}.translation_batches
               SET status = 'RUNNING', finished_at = NULL WHERE id = :bid
        """), {"bid": batch_id})
        return True
    return False
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && python -m pytest tests/localisation/test_batch_repo.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/localisation/batch_repo.py services/learning/tests/localisation/test_batch_repo.py
git commit -m "feat(learning): translation batch repo — fan-out, skip-existing, claim/finalize"
```

---

## Task 5: Shared translate core + batch worker

Extract the payload-building logic so both the existing endpoint and the worker share it (DRY), then write the worker drain loop.

**Files:**
- Create: `services/learning/src/learning/localisation/artifact_payload.py` (move `_synth_legacy_payload` + `_collect_strings` here)
- Create: `services/learning/src/learning/localisation/translate_one.py`
- Create: `services/learning/src/learning/localisation/batch_worker.py`
- Modify: `services/learning/src/learning/content/translation_routes.py` (import moved helpers; refactor `request_translation` to call `translate_question_into`)
- Test: `services/learning/tests/localisation/test_batch_worker.py`

**Interfaces:**
- Consumes: `batch_repo` (Task 4); `translate_artifact`, `upsert_translation_draft`, `list_for_lookup`, `get_handler`, `is_supported` (existing).
- Produces:
  - `translate_one.translate_question_into(session, gateway, *, question_id, target_lang, subject="general", source_lang="en") -> dict` → `{"version", "fieldsTranslated", "avgConfidence", "culturalFlags"}`. Raises `ValueError` for unknown question / unsupported type / no payload.
  - `batch_worker.run_batch(session_factory, gateway, batch_id) -> None` — drains all PENDING tasks for one batch, finalizing at the end. Each task uses its own session/commit so one failure doesn't roll back siblings.
  - `artifact_payload.synth_legacy_payload(row) -> dict | None`, `artifact_payload.collect_strings(payload) -> list[str]`.

- [ ] **Step 1: Write the failing test**

```python
# services/learning/tests/localisation/test_batch_worker.py
import pytest
from sqlalchemy import text

from learning.content.db import sessionmaker as content_sessionmaker
from learning.localisation import batch_repo, batch_worker


class FakeGateway:
    """Returns a deterministic 'translated' string per field call."""
    async def call(self, *, touchpoint, prompt_template_id, variables, output_model, **kw):
        src = variables.get("text") or variables.get("source_text") or "x"
        return output_model(translated=f"[hi]{src}", flagged_cultural=False,
                            flag_reason="", confidence=0.9)


async def _seed_question(session, qid):
    await session.execute(text("""
        INSERT INTO content_schema.questions
          (id, topic_id, stem, choices, correct_idx, language, status, created_by, question_type)
        VALUES (:id, :id, 'What is 2+2?', '["3","4"]'::jsonb, 1, 'en', 'PUBLISHED', :id, 'MCQ_SINGLE')
        ON CONFLICT (id) DO NOTHING
    """), {"id": qid})


@pytest.mark.asyncio
async def test_worker_translates_and_finalizes(content_session):
    q = "00000000-0000-0000-0000-0000000b0001"
    await _seed_question(content_session, q)
    out = await batch_repo.create_batch(
        content_session, created_by=None, question_ids=[q], target_langs=["hi"])
    await content_session.commit()

    await batch_worker.run_batch(content_sessionmaker(), FakeGateway(), out["batchId"])

    got = await batch_repo.get_batch(content_session, out["batchId"])
    assert got["batch"]["status"] == "DONE"
    assert got["tasks"][0]["status"] == "SUCCEEDED"
    # A DRAFT translation row now exists.
    n = (await content_session.execute(text("""
        SELECT count(*) FROM content_schema.content_artifact_translations
         WHERE artifact_id = :q AND language = 'hi' AND status = 'DRAFT'
    """), {"q": q})).scalar()
    assert n == 1
```

> NOTE: `FakeGateway.call` must match the real `AIGateway.call` signature used inside `translate_artifact`. Open `translator.py` and copy the exact keyword names (e.g. `touchpoint`, `prompt_template_id`, `variables`, `output_model`) into the fake. Adjust the fake to whatever the real call passes.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && python -m pytest tests/localisation/test_batch_worker.py -v`
Expected: FAIL — `ModuleNotFoundError: learning.localisation.batch_worker`.

- [ ] **Step 3a: Create `artifact_payload.py`**

Move the two private helpers out of `translation_routes.py` verbatim (rename to public). Open `translation_routes.py`, find `_synth_legacy_payload` (near line 389) and `_collect_strings`, and relocate:

```python
# services/learning/src/learning/localisation/artifact_payload.py
"""Shared helpers for turning a question row into a translatable payload."""

from __future__ import annotations

from typing import Any


def synth_legacy_payload(row: Any) -> dict[str, Any] | None:
    """Build the canonical MCQ_SINGLE payload from legacy choices+correct_idx
    columns when `payload` JSONB is NULL (the seeded rows)."""
    choices = row.get("choices") or []
    if not choices:
        return None
    options = [{"id": chr(ord("A") + i), "text": str(c)} for i, c in enumerate(choices)]
    correct_idx = int(row.get("correct_idx") or 0)
    correct_id = options[correct_idx]["id"] if correct_idx < len(options) else options[0]["id"]
    return {"stem": row.get("stem") or "", "options": options, "correct_id": correct_id}


def collect_strings(node: Any) -> list[str]:
    """Flatten all string leaves of a payload (used for glossary matching)."""
    out: list[str] = []
    if isinstance(node, str):
        out.append(node)
    elif isinstance(node, dict):
        for v in node.values():
            out.extend(collect_strings(v))
    elif isinstance(node, list):
        for v in node:
            out.extend(collect_strings(v))
    return out
```

Then in `translation_routes.py`, delete the two local defs and import them:

```python
from learning.localisation.artifact_payload import (
    collect_strings as _collect_strings,
    synth_legacy_payload as _synth_legacy_payload,
)
```

(Keeping the `_`-aliased names means the rest of `translation_routes.py` is unchanged.)

- [ ] **Step 3b: Create `translate_one.py`**

```python
# services/learning/src/learning/localisation/translate_one.py
"""Single-artifact translate core, shared by the per-question endpoint
and the batch worker. Loads the artifact payload, runs the glossary +
AI translation, and persists a DRAFT. Returns the result metadata."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.ai_gateway import AIGateway
from learning.localisation.artifact_payload import collect_strings, synth_legacy_payload
from learning.localisation.glossary import list_for_lookup
from learning.localisation.repositories import upsert_translation_draft
from learning.localisation.translator import translate_artifact
from learning.types import get_handler, is_supported

CONTENT_SCHEMA = "content_schema"


async def translate_question_into(
    session: AsyncSession, gateway: AIGateway, *,
    question_id: str, target_lang: str,
    subject: str = "general", source_lang: str = "en",
) -> dict[str, Any]:
    rows = (await session.execute(text(f"""
        SELECT id, question_type, payload, stem, choices, correct_idx,
               language AS source_language
          FROM {CONTENT_SCHEMA}.questions WHERE id = :id
    """), {"id": question_id})).mappings().all()
    if not rows:
        raise ValueError(f"question id={question_id!r} not found")
    row = rows[0]
    type_id = row["question_type"] or "MCQ_SINGLE"
    if not is_supported(type_id):
        raise ValueError(f"unsupported question type {type_id!r}")
    payload = row["payload"] or synth_legacy_payload(row)
    if payload is None:
        raise ValueError("question has no typed payload and no legacy choices")

    handler = get_handler(type_id)
    paths = handler.translatable_fields(payload)
    glossary = await list_for_lookup(
        session, subject=subject, source_lang=source_lang,
        target_lang=target_lang, text_to_match=" ".join(collect_strings(payload)))
    draft = await translate_artifact(
        gateway, artifact_id=question_id, target_lang=target_lang,
        payload=payload, translatable_paths=paths, glossary=glossary,
        source_lang=source_lang)
    version = await upsert_translation_draft(
        session, artifact_id=question_id, target_lang=target_lang,
        payload_translation=draft.payload_translation,
        ai_confidence=draft.avg_confidence, cultural_flags=draft.cultural_flags)
    return {
        "version": version, "fieldsTranslated": draft.fields_translated,
        "avgConfidence": draft.avg_confidence, "culturalFlags": draft.cultural_flags,
    }
```

- [ ] **Step 3c: Create `batch_worker.py`**

```python
# services/learning/src/learning/localisation/batch_worker.py
"""Background drain loop for a translation batch.

Each task runs in its own session+commit so one failure never rolls
back a sibling. A crashed/restarted worker resumes by re-querying
PENDING tasks (next_pending_task claims PENDING->RUNNING)."""

from __future__ import annotations

import logging

from learning.ai_gateway import AIGateway
from learning.localisation import batch_repo
from learning.localisation.translate_one import translate_question_into

logger = logging.getLogger(__name__)


async def run_batch(session_factory, gateway: AIGateway, batch_id: str) -> None:
    while True:
        async with session_factory() as session:
            task = await batch_repo.next_pending_task(session, batch_id)
            await session.commit()
        if task is None:
            break
        async with session_factory() as session:
            try:
                res = await translate_question_into(
                    session, gateway,
                    question_id=task["questionId"], target_lang=task["language"])
                await batch_repo.complete_task(session, task_id=task["id"], version=res["version"])
                await session.commit()
            except Exception as e:  # noqa: BLE001
                await session.rollback()
                async with session_factory() as s2:
                    await batch_repo.fail_task(s2, task_id=task["id"], error=str(e))
                    await s2.commit()
                logger.warning("batch task %s failed: %s", task["id"], e)
    async with session_factory() as session:
        await batch_repo.finalize_batch_if_done(session, batch_id)
        await session.commit()
```

> NOTE: `session_factory` is what `content_sessionmaker()` returns — call it as `session_factory()` to get an `AsyncSession` context manager. Confirm against `learning.content.db`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && python -m pytest tests/localisation/test_batch_worker.py tests/localisation/test_batch_repo.py -v`
Expected: PASS. Also run the existing translation-route tests to confirm the helper move didn't break them:
Run: `cd services/learning && python -m pytest tests/content -k translation -v`
Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/localisation/artifact_payload.py services/learning/src/learning/localisation/translate_one.py services/learning/src/learning/localisation/batch_worker.py services/learning/src/learning/content/translation_routes.py services/learning/tests/localisation/test_batch_worker.py
git commit -m "feat(learning): shared translate core + batch worker drain loop"
```

---

## Task 6: Batch HTTP routes

**Files:**
- Create: `services/learning/src/learning/localisation/batch_routes.py`
- Modify: `services/learning/src/learning/main.py` (register router)
- Test: `services/learning/tests/localisation/test_batch_routes.py`

**Interfaces:**
- Consumes: `batch_repo`, `batch_worker`, `enabled_target_codes`, `get_gateway` pattern.
- Produces:
  - `POST /localisation/batches` `{questionIds, targetLangs, subject?, overwriteExisting?}` → `{batchId, totalTasks, skipped}`; schedules `run_batch` via `BackgroundTasks`.
  - `GET /localisation/batches?limit=&offset=` → `{batches:[...]}`.
  - `GET /localisation/batches/{id}` → `{batch, tasks}`.
  - `POST /localisation/batches/{id}/tasks/{taskId}/retry` → `{retried: bool}`; re-schedules `run_batch`.

- [ ] **Step 1: Write the failing test**

```python
# services/learning/tests/localisation/test_batch_routes.py
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from learning.content.db import sessionmaker as content_sessionmaker
from learning.main import app


async def _seed_question(qid):
    async with content_sessionmaker()() as s:
        await s.execute(text("""
            INSERT INTO content_schema.questions
              (id, topic_id, stem, choices, correct_idx, language, status, created_by, question_type)
            VALUES (:id, :id, 'Q stem', '["a","b"]'::jsonb, 0, 'en', 'PUBLISHED', :id, 'MCQ_SINGLE')
            ON CONFLICT (id) DO NOTHING
        """), {"id": qid})
        await s.commit()


@pytest.mark.asyncio
async def test_create_batch_returns_id_and_validates_langs(admin_headers):
    q = "00000000-0000-0000-0000-0000000c0001"
    await _seed_question(q)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        # Unknown language rejected.
        bad = await c.post("/localisation/batches", headers=admin_headers,
                           json={"questionIds": [q], "targetLangs": ["zz"]})
        assert bad.status_code == 400
        # Valid batch accepted.
        r = await c.post("/localisation/batches", headers=admin_headers,
                         json={"questionIds": [q], "targetLangs": ["hi"]})
        assert r.status_code == 200
        bid = r.json()["batchId"]
        g = await c.get(f"/localisation/batches/{bid}", headers=admin_headers)
        assert g.status_code == 200
        assert g.json()["batch"]["totalTasks"] == 1
```

> NOTE: BackgroundTasks run after the response in real serving but synchronously within the `AsyncClient` request lifecycle under ASGITransport; the test asserts on batch creation, not on completion, to stay deterministic regardless of gateway availability.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && python -m pytest tests/localisation/test_batch_routes.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Write the implementation**

```python
# services/learning/src/learning/localisation/batch_routes.py
"""Translation batch HTTP routes."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from learning.ai_gateway import AIGateway
from learning.content.db import sessionmaker as content_sessionmaker
from learning.localisation import batch_repo
from learning.localisation.batch_worker import run_batch
from learning.localisation.language_registry import enabled_target_codes

router = APIRouter(prefix="/localisation", tags=["localisation_batches"])


def _gateway(request: Request) -> AIGateway:
    gw = getattr(request.app.state, "ai_gateway", None)
    if gw is None:
        raise HTTPException(status_code=503, detail={
            "code": "ai_gateway_unavailable",
            "message": "AI Gateway is not available; translation disabled."})
    return gw


async def _session() -> AsyncSession:
    async with content_sessionmaker()() as s:
        yield s


class BatchCreate(BaseModel):
    questionIds: list[str] = Field(min_length=1, max_length=1000)
    targetLangs: list[str] = Field(min_length=1, max_length=20)
    subject: str = "general"
    overwriteExisting: bool = False


@router.post("/batches")
async def create_batch(
    body: BatchCreate, background: BackgroundTasks, request: Request,
    session: AsyncSession = Depends(_session),
) -> dict:
    gateway = _gateway(request)
    allowed = await enabled_target_codes(session)
    bad = [c for c in body.targetLangs if c not in allowed]
    if bad:
        raise HTTPException(status_code=400, detail={
            "code": "unsupported_language",
            "message": f"not enabled target languages: {bad}"})
    out = await batch_repo.create_batch(
        session, created_by=None, question_ids=body.questionIds,
        target_langs=body.targetLangs, subject=body.subject,
        overwrite_existing=body.overwriteExisting)
    await session.commit()
    if out["totalTasks"] - out["skipped"] > 0:
        background.add_task(run_batch, content_sessionmaker(), gateway, out["batchId"])
    return out


@router.get("/batches")
async def list_batches(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(_session),
) -> dict:
    return await batch_repo.list_batches(session, limit=limit, offset=offset)


@router.get("/batches/{batch_id}")
async def get_batch(batch_id: str, session: AsyncSession = Depends(_session)) -> dict:
    got = await batch_repo.get_batch(session, batch_id)
    if got is None:
        raise HTTPException(status_code=404, detail={"code": "batch_not_found", "message": batch_id})
    return got


@router.post("/batches/{batch_id}/tasks/{task_id}/retry")
async def retry_task(
    batch_id: str, task_id: str, background: BackgroundTasks, request: Request,
    session: AsyncSession = Depends(_session),
) -> dict:
    gateway = _gateway(request)
    ok = await batch_repo.retry_task(session, batch_id=batch_id, task_id=task_id)
    await session.commit()
    if ok:
        background.add_task(run_batch, content_sessionmaker(), gateway, batch_id)
    return {"retried": ok}
```

Register in `main.py` (near the other localisation `include_router` calls):

```python
from learning.localisation.batch_routes import router as batch_router
...
app.include_router(batch_router)   # Translation workbench — batch engine
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && python -m pytest tests/localisation/test_batch_routes.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/localisation/batch_routes.py services/learning/src/learning/main.py services/learning/tests/localisation/test_batch_routes.py
git commit -m "feat(learning): translation batch HTTP routes + background worker dispatch"
```

---

## Task 7: Review-queue repo + routes (list, versioned edit, bulk decide)

**Files:**
- Create: `services/learning/src/learning/localisation/review_queue.py`
- Modify: `services/learning/src/learning/content/translation_routes.py` (add `PUT .../translations/{lang}`)
- Modify: `services/learning/src/learning/main.py` (register review_queue router)
- Test: `services/learning/tests/localisation/test_review_queue.py`

**Interfaces:**
- Consumes: `content_artifact_translations`, `questions`, `approve_translation`, `reject_translation`, `upsert_translation_draft`, `get_handler`/`synth_legacy_payload` for source payload + paths.
- Produces:
  - `review_queue.list_queue(session, *, lang=None, status="DRAFT", batch_id=None, min_confidence=None, limit=50, offset=0) -> dict` → `{items:[{questionId, language, status, aiConfidence, version, culturalFlags, stem, sourcePayload, payloadTranslation, translatablePaths}], total}`.
  - `review_queue.bulk_decide(session, *, decisions, reviewer_id) -> dict` → `{results:[{questionId, lang, ok, error?}]}`.
  - Route `GET /localisation/review-queue` (query params above).
  - Route `POST /localisation/review-queue/bulk`.
  - Route `PUT /content/questions/{id}/translations/{lang}` `{payloadTranslation}` → `SingleTranslationResponse` (new version, status DRAFT, preserves prior confidence + cultural flags).

- [ ] **Step 1: Write the failing test**

```python
# services/learning/tests/localisation/test_review_queue.py
import pytest
from sqlalchemy import text

from learning.localisation import review_queue


async def _seed(session, qid):
    await session.execute(text("""
        INSERT INTO content_schema.questions
          (id, topic_id, stem, choices, correct_idx, language, status, created_by, question_type)
        VALUES (:id, :id, 'Stem', '["a","b"]'::jsonb, 0, 'en', 'PUBLISHED', :id, 'MCQ_SINGLE')
        ON CONFLICT (id) DO NOTHING
    """), {"id": qid})
    await session.execute(text("""
        INSERT INTO content_schema.content_artifact_translations
          (artifact_id, language, payload_translation, status, ai_confidence, version)
        VALUES (:id, 'hi', '{"stem":"अनुवाद"}'::jsonb, 'DRAFT', 0.8, 1)
        ON CONFLICT (artifact_id, language) DO UPDATE
          SET status='DRAFT', payload_translation=EXCLUDED.payload_translation
    """), {"id": qid})


@pytest.mark.asyncio
async def test_list_queue_returns_draft_with_source(content_session):
    q = "00000000-0000-0000-0000-0000000d0001"
    await _seed(content_session, q)
    await content_session.commit()
    out = await review_queue.list_queue(content_session, lang="hi", status="DRAFT")
    item = next(i for i in out["items"] if i["questionId"] == q)
    assert item["payloadTranslation"]["stem"] == "अनुवाद"
    assert "stem" in item["translatablePaths"]
    assert item["stem"] == "Stem"


@pytest.mark.asyncio
async def test_bulk_decide_publishes(content_session):
    q = "00000000-0000-0000-0000-0000000d0002"
    await _seed(content_session, q)
    await content_session.commit()
    out = await review_queue.bulk_decide(
        content_session,
        decisions=[{"questionId": q, "lang": "hi", "action": "approve"}],
        reviewer_id="11111111-1111-1111-1111-111111111111")
    await content_session.commit()
    assert out["results"][0]["ok"] is True
    status = (await content_session.execute(text("""
        SELECT status FROM content_schema.content_artifact_translations
         WHERE artifact_id = :q AND language = 'hi'
    """), {"q": q})).scalar()
    assert status == "PUBLISHED"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && python -m pytest tests/localisation/test_review_queue.py -v`
Expected: FAIL — `ModuleNotFoundError: learning.localisation.review_queue`.

- [ ] **Step 3a: Write `review_queue.py`**

```python
# services/learning/src/learning/localisation/review_queue.py
"""Bulk verification queue — list DRAFT (or other) translations with their
source payload for side-by-side review, plus bulk approve/reject."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.localisation.artifact_payload import synth_legacy_payload
from learning.localisation.repositories import approve_translation, reject_translation
from learning.types import get_handler, is_supported

CONTENT_SCHEMA = "content_schema"


async def list_queue(
    session: AsyncSession, *, lang: str | None = None, status: str = "DRAFT",
    batch_id: str | None = None, min_confidence: float | None = None,
    limit: int = 50, offset: int = 0,
) -> dict[str, Any]:
    clauses = ["t.status = :status"]
    params: dict[str, Any] = {"status": status, "limit": limit, "offset": offset}
    if lang:
        clauses.append("t.language = :lang")
        params["lang"] = lang
    if min_confidence is not None:
        clauses.append("t.ai_confidence >= :minc")
        params["minc"] = min_confidence
    if batch_id:
        clauses.append(
            "EXISTS (SELECT 1 FROM {s}.translation_batch_tasks bt "
            "WHERE bt.batch_id = :bid AND bt.question_id = t.artifact_id "
            "AND bt.language = t.language)".format(s=CONTENT_SCHEMA))
        params["bid"] = batch_id
    where = " AND ".join(clauses)

    total = (await session.execute(text(f"""
        SELECT count(*) FROM {CONTENT_SCHEMA}.content_artifact_translations t WHERE {where}
    """), params)).scalar()

    rows = (await session.execute(text(f"""
        SELECT t.artifact_id, t.language, t.status, t.ai_confidence, t.version,
               t.cultural_flags, t.payload_translation,
               q.stem, q.question_type, q.payload, q.choices, q.correct_idx
          FROM {CONTENT_SCHEMA}.content_artifact_translations t
          JOIN {CONTENT_SCHEMA}.questions q ON q.id = t.artifact_id
         WHERE {where}
         ORDER BY t.updated_at
         LIMIT :limit OFFSET :offset
    """), params)).mappings().all()

    items = []
    for r in rows:
        type_id = r["question_type"] or "MCQ_SINGLE"
        source_payload = r["payload"]
        paths: list[str] = []
        if is_supported(type_id):
            source_payload = source_payload or synth_legacy_payload(r)
            if source_payload is not None:
                paths = get_handler(type_id).translatable_fields(source_payload)
        items.append({
            "questionId": str(r["artifact_id"]), "language": r["language"],
            "status": r["status"], "aiConfidence": r["ai_confidence"],
            "version": r["version"], "culturalFlags": list(r["cultural_flags"] or []),
            "stem": r["stem"], "sourcePayload": source_payload or {},
            "payloadTranslation": r["payload_translation"] or {},
            "translatablePaths": paths,
        })
    return {"items": items, "total": int(total or 0)}


async def bulk_decide(
    session: AsyncSession, *, decisions: list[dict[str, Any]], reviewer_id: str,
) -> dict[str, Any]:
    results = []
    for d in decisions:
        qid, lang, action = d["questionId"], d["lang"], d["action"]
        try:
            if action == "approve":
                await approve_translation(session, artifact_id=qid, target_lang=lang, reviewer_id=reviewer_id)
            elif action == "reject":
                await reject_translation(session, artifact_id=qid, target_lang=lang, reviewer_id=reviewer_id)
            else:
                raise ValueError(f"unknown action {action!r}")
            results.append({"questionId": qid, "lang": lang, "ok": True})
        except Exception as e:  # noqa: BLE001
            results.append({"questionId": qid, "lang": lang, "ok": False, "error": str(e)})
    return {"results": results}
```

- [ ] **Step 3b: Add routes**

Add a new router file section — simplest is to extend `translation_routes.py` with the `PUT` edit, and add a small `review_queue_routes` inside `review_queue.py`'s caller. To keep one responsibility per file, add the queue routes to `batch_routes.py` is wrong (different concern); instead add them to a tiny new section. Put the two queue routes in `language_routes.py`? No — separate concern. Create them in `translation_routes.py` is acceptable since it already owns per-question translation HTTP. Add to `translation_routes.py`:

```python
# ── PUT /content/questions/{id}/translations/{lang} (versioned inline edit) ──
from learning.localisation.repositories import upsert_translation_draft  # already imported


class TranslationEditBody(BaseModel):
    payloadTranslation: dict[str, Any]


@router.put(
    "/content/questions/{question_id}/translations/{lang}",
    response_model=SingleTranslationResponse,
)
async def edit_translation(
    question_id: str, lang: str, body: TranslationEditBody,
    session: AsyncSession = Depends(_content_session),
) -> SingleTranslationResponse:
    # Preserve prior confidence + cultural flags on a human edit.
    prior = (await session.execute(text(f"""
        SELECT ai_confidence, cultural_flags
          FROM {CONTENT_SCHEMA}.content_artifact_translations
         WHERE artifact_id = :id AND language = :lang
    """), {"id": question_id, "lang": lang})).mappings().all()
    conf = float(prior[0]["ai_confidence"]) if prior and prior[0]["ai_confidence"] is not None else 1.0
    flags = list(prior[0]["cultural_flags"] or []) if prior else []
    await upsert_translation_draft(
        session, artifact_id=question_id, target_lang=lang,
        payload_translation=body.payloadTranslation,
        ai_confidence=conf, cultural_flags=flags)
    await session.commit()
    return await get_translation(question_id, lang, session)
```

And add the queue routes (also in `translation_routes.py`, or a dedicated `review_queue` router registered separately — choose `translation_routes.py` to reuse `_content_session`):

```python
from learning.localisation.review_queue import bulk_decide, list_queue


@router.get("/localisation/review-queue")
async def get_review_queue(
    lang: str | None = None, status: str = "DRAFT", batchId: str | None = None,
    minConfidence: float | None = None, limit: int = 50, offset: int = 0,
    session: AsyncSession = Depends(_content_session),
) -> dict:
    return await list_queue(session, lang=lang, status=status, batch_id=batchId,
                            min_confidence=minConfidence, limit=limit, offset=offset)


class BulkDecision(BaseModel):
    questionId: str
    lang: str
    action: Literal["approve", "reject"]
    rejectionReason: str | None = None


class BulkDecideBody(BaseModel):
    decisions: list[BulkDecision]
    reviewerId: str = Field(min_length=1)


@router.post("/localisation/review-queue/bulk")
async def post_review_bulk(
    body: BulkDecideBody, session: AsyncSession = Depends(_content_session),
) -> dict:
    out = await bulk_decide(
        session,
        decisions=[d.model_dump() for d in body.decisions],
        reviewer_id=body.reviewerId)
    await session.commit()
    return out
```

(No `main.py` change needed — these hang off the already-registered `content_translations_router`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && python -m pytest tests/localisation/test_review_queue.py -v`
Expected: PASS (2 tests). Also re-run the existing translation route tests for no regression:
Run: `cd services/learning && python -m pytest tests/content -k translation -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/localisation/review_queue.py services/learning/src/learning/content/translation_routes.py services/learning/tests/localisation/test_review_queue.py
git commit -m "feat(learning): bulk review queue (list + bulk decide) + versioned inline edit"
```

---

## Task 8: Frontend API client

**Files:**
- Create: `apps/web-admin/src/lib/translation-workbench-api.ts`
- Test: `apps/web-admin/src/lib/__tests__/translation-workbench-api.test.ts`

**Interfaces:**
- Consumes: `auth.fetch`, `env.apiBaseUrl`.
- Produces typed clients:
  - `languages.list(includeDisabled?) / upsert(input) / patch(code, patch)`
  - `batches.create(input) / get(id) / list() / retryTask(batchId, taskId)`
  - `reviewQueue.list(params) / bulk(decisions, reviewerId)`
  - `translationEdit.save(questionId, lang, payloadTranslation)`
  - Types: `Language`, `BatchSummary`, `BatchTask`, `BatchDetail`, `ReviewItem`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web-admin/src/lib/__tests__/translation-workbench-api.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../api", () => ({
  auth: { fetch: vi.fn() },
}));
vi.mock("../env", () => ({ env: { apiBaseUrl: "http://api" } }));

import { auth } from "../api";
import { batches, languages } from "../translation-workbench-api";

const mockFetch = auth.fetch as unknown as ReturnType<typeof vi.fn>;

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => mockFetch.mockReset());

describe("translation-workbench-api", () => {
  it("languages.list hits the right URL", async () => {
    mockFetch.mockResolvedValueOnce(ok({ languages: [{ code: "hi" }] }));
    const out = await languages.list();
    expect(mockFetch).toHaveBeenCalledWith("http://api/localisation/languages?includeDisabled=false");
    expect(out[0].code).toBe("hi");
  });

  it("batches.create posts body and returns id", async () => {
    mockFetch.mockResolvedValueOnce(ok({ batchId: "b1", totalTasks: 2, skipped: 0 }));
    const out = await batches.create({ questionIds: ["q1"], targetLangs: ["hi", "ta"] });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body).targetLangs).toEqual(["hi", "ta"]);
    expect(out.batchId).toBe("b1");
  });

  it("throws on non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    await expect(languages.list()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-admin && npx vitest run src/lib/__tests__/translation-workbench-api.test.ts`
Expected: FAIL — cannot find module `../translation-workbench-api`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web-admin/src/lib/translation-workbench-api.ts
import { auth } from "./api";
import { env } from "./env";

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  script: string | null;
  enabled: boolean;
  isSource: boolean;
  sortOrder: number;
}

export interface BatchSummary {
  id: string;
  status: "QUEUED" | "RUNNING" | "DONE" | "DONE_WITH_ERRORS";
  totalTasks: number;
  doneTasks: number;
  failedTasks: number;
  targetLangs: string[];
  subject: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface BatchTask {
  id: string;
  questionId: string;
  language: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  error: string | null;
  version: number | null;
  stem: string | null;
}

export interface BatchDetail {
  batch: BatchSummary;
  tasks: BatchTask[];
}

export interface ReviewItem {
  questionId: string;
  language: string;
  status: string;
  aiConfidence: number | null;
  version: number;
  culturalFlags: string[];
  stem: string;
  sourcePayload: Record<string, unknown>;
  payloadTranslation: Record<string, unknown>;
  translatablePaths: string[];
}

const base = () => env.apiBaseUrl;

async function jsonOrThrow<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const languages = {
  async list(includeDisabled = false): Promise<Language[]> {
    const res = await auth.fetch(`${base()}/localisation/languages?includeDisabled=${includeDisabled}`);
    const body = await jsonOrThrow<{ languages: Language[] }>(res, "languages.list");
    return body.languages;
  },
  async upsert(input: Omit<Language, "isSource">): Promise<Language> {
    const res = await auth.fetch(`${base()}/localisation/languages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return jsonOrThrow<Language>(res, "languages.upsert");
  },
  async patch(code: string, patch: { enabled?: boolean; sortOrder?: number }): Promise<Language> {
    const res = await auth.fetch(`${base()}/localisation/languages/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return jsonOrThrow<Language>(res, "languages.patch");
  },
};

export interface CreateBatchInput {
  questionIds: string[];
  targetLangs: string[];
  subject?: string;
  overwriteExisting?: boolean;
}

export const batches = {
  async create(input: CreateBatchInput): Promise<{ batchId: string; totalTasks: number; skipped: number }> {
    const res = await auth.fetch(`${base()}/localisation/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return jsonOrThrow(res, "batches.create");
  },
  async get(id: string): Promise<BatchDetail> {
    const res = await auth.fetch(`${base()}/localisation/batches/${encodeURIComponent(id)}`);
    return jsonOrThrow<BatchDetail>(res, "batches.get");
  },
  async list(limit = 20, offset = 0): Promise<BatchSummary[]> {
    const res = await auth.fetch(`${base()}/localisation/batches?limit=${limit}&offset=${offset}`);
    const body = await jsonOrThrow<{ batches: BatchSummary[] }>(res, "batches.list");
    return body.batches;
  },
  async retryTask(batchId: string, taskId: string): Promise<{ retried: boolean }> {
    const res = await auth.fetch(
      `${base()}/localisation/batches/${encodeURIComponent(batchId)}/tasks/${encodeURIComponent(taskId)}/retry`,
      { method: "POST" });
    return jsonOrThrow(res, "batches.retryTask");
  },
};

export interface ReviewQueueParams {
  lang?: string;
  status?: string;
  batchId?: string;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

export interface BulkDecision {
  questionId: string;
  lang: string;
  action: "approve" | "reject";
  rejectionReason?: string;
}

export const reviewQueue = {
  async list(params: ReviewQueueParams): Promise<{ items: ReviewItem[]; total: number }> {
    const q = new URLSearchParams();
    if (params.lang) q.set("lang", params.lang);
    q.set("status", params.status ?? "DRAFT");
    if (params.batchId) q.set("batchId", params.batchId);
    if (params.minConfidence != null) q.set("minConfidence", String(params.minConfidence));
    q.set("limit", String(params.limit ?? 50));
    q.set("offset", String(params.offset ?? 0));
    const res = await auth.fetch(`${base()}/localisation/review-queue?${q.toString()}`);
    return jsonOrThrow(res, "reviewQueue.list");
  },
  async bulk(decisions: BulkDecision[], reviewerId: string): Promise<{ results: { questionId: string; lang: string; ok: boolean; error?: string }[] }> {
    const res = await auth.fetch(`${base()}/localisation/review-queue/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions, reviewerId }),
    });
    return jsonOrThrow(res, "reviewQueue.bulk");
  },
};

export const translationEdit = {
  async save(questionId: string, lang: string, payloadTranslation: Record<string, unknown>): Promise<unknown> {
    const res = await auth.fetch(
      `${base()}/content/questions/${encodeURIComponent(questionId)}/translations/${encodeURIComponent(lang)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payloadTranslation }),
      });
    return jsonOrThrow(res, "translationEdit.save");
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web-admin && npx vitest run src/lib/__tests__/translation-workbench-api.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/src/lib/translation-workbench-api.ts apps/web-admin/src/lib/__tests__/translation-workbench-api.test.ts
git commit -m "feat(web-admin): translation workbench API client"
```

---

## Task 9: Selection on TranslationsList + sticky action bar

**Files:**
- Create: `apps/web-admin/src/pages/translation-selection.ts` (pure selection-store helpers)
- Modify: `apps/web-admin/src/pages/TranslationsList.tsx`
- Test: `apps/web-admin/src/pages/__tests__/translation-selection.test.ts`

**Interfaces:**
- Consumes: `batches.create`, `languages.list`.
- Produces:
  - `translation-selection.ts`: `toggle(set: Set<string>, id: string): Set<string>`, `selectAllOnPage(set, ids): Set<string>`, `clearPage(set, ids): Set<string>`, `resolveAllMatching(fetchPage, cap): Promise<{ids: string[], capped: boolean}>` where `fetchPage(offset) => Promise<{ids, total}>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web-admin/src/pages/__tests__/translation-selection.test.ts
import { describe, expect, it } from "vitest";
import { clearPage, resolveAllMatching, selectAllOnPage, toggle } from "../translation-selection";

describe("translation-selection", () => {
  it("toggles an id in/out", () => {
    let s = new Set<string>();
    s = toggle(s, "a");
    expect(s.has("a")).toBe(true);
    s = toggle(s, "a");
    expect(s.has("a")).toBe(false);
  });

  it("selectAllOnPage adds, clearPage removes", () => {
    let s = new Set<string>(["x"]);
    s = selectAllOnPage(s, ["a", "b"]);
    expect([...s].sort()).toEqual(["a", "b", "x"]);
    s = clearPage(s, ["a", "b"]);
    expect([...s]).toEqual(["x"]);
  });

  it("resolveAllMatching pages until total, respects cap", async () => {
    const all = Array.from({ length: 120 }, (_, i) => `q${i}`);
    const fetchPage = async (offset: number) => ({
      ids: all.slice(offset, offset + 50),
      total: all.length,
    });
    const out = await resolveAllMatching(fetchPage, 100);
    expect(out.ids.length).toBe(100);
    expect(out.capped).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-admin && npx vitest run src/pages/__tests__/translation-selection.test.ts`
Expected: FAIL — cannot find module `../translation-selection`.

- [ ] **Step 3a: Write `translation-selection.ts`**

```ts
// apps/web-admin/src/pages/translation-selection.ts
export function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectAllOnPage(set: Set<string>, ids: string[]): Set<string> {
  const next = new Set(set);
  for (const id of ids) next.add(id);
  return next;
}

export function clearPage(set: Set<string>, ids: string[]): Set<string> {
  const next = new Set(set);
  for (const id of ids) next.delete(id);
  return next;
}

export async function resolveAllMatching(
  fetchPage: (offset: number) => Promise<{ ids: string[]; total: number }>,
  cap: number,
): Promise<{ ids: string[]; capped: boolean }> {
  const ids: string[] = [];
  let offset = 0;
  let total = Infinity;
  while (ids.length < total && ids.length < cap) {
    const { ids: pageIds, total: t } = await fetchPage(offset);
    total = t;
    if (pageIds.length === 0) break;
    ids.push(...pageIds);
    offset += pageIds.length;
  }
  const capped = ids.length >= cap && total > cap;
  return { ids: ids.slice(0, cap), capped };
}
```

- [ ] **Step 3b: Wire selection + action bar into `TranslationsList.tsx`**

Add the imports and state at the top of the component, a checkbox column, and a sticky action bar. Concrete edits:

1. Add imports after the existing imports (line 6):

```tsx
import { useNavigate } from "react-router-dom";
import { batches, languages, type Language } from "../lib/translation-workbench-api";
import { clearPage, resolveAllMatching, selectAllOnPage, toggle } from "./translation-selection";

const SELECT_ALL_CAP = 500;
```

2. Add state inside `TranslationsList` (after the existing `useState` block, around line 47):

```tsx
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [langs, setLangs] = useState<Language[]>([]);
  const [chosenLangs, setChosenLangs] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    languages.list().then((ls) => setLangs(ls.filter((l) => !l.isSource))).catch(() => setLangs([]));
  }, []);

  const pageIds = rows.map((r) => r.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  async function selectAllMatching() {
    const { ids, capped } = await resolveAllMatching(async (off) => {
      const p = new URLSearchParams(queryString);
      p.set("limit", "200");
      p.set("offset", String(off));
      const r = await auth.fetch(`${env.apiBaseUrl}/content/questions?${p.toString()}`);
      const body = (await r.json()) as QuestionList;
      return { ids: body.items.map((i) => i.id), total: body.total };
    }, SELECT_ALL_CAP);
    setSelected(new Set(ids));
    if (capped) setNotice(`Selection capped at ${SELECT_ALL_CAP} questions.`);
  }

  async function startBatch() {
    if (selected.size === 0 || chosenLangs.size === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const out = await batches.create({
        questionIds: [...selected],
        targetLangs: [...chosenLangs],
        overwriteExisting: overwrite,
      });
      navigate(`/translation-batches/${out.batchId}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't start batch");
      setBusy(false);
    }
  }
```

3. Add a header checkbox cell as the first `<th>` (before `<th>Stem</th>` at line 174):

```tsx
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={(e) =>
                    setSelected((s) => (e.target.checked ? selectAllOnPage(s, pageIds) : clearPage(s, pageIds)))
                  }
                  aria-label="Select all on page"
                />
              </th>
```

4. Add a per-row checkbox cell as the first `<td>` (before the Stem `<td>` at line 213):

```tsx
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(q.id)}
                    onChange={() => setSelected((s) => toggle(s, q.id))}
                    aria-label={`Select ${q.id}`}
                  />
                </td>
```

   Also bump the empty/loading `colSpan` from `6` to `7` (lines 186 and 200).

5. Add the "select all matching" hint + the sticky action bar. Place the hint just above the table `<div>` (line 163), and the action bar just before the closing `</AdminShell>` (line 313):

```tsx
      {notice && <Banner tone="info">{notice}</Banner>}
      {selected.size > 0 && total > rows.length && (
        <button className="btn" onClick={selectAllMatching} style={{ marginBottom: 8 }}>
          Select all {total} matching this filter
        </button>
      )}
```

```tsx
      {selected.size > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "12px 16px",
            marginTop: 12,
            background: "var(--card)",
            border: "1px solid var(--rule)",
            borderRadius: 8,
          }}
        >
          <strong>{selected.size} selected</strong>
          <button className="btn" onClick={() => setSelected(new Set())}>Clear</button>
          <span style={{ color: "var(--ink-3)" }}>Translate to:</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {langs.map((l) => (
              <label key={l.code} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={chosenLangs.has(l.code)}
                  onChange={() => setChosenLangs((s) => toggle(s, l.code))}
                />
                {l.name}
              </label>
            ))}
          </div>
          <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            Overwrite existing
          </label>
          <button
            className="btn btn-primary"
            disabled={busy || chosenLangs.size === 0}
            onClick={startBatch}
          >
            {busy ? "Starting…" : `Translate → ${chosenLangs.size} lang(s)`}
          </button>
        </div>
      )}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/web-admin && npx vitest run src/pages/__tests__/translation-selection.test.ts`
Expected: PASS (3 tests).
Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: no type errors in `TranslationsList.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/src/pages/translation-selection.ts apps/web-admin/src/pages/TranslationsList.tsx apps/web-admin/src/pages/__tests__/translation-selection.test.ts
git commit -m "feat(web-admin): bulk selection + translate action bar on Translations list"
```

---

## Task 10: Batch progress page + recent batches + nav/routes

**Files:**
- Create: `apps/web-admin/src/pages/TranslationBatch.tsx`
- Create: `apps/web-admin/src/pages/TranslationBatches.tsx`
- Modify: `apps/web-admin/src/routes.tsx`
- Modify: `apps/web-admin/src/components/AdminShell.tsx`
- Test: `apps/web-admin/src/pages/__tests__/TranslationBatch.test.tsx`

**Interfaces:**
- Consumes: `batches.get`, `batches.list`, `batches.retryTask`.
- Produces: pages at `/translation-batches` and `/translation-batches/:batchId`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web-admin/src/pages/__tests__/TranslationBatch.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/translation-workbench-api", () => ({
  batches: { get: vi.fn(), retryTask: vi.fn() },
}));
vi.mock("../../components/AdminShell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { batches } from "../../lib/translation-workbench-api";
import { TranslationBatch } from "../TranslationBatch";

const mockGet = batches.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => mockGet.mockReset());

describe("TranslationBatch", () => {
  it("shows progress counters from the batch", async () => {
    mockGet.mockResolvedValue({
      batch: { id: "b1", status: "DONE", totalTasks: 3, doneTasks: 2, failedTasks: 1,
               targetLangs: ["hi"], subject: "general", createdAt: "2026-06-17T00:00:00Z", finishedAt: null },
      tasks: [{ id: "t1", questionId: "q1", language: "hi", status: "SUCCEEDED", error: null, version: 1, stem: "S1" }],
    });
    render(
      <MemoryRouter initialEntries={["/translation-batches/b1"]}>
        <Routes>
          <Route path="/translation-batches/:batchId" element={<TranslationBatch />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/2/)).toBeInTheDocument());
    expect(mockGet).toHaveBeenCalledWith("b1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-admin && npx vitest run src/pages/__tests__/TranslationBatch.test.tsx`
Expected: FAIL — cannot find module `../TranslationBatch`.

- [ ] **Step 3a: Write `TranslationBatch.tsx`**

```tsx
// apps/web-admin/src/pages/TranslationBatch.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill, StatCard } from "../components/primitives";
import { batches, type BatchDetail } from "../lib/translation-workbench-api";

const TERMINAL = new Set(["DONE", "DONE_WITH_ERRORS"]);

export function TranslationBatch() {
  const { batchId } = useParams<{ batchId: string }>();
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!batchId) return;
    try {
      const d = await batches.get(batchId);
      setDetail(d);
      if (!TERMINAL.has(d.batch.status)) {
        timer.current = setTimeout(load, 2000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load batch");
    }
  }, [batchId]);

  useEffect(() => {
    void load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  async function retry(taskId: string) {
    if (!batchId) return;
    await batches.retryTask(batchId, taskId);
    void load();
  }

  const b = detail?.batch;
  const pct = b && b.totalTasks > 0 ? Math.round(((b.doneTasks + b.failedTasks) / b.totalTasks) * 100) : 0;

  return (
    <AdminShell crumbs="Quality · Translations · Batch" title="Translation batch">
      {error && <Banner tone="danger">{error}</Banner>}
      {b && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <StatCard label="Total" value={String(b.totalTasks)} />
            <StatCard label="Done" value={String(b.doneTasks)} tone="success" />
            <StatCard label="Failed" value={String(b.failedTasks)} tone={b.failedTasks ? "danger" : "muted"} />
            <StatCard label="Progress" value={`${pct}%`} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Pill tone={TERMINAL.has(b.status) ? "success" : "info"}>{b.status}</Pill>
            {TERMINAL.has(b.status) && (
              <Link to={`/translation-verify?batchId=${b.id}`} className="btn btn-primary" style={{ marginLeft: 12 }}>
                Review drafts →
              </Link>
            )}
          </div>
          <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden" }}>
            <table className="data-table">
              <thead>
                <tr><th>Question</th><th>Lang</th><th>Status</th><th>Error</th><th></th></tr>
              </thead>
              <tbody>
                {detail!.tasks.map((t) => (
                  <tr key={t.id}>
                    <td style={{ maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.stem ?? t.questionId}>
                      {t.stem ?? t.questionId}
                    </td>
                    <td>{t.language.toUpperCase()}</td>
                    <td><Pill tone={t.status === "SUCCEEDED" ? "success" : t.status === "FAILED" ? "danger" : "muted"}>{t.status}</Pill></td>
                    <td style={{ color: "var(--ink-3)", fontSize: 12 }} title={t.error ?? ""}>{t.error ?? ""}</td>
                    <td>{t.status === "FAILED" && <button className="btn" onClick={() => retry(t.id)}>Retry</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  );
}
```

- [ ] **Step 3b: Write `TranslationBatches.tsx`**

```tsx
// apps/web-admin/src/pages/TranslationBatches.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill } from "../components/primitives";
import { batches, type BatchSummary } from "../lib/translation-workbench-api";

export function TranslationBatches() {
  const [rows, setRows] = useState<BatchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    batches.list().then(setRows).catch((e) => setError(e instanceof Error ? e.message : "load failed"));
  }, []);

  return (
    <AdminShell crumbs="Quality · Translation batches" title="Translation batches">
      {error && <Banner tone="danger">{error}</Banner>}
      <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr><th>Batch</th><th>Status</th><th>Langs</th><th>Done</th><th>Failed</th><th>Created</th></tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td><Link to={`/translation-batches/${b.id}`}>{b.id.slice(0, 8)}…</Link></td>
                <td><Pill tone={b.status.startsWith("DONE") ? "success" : "info"}>{b.status}</Pill></td>
                <td>{b.targetLangs.join(", ").toUpperCase()}</td>
                <td>{b.doneTasks}/{b.totalTasks}</td>
                <td>{b.failedTasks}</td>
                <td style={{ color: "var(--ink-3)", fontSize: 12 }}>{new Date(b.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && !error && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--ink-3)" }}>No batches yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
```

- [ ] **Step 3c: Add routes**

In `routes.tsx`, add imports (after line 26) and routes (after line 85):

```tsx
import { TranslationBatch } from "./pages/TranslationBatch";
import { TranslationBatches } from "./pages/TranslationBatches";
```

```tsx
  adminRoute("/translation-batches", <TranslationBatches />),
  adminRoute("/translation-batches/:batchId", <TranslationBatch />),
```

- [ ] **Step 3d: Add nav entry**

In `AdminShell.tsx`, in the `Quality` group `items` array (after the Translations entry, line 68):

```tsx
      { href: "/translation-batches", label: "Batches", icon: <IconGlobe /> },
```

- [ ] **Step 4: Run tests**

Run: `cd apps/web-admin && npx vitest run src/pages/__tests__/TranslationBatch.test.tsx`
Expected: PASS.
Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/src/pages/TranslationBatch.tsx apps/web-admin/src/pages/TranslationBatches.tsx apps/web-admin/src/routes.tsx apps/web-admin/src/components/AdminShell.tsx apps/web-admin/src/pages/__tests__/TranslationBatch.test.tsx
git commit -m "feat(web-admin): batch progress + recent batches pages"
```

---

## Task 11: Bulk verification screen + shared PayloadDiff

**Files:**
- Create: `apps/web-admin/src/components/PayloadDiff.tsx` (new, path-driven + editable — NOT a refactor of TranslationReview; see deviation #3)
- Create: `apps/web-admin/src/pages/TranslationVerify.tsx`
- Modify: `apps/web-admin/src/routes.tsx`, `apps/web-admin/src/components/AdminShell.tsx`
- Test: `apps/web-admin/src/pages/__tests__/TranslationVerify.test.tsx`

**Interfaces:**
- Consumes: `reviewQueue.list`, `reviewQueue.bulk`, `translationEdit.save`, `useAuth().user.id`.
- Produces: `/translation-verify` page; `PayloadDiff` component with props `{ paths: string[]; source: Record<string, unknown>; translation: Record<string, unknown>; editable?: boolean; onEdit?(path: string, value: string): void }`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web-admin/src/pages/__tests__/TranslationVerify.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/translation-workbench-api", () => ({
  reviewQueue: { list: vi.fn(), bulk: vi.fn() },
  translationEdit: { save: vi.fn() },
}));
vi.mock("../../components/AdminShell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../lib/auth-provider", () => ({
  useAuth: () => ({ user: { id: "rev-1" } }),
}));

import { reviewQueue } from "../../lib/translation-workbench-api";
import { TranslationVerify } from "../TranslationVerify";

const mockList = reviewQueue.list as unknown as ReturnType<typeof vi.fn>;
const mockBulk = reviewQueue.bulk as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockList.mockReset();
  mockBulk.mockReset();
});

describe("TranslationVerify", () => {
  it("lists drafts and bulk-approves selected", async () => {
    mockList.mockResolvedValue({
      items: [{
        questionId: "q1", language: "hi", status: "DRAFT", aiConfidence: 0.9, version: 1,
        culturalFlags: [], stem: "Stem", sourcePayload: { stem: "Stem" },
        payloadTranslation: { stem: "अनुवाद" }, translatablePaths: ["stem"],
      }],
      total: 1,
    });
    mockBulk.mockResolvedValue({ results: [{ questionId: "q1", lang: "hi", ok: true }] });

    render(<MemoryRouter><TranslationVerify /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Stem")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Select q1 hi"));
    fireEvent.click(screen.getByText(/Approve & Publish/));

    await waitFor(() =>
      expect(mockBulk).toHaveBeenCalledWith(
        [{ questionId: "q1", lang: "hi", action: "approve" }], "rev-1"),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-admin && npx vitest run src/pages/__tests__/TranslationVerify.test.tsx`
Expected: FAIL — cannot find module `../TranslationVerify`.

- [ ] **Step 3a: Write `PayloadDiff.tsx`**

```tsx
// apps/web-admin/src/components/PayloadDiff.tsx
// Path-driven, editable side-by-side source ↔ translation field viewer
// for the bulk verify screen. Iterates the question type's
// `translatablePaths` (expanding `[*]` wildcards), resolves each path in
// both payloads, and renders an editable target textarea.

export interface PayloadDiffProps {
  paths: string[];
  source: Record<string, unknown>;
  translation: Record<string, unknown>;
  editable?: boolean;
  onEdit?: (path: string, value: string) => void;
}

// Resolve a dotted/indexed path like "options[0].text" against an object.
function getAtPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

// Expand wildcard paths ("options[*].text") against the source array length.
function expandPaths(paths: string[], source: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const path of paths) {
    const m = path.match(/^(.*)\[\*\](.*)$/);
    if (!m) {
      out.push(path);
      continue;
    }
    const [, head, tail] = m;
    const arr = getAtPath(source, head);
    const len = Array.isArray(arr) ? arr.length : 0;
    for (let i = 0; i < len; i++) out.push(`${head}[${i}]${tail}`);
  }
  return out;
}

export function PayloadDiff({ paths, source, translation, editable, onEdit }: PayloadDiffProps) {
  const concrete = expandPaths(paths, source);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {concrete.map((path) => {
        const src = getAtPath(source, path);
        const tr = getAtPath(translation, path);
        return (
          <div key={path} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 4, padding: 8 }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono, monospace)" }}>{path}</div>
              <div>{String(src ?? "")}</div>
            </div>
            <div style={{ background: "var(--card)", border: "1px solid var(--rule)", borderRadius: 4, padding: 8 }}>
              {editable ? (
                <textarea
                  defaultValue={String(tr ?? "")}
                  onBlur={(e) => onEdit?.(path, e.target.value)}
                  aria-label={`edit ${path}`}
                  style={{ width: "100%", minHeight: 48, background: "var(--paper-2)", color: "var(--ink)", border: "1px solid var(--rule)", borderRadius: 4 }}
                />
              ) : (
                <div>{String(tr ?? "")}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3b: Write `TranslationVerify.tsx`**

```tsx
// apps/web-admin/src/pages/TranslationVerify.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill } from "../components/primitives";
import { PayloadDiff } from "../components/PayloadDiff";
import { useAuth } from "../lib/auth-provider";
import {
  reviewQueue,
  translationEdit,
  type ReviewItem,
} from "../lib/translation-workbench-api";

function rowKey(i: { questionId: string; language: string }) {
  return `${i.questionId}::${i.language}`;
}

export function TranslationVerify() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const batchId = params.get("batchId") ?? undefined;

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [langFilter, setLangFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const out = await reviewQueue.list({ batchId, lang: langFilter || undefined, status: "DRAFT" });
      setItems(out.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load review queue");
    }
  }, [batchId, langFilter]);

  useEffect(() => { void load(); }, [load]);

  function toggleSel(k: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }

  async function saveEdit(item: ReviewItem, path: string, value: string) {
    const k = rowKey(item);
    const base = edits[k] ?? { ...item.payloadTranslation };
    // Shallow set for top-level paths; nested paths handled server-side payload merge.
    const next = { ...base, [path]: value };
    setEdits((e) => ({ ...e, [k]: next }));
    await translationEdit.save(item.questionId, item.language, next);
  }

  async function decide(action: "approve" | "reject") {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const decisions = items
        .filter((i) => selected.has(rowKey(i)))
        .map((i) => ({ questionId: i.questionId, lang: i.language, action }));
      await reviewQueue.bulk(decisions, user!.id);
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBusy(false);
    }
  }

  const langs = useMemo(
    () => Array.from(new Set(items.map((i) => i.language))).sort(),
    [items],
  );

  return (
    <AdminShell crumbs="Quality · Verify translations" title="Verify translations">
      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)}
          style={{ padding: "6px 10px", background: "var(--paper-2)", color: "var(--ink)", border: "1px solid var(--rule)", borderRadius: 4 }}>
          <option value="">All languages</option>
          {langs.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
        <span style={{ color: "var(--ink-3)", fontSize: 13 }}>{items.length} draft(s)</span>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => {
          const k = rowKey(item);
          const isOpen = expanded.has(k);
          return (
            <div key={k} style={{ border: "1px solid var(--rule)", borderRadius: 8, background: "var(--paper-2)" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12 }}>
                <input type="checkbox" checked={selected.has(k)} onChange={() => toggleSel(k)}
                  aria-label={`Select ${item.questionId} ${item.language}`} />
                <Pill tone="muted">{item.language.toUpperCase()}</Pill>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.stem}>{item.stem}</span>
                {item.aiConfidence != null && (
                  <Pill tone={item.aiConfidence < 0.6 ? "warning" : "info"}>conf {item.aiConfidence.toFixed(2)}</Pill>
                )}
                {item.culturalFlags.length > 0 && <Pill tone="danger">cultural</Pill>}
                <button className="btn" onClick={() => setExpanded((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })}>
                  {isOpen ? "Hide" : "Diff"}
                </button>
              </div>
              {isOpen && (
                <div style={{ padding: 12, borderTop: "1px solid var(--rule)" }}>
                  <PayloadDiff
                    paths={item.translatablePaths}
                    source={item.sourcePayload}
                    translation={edits[k] ?? item.payloadTranslation}
                    editable
                    onEdit={(path, value) => saveEdit(item, path, value)}
                  />
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && !error && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)" }}>No drafts pending review.</div>
        )}
      </div>

      {selected.size > 0 && (
        <div style={{ position: "sticky", bottom: 0, display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", marginTop: 12, background: "var(--card)", border: "1px solid var(--rule)", borderRadius: 8 }}>
          <strong>{selected.size} selected</strong>
          <button className="btn btn-primary" disabled={busy} onClick={() => decide("approve")}>Approve & Publish</button>
          <button className="btn" disabled={busy} onClick={() => decide("reject")}>Reject</button>
          <button className="btn" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
    </AdminShell>
  );
}
```

- [ ] **Step 3c: Routes + nav**

`routes.tsx` — import + route:

```tsx
import { TranslationVerify } from "./pages/TranslationVerify";
```
```tsx
  adminRoute("/translation-verify", <TranslationVerify />),
```

`AdminShell.tsx` — Quality group, after the Batches entry:

```tsx
      { href: "/translation-verify", label: "Verify queue", icon: <IconCheck /> },
```

- [ ] **Step 4: Run tests**

Run: `cd apps/web-admin && npx vitest run src/pages/__tests__/TranslationVerify.test.tsx`
Expected: PASS.
Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/src/components/PayloadDiff.tsx apps/web-admin/src/pages/TranslationVerify.tsx apps/web-admin/src/routes.tsx apps/web-admin/src/components/AdminShell.tsx apps/web-admin/src/pages/__tests__/TranslationVerify.test.tsx
git commit -m "feat(web-admin): bulk verification screen + path-driven editable PayloadDiff"
```

---

## Task 12: Languages registry page

**Files:**
- Create: `apps/web-admin/src/pages/Languages.tsx`
- Modify: `apps/web-admin/src/routes.tsx`, `apps/web-admin/src/components/AdminShell.tsx`
- Test: `apps/web-admin/src/pages/__tests__/Languages.test.tsx`

**Interfaces:**
- Consumes: `languages.list(includeDisabled=true)`, `languages.upsert`, `languages.patch`.
- Produces: `/languages` page.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web-admin/src/pages/__tests__/Languages.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/translation-workbench-api", () => ({
  languages: { list: vi.fn(), upsert: vi.fn(), patch: vi.fn() },
}));
vi.mock("../../components/AdminShell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { languages } from "../../lib/translation-workbench-api";
import { Languages } from "../Languages";

const mockList = languages.list as unknown as ReturnType<typeof vi.fn>;
const mockPatch = languages.patch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockList.mockReset();
  mockPatch.mockReset();
});

describe("Languages", () => {
  it("lists languages and toggles enabled", async () => {
    mockList.mockResolvedValue([
      { code: "en", name: "English", nativeName: "English", script: "Latin", enabled: true, isSource: true, sortOrder: 0 },
      { code: "hi", name: "Hindi", nativeName: "हिन्दी", script: "Devanagari", enabled: true, isSource: false, sortOrder: 10 },
    ]);
    mockPatch.mockResolvedValue({ code: "hi", enabled: false });
    render(<Languages />);
    await waitFor(() => expect(screen.getByText("Hindi")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("toggle hi"));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith("hi", { enabled: false }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-admin && npx vitest run src/pages/__tests__/Languages.test.tsx`
Expected: FAIL — cannot find module `../Languages`.

- [ ] **Step 3a: Write `Languages.tsx`**

```tsx
// apps/web-admin/src/pages/Languages.tsx
import { useEffect, useState } from "react";
import { AdminShell } from "../components/AdminShell";
import { Banner, Pill } from "../components/primitives";
import { languages, type Language } from "../lib/translation-workbench-api";

const EMPTY = { code: "", name: "", nativeName: "", script: "", enabled: true, sortOrder: 100 };

export function Languages() {
  const [rows, setRows] = useState<Language[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  async function load() {
    try {
      setRows(await languages.list(true));
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }
  useEffect(() => { void load(); }, []);

  async function toggle(code: string, enabled: boolean) {
    await languages.patch(code, { enabled });
    await load();
  }

  async function add() {
    if (!form.code || !form.name || !form.nativeName) return;
    await languages.upsert({ ...form, script: form.script || null });
    setForm({ ...EMPTY });
    await load();
  }

  return (
    <AdminShell crumbs="Quality · Languages" title="Languages">
      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
        <table className="data-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Native</th><th>Script</th><th>Source</th><th>Enabled</th></tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.code}>
                <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{l.code}</td>
                <td>{l.name}</td>
                <td>{l.nativeName}</td>
                <td style={{ color: "var(--ink-3)" }}>{l.script ?? ""}</td>
                <td>{l.isSource ? <Pill tone="info">source</Pill> : ""}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={l.enabled}
                    disabled={l.isSource}
                    aria-label={`toggle ${l.code}`}
                    onChange={(e) => toggle(l.code, e.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="code (e.g. kn)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={inp} />
        <input placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} />
        <input placeholder="native name" value={form.nativeName} onChange={(e) => setForm({ ...form, nativeName: e.target.value })} style={inp} />
        <input placeholder="script" value={form.script} onChange={(e) => setForm({ ...form, script: e.target.value })} style={inp} />
        <button className="btn btn-primary" onClick={add}>Add language</button>
      </div>
    </AdminShell>
  );
}

const inp: React.CSSProperties = {
  padding: "6px 10px", background: "var(--paper-2)", color: "var(--ink)",
  border: "1px solid var(--rule)", borderRadius: 4, fontSize: 13,
};
```

- [ ] **Step 3b: Routes + nav**

`routes.tsx` — import + route:

```tsx
import { Languages } from "./pages/Languages";
```
```tsx
  adminRoute("/languages", <Languages />),
```

`AdminShell.tsx` — add to the `Account` group (or a new entry under Quality). Add under Quality after Verify queue:

```tsx
      { href: "/languages", label: "Languages", icon: <IconGlobe /> },
```

- [ ] **Step 4: Run tests**

Run: `cd apps/web-admin && npx vitest run src/pages/__tests__/Languages.test.tsx`
Expected: PASS.
Run: `cd apps/web-admin && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/src/pages/Languages.tsx apps/web-admin/src/routes.tsx apps/web-admin/src/components/AdminShell.tsx apps/web-admin/src/pages/__tests__/Languages.test.tsx
git commit -m "feat(web-admin): language registry management page"
```

---

## Final verification

- [ ] Run the full backend localisation suite: `cd services/learning && python -m pytest tests/localisation tests/content -k "translation or batch or language or review" -v` → all PASS.
- [ ] Run the full frontend suite: `cd apps/web-admin && npx vitest run` → all PASS.
- [ ] Typecheck frontend: `cd apps/web-admin && npx tsc --noEmit` → clean.
- [ ] Manual smoke (optional, via the `run` skill): start the stack, log in as admin, select 2 questions on `/translation-review`, choose Hindi + Tamil, Translate, watch `/translation-batches/:id` complete, click "Review drafts", edit a field, Approve & Publish, confirm status flips to PUBLISHED.

## Spec coverage check

| Spec section | Task(s) |
|---|---|
| §1 Language Registry (table, seed, repo, routes, replace SUPPORTED_LANGS) | 1, 2, 3 |
| §2 Batch engine (tables, fan-out, worker, progress/retry endpoints) | 1, 4, 5, 6 |
| §3 Selection UX (checkboxes, select-all-matching, action bar) | 9 |
| §4 Batch Progress view (polling, KPIs, retry, review CTA) | 10 |
| §5 Bulk Verification (queue API, row diff, inline edit→new version, bulk approve&publish) | 7, 11 |
| §6 Navigation, scope, testing | 9–12 (nav), all (tests) |
| New API surface table | 3 (languages), 6 (batches), 7 (review-queue, edit) |
