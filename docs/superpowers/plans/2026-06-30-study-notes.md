# Rich-text Study Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-exam notebook to the student Study Materials page where a student can create multiple named notes, write rich text, and paste images that upload to object storage.

**Architecture:** A new `content_schema.user_notes` table stores ProseMirror JSON per note, keyed to `(user_id, exam_id)`. New owner-scoped CRUD endpoints in the learning service back it. Pasted images ride the existing `/uploads/presign` → MinIO → `/uploads/sign` flow via a new `note-image` kind; the note body persists only the stable `object_key`, and the TipTap editor resolves it to a short-lived signed URL at render time. The notebook UI (rail + TipTap editor with autosave) mounts as a "My Notes" section on `ExamContent.tsx`.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy async (raw `text()` SQL) / Alembic; asyncpg-backed pytest against `learning_test` (localhost:35432). React 18 + TypeScript / Vitest (jsdom + jest-dom). TipTap (ProseMirror) editor. web-student served by nginx Docker container.

## Global Constraints

- New table is `content_schema.user_notes`; migration revision `047`, down_revision `046`.
- All note endpoints are `current_principal`-gated and **owner-scoped**: a row is only readable/writable when `user_id == principal.user_id`; otherwise **404** (never reveal existence). Errors use FastAPI's default `{"detail": ...}` shape.
- Caps (server-enforced): ≤ 100 notes per `(user_id, exam_id)` → **409**; `title` ≤ 200 chars and serialized `body` ≤ 262144 bytes → **422**.
- Note `body` is a ProseMirror JSON document (JSONB). Image nodes persist `{ objectKey }` only — **never** a signed/expiring `src`.
- Note-image upload kind is `"note-image"`, object-key layout `note-images/{user_id}/{uuid}.{ext}`, `image/*` MIME only.
- Visibility is PRIVATE only (no sharing). Image moderation is deferred (out of scope).
- Frontend network calls use `auth.fetch(\`${env.apiBaseUrl}/...\`)` (`env.apiBaseUrl` = `/api/v1`); `auth.fetch` does NOT prepend a base URL, so pass the full path (mirror `apps/web-student/src/lib/notes-api.ts`).
- The editor "writing font" is the design-system serif token `var(--font-display)` ("Instrument Serif").
- Backend tests: `cd services/learning && uv run pytest <path> -v`. Frontend tests: `cd apps/web-student && npx vitest run <path>`; type-check `cd apps/web-student && npx tsc --noEmit`.
- web-student has a known pre-existing vitest baseline of failing files (e.g. `App.test`, `error_patterns`, `goals`, `syllabus_coverage`) unrelated to this work — do not fix them; only ensure no NEW failures.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `services/learning/alembic/content/versions/047_user_notes.py` | create `content_schema.user_notes` | T1 |
| `services/learning/src/learning/content/user_notes_repo.py` | SQL persistence for user_notes | T2 |
| `services/learning/src/learning/content/user_notes_routes.py` | owner-scoped CRUD endpoints | T2 |
| `services/learning/src/learning/main.py` | register `user_notes_router` | T2 |
| `services/learning/tests/content/test_user_notes.py` | CRUD + ownership + caps tests | T2 |
| `services/learning/src/learning/storage/__init__.py` | `note-image` kind in `UploadKind` + `object_key()` | T3 |
| `services/learning/src/learning/storage/routes.py` | `note-image` in presign Literal + image-only guard; `note-images` branch in finalize & sign | T3 |
| `services/learning/tests/storage/test_note_image_uploads.py` | presign/sign/finalize for note-image | T3 |
| `apps/web-student/src/lib/userNotes-api.ts` + `.test.ts` | notes CRUD client | T4 |
| `apps/web-student/src/lib/noteImages.ts` + `.test.ts` | presign-upload + sign helpers | T5 |
| `apps/web-student/src/lib/noteDoc.ts` + `.test.ts` | pure doc helpers (empty doc, strip transient src, collect objectKeys) | T6 |
| `apps/web-student/src/components/notes/NoteEditor.tsx` | TipTap editor + custom image node | T7 |
| `apps/web-student/src/components/notes/NoteList.tsx` | note rail (create/rename/delete) | T8 |
| `apps/web-student/src/components/notes/NotesPanel.tsx` + `.test.tsx` | compose rail+editor, autosave | T8 |
| `apps/web-student/src/pages/ExamContent.tsx` | mount "My Notes" section | T9 |

**Task order:** T1→T2→T3 (backend), then T4, T5, T6 (independent frontend libs), T7 (editor; consumes T5+T6), T8 (panel; consumes T4+T7), T9 (mount; consumes T8). Backend and frontend-lib tasks are mutually independent; T7–T9 are sequential.

---

### Task 1: Migration — `content_schema.user_notes`

**Files:**
- Create: `services/learning/alembic/content/versions/047_user_notes.py`

**Interfaces:**
- Produces: table `content_schema.user_notes(id uuid pk, user_id uuid, tenant_id uuid, exam_id uuid, title text, body jsonb, created_at timestamptz, updated_at timestamptz)` + index `idx_user_notes_owner_exam (user_id, exam_id, updated_at DESC)`.

- [ ] **Step 1: Write the migration**

Create `services/learning/alembic/content/versions/047_user_notes.py`:

```python
"""create content_schema.user_notes — per-exam student rich-text notebook.

Revision ID: 047
Revises: 046
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "047"
down_revision: str | None = "046"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.user_notes (
          id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id     UUID        NOT NULL,
          tenant_id   UUID        NOT NULL,
          exam_id     UUID        NOT NULL,
          title       TEXT        NOT NULL DEFAULT 'Untitled note',
          body        JSONB       NOT NULL DEFAULT '{{}}'::jsonb,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_user_notes_owner_exam "
        f"ON {SCHEMA}.user_notes (user_id, exam_id, updated_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.user_notes")
```

- [ ] **Step 2: Apply the migration to the test DB and verify the table exists**

The test harness only auto-migrates `learning_test` when the sentinel `doubts_schema.doubts` is absent (it isn't), so apply manually:

Run:
```bash
cd services/learning && DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:35432/learning_test \
  uv run alembic -c alembic_content.ini upgrade head
```
Expected: alembic logs `Running upgrade 046 -> 047`.

Then verify:
```bash
cd services/learning && uv run python -c "import asyncio, asyncpg; \
print(asyncio.run((lambda: (lambda c: c)(None))()) if False else asyncio.run(__import__('asyncpg').connect(host='localhost',port=35432,user='postgres',password='postgres',database='learning_test').__await__().__next__())) " 2>/dev/null || \
psql "postgresql://postgres:postgres@localhost:35432/learning_test" -c "\d content_schema.user_notes"
```
Simpler verification (preferred): 
```bash
psql "postgresql://postgres:postgres@localhost:35432/learning_test" -c "SELECT to_regclass('content_schema.user_notes');"
```
Expected: returns `content_schema.user_notes` (not NULL).

- [ ] **Step 3: Commit**

```bash
git add services/learning/alembic/content/versions/047_user_notes.py
git commit -m "feat(content): migration 047 — user_notes table"
```

---

### Task 2: Backend — user_notes repository + CRUD routes

**Files:**
- Create: `services/learning/src/learning/content/user_notes_repo.py`
- Create: `services/learning/src/learning/content/user_notes_routes.py`
- Modify: `services/learning/src/learning/main.py` (register router)
- Test: `services/learning/tests/content/test_user_notes.py`

**Interfaces:**
- Consumes: `content/db.py` `sessionmaker`; `content/security.py` `current_principal`, `JwtPrincipal`; table from Task 1.
- Produces these endpoints (router prefix `/content`):
  - `GET /content/notes?exam_id={uuid}` → `200 [{id, title, updated_at}]`
  - `POST /content/notes` `{exam_id, title?}` → `201 {id, exam_id, title, body, created_at, updated_at}`
  - `GET /content/notes/{note_id}` → `200 {id, exam_id, title, body, created_at, updated_at}`
  - `PUT /content/notes/{note_id}` `{title?, body?}` → `200` (full note)
  - `DELETE /content/notes/{note_id}` → `204`
- Caps: 100 notes/exam → 409; title>200 or body>262144 bytes → 422; missing/not-owned → 404.

- [ ] **Step 1: Write the failing tests**

Create `services/learning/tests/content/test_user_notes.py`:

```python
"""Per-exam student notebook — owner-scoped CRUD + caps."""
from __future__ import annotations

import time
from collections.abc import Iterator
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from learning.content.config import settings
from learning.main import app


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def _auth(user_id: str, role: str = "STUDENT") -> dict[str, str]:
    tok = jwt.encode(
        {"sub": user_id, "role": role, "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret, algorithm="HS256",
    )
    return {"authorization": f"Bearer {tok}"}


def _create(client: TestClient, uid: str, exam_id: str, title: str = "My note") -> dict:
    r = client.post("/content/notes", headers=_auth(uid), json={"exam_id": exam_id, "title": title})
    assert r.status_code == 201, r.text
    return r.json()


def test_create_get_update_delete_happy_path(client: TestClient) -> None:
    uid, exam = str(uuid4()), str(uuid4())
    note = _create(client, uid, exam)
    nid = note["id"]
    assert note["title"] == "My note"
    assert note["exam_id"] == exam

    got = client.get(f"/content/notes/{nid}", headers=_auth(uid))
    assert got.status_code == 200
    assert got.json()["id"] == nid

    body = {"type": "doc", "content": [{"type": "paragraph"}]}
    upd = client.put(f"/content/notes/{nid}", headers=_auth(uid),
                     json={"title": "Renamed", "body": body})
    assert upd.status_code == 200
    assert upd.json()["title"] == "Renamed"
    assert upd.json()["body"] == body

    dl = client.delete(f"/content/notes/{nid}", headers=_auth(uid))
    assert dl.status_code == 204
    assert client.get(f"/content/notes/{nid}", headers=_auth(uid)).status_code == 404


def test_list_is_scoped_to_user_and_exam(client: TestClient) -> None:
    uid, other = str(uuid4()), str(uuid4())
    exam_a, exam_b = str(uuid4()), str(uuid4())
    _create(client, uid, exam_a, "A1")
    _create(client, uid, exam_a, "A2")
    _create(client, uid, exam_b, "B1")
    _create(client, other, exam_a, "OTHER")

    listing = client.get(f"/content/notes?exam_id={exam_a}", headers=_auth(uid))
    assert listing.status_code == 200
    titles = {n["title"] for n in listing.json()}
    assert titles == {"A1", "A2"}  # not exam_b, not other-user's


def test_cannot_access_others_note(client: TestClient) -> None:
    owner, attacker = str(uuid4()), str(uuid4())
    nid = _create(client, owner, str(uuid4()))["id"]
    assert client.get(f"/content/notes/{nid}", headers=_auth(attacker)).status_code == 404
    assert client.put(f"/content/notes/{nid}", headers=_auth(attacker),
                      json={"title": "hax"}).status_code == 404
    assert client.delete(f"/content/notes/{nid}", headers=_auth(attacker)).status_code == 404


def test_unknown_note_404(client: TestClient) -> None:
    assert client.get(f"/content/notes/{uuid4()}", headers=_auth(str(uuid4()))).status_code == 404


def test_title_too_long_422(client: TestClient) -> None:
    uid = str(uuid4())
    nid = _create(client, uid, str(uuid4()))["id"]
    r = client.put(f"/content/notes/{nid}", headers=_auth(uid), json={"title": "x" * 201})
    assert r.status_code == 422


def test_body_too_large_422(client: TestClient) -> None:
    uid = str(uuid4())
    nid = _create(client, uid, str(uuid4()))["id"]
    big = {"type": "doc", "content": [{"type": "paragraph",
            "content": [{"type": "text", "text": "x" * 300_000}]}]}
    r = client.put(f"/content/notes/{nid}", headers=_auth(uid), json={"body": big})
    assert r.status_code == 422


def test_note_cap_per_exam_409(client: TestClient) -> None:
    uid, exam = str(uuid4()), str(uuid4())
    for i in range(100):
        _create(client, uid, exam, f"n{i}")
    r = client.post("/content/notes", headers=_auth(uid), json={"exam_id": exam, "title": "over"})
    assert r.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/learning && uv run pytest tests/content/test_user_notes.py -v`
Expected: FAIL — `/content/notes` routes return 404 (not registered).

- [ ] **Step 3: Write the repository**

Create `services/learning/src/learning/content/user_notes_repo.py`:

```python
"""Persistence for content_schema.user_notes — per-exam student notebook."""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

MAX_NOTES_PER_EXAM = 100


def _row_to_note(row: Any) -> dict:
    return {
        "id": str(row["id"]),
        "exam_id": str(row["exam_id"]),
        "title": row["title"],
        "body": row["body"] if isinstance(row["body"], dict) else json.loads(row["body"]),
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
    }


async def count_for_exam(s: AsyncSession, *, user_id: str, exam_id: str) -> int:
    res = await s.execute(
        text("SELECT COUNT(*) FROM content_schema.user_notes "
             "WHERE user_id = CAST(:u AS uuid) AND exam_id = CAST(:e AS uuid)"),
        {"u": user_id, "e": exam_id})
    return int(res.scalar_one())


async def list_for_exam(s: AsyncSession, *, user_id: str, exam_id: str) -> list[dict]:
    res = await s.execute(
        text("SELECT id, title, updated_at FROM content_schema.user_notes "
             "WHERE user_id = CAST(:u AS uuid) AND exam_id = CAST(:e AS uuid) "
             "ORDER BY updated_at DESC"),
        {"u": user_id, "e": exam_id})
    return [
        {"id": str(r["id"]), "title": r["title"], "updated_at": r["updated_at"].isoformat()}
        for r in res.mappings().all()
    ]


async def create(s: AsyncSession, *, user_id: str, tenant_id: str, exam_id: str, title: str) -> dict:
    res = await s.execute(
        text("INSERT INTO content_schema.user_notes (user_id, tenant_id, exam_id, title) "
             "VALUES (CAST(:u AS uuid), CAST(:t AS uuid), CAST(:e AS uuid), :title) "
             "RETURNING id, exam_id, title, body, created_at, updated_at"),
        {"u": user_id, "t": tenant_id, "e": exam_id, "title": title})
    await s.commit()
    return _row_to_note(res.mappings().one())


async def get_owned(s: AsyncSession, *, note_id: str, user_id: str) -> dict | None:
    res = await s.execute(
        text("SELECT id, exam_id, title, body, created_at, updated_at "
             "FROM content_schema.user_notes "
             "WHERE id = CAST(:n AS uuid) AND user_id = CAST(:u AS uuid)"),
        {"n": note_id, "u": user_id})
    row = res.mappings().first()
    return _row_to_note(row) if row else None


async def update_owned(
    s: AsyncSession, *, note_id: str, user_id: str,
    title: str | None, body: dict | None,
) -> dict | None:
    res = await s.execute(
        text("""
            UPDATE content_schema.user_notes
               SET title = COALESCE(:title, title),
                   body  = COALESCE(CAST(:body AS jsonb), body),
                   updated_at = now()
             WHERE id = CAST(:n AS uuid) AND user_id = CAST(:u AS uuid)
         RETURNING id, exam_id, title, body, created_at, updated_at
        """),
        {"n": note_id, "u": user_id, "title": title,
         "body": json.dumps(body) if body is not None else None})
    await s.commit()
    row = res.mappings().first()
    return _row_to_note(row) if row else None


async def delete_owned(s: AsyncSession, *, note_id: str, user_id: str) -> bool:
    res = await s.execute(
        text("DELETE FROM content_schema.user_notes "
             "WHERE id = CAST(:n AS uuid) AND user_id = CAST(:u AS uuid)"),
        {"n": note_id, "u": user_id})
    await s.commit()
    return (res.rowcount or 0) > 0
```

- [ ] **Step 4: Write the routes**

Create `services/learning/src/learning/content/user_notes_routes.py`:

```python
"""Per-exam student notebook — owner-scoped rich-text notes.

GET    /content/notes?exam_id=...
POST   /content/notes
GET    /content/notes/{note_id}
PUT    /content/notes/{note_id}
DELETE /content/notes/{note_id}
"""
from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content import user_notes_repo as repo
from learning.content.db import sessionmaker
from learning.content.security import JwtPrincipal, current_principal

router = APIRouter(prefix="/content", tags=["content-user-notes"])

PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]

MAX_BODY_BYTES = 262144  # 256 KB


async def _session() -> AsyncSession:
    async with sessionmaker()() as s:
        yield s


SessionDep = Annotated[AsyncSession, Depends(_session)]


class NoteSummary(BaseModel):
    id: str
    title: str
    updated_at: str


class NoteOut(BaseModel):
    id: str
    exam_id: str
    title: str
    body: dict
    created_at: str
    updated_at: str


class NoteCreate(BaseModel):
    exam_id: str = Field(..., min_length=1)
    title: str = Field(default="Untitled note", max_length=200)


class NotePatch(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    body: dict | None = None


def _tenant(principal: JwtPrincipal) -> str:
    return getattr(principal, "tenant_id", None) or "00000000-0000-0000-0000-000000000000"


@router.get("/notes", response_model=list[NoteSummary])
async def list_notes(
    session: SessionDep, principal: PrincipalDep,
    exam_id: Annotated[str, Query(min_length=1)],
) -> list[NoteSummary]:
    rows = await repo.list_for_exam(session, user_id=principal.user_id, exam_id=exam_id)
    return [NoteSummary(**r) for r in rows]


@router.post("/notes", response_model=NoteOut, status_code=201)
async def create_note(
    body: NoteCreate, session: SessionDep, principal: PrincipalDep,
) -> NoteOut:
    n = await repo.count_for_exam(session, user_id=principal.user_id, exam_id=body.exam_id)
    if n >= repo.MAX_NOTES_PER_EXAM:
        raise HTTPException(status_code=409, detail={
            "code": "note_limit_reached",
            "message": f"You can keep at most {repo.MAX_NOTES_PER_EXAM} notes per exam.",
        })
    note = await repo.create(
        session, user_id=principal.user_id, tenant_id=_tenant(principal),
        exam_id=body.exam_id, title=body.title)
    return NoteOut(**note)


@router.get("/notes/{note_id}", response_model=NoteOut)
async def get_note(note_id: str, session: SessionDep, principal: PrincipalDep) -> NoteOut:
    note = await repo.get_owned(session, note_id=note_id, user_id=principal.user_id)
    if note is None:
        raise HTTPException(status_code=404, detail="note not found")
    return NoteOut(**note)


@router.put("/notes/{note_id}", response_model=NoteOut)
async def update_note(
    note_id: str, body: NotePatch, session: SessionDep, principal: PrincipalDep,
) -> NoteOut:
    if body.body is not None and len(json.dumps(body.body)) > MAX_BODY_BYTES:
        raise HTTPException(status_code=422, detail={
            "code": "note_too_large",
            "message": f"Note body exceeds {MAX_BODY_BYTES} bytes.",
        })
    note = await repo.update_owned(
        session, note_id=note_id, user_id=principal.user_id,
        title=body.title, body=body.body)
    if note is None:
        raise HTTPException(status_code=404, detail="note not found")
    return NoteOut(**note)


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(note_id: str, session: SessionDep, principal: PrincipalDep) -> None:
    ok = await repo.delete_owned(session, note_id=note_id, user_id=principal.user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="note not found")
```

> Match the `current_principal` / `sessionmaker` import paths to `content/notes_routes.py` exactly — if `notes_routes.py` builds its session differently (e.g. a shared `_session` dependency in that module), follow that same construction. The `JwtPrincipal.user_id` / `.tenant_id` attribute names must match what `content/security.py` exposes (verify before writing).

- [ ] **Step 5: Register the router**

In `services/learning/src/learning/main.py`, near the other content routers (search for where `notes_routes` / topic-notes router is included), add:

```python
from learning.content.user_notes_routes import router as user_notes_router
...
app.include_router(user_notes_router)
```
(Place the import with the other `learning.content.*` route imports and the `include_router` call beside the existing content-notes registration.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd services/learning && uv run pytest tests/content/test_user_notes.py -v`
Expected: PASS — all 7 tests.

- [ ] **Step 7: Commit**

```bash
git add services/learning/src/learning/content/user_notes_repo.py \
        services/learning/src/learning/content/user_notes_routes.py \
        services/learning/src/learning/main.py \
        services/learning/tests/content/test_user_notes.py
git commit -m "feat(content): per-exam user notes CRUD endpoints"
```

---

### Task 3: Backend — `note-image` upload kind

**Files:**
- Modify: `services/learning/src/learning/storage/__init__.py` (`UploadKind`, `object_key()`)
- Modify: `services/learning/src/learning/storage/routes.py` (presign Literal + image-only guard; finalize + sign prefix maps)
- Test: `services/learning/tests/storage/test_note_image_uploads.py`

**Interfaces:**
- Consumes: existing presign/finalize/sign machinery.
- Produces: `POST /uploads/presign {kind:"note-image", content_type}` → object key `note-images/{user_id}/{uuid}.{ext}`; non-image MIME → 415; `GET /uploads/sign?key=note-images/{uid}/..` and `POST /uploads/finalize` owner-gate by `parts[1]`.

- [ ] **Step 1: Write the failing tests**

Create `services/learning/tests/storage/test_note_image_uploads.py` (mirror the auth/client pattern of `services/learning/tests/storage/` if tests exist there; otherwise this is self-contained):

```python
"""note-image upload kind — presign key layout, MIME guard, owner-scoped sign."""
from __future__ import annotations

import time
from collections.abc import Iterator
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from learning.content.config import settings
from learning.main import app


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def _auth(user_id: str, role: str = "STUDENT") -> dict[str, str]:
    tok = jwt.encode(
        {"sub": user_id, "role": role, "iat": int(time.time()), "exp": int(time.time()) + 3600},
        settings.jwt_secret, algorithm="HS256",
    )
    return {"authorization": f"Bearer {tok}"}


def test_presign_note_image_returns_user_scoped_key(client: TestClient) -> None:
    uid = str(uuid4())
    r = client.post("/uploads/presign", headers=_auth(uid),
                    json={"kind": "note-image", "content_type": "image/png"})
    assert r.status_code == 200, r.text
    key = r.json()["object_key"]
    assert key.startswith(f"note-images/{uid}/")
    assert key.endswith(".png")


def test_presign_note_image_rejects_non_image(client: TestClient) -> None:
    r = client.post("/uploads/presign", headers=_auth(str(uuid4())),
                    json={"kind": "note-image", "content_type": "application/pdf"})
    assert r.status_code == 415


def test_sign_note_image_owner_only(client: TestClient) -> None:
    owner, other = str(uuid4()), str(uuid4())
    key = f"note-images/{owner}/{uuid4().hex}.png"
    # Owner may request a signed GET URL (object need not exist to be signed).
    ok = client.get(f"/uploads/sign?key={key}", headers=_auth(owner))
    assert ok.status_code == 200
    # A different user may not.
    no = client.get(f"/uploads/sign?key={key}", headers=_auth(other))
    assert no.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/learning && uv run pytest tests/storage/test_note_image_uploads.py -v`
Expected: FAIL — `note-image` is not an accepted `kind` (422/400) and `note-images` prefix is unknown to `/uploads/sign` (400).

- [ ] **Step 3: Add the kind to `storage/__init__.py`**

In `services/learning/src/learning/storage/__init__.py`, add `"note-image"` to `UploadKind`:

```python
UploadKind = Literal[
    "quiz-response",
    "doubt",
    "content-media",
    "study-material",
    "profile-avatar",
    "profile-id-proof",
    "tmp",
    "note-image",
]
```

And add a branch to `object_key()` (place it before the final `raise ValueError`):

```python
    if kind == "note-image":
        if not user_id:
            raise ValueError("note-image requires user_id")
        return f"note-images/{user_id}/{fid}.{extension}"
```

- [ ] **Step 4: Update `storage/routes.py` — presign Literal, image-only guard, and prefix maps**

In `services/learning/src/learning/storage/routes.py`:

(a) add `"note-image"` to `PresignRequest.kind`:

```python
    kind: Literal[
        "quiz-response",
        "doubt",
        "content-media",
        "study-material",
        "profile-avatar",
        "profile-id-proof",
        "tmp",
        "note-image",
    ]
```

(b) in the `presign` handler, after the `ALLOWED_MIME` check and before `object_key(...)`, restrict note-image to images:

```python
    if body.kind == "note-image" and not body.content_type.startswith("image/"):
        raise HTTPException(
            status_code=415,
            detail={"code": "unsupported_media_type",
                    "message": "note-image accepts image/* only."},
        )
```

(c) add a `note-images` branch to the prefix map in **`finalize`** (alongside `profile-uploads`):

```python
    elif parts[:1] == ["note-images"] and len(parts) >= 2:
        owner_segment = parts[1]
```

(d) add the same branch to the prefix map in **`sign_get`** (alongside `profile-uploads`):

```python
    elif parts[:1] == ["note-images"] and len(parts) >= 2:
        owner_segment = parts[1]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/learning && uv run pytest tests/storage/test_note_image_uploads.py -v`
Expected: PASS — all 3 tests.

- [ ] **Step 6: Commit**

```bash
git add services/learning/src/learning/storage/__init__.py \
        services/learning/src/learning/storage/routes.py \
        services/learning/tests/storage/test_note_image_uploads.py
git commit -m "feat(storage): note-image upload kind (presign/sign/finalize)"
```

---

### Task 4: Frontend — `userNotes-api.ts` client

**Files:**
- Create: `apps/web-student/src/lib/userNotes-api.ts`
- Test: `apps/web-student/src/lib/userNotes-api.test.ts`

**Interfaces:**
- Consumes: `lib/api.ts` `auth`, `lib/env.ts` `env` (mirror `lib/notes-api.ts`).
- Produces: `userNotes` with `list(examId): Promise<NoteSummary[]>`, `create(examId, title?): Promise<Note>`, `get(id): Promise<Note>`, `update(id, {title?, body?}): Promise<Note>`, `remove(id): Promise<void>`. Types: `NoteSummary{id,title,updatedAt?}` (maps `updated_at`), `Note{id, examId, title, body, createdAt, updatedAt}` (maps snake_case).

> Note: the backend returns snake_case (`exam_id`, `updated_at`). For v1 keep it simple and expose the **raw** server fields on the returned objects (`exam_id`, `updated_at`) rather than remapping — the consuming components will read those exact names. Define the TS types with the snake_case fields the server sends. This avoids a remap layer (DRY).

- [ ] **Step 1: Write the failing test**

Create `apps/web-student/src/lib/userNotes-api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { userNotes } from "./userNotes-api";
import { auth } from "./api";

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(auth, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("userNotes api", () => {
  it("list() GETs the exam-scoped collection", async () => {
    const spy = mockFetch(200, [{ id: "n1", title: "A", updated_at: "t" }]);
    const out = await userNotes.list("exam-1");
    expect(spy.mock.calls[0][0]).toContain("/content/notes?exam_id=exam-1");
    expect(out[0].id).toBe("n1");
  });

  it("create() POSTs exam_id + title", async () => {
    const spy = mockFetch(201, { id: "n2", exam_id: "exam-1", title: "T", body: {},
      created_at: "c", updated_at: "u" });
    const out = await userNotes.create("exam-1", "T");
    const [, init] = spy.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ exam_id: "exam-1", title: "T" });
    expect(out.id).toBe("n2");
  });

  it("update() PUTs title/body", async () => {
    const spy = mockFetch(200, { id: "n2", exam_id: "e", title: "R", body: { type: "doc" },
      created_at: "c", updated_at: "u" });
    await userNotes.update("n2", { title: "R", body: { type: "doc" } });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain("/content/notes/n2");
    expect(init?.method).toBe("PUT");
  });

  it("remove() DELETEs and tolerates 204", async () => {
    const spy = vi.spyOn(auth, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    await expect(userNotes.remove("n2")).resolves.toBeUndefined();
    expect(spy.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("throws on non-ok", async () => {
    mockFetch(500, { detail: "boom" });
    await expect(userNotes.list("e")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-student && npx vitest run src/lib/userNotes-api.test.ts`
Expected: FAIL — cannot resolve `./userNotes-api`.

- [ ] **Step 3: Write the client**

Create `apps/web-student/src/lib/userNotes-api.ts`:

```ts
// Per-exam student notebook client. Mirrors lib/notes-api.ts conventions.
import { auth } from "./api";
import { env } from "./env";

export interface NoteSummary {
  id: string;
  title: string;
  updated_at: string;
}

export interface Note {
  id: string;
  exam_id: string;
  title: string;
  body: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const base = `${env.apiBaseUrl}/content/notes`;

async function ok<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const b = await res.json();
      if (b?.detail?.message) msg = b.detail.message;
      else if (typeof b?.detail === "string") msg = b.detail;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const userNotes = {
  async list(examId: string): Promise<NoteSummary[]> {
    return ok<NoteSummary[]>(
      await auth.fetch(`${base}?exam_id=${encodeURIComponent(examId)}`),
    );
  },
  async create(examId: string, title?: string): Promise<Note> {
    return ok<Note>(
      await auth.fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(title ? { exam_id: examId, title } : { exam_id: examId }),
      }),
    );
  },
  async get(id: string): Promise<Note> {
    return ok<Note>(await auth.fetch(`${base}/${encodeURIComponent(id)}`));
  },
  async update(
    id: string,
    patch: { title?: string; body?: Record<string, unknown> },
  ): Promise<Note> {
    return ok<Note>(
      await auth.fetch(`${base}/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }),
    );
  },
  async remove(id: string): Promise<void> {
    const res = await auth.fetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web-student && npx vitest run src/lib/userNotes-api.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web-student/src/lib/userNotes-api.ts apps/web-student/src/lib/userNotes-api.test.ts
git commit -m "feat(web-student): userNotes api client"
```

---

### Task 5: Frontend — `noteImages.ts` (presign upload + sign)

**Files:**
- Create: `apps/web-student/src/lib/noteImages.ts`
- Test: `apps/web-student/src/lib/noteImages.test.ts`

**Interfaces:**
- Consumes: `lib/api.ts` `auth`, `lib/env.ts` `env`. Presign/PUT pattern mirrors `components/UploadField.tsx`.
- Produces: `uploadNoteImage(file: File): Promise<string>` (returns `objectKey`); `signObjectKey(objectKey: string): Promise<string>` (returns a signed GET URL). Throws `Error` with a readable message on failure or oversize.

- [ ] **Step 1: Write the failing test**

Create `apps/web-student/src/lib/noteImages.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { signObjectKey, uploadNoteImage } from "./noteImages";
import { auth } from "./api";

afterEach(() => vi.restoreAllMocks());

function jsonRes(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}

describe("noteImages", () => {
  it("uploadNoteImage presigns then PUTs and returns object_key", async () => {
    const authSpy = vi.spyOn(auth, "fetch").mockResolvedValue(
      jsonRes(200, {
        url: "http://minio/put", object_key: "note-images/u/abc.png",
        max_bytes: 25 * 1024 * 1024, method: "PUT", content_type: "image/png",
        upload_claim: "claim",
      }),
    );
    const putSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    const file = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    const key = await uploadNoteImage(file);

    expect(key).toBe("note-images/u/abc.png");
    expect(String(authSpy.mock.calls[0][0])).toContain("/uploads/presign");
    expect(JSON.parse(String(authSpy.mock.calls[0][1]?.body))).toMatchObject({
      kind: "note-image", content_type: "image/png",
    });
    expect(putSpy).toHaveBeenCalledWith("http://minio/put", expect.objectContaining({ method: "PUT" }));
  });

  it("uploadNoteImage rejects oversize before PUT", async () => {
    vi.spyOn(auth, "fetch").mockResolvedValue(
      jsonRes(200, { url: "u", object_key: "k", max_bytes: 2, method: "PUT",
        content_type: "image/png", upload_claim: "c" }),
    );
    const putSpy = vi.spyOn(globalThis, "fetch");
    const big = new File([new Uint8Array([1, 2, 3, 4, 5])], "b.png", { type: "image/png" });
    await expect(uploadNoteImage(big)).rejects.toThrow();
    expect(putSpy).not.toHaveBeenCalled();
  });

  it("signObjectKey returns the signed url", async () => {
    const spy = vi.spyOn(auth, "fetch").mockResolvedValue(
      jsonRes(200, { url: "http://minio/get?sig=1", expires_at: "t" }),
    );
    const url = await signObjectKey("note-images/u/abc.png");
    expect(url).toBe("http://minio/get?sig=1");
    expect(String(spy.mock.calls[0][0])).toContain("/uploads/sign?key=note-images%2Fu%2Fabc.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-student && npx vitest run src/lib/noteImages.test.ts`
Expected: FAIL — cannot resolve `./noteImages`.

- [ ] **Step 3: Write the helper**

Create `apps/web-student/src/lib/noteImages.ts`:

```ts
// Pasted-image upload for notes — reuses the platform presign → MinIO → sign flow.
import { auth } from "./api";
import { env } from "./env";

interface PresignResponse {
  url: string;
  object_key: string;
  max_bytes: number;
  method: string;
  content_type: string;
  upload_claim: string;
}

/** Presign a note-image, PUT the bytes to MinIO, return the stable object key. */
export async function uploadNoteImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be pasted into a note.");
  }
  const presignRes = await auth.fetch(`${env.apiBaseUrl}/uploads/presign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "note-image", content_type: file.type }),
  });
  if (!presignRes.ok) throw new Error(`Couldn't prepare upload (HTTP ${presignRes.status})`);
  const presign = (await presignRes.json()) as PresignResponse;

  if (file.size > presign.max_bytes) {
    throw new Error(
      `Image is too large (max ${Math.round(presign.max_bytes / (1024 * 1024))} MB).`,
    );
  }

  const put = await fetch(presign.url, {
    method: "PUT",
    headers: { "Content-Type": presign.content_type },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status})`);
  return presign.object_key;
}

/** Mint a short-lived signed GET URL for a stored note-image object key. */
export async function signObjectKey(objectKey: string): Promise<string> {
  const res = await auth.fetch(
    `${env.apiBaseUrl}/uploads/sign?key=${encodeURIComponent(objectKey)}`,
  );
  if (!res.ok) throw new Error(`Couldn't load image (HTTP ${res.status})`);
  return ((await res.json()) as { url: string }).url;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web-student && npx vitest run src/lib/noteImages.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web-student/src/lib/noteImages.ts apps/web-student/src/lib/noteImages.test.ts
git commit -m "feat(web-student): note image upload + sign helpers"
```

---

### Task 6: Frontend — `noteDoc.ts` pure document helpers

**Files:**
- Create: `apps/web-student/src/lib/noteDoc.ts`
- Test: `apps/web-student/src/lib/noteDoc.test.ts`

**Interfaces:**
- Produces:
  - `EMPTY_DOC: ProseMirrorDoc` — `{ type: "doc", content: [{ type: "paragraph" }] }`.
  - `stripTransientSrc(doc): ProseMirrorDoc` — returns a deep copy where every `image` node's `attrs.src` is removed (keeping `attrs.objectKey`). Used before persisting so signed URLs never get saved.
  - `collectObjectKeys(doc): string[]` — all `image` node `attrs.objectKey` values (deduped, in document order). Used to resolve signed URLs on load.
  - Type `ProseMirrorDoc = { type: string; attrs?: Record<string, unknown>; content?: ProseMirrorDoc[]; [k: string]: unknown }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web-student/src/lib/noteDoc.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EMPTY_DOC, collectObjectKeys, stripTransientSrc } from "./noteDoc";

const doc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "hi" }] },
    { type: "image", attrs: { objectKey: "note-images/u/a.png", src: "http://signed/a" } },
    { type: "image", attrs: { objectKey: "note-images/u/b.png", src: "http://signed/b" } },
    { type: "image", attrs: { objectKey: "note-images/u/a.png", src: "http://signed/a2" } },
  ],
};

describe("noteDoc", () => {
  it("EMPTY_DOC is a single empty paragraph", () => {
    expect(EMPTY_DOC).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("stripTransientSrc removes src but keeps objectKey, without mutating input", () => {
    const out = stripTransientSrc(doc);
    const imgs = out.content!.filter((n) => n.type === "image");
    expect(imgs.every((n) => n.attrs!.src === undefined)).toBe(true);
    expect(imgs[0].attrs!.objectKey).toBe("note-images/u/a.png");
    // input untouched
    expect((doc.content[1] as { attrs: { src?: string } }).attrs.src).toBe("http://signed/a");
  });

  it("collectObjectKeys dedupes in document order", () => {
    expect(collectObjectKeys(doc)).toEqual(["note-images/u/a.png", "note-images/u/b.png"]);
  });

  it("handles docs without content", () => {
    expect(collectObjectKeys({ type: "doc" })).toEqual([]);
    expect(stripTransientSrc({ type: "doc" })).toEqual({ type: "doc" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-student && npx vitest run src/lib/noteDoc.test.ts`
Expected: FAIL — cannot resolve `./noteDoc`.

- [ ] **Step 3: Write the helpers**

Create `apps/web-student/src/lib/noteDoc.ts`:

```ts
// Pure helpers over the ProseMirror JSON we persist for a note.
export interface ProseMirrorDoc {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorDoc[];
  [k: string]: unknown;
}

export const EMPTY_DOC: ProseMirrorDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/** Deep-copy `doc`, dropping every image node's transient `src` (keeping objectKey). */
export function stripTransientSrc(doc: ProseMirrorDoc): ProseMirrorDoc {
  const walk = (node: ProseMirrorDoc): ProseMirrorDoc => {
    const next: ProseMirrorDoc = { ...node };
    if (node.attrs) {
      next.attrs = { ...node.attrs };
      if (node.type === "image" && "src" in next.attrs) delete next.attrs.src;
    }
    if (node.content) next.content = node.content.map(walk);
    return next;
  };
  return walk(doc);
}

/** All image objectKeys in document order, deduped. */
export function collectObjectKeys(doc: ProseMirrorDoc): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (node: ProseMirrorDoc): void => {
    if (node.type === "image") {
      const key = node.attrs?.objectKey;
      if (typeof key === "string" && !seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web-student && npx vitest run src/lib/noteDoc.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web-student/src/lib/noteDoc.ts apps/web-student/src/lib/noteDoc.test.ts
git commit -m "feat(web-student): pure note-document helpers"
```

---

### Task 7: Frontend — `NoteEditor.tsx` (TipTap)

**Files:**
- Modify: `apps/web-student/package.json` (add TipTap deps)
- Create: `apps/web-student/src/components/notes/NoteEditor.tsx`
- Create: `apps/web-student/src/components/notes/NoteImage.ts` (custom node extension)

**Interfaces:**
- Consumes: `lib/noteDoc.ts` (`EMPTY_DOC`, `stripTransientSrc`, `collectObjectKeys`, `ProseMirrorDoc`), `lib/noteImages.ts` (`uploadNoteImage`, `signObjectKey`).
- Produces: `<NoteEditor value={ProseMirrorDoc | null} onChange={(doc: ProseMirrorDoc) => void} />`. `onChange` receives the **persist-ready** doc (transient `src` stripped). Pasting an image uploads it and inserts an image node carrying `objectKey`; images render via signed URLs resolved on load.

- [ ] **Step 1: Add the TipTap dependencies**

Run (installs and updates package.json + lockfile):
```bash
cd apps/web-student && npm install @tiptap/react@^2 @tiptap/starter-kit@^2 @tiptap/extension-image@^2 @tiptap/extension-link@^2
```
Expected: the four packages appear under `dependencies` in `apps/web-student/package.json`.

> If the repo pins a specific TipTap major already used elsewhere, match that major instead of `^2`. Verify the install succeeded by checking `node_modules/@tiptap/react` exists.

- [ ] **Step 2: Write the custom image node**

Create `apps/web-student/src/components/notes/NoteImage.ts`:

```ts
// Image node that persists a stable `objectKey` (not the signed src).
import Image from "@tiptap/extension-image";

export const NoteImage = Image.extend({
  name: "image",
  addAttributes() {
    return {
      ...this.parent?.(),
      objectKey: {
        default: null,
        // objectKey is persisted in the node JSON; src is transient (resolved at runtime).
        renderHTML: (attrs) => (attrs.objectKey ? { "data-object-key": attrs.objectKey } : {}),
        parseHTML: (el) => el.getAttribute("data-object-key"),
      },
    };
  },
});
```

- [ ] **Step 3: Write the editor**

Create `apps/web-student/src/components/notes/NoteEditor.tsx`:

```tsx
// Rich-text note editor (TipTap). Persists ProseMirror JSON with image objectKeys;
// resolves objectKeys → signed URLs on load. Writing surface uses the serif display font.
import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { NoteImage } from "./NoteImage";
import {
  EMPTY_DOC,
  collectObjectKeys,
  stripTransientSrc,
  type ProseMirrorDoc,
} from "../../lib/noteDoc";
import { signObjectKey, uploadNoteImage } from "../../lib/noteImages";

interface Props {
  value: ProseMirrorDoc | null;
  onChange: (doc: ProseMirrorDoc) => void;
}

export function NoteEditor({ value, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      NoteImage,
    ],
    content: value ?? EMPTY_DOC,
    onUpdate: ({ editor }) => {
      onChangeRef.current(stripTransientSrc(editor.getJSON() as ProseMirrorDoc));
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        const image = files.find((f) => f.type.startsWith("image/"));
        if (!image) return false;
        event.preventDefault();
        void (async () => {
          try {
            const objectKey = await uploadNoteImage(image);
            const src = await signObjectKey(objectKey);
            editor?.chain().focus().setImage({ src, objectKey } as never).run();
          } catch {
            /* surfaced by the panel-level toast; leave the note intact */
          }
        })();
        return true;
      },
    },
  });

  // Resolve image objectKeys → signed URLs whenever the loaded note changes.
  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(value ?? EMPTY_DOC, false);
    const keys = collectObjectKeys((value ?? EMPTY_DOC) as ProseMirrorDoc);
    if (keys.length === 0) return;
    let cancelled = false;
    void (async () => {
      const map = new Map<string, string>();
      await Promise.all(
        keys.map(async (k) => {
          try {
            map.set(k, await signObjectKey(k));
          } catch {
            /* leave unresolved */
          }
        }),
      );
      if (cancelled) return;
      const { state, view } = editor;
      const tr = state.tr;
      state.doc.descendants((node, pos) => {
        if (node.type.name === "image") {
          const key = node.attrs.objectKey as string | null;
          const url = key ? map.get(key) : undefined;
          if (url) tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url });
        }
      });
      if (tr.docChanged) view.dispatch(tr);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="note-editor">
      <div className="note-editor__toolbar">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</button>
      </div>
      <EditorContent editor={editor} className="note-editor__canvas" />
    </div>
  );
}
```

Add CSS (append to `apps/web-student/src/index.css` or the app's global stylesheet — match where existing component styles live):

```css
.note-editor__canvas .ProseMirror {
  font-family: var(--font-display);
  font-size: 17px;
  line-height: 1.7;
  min-height: 320px;
  outline: none;
}
.note-editor__canvas .ProseMirror img { max-width: 100%; border-radius: 8px; }
.note-editor__toolbar { display: flex; gap: 6px; margin-bottom: 8px; }
.note-editor__toolbar button { font-size: 13px; padding: 2px 8px; cursor: pointer; }
```

- [ ] **Step 4: Verify type-check + smoke render**

Run: `cd apps/web-student && npx tsc --noEmit`
Expected: clean.

Add a minimal smoke test `apps/web-student/src/components/notes/NoteEditor.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteEditor } from "./NoteEditor";

vi.mock("../../lib/noteImages", () => ({
  uploadNoteImage: vi.fn(),
  signObjectKey: vi.fn(async () => "http://signed"),
}));

describe("NoteEditor", () => {
  it("renders the formatting toolbar", () => {
    render(<NoteEditor value={null} onChange={() => {}} />);
    expect(screen.getByText("H2")).toBeInTheDocument();
    expect(screen.getByText("• List")).toBeInTheDocument();
  });
});
```

Run: `cd apps/web-student && npx vitest run src/components/notes/NoteEditor.test.tsx`
Expected: PASS. (If TipTap's `useEditor` fails to mount under jsdom, keep the test but assert the component renders without throwing; do NOT add jsdom polyfills beyond what the repo already configures — note the limitation in your report instead.)

- [ ] **Step 5: Commit**

```bash
git add apps/web-student/package.json apps/web-student/package-lock.json \
        apps/web-student/src/components/notes/NoteImage.ts \
        apps/web-student/src/components/notes/NoteEditor.tsx \
        apps/web-student/src/components/notes/NoteEditor.test.tsx \
        apps/web-student/src/index.css
git commit -m "feat(web-student): TipTap note editor with object-key images"
```

---

### Task 8: Frontend — `NoteList.tsx` + `NotesPanel.tsx` (autosave)

**Files:**
- Create: `apps/web-student/src/components/notes/NoteList.tsx`
- Create: `apps/web-student/src/components/notes/NotesPanel.tsx`
- Test: `apps/web-student/src/components/notes/NotesPanel.test.tsx`

**Interfaces:**
- Consumes: `lib/userNotes-api.ts` (`userNotes`, `NoteSummary`, `Note`), `components/notes/NoteEditor.tsx`, `lib/noteDoc.ts` (`ProseMirrorDoc`).
- Produces:
  - `<NoteList notes={NoteSummary[]} activeId={string|null} onSelect onCreate onRename onDelete />`.
  - `<NotesPanel examId={string} />` — owns selection + autosave; debounces body/title saves (~1000ms) into a single `userNotes.update`; shows "Saving…/Saved ✓".

- [ ] **Step 1: Write the failing test**

Create `apps/web-student/src/components/notes/NotesPanel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesPanel } from "./NotesPanel";

vi.mock("./NoteEditor", () => ({
  NoteEditor: ({ onChange }: { onChange: (d: unknown) => void }) => (
    <button onClick={() => onChange({ type: "doc", content: [{ type: "paragraph" }] })}>
      edit-body
    </button>
  ),
}));

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../../lib/userNotes-api", () => ({ userNotes: api }));

beforeEach(() => {
  vi.useFakeTimers();
  api.list.mockResolvedValue([{ id: "n1", title: "First", updated_at: "t" }]);
  api.get.mockResolvedValue({ id: "n1", exam_id: "e1", title: "First", body: {},
    created_at: "c", updated_at: "t" });
  api.update.mockResolvedValue({ id: "n1", exam_id: "e1", title: "First", body: {},
    created_at: "c", updated_at: "t2" });
  api.create.mockResolvedValue({ id: "n2", exam_id: "e1", title: "Untitled note", body: {},
    created_at: "c", updated_at: "t" });
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("NotesPanel", () => {
  it("lists notes for the exam on mount", async () => {
    render(<NotesPanel examId="e1" />);
    await waitFor(() => expect(api.list).toHaveBeenCalledWith("e1"));
    expect(await screen.findByText("First")).toBeInTheDocument();
  });

  it("debounces body edits into a single update PUT", async () => {
    render(<NotesPanel examId="e1" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled()); // first note auto-opened
    fireEvent.click(screen.getByText("edit-body"));
    fireEvent.click(screen.getByText("edit-body"));
    fireEvent.click(screen.getByText("edit-body"));
    expect(api.update).not.toHaveBeenCalled(); // debounced
    await vi.advanceTimersByTimeAsync(1100);
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it("creates a new note", async () => {
    render(<NotesPanel examId="e1" />);
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /new note/i }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("e1"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-student && npx vitest run src/components/notes/NotesPanel.test.tsx`
Expected: FAIL — cannot resolve `./NotesPanel`.

- [ ] **Step 3: Write `NoteList.tsx`**

Create `apps/web-student/src/components/notes/NoteList.tsx`:

```tsx
import type { NoteSummary } from "../../lib/userNotes-api";

interface Props {
  notes: NoteSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function NoteList({ notes, activeId, onSelect, onCreate, onRename, onDelete }: Props) {
  return (
    <aside className="note-list">
      <button type="button" className="note-list__new" onClick={onCreate}>
        ＋ New note
      </button>
      <ul>
        {notes.map((n) => (
          <li
            key={n.id}
            className={n.id === activeId ? "note-list__item note-list__item--active" : "note-list__item"}
          >
            <button type="button" className="note-list__open" onClick={() => onSelect(n.id)}>
              {n.title || "Untitled note"}
            </button>
            <button
              type="button"
              className="note-list__rename"
              aria-label={`Rename ${n.title}`}
              onClick={() => {
                const next = window.prompt("Rename note", n.title);
                if (next && next.trim()) onRename(n.id, next.trim());
              }}
            >
              ✎
            </button>
            <button
              type="button"
              className="note-list__delete"
              aria-label={`Delete ${n.title}`}
              onClick={() => {
                if (window.confirm(`Delete "${n.title}"? This cannot be undone.`)) onDelete(n.id);
              }}
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 4: Write `NotesPanel.tsx`**

Create `apps/web-student/src/components/notes/NotesPanel.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { NoteList } from "./NoteList";
import { NoteEditor } from "./NoteEditor";
import { userNotes, type Note, type NoteSummary } from "../../lib/userNotes-api";
import type { ProseMirrorDoc } from "../../lib/noteDoc";

type SaveState = "idle" | "saving" | "saved" | "error";

export function NotesPanel({ examId }: { examId: string }) {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<Note | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshList = async () => setNotes(await userNotes.list(examId));

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await userNotes.list(examId);
      if (!alive) return;
      setNotes(list);
      if (list.length && !activeId) setActiveId(list[0].id);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  useEffect(() => {
    if (!activeId) {
      setActive(null);
      return;
    }
    let alive = true;
    (async () => {
      const n = await userNotes.get(activeId);
      if (alive) setActive(n);
    })();
    return () => {
      alive = false;
    };
  }, [activeId]);

  const scheduleSave = (patch: { title?: string; body?: ProseMirrorDoc }) => {
    if (!activeId) return;
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await userNotes.update(activeId, patch as { title?: string; body?: Record<string, unknown> });
        setSave("saved");
        void refreshList();
      } catch {
        setSave("error");
      }
    }, 1000);
  };

  const create = async () => {
    const n = await userNotes.create(examId);
    await refreshList();
    setActiveId(n.id);
  };
  const rename = async (id: string, title: string) => {
    await userNotes.update(id, { title });
    await refreshList();
    if (id === activeId) setActive((a) => (a ? { ...a, title } : a));
  };
  const remove = async (id: string) => {
    await userNotes.remove(id);
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    if (id === activeId) setActiveId(next[0]?.id ?? null);
  };

  return (
    <section className="notes-panel">
      <div className="notes-panel__head">
        <h2>My Notes</h2>
        <span className="notes-panel__status">
          {save === "saving" ? "Saving…" : save === "saved" ? "Saved ✓"
            : save === "error" ? "Couldn't save — retrying" : ""}
        </span>
      </div>
      <div className="notes-panel__body">
        <NoteList
          notes={notes}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={create}
          onRename={rename}
          onDelete={remove}
        />
        <div className="notes-panel__editor">
          {active ? (
            <NoteEditor
              value={(active.body as ProseMirrorDoc) ?? null}
              onChange={(doc) => scheduleSave({ body: doc })}
            />
          ) : (
            <p className="notes-panel__empty">Create a note to start writing.</p>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run tests + type-check**

Run: `cd apps/web-student && npx vitest run src/components/notes/NotesPanel.test.tsx && npx tsc --noEmit`
Expected: tests PASS (3); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web-student/src/components/notes/NoteList.tsx \
        apps/web-student/src/components/notes/NotesPanel.tsx \
        apps/web-student/src/components/notes/NotesPanel.test.tsx
git commit -m "feat(web-student): notes panel with rail + autosave"
```

---

### Task 9: Frontend — mount "My Notes" on Study Materials

**Files:**
- Modify: `apps/web-student/src/pages/ExamContent.tsx`

**Interfaces:**
- Consumes: `components/notes/NotesPanel.tsx`; `examId` from `useParams` (already destructured at the top of `ExamContent`).

- [ ] **Step 1: Add the import**

In `apps/web-student/src/pages/ExamContent.tsx`, with the other component imports (near `import { ContentCard } from "../components/content/ContentCard";`), add:

```tsx
import { NotesPanel } from "../components/notes/NotesPanel";
```

- [ ] **Step 2: Render the section**

`ExamContent` returns a page with content sections. Add the notebook as its own section near the end of the returned JSX (after the subject/topic content sections, before the page's closing wrapper). Render only when an exam is selected:

```tsx
      {examId ? <NotesPanel examId={examId} /> : null}
```

(Place it as a sibling of the existing `<section>` blocks so it inherits the page layout.)

- [ ] **Step 3: Type-check + full suite (no new failures)**

Run: `cd apps/web-student && npx tsc --noEmit && npx vitest run`
Expected: tsc clean; the new notes tests pass; no NEW failures versus the known pre-existing baseline (`App.test`, `error_patterns`, `goals`, `syllabus_coverage`, etc.). Compare failing-file set to baseline; nothing that passed before may now fail.

- [ ] **Step 4: Commit**

```bash
git add apps/web-student/src/pages/ExamContent.tsx
git commit -m "feat(web-student): mount My Notes on Study Materials page"
```

---

## Deployment (after all tasks pass review)

The running app serves a built bundle; the learning container applies content migrations on startup. Rebuild + recreate:

```bash
cd infrastructure/docker
docker compose build learning web-student
docker compose up -d learning web-student
```

Then hard-refresh `/exams/:examId/content`, confirm: a "My Notes" section with "＋ New note"; create a note, type rich text (bold/headings/lists render in the serif face), paste an image (uploads, then displays), reload (note + image persist), rename/delete work, and the Saving→Saved indicator updates.

> Verify the compose service names (`learning`, `web-student`) against `infrastructure/docker/docker-compose.yml` before running.

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| `content_schema.user_notes` table (JSONB body, owner+exam index) | T1 |
| Owner-scoped CRUD (GET list/create/get/put/delete), 404 non-owned | T2 |
| Caps: 100/exam → 409, title ≤200 → 422, body ≤256KB → 422 | T2 |
| `note-image` presign kind, `note-images/{user_id}/…`, image-only | T3 |
| `note-images` branch in finalize + sign owner-maps | T3 |
| Notes CRUD client | T4 |
| Image upload (presign→PUT) + sign helpers | T5 |
| Persist objectKey only; strip transient src; collect keys | T6 (helpers), T7 (applied) |
| TipTap WYSIWYG (bold/italic/headings/lists/quote/link) + paste image | T7 |
| Serif writing font (`--font-display`) | T7 (CSS) |
| Per-exam notebook: rail + multiple named notes (create/rename/delete) | T8 |
| Debounced autosave + Saving/Saved indicator | T8 |
| Mount "My Notes" on ExamContent | T9 |
| Tests backend (CRUD/ownership/caps/presign) + frontend (clients/helpers/panel) | T2,T3,T4,T5,T6,T8 |
| Private only; moderation deferred | (no task needed — nothing built) |

All spec sections map to a task. No gaps.

**2. Placeholder scan:** No TBD/TODO/"handle errors" placeholders; every code step has complete code. The two soft "verify the import path / match the TipTap major" notes are explicit verification instructions grounded in named files, not deferred work.

**3. Type consistency:** `userNotes` method names (`list/create/get/update/remove`) and types (`NoteSummary{id,title,updated_at}`, `Note{id,exam_id,title,body,created_at,updated_at}`) are identical in T4 (definition), T8 (consumer), and the T8 test mock. `ProseMirrorDoc`, `EMPTY_DOC`, `stripTransientSrc`, `collectObjectKeys` names match across T6→T7. `uploadNoteImage`/`signObjectKey` match T5→T7. `NoteEditor` props (`value`, `onChange`) match T7→T8. Backend `objectKey` field is server snake_case `object_key`; the editor uses the camelCase node attr `objectKey` (distinct layers — intentional, the image node's attr name is independent of the upload API's JSON field).

**Out of scope (per spec):** sharing/visibility, cross-exam/global notebook, collaboration/history/offline, markdown import-export, reusing `user_topic_notes`, tables/embeds, image moderation. None planned.
