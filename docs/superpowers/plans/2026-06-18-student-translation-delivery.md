# Student Translation Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a student selects a question/content language, the questions they answer and review render in that language (per-field English fallback), by bridging PUBLISHED translations from the learning service into the quiz service and substituting at delivery.

**Architecture:** Learning emits a new NATS event `content.translation.published` (sibling of the existing question bridge) carrying the translated text. Quiz consumes it into a new `quiz_schema.question_translations` table and substitutes via a `GetQuestion(id, language)` LEFT JOIN. The student's **content language** is a new parameter (separate from app-UI language): stored on the identity profile, sent by the client at `POST /quiz/sessions/start`, and held on the quiz session row.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy / Alembic / pytest (learning, identity); Go / pgx / NATS JetStream / golang-migrate (quiz); React+Vite+TS (web-student); Flutter (mobile).

## Global Constraints

- **Two independent language parameters.** App UI language = `language_pref` (en/hi/hinglish, existing). Content language = `content_language` (en/hi/ta/te/bn/mr, NEW). Never couple them.
- Content-language allow-list is the **static** set `{en, hi, ta, te, bn, mr}` in v1 (mirrors the registry; widen when a 7th language ships). `hinglish` is NEVER a content language → coerces to `en`.
- Per-field English fallback: each of stem/choices/explanation/payload independently `COALESCE`s the translation over the canonical English; never a broken half-language field.
- Event emit is **best-effort**: a NATS publish failure must never propagate or fail the approve/commit (the DB row is durable truth) — mirror the existing `publish_question_published` swallow-and-log.
- Migration heads at plan start: identity `profile` = **013** (next: 014); quiz = **016** (next: 017, 018); learning content = 043 (no new learning migration needed).
- Run backend learning/identity tests: `cd services/<svc> && uv run pytest <path> -v`. Run quiz Go tests: `cd services/quiz && go test ./<pkg>/... ` (DB/NATS-backed tests `t.Skipf` when infra is absent — they require the local stack).
- Quiz delivery substitution lives in ONE place: `Store.GetQuestion(ctx, id, language)`. All call sites pass `session.ContentLanguage`.
- Frontend: a SECOND "Question language" control, visually + functionally separate from the existing App Language control; changing one never mutates the other.

---

## File Structure

**Learning (modify/create):**
- `services/learning/src/learning/content/events.py` — add `SUBJECT_TRANSLATION_PUBLISHED` + `publish_translation_published()`.
- `services/learning/src/learning/localisation/translation_events.py` (new) — build the event payload from a PUBLISHED translation row (reads payload_translation, derives stem/choices/explanation/payload via type handler).
- `services/learning/src/learning/content/translation_routes.py` — emit after approve in `review_translation`; add backfill route.
- `services/learning/src/learning/localisation/review_queue.py` — emit after each approve in `bulk_decide`.
- Tests under `services/learning/tests/localisation/`.

**Identity (modify/create):**
- `services/identity/alembic/profile/versions/014_content_language.py` (new) — add column.
- `services/identity/src/identity/profile/schemas.py`, `routes.py`, `repositories.py` — accept/persist/return `contentLanguage`.
- Test in `services/identity/tests/profile/`.

**Quiz (modify/create):**
- `services/quiz/migrations/017_question_translations.{up,down}.sql` (new).
- `services/quiz/migrations/018_session_content_language.{up,down}.sql` (new).
- `services/quiz/internal/events/content_subscriber.go` — add `TranslationPublished` struct + consumer branch.
- `services/quiz/internal/store/store.go` — `GetQuestion(ctx,id,language)` + translation JOIN; Session `ContentLanguage`; GetSession + CreateSession.
- `services/quiz/internal/domain/domain.go` — `Session.ContentLanguage`.
- `services/quiz/internal/server/sessions.go` — `startRequest.Language`; thread language to all `GetQuestion` call sites.
- Tests under `services/quiz/internal/{events,store,server}/`.

**Frontend (modify):**
- `apps/web-student/src/pages/Settings.tsx` + its API client + practice-start call.
- `apps/mobile/lib/screens/preferences_screen.dart` + practice-start call.

---

## Task 1: Learning — `content.translation.published` event + emit on approve

**Files:**
- Modify: `services/learning/src/learning/content/events.py`
- Create: `services/learning/src/learning/localisation/translation_events.py`
- Modify: `services/learning/src/learning/content/translation_routes.py` (emit in `review_translation`)
- Modify: `services/learning/src/learning/localisation/review_queue.py` (emit in `bulk_decide`)
- Test: `services/learning/tests/localisation/test_translation_events.py`

**Interfaces:**
- Produces:
  - `events.SUBJECT_TRANSLATION_PUBLISHED = "content.translation.published"`
  - `async def events.publish_translation_published(payload: dict) -> None` (best-effort)
  - `async def translation_events.build_translation_event(session, *, question_id, language) -> dict | None` → `{question_id, language, stem, choices, explanation, payload, version}` or None if no PUBLISHED row.
  - `async def translation_events.emit_translation_published(session, *, question_id, language) -> None` (builds + publishes; best-effort)

- [ ] **Step 1: Write the failing test**

```python
# services/learning/tests/localisation/test_translation_events.py
import pytest
from sqlalchemy import text

from learning.content import events
from learning.localisation import translation_events


class _FakeJS:
    def __init__(self): self.calls = []
    async def publish(self, subject, data):
        import json
        self.calls.append((subject, json.loads(data.decode())))


async def _seed_published_translation(session, qid):
    await session.execute(text("""
        INSERT INTO content_schema.questions
          (id, topic_id, stem, choices, correct_idx, language, status, created_by, question_type,
           payload)
        VALUES (:id,:id,'EN stem','["a","b"]'::jsonb,0,'en','PUBLISHED',:id,'MCQ_SINGLE',
           '{"stem":"EN stem","options":[{"id":"A","text":"a"},{"id":"B","text":"b"}],"correct_id":"A"}'::jsonb)
        ON CONFLICT (id) DO NOTHING
    """), {"id": qid})
    await session.execute(text("""
        INSERT INTO content_schema.content_artifact_translations
          (artifact_id, language, payload_translation, status, ai_confidence, version)
        VALUES (:id,'hi',
          '{"stem":"HI stem","options":[{"id":"A","text":"क"},{"id":"B","text":"ख"}],"explanation":"व्याख्या"}'::jsonb,
          'PUBLISHED', 0.9, 3)
        ON CONFLICT (artifact_id, language) DO UPDATE
          SET status='PUBLISHED', payload_translation=EXCLUDED.payload_translation, version=3
    """), {"id": qid})


@pytest.mark.asyncio
async def test_build_event_extracts_translated_fields(content_session):
    qid = "00000000-0000-0000-0000-0000000e0001"
    await _seed_published_translation(content_session, qid)
    await content_session.commit()
    ev = await translation_events.build_translation_event(content_session, question_id=qid, language="hi")
    assert ev["question_id"] == qid
    assert ev["language"] == "hi"
    assert ev["stem"] == "HI stem"
    assert ev["choices"] == ["क", "ख"]          # derived from options[*].text
    assert ev["explanation"] == "व्याख्या"
    assert ev["version"] == 3
    assert ev["payload"]["stem"] == "HI stem"     # full translated payload passed through


@pytest.mark.asyncio
async def test_emit_publishes_best_effort(content_session, monkeypatch):
    qid = "00000000-0000-0000-0000-0000000e0002"
    await _seed_published_translation(content_session, qid)
    await content_session.commit()
    fake = _FakeJS()
    monkeypatch.setattr(events, "_js", fake)
    await translation_events.emit_translation_published(content_session, question_id=qid, language="hi")
    assert len(fake.calls) == 1
    subject, payload = fake.calls[0]
    assert subject == events.SUBJECT_TRANSLATION_PUBLISHED
    assert payload["stem"] == "HI stem"


@pytest.mark.asyncio
async def test_emit_swallows_publish_errors(content_session, monkeypatch):
    qid = "00000000-0000-0000-0000-0000000e0003"
    await _seed_published_translation(content_session, qid)
    await content_session.commit()
    class _Flaky:
        async def publish(self, *a, **k): raise RuntimeError("nats down")
    monkeypatch.setattr(events, "_js", _Flaky())
    # must not raise
    await translation_events.emit_translation_published(content_session, question_id=qid, language="hi")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && uv run pytest tests/localisation/test_translation_events.py -v`
Expected: FAIL — `ModuleNotFoundError: learning.localisation.translation_events`.

- [ ] **Step 3a: Add the subject + publisher to `events.py`**

After the existing `SUBJECT_QUESTION_PUBLISHED` constant (near line 35), add:

```python
SUBJECT_TRANSLATION_PUBLISHED = "content.translation.published"
```

After `publish_question_published` (near line 141), add a sibling:

```python
async def publish_translation_published(payload: dict[str, Any]) -> None:
    """Emit content.translation.published. Best-effort: a publish failure is
    logged but not propagated — the DB row is the durable truth."""
    if _js is None:
        log.debug("content noop publish: js not connected")
        return
    try:
        await _js.publish(
            SUBJECT_TRANSLATION_PUBLISHED, json.dumps(payload).encode("utf-8")
        )
        log.info(
            "content published translation %s/%s",
            payload.get("question_id"), payload.get("language"),
        )
    except Exception as err:  # noqa: BLE001
        log.warning(
            "content translation publish failed for %s/%s: %s",
            payload.get("question_id"), payload.get("language"), err,
        )
```

- [ ] **Step 3b: Create `translation_events.py`**

```python
# services/learning/src/learning/localisation/translation_events.py
"""Build + emit content.translation.published from a PUBLISHED translation row.

The quiz service consumes this to mirror translated text into its own DB. We
extract stem/choices/explanation here (learning owns the type handlers) so the
Go consumer stays type-agnostic."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content import events
from learning.types import get_handler, is_supported

CONTENT_SCHEMA = "content_schema"


def _choices_from_payload(payload: dict[str, Any]) -> list[str] | None:
    opts = payload.get("options")
    if isinstance(opts, list) and all(isinstance(o, dict) for o in opts):
        return [str(o.get("text", "")) for o in opts]
    return None


async def build_translation_event(
    session: AsyncSession, *, question_id: str, language: str,
) -> dict[str, Any] | None:
    rows = (await session.execute(text(f"""
        SELECT t.payload_translation, t.version, q.question_type
          FROM {CONTENT_SCHEMA}.content_artifact_translations t
          JOIN {CONTENT_SCHEMA}.questions q ON q.id = t.artifact_id
         WHERE t.artifact_id = :aid AND t.language = :lang AND t.status = 'PUBLISHED'
    """), {"aid": question_id, "lang": language})).mappings().all()
    if not rows:
        return None
    r = rows[0]
    payload = r["payload_translation"] or {}
    # type handler is available for future per-type extraction; choices come
    # from options[*].text which all MCQ-family types share.
    type_id = r["question_type"] or "MCQ_SINGLE"
    _ = get_handler(type_id) if is_supported(type_id) else None
    return {
        "question_id": str(question_id),
        "language": language,
        "stem": payload.get("stem"),
        "choices": _choices_from_payload(payload),
        "explanation": payload.get("explanation"),
        "payload": payload,
        "version": int(r["version"]),
    }


async def emit_translation_published(
    session: AsyncSession, *, question_id: str, language: str,
) -> None:
    """Build + publish. Best-effort: never raises."""
    try:
        ev = await build_translation_event(session, question_id=question_id, language=language)
        if ev is not None:
            await events.publish_translation_published(ev)
    except Exception:  # noqa: BLE001
        # Emission must never break the approve/commit path.
        pass
```

- [ ] **Step 3c: Emit after approve in `review_translation`**

In `translation_routes.py`, import at top-level:

```python
from learning.localisation.translation_events import emit_translation_published
```

In `review_translation`, after `await session.commit()` and before the return, add (only on approve):

```python
    if body.action == "approve":
        await emit_translation_published(session, question_id=question_id, language=lang)
```

- [ ] **Step 3d: Emit after approve in `bulk_decide`**

In `review_queue.py`, import:

```python
from learning.localisation.translation_events import emit_translation_published
```

In `bulk_decide`, inside the loop, after a successful approve (the `results.append({... "ok": True})` for approve), emit. Restructure the approve branch:

```python
            if action == "approve":
                await approve_translation(session, artifact_id=qid, target_lang=lang, reviewer_id=reviewer_id)
                await emit_translation_published(session, question_id=qid, language=lang)
            elif action == "reject":
```

(The caller commits after `bulk_decide`; emitting reads the just-updated row within the same session/transaction — the PUBLISHED status is visible to the SELECT via autoflush. This is acceptable: the event reflects intended state; if the outer commit later fails, the worst case is a quiz row mirroring a translation that didn't persist — recoverable via the next publish/backfill. Note this in the report.)

- [ ] **Step 4: Run tests**

Run: `cd services/learning && uv run pytest tests/localisation/test_translation_events.py -v`
Expected: PASS (3 tests). Then regression: `uv run pytest tests/localisation tests/content -k "translation or review" -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/content/events.py services/learning/src/learning/localisation/translation_events.py services/learning/src/learning/content/translation_routes.py services/learning/src/learning/localisation/review_queue.py services/learning/tests/localisation/test_translation_events.py
git commit -m "feat(learning): emit content.translation.published on translation approve"
```

---

## Task 2: Learning — one-time backfill route

**Files:**
- Modify: `services/learning/src/learning/content/translation_routes.py` (add backfill route)
- Test: `services/learning/tests/localisation/test_translation_backfill.py`

**Interfaces:**
- Consumes: `emit_translation_published` (Task 1).
- Produces: `POST /localisation/translations/backfill` (admin-guarded) → `{emitted: int}`; emits an event for every PUBLISHED translation.

- [ ] **Step 1: Write the failing test**

```python
# services/learning/tests/localisation/test_translation_backfill.py
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from learning.content import events
from learning.content.db import sessionmaker as content_sessionmaker
from learning.main import app


class _FakeJS:
    def __init__(self): self.calls = []
    async def publish(self, subject, data):
        import json
        self.calls.append((subject, json.loads(data.decode())))


@pytest.mark.asyncio
async def test_backfill_emits_for_published(admin_headers, monkeypatch):
    qid = "00000000-0000-0000-0000-0000000f0001"
    async with content_sessionmaker()() as s:
        await s.execute(text("""
            INSERT INTO content_schema.questions
              (id, topic_id, stem, choices, correct_idx, language, status, created_by, question_type)
            VALUES (:id,:id,'S','["a"]'::jsonb,0,'en','PUBLISHED',:id,'MCQ_SINGLE')
            ON CONFLICT (id) DO NOTHING
        """), {"id": qid})
        await s.execute(text("""
            INSERT INTO content_schema.content_artifact_translations
              (artifact_id, language, payload_translation, status, version)
            VALUES (:id,'hi','{"stem":"HI"}'::jsonb,'PUBLISHED',1)
            ON CONFLICT (artifact_id, language) DO UPDATE SET status='PUBLISHED'
        """), {"id": qid})
        await s.commit()
    fake = _FakeJS()
    monkeypatch.setattr(events, "_js", fake)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/localisation/translations/backfill", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["emitted"] >= 1
    assert any(p["question_id"] == qid and p["language"] == "hi" for _, p in fake.calls)


@pytest.mark.asyncio
async def test_backfill_requires_admin():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post("/localisation/translations/backfill")
    assert r.status_code in (401, 403)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && uv run pytest tests/localisation/test_translation_backfill.py -v`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Add the backfill route**

In `translation_routes.py`, add (the `_content_session` dep + `require_admin` already exist in the codebase — import `require_admin` from `learning.localisation.auth`):

```python
from learning.localisation.auth import require_admin


@router.post("/localisation/translations/backfill", dependencies=[Depends(require_admin)])
async def backfill_translations(
    session: AsyncSession = Depends(_content_session),
) -> dict[str, int]:
    """One-time: emit content.translation.published for every PUBLISHED
    translation so the quiz mirror is seeded. Idempotent (quiz upserts)."""
    rows = (await session.execute(text(f"""
        SELECT artifact_id::text AS qid, language
          FROM {CONTENT_SCHEMA}.content_artifact_translations
         WHERE status = 'PUBLISHED'
    """))).mappings().all()
    emitted = 0
    for r in rows:
        await emit_translation_published(session, question_id=r["qid"], language=r["language"])
        emitted += 1
    return {"emitted": emitted}
```

- [ ] **Step 4: Run tests**

Run: `cd services/learning && uv run pytest tests/localisation/test_translation_backfill.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/content/translation_routes.py services/learning/tests/localisation/test_translation_backfill.py
git commit -m "feat(learning): one-time translation backfill emit route"
```

---

## Task 3: Identity — `content_language` profile parameter

**Files:**
- Create: `services/identity/alembic/profile/versions/014_content_language.py`
- Modify: `services/identity/src/identity/profile/schemas.py`, `repositories.py`, `routes.py`
- Test: `services/identity/tests/profile/test_content_language.py`

**Interfaces:**
- Produces: profile column `content_language` (default 'en', CHECK en/hi/ta/te/bn/mr); `PreferencesPatch.contentLanguage`; `Preferences.contentLanguage`; `ProfileRepo.patch_preferences(..., content_language=...)`.

- [ ] **Step 1: Write the failing test**

```python
# services/identity/tests/profile/test_content_language.py
# Mirror the existing tests/profile/test_profile_routes.py fixtures (_auth_header / _access_token + clean_db).
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_content_language_is_independent_of_app_language(client: AsyncClient, clean_db):
    uid = "00000000-0000-0000-0000-0000000c0a01"
    # set app language hi + content language ta in one call
    r = await client.patch("/profile/preferences", headers=_auth_header(uid),
                           json={"language": "hi", "contentLanguage": "ta", "dailyGoalMinutes": 30})
    assert r.status_code == 200
    prefs = r.json()["preferences"]
    assert prefs["language"] == "hi"
    assert prefs["contentLanguage"] == "ta"
    # change ONLY content language; app language must stay hi
    r2 = await client.patch("/profile/preferences", headers=_auth_header(uid),
                            json={"contentLanguage": "en"})
    p2 = r2.json()["preferences"]
    assert p2["contentLanguage"] == "en"
    assert p2["language"] == "hi"


@pytest.mark.asyncio
async def test_invalid_content_language_rejected(client: AsyncClient, clean_db):
    uid = "00000000-0000-0000-0000-0000000c0a02"
    r = await client.patch("/profile/preferences", headers=_auth_header(uid),
                           json={"contentLanguage": "hinglish"})  # not a content language
    assert r.status_code == 422
```

> Copy `_auth_header`, `_access_token`, the `client` fixture and `clean_db` from `tests/profile/test_profile_routes.py` into this module (or a shared conftest) so the fixtures resolve.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/identity && uv run pytest tests/profile/test_content_language.py -v`
Expected: FAIL — `contentLanguage` unknown field / column missing.

- [ ] **Step 3a: Migration 014**

```python
# services/identity/alembic/profile/versions/014_content_language.py
"""Add content_language (question/content language, distinct from app language_pref).

Revision ID: 014
Revises: 013
Create Date: 2026-06-18
"""
from __future__ import annotations
from collections.abc import Sequence
from alembic import op

revision: str = "014"
down_revision: str | None = "013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.profiles "
        "ADD COLUMN IF NOT EXISTS content_language TEXT NOT NULL DEFAULT 'en' "
        "CONSTRAINT chk_content_language CHECK (content_language IN ('en','hi','ta','te','bn','mr'))"
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE {SCHEMA}.profiles DROP COLUMN IF EXISTS content_language")
```

> Confirm 013 is the head first: the explore reported `013 diagnostic_state.py` as head. If a newer head exists, set `down_revision` to it.

- [ ] **Step 3b: Schemas**

In `schemas.py`, add a content-language literal and extend the models:

```python
ContentLanguage = Literal["en", "hi", "ta", "te", "bn", "mr"]


class Preferences(BaseModel):
    language: Language = "en"
    contentLanguage: ContentLanguage = "en"
    dailyGoalMinutes: int | None = None


class PreferencesPatch(BaseModel):
    language: Language | None = None
    contentLanguage: ContentLanguage | None = None
    dailyGoalMinutes: int | None = Field(default=None, ge=5, le=240)
```

- [ ] **Step 3c: Repository write**

In `repositories.py` `patch_preferences`, add the param + COALESCE column:

```python
    async def patch_preferences(
        self, *, user_id, language=None, content_language=None, daily_goal_minutes=None,
    ) -> dict[str, Any]:
        await self.s.execute(
            text(
                "UPDATE profile_schema.profiles SET "
                "language_pref = COALESCE(:lang, language_pref), "
                "content_language = COALESCE(:clang, content_language), "
                "daily_goal_minutes = COALESCE(:goal, daily_goal_minutes), "
                "updated_at = NOW() "
                "WHERE user_id = :uid"
            ),
            {"uid": str(user_id), "lang": language, "clang": content_language,
             "goal": daily_goal_minutes},
        )
        # ... (keep the existing onboarding-FSM block unchanged) ...
```

Also ensure the read path that builds `Preferences` selects `content_language` and maps it to `contentLanguage` (find where `by_user_id` / `_build_profile` reads `language_pref` and add `content_language` alongside, defaulting to 'en').

- [ ] **Step 3d: Route**

In `routes.py` `patch_preferences`, pass the new field:

```python
    await profiles.patch_preferences(
        user_id=principal.user_id,
        language=body.language,
        content_language=body.contentLanguage,
        daily_goal_minutes=body.dailyGoalMinutes,
    )
```

- [ ] **Step 4: Apply migration + run tests**

Apply the profile migration to the identity test DB (same mechanism identity tests already use; if manual: `docker exec alp-local-identity-1 sh -c "cd /repo/services/identity && alembic -c alembic_profile.ini upgrade head"` against the test DB URL).
Run: `cd services/identity && uv run pytest tests/profile/test_content_language.py tests/profile/test_profile_routes.py -v`
Expected: PASS (new tests + no regression).

- [ ] **Step 5: Commit**

```bash
git add services/identity/alembic/profile/versions/014_content_language.py services/identity/src/identity/profile/schemas.py services/identity/src/identity/profile/repositories.py services/identity/src/identity/profile/routes.py services/identity/tests/profile/test_content_language.py
git commit -m "feat(identity): content_language profile preference (independent of app language)"
```

---

## Task 4: Quiz — `question_translations` table + consumer

**Files:**
- Create: `services/quiz/migrations/017_question_translations.up.sql`, `017_question_translations.down.sql`
- Modify: `services/quiz/internal/events/content_subscriber.go`
- Test: `services/quiz/internal/events/translation_subscriber_test.go`

**Interfaces:**
- Produces: table `quiz_schema.question_translations(question_id, language, stem, choices, explanation, payload, version, updated_at)` PK `(question_id, language)`; a consumer on `content.translation.published` (durable `quiz-content-translation-published`) that upserts it; event struct `TranslationPublished`.

- [ ] **Step 1: Write the failing test**

```go
// services/quiz/internal/events/translation_subscriber_test.go
package events

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go/jetstream"
)

func TestContentSubscriber_MirrorsPublishedTranslation(t *testing.T) {
	_, pool, js, cleanup := startSubscriber(t) // reuse helper from content_subscriber_test.go
	defer cleanup()

	qid := uuid.New().String()
	defer func() {
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM quiz_schema.question_translations WHERE question_id=$1`, qid)
	}()

	ev := TranslationPublished{
		QuestionID:  qid,
		Language:    "hi",
		Stem:        strPtr("HI stem"),
		Choices:     []string{"क", "ख"},
		Explanation: strPtr("व्याख्या"),
		Version:     3,
	}
	buf, _ := json.Marshal(ev)
	if _, err := js.Publish(context.Background(), SubjectContentTranslationPublished, buf); err != nil {
		t.Fatalf("publish: %v", err)
	}

	// poll question_translations for the row
	var stem string
	ok := false
	for i := 0; i < 50; i++ {
		err := pool.QueryRow(context.Background(),
			`SELECT stem FROM quiz_schema.question_translations WHERE question_id=$1 AND language='hi'`, qid).Scan(&stem)
		if err == nil { ok = true; break }
		waitMs(100)
	}
	if !ok || stem != "HI stem" {
		t.Fatalf("translation row not mirrored (ok=%v stem=%q)", ok, stem)
	}
}

func strPtr(s string) *string { return &s }
```

> `startSubscriber`, `waitMs`/poll helper, `quizDBURL`, `natsURL` already exist in `content_subscriber_test.go`. If `waitMs` doesn't exist, use `time.Sleep(100*time.Millisecond)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/quiz && go test ./internal/events/... -run MirrorsPublishedTranslation -v`
Expected: FAIL to compile — `SubjectContentTranslationPublished` / `TranslationPublished` undefined. (If infra absent it `t.Skipf`s; ensure the local stack is up so it actually runs.)

- [ ] **Step 3a: Migration 017**

```sql
-- services/quiz/migrations/017_question_translations.up.sql
CREATE TABLE IF NOT EXISTS quiz_schema.question_translations (
    question_id  UUID  NOT NULL,
    language     TEXT  NOT NULL,
    stem         TEXT,
    choices      JSONB,
    explanation  TEXT,
    payload      JSONB,
    version      INTEGER NOT NULL DEFAULT 1,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (question_id, language)
);
```
```sql
-- services/quiz/migrations/017_question_translations.down.sql
DROP TABLE IF EXISTS quiz_schema.question_translations;
```

- [ ] **Step 3b: Add the event struct + subject + consumer branch**

In `content_subscriber.go`, add the subject constant near `SubjectContentQuestionPublished`:

```go
const SubjectContentTranslationPublished = "content.translation.published"
```

Add the event struct near `QuestionPublished`:

```go
type TranslationPublished struct {
	QuestionID  string          `json:"question_id"`
	Language    string          `json:"language"`
	Stem        *string         `json:"stem,omitempty"`
	Choices     []string        `json:"choices,omitempty"`
	Explanation *string         `json:"explanation,omitempty"`
	Payload     json.RawMessage `json:"payload,omitempty"`
	Version     int             `json:"version"`
}
```

In `StartContentSubscriber`, after the existing question consumer is bound, bind a second durable consumer on the same stream filtered to the translation subject (durable `"quiz-content-translation-published"`), with its own `Consume` handler `s.handleTranslation`. Mirror the existing consumer-binding block exactly, changing only the durable name, `FilterSubject`, and handler.

Add the handler:

```go
func (s *ContentSubscriber) handleTranslation(msg jetstream.Msg) {
	var ev TranslationPublished
	if err := json.Unmarshal(msg.Data(), &ev); err != nil {
		s.logger.Error("translation.unmarshal", "err", err)
		_ = msg.Ack() // poison message: drop
		return
	}
	if ev.QuestionID == "" || ev.Language == "" {
		_ = msg.Ack()
		return
	}
	var choicesJSON []byte
	if ev.Choices != nil {
		choicesJSON, _ = json.Marshal(ev.Choices)
	}
	var payloadArg any
	if len(ev.Payload) > 0 {
		payloadArg = []byte(ev.Payload)
	}
	ctx := context.Background()
	_, err := s.pool.Exec(ctx, `
		INSERT INTO quiz_schema.question_translations
		  (question_id, language, stem, choices, explanation, payload, version, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7, now())
		ON CONFLICT (question_id, language) DO UPDATE SET
		  stem = EXCLUDED.stem,
		  choices = EXCLUDED.choices,
		  explanation = EXCLUDED.explanation,
		  payload = EXCLUDED.payload,
		  version = EXCLUDED.version,
		  updated_at = now()
		WHERE EXCLUDED.version >= quiz_schema.question_translations.version
	`, ev.QuestionID, ev.Language, ev.Stem, choicesJSON, ev.Explanation, payloadArg, ev.Version)
	if err != nil {
		s.logger.Error("translation.upsert", "err", err, "qid", ev.QuestionID)
		_ = msg.Nak()
		return
	}
	_ = msg.Ack()
}
```

> Match the exact JetStream binding API the existing question consumer uses (`CreateOrUpdateConsumer` + `Consume`). The `WHERE EXCLUDED.version >= ...version` guard makes older replays no-ops (newer version wins).

- [ ] **Step 3c: Apply migration**

The quiz service runs migrations via golang-migrate at container start. For the test DB, apply: `docker exec alp-local-quiz-1 sh -c "cd /repo/services/quiz && QUIZ_DATABASE_URL=$QUIZ_DATABASE_URL go run ./cmd/migrate up"` — OR restart the quiz container (entrypoint runs `cmd/migrate up`). Confirm the table exists in the `quiz` DB.

- [ ] **Step 4: Run test**

Run: `cd services/quiz && go test ./internal/events/... -run MirrorsPublishedTranslation -v`
Expected: PASS (with local stack up).

- [ ] **Step 5: Commit**

```bash
git add services/quiz/migrations/017_question_translations.up.sql services/quiz/migrations/017_question_translations.down.sql services/quiz/internal/events/content_subscriber.go services/quiz/internal/events/translation_subscriber_test.go
git commit -m "feat(quiz): consume content.translation.published into question_translations"
```

---

## Task 5: Quiz — session content_language capture

**Files:**
- Create: `services/quiz/migrations/018_session_content_language.up.sql`, `.down.sql`
- Modify: `services/quiz/internal/domain/domain.go` (Session.ContentLanguage)
- Modify: `services/quiz/internal/store/store.go` (CreateSession INSERT, GetSession SELECT/Scan)
- Modify: `services/quiz/internal/server/sessions.go` (startRequest.Language + validate + pass to create)
- Test: `services/quiz/internal/server/sessions_lang_pg_test.go`

**Interfaces:**
- Produces: `quiz_sessions.content_language` column; `Session.ContentLanguage string`; `startRequest.Language string`; validated content language stored on the session (unknown/`hinglish`/absent → `en`).

- [ ] **Step 1: Write the failing test**

```go
// services/quiz/internal/server/sessions_lang_pg_test.go
package server

import (
	"fmt"
	"testing"

	"github.com/google/uuid"
)

func TestPG_SessionStoresContentLanguage(t *testing.T) {
	f := newPGFixture(t, stubFlags{irtEnabled: false})
	if f == nil { return }
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q,"mode":"PRACTICE","language":"hi"}`,
		mechanicsTopicID, uuid.New().String()))
	started := startSession(t, f.srv, body)
	t.Cleanup(func() { f.cleanupSession(t, started.SessionID) })

	sid := uuid.MustParse(started.SessionID)
	sess, err := f.st.GetSession(t.Context(), sid)
	if err != nil { t.Fatalf("GetSession: %v", err) }
	if sess.ContentLanguage != "hi" {
		t.Fatalf("want content_language=hi, got %q", sess.ContentLanguage)
	}
}

func TestPG_SessionCoercesUnknownLanguageToEn(t *testing.T) {
	f := newPGFixture(t, stubFlags{irtEnabled: false})
	if f == nil { return }
	body := []byte(fmt.Sprintf(`{"topicId":%q,"userId":%q,"mode":"PRACTICE","language":"hinglish"}`,
		mechanicsTopicID, uuid.New().String()))
	started := startSession(t, f.srv, body)
	t.Cleanup(func() { f.cleanupSession(t, started.SessionID) })
	sess, _ := f.st.GetSession(t.Context(), uuid.MustParse(started.SessionID))
	if sess.ContentLanguage != "en" {
		t.Fatalf("want coerced en, got %q", sess.ContentLanguage)
	}
}
```

> `newPGFixture`, `startSession`, `cleanupSession`, `mechanicsTopicID` exist in `sessions_pg_test.go`. If `t.Context()` isn't available on the Go version, use `context.Background()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/quiz && go test ./internal/server/... -run ContentLanguage -v`
Expected: FAIL — `sess.ContentLanguage` undefined / column missing.

- [ ] **Step 3a: Migration 018**

```sql
-- services/quiz/migrations/018_session_content_language.up.sql
ALTER TABLE quiz_schema.quiz_sessions
  ADD COLUMN IF NOT EXISTS content_language TEXT NOT NULL DEFAULT 'en';
```
```sql
-- services/quiz/migrations/018_session_content_language.down.sql
ALTER TABLE quiz_schema.quiz_sessions DROP COLUMN IF EXISTS content_language;
```

- [ ] **Step 3b: Domain + store**

In `domain.go` `Session` struct, add:
```go
	ContentLanguage string
```

In `store.go` `CreateSession` INSERT, add `content_language` as a new column + parameter `$18` bound to `sess.ContentLanguage`. In `GetSession`, add `content_language` to the SELECT and `&sess.ContentLanguage` to the Scan (append at the end of both).

Add a content-language allow-list helper in the server package:
```go
// sessions.go (near startRequest)
var contentLanguages = map[string]bool{"en": true, "hi": true, "ta": true, "te": true, "bn": true, "mr": true}

func normalizeContentLanguage(s string) string {
	if contentLanguages[s] { return s }
	return "en"
}
```

- [ ] **Step 3c: Start handler captures language**

In `sessions.go`, add to `startRequest`:
```go
	Language string `json:"language,omitempty"`
```
In `Start()`, after decoding the request and building `sess`, set:
```go
	sess.ContentLanguage = normalizeContentLanguage(req.Language)
```
(before the CreateSession call). Ensure `CreateSession` persists it.

- [ ] **Step 4: Apply migration + run tests**

Apply quiz migration 018 (restart quiz container or run `cmd/migrate up`). Then:
Run: `cd services/quiz && go test ./internal/server/... -run ContentLanguage -v`
Expected: PASS. Regression: `go test ./internal/server/... -run RoundTrip -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add services/quiz/migrations/018_session_content_language.up.sql services/quiz/migrations/018_session_content_language.down.sql services/quiz/internal/domain/domain.go services/quiz/internal/store/store.go services/quiz/internal/server/sessions.go services/quiz/internal/server/sessions_lang_pg_test.go
git commit -m "feat(quiz): capture content_language on session start"
```

---

## Task 6: Quiz — `GetQuestion(language)` + delivery substitution

**Files:**
- Modify: `services/quiz/internal/store/store.go` (`GetQuestion` signature + JOIN)
- Modify: `services/quiz/internal/server/sessions.go` (thread `sess.ContentLanguage` to all `GetQuestion` calls)
- Test: `services/quiz/internal/store/store_translation_pg_test.go`

**Interfaces:**
- Consumes: `question_translations` (Task 4), `Session.ContentLanguage` (Task 5).
- Produces: `GetQuestion(ctx, id, language)` overlaying translated stem/choices/explanation/payload per-field; English for `en`/unknown.

- [ ] **Step 1: Write the failing test**

```go
// services/quiz/internal/store/store_translation_pg_test.go
package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestPG_GetQuestion_OverlaysTranslation(t *testing.T) {
	st, pool := newStoreFixture(t) // mirror existing store test fixture; t.Skipf if no DB
	if st == nil { return }
	ctx := context.Background()
	qid := uuid.New()
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM quiz_schema.question_translations WHERE question_id=$1`, qid)
		_, _ = pool.Exec(ctx, `DELETE FROM quiz_schema.questions WHERE id=$1`, qid)
	}()
	_, err := pool.Exec(ctx, `
		INSERT INTO quiz_schema.questions (id, topic_id, stem, choices, correct_idx, difficulty_b, language, status)
		VALUES ($1,$1,'EN stem','["a","b"]'::jsonb,0,0.0,'en','PUBLISHED')`, qid)
	if err != nil { t.Fatal(err) }
	_, err = pool.Exec(ctx, `
		INSERT INTO quiz_schema.question_translations (question_id, language, stem, choices, version)
		VALUES ($1,'hi','HI stem','["क","ख"]'::jsonb,1)`, qid)
	if err != nil { t.Fatal(err) }

	// hi → translated
	q, err := st.GetQuestion(ctx, qid, "hi")
	if err != nil { t.Fatal(err) }
	if q.Stem != "HI stem" || q.Choices[0] != "क" {
		t.Fatalf("want translated, got stem=%q choices=%v", q.Stem, q.Choices)
	}
	// en → canonical English
	qen, _ := st.GetQuestion(ctx, qid, "en")
	if qen.Stem != "EN stem" {
		t.Fatalf("want EN stem, got %q", qen.Stem)
	}
	// unknown lang → English fallback
	qx, _ := st.GetQuestion(ctx, qid, "zz")
	if qx.Stem != "EN stem" {
		t.Fatalf("want EN fallback, got %q", qx.Stem)
	}
}
```

> If there is no existing standalone store-test fixture, create `newStoreFixture(t)` here mirroring the pool/skip pattern from `sessions_pg_test.go` (`os.Getenv("QUIZ_DATABASE_URL")`, `store.New(pool)`, `t.Skipf` when absent).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/quiz && go test ./internal/store/... -run OverlaysTranslation -v`
Expected: FAIL to compile — `GetQuestion` takes 2 args, not 3.

- [ ] **Step 3a: Change `GetQuestion`**

Replace the `GetQuestion` body (store.go ~870) with a language-aware JOIN:

```go
func (s *Store) GetQuestion(ctx context.Context, id uuid.UUID, language string) (domain.Question, error) {
	var q domain.Question
	var choicesJSON []byte
	err := s.pool.QueryRow(ctx, `
		SELECT q.id, q.topic_id,
		       COALESCE(t.stem, q.stem) AS stem,
		       COALESCE(t.choices, q.choices) AS choices,
		       q.correct_idx, q.difficulty_b, q.discrimination_a, q.guessing_c,
		       q.language, q.status,
		       COALESCE(t.explanation, q.explanation) AS explanation,
		       COALESCE(q.question_type, 'MCQ_SINGLE'),
		       COALESCE(t.payload, q.payload) AS payload
		FROM quiz_schema.questions q
		LEFT JOIN quiz_schema.question_translations t
		  ON t.question_id = q.id AND t.language = $2
		WHERE q.id = $1`, id, language,
	).Scan(&q.ID, &q.TopicID, &q.Stem, &choicesJSON, &q.CorrectIdx, &q.DifficultyB,
		&q.DiscriminationA, &q.GuessingC, &q.Language, &q.Status, &q.Explanation,
		&q.QuestionType, &q.Payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return q, ErrQuestionNotFound
	}
	if err != nil {
		return q, err
	}
	return q, json.Unmarshal(choicesJSON, &q.Choices)
}
```

For `language == "en"` or unknown, the LEFT JOIN simply matches no translation row → all `COALESCE`s fall to canonical English. No special-casing needed.

- [ ] **Step 3b: Thread language through every call site in sessions.go**

Update all six `svc.store.GetQuestion(...)` call sites to pass the session's content language:
- Line ~837 (`/next` pre-served): `svc.store.GetQuestion(r.Context(), it.QuestionID, sess.ContentLanguage)`
- Line ~874 (`/next` resume): `... current.QuestionID, sess.ContentLanguage)`
- Line ~980 (`/items` loop): `... it.QuestionID, sess.ContentLanguage)`
- Line ~1027 (`/answer`): `... item.QuestionID, sess.ContentLanguage)` (grading uses correct_idx; language is harmless here)
- Line ~1362 (`pickNextADP`): thread the session language into this internal helper — it already has the session in scope or receives it; pass `sess.ContentLanguage` (add a `language string` param to the helper if needed and pass it from the caller).
- Line ~1443 (`pickNextIRT`): same.

For the `/sessions/{id}` review handler (the `Get()` path that calls `GetQuestion` when hydrating answered items), pass `sess.ContentLanguage` there too.

> Grep to be exhaustive: `cd services/quiz && grep -rn "GetQuestion(" internal/` — every call must compile with the new 3-arg signature. Any non-session context (none expected) would pass `"en"`.

- [ ] **Step 4: Build + run tests**

Run: `cd services/quiz && go build ./... && go test ./internal/store/... -run OverlaysTranslation -v`
Expected: build clean, test PASS. Regression: `go test ./internal/server/... -run RoundTrip -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add services/quiz/internal/store/store.go services/quiz/internal/server/sessions.go services/quiz/internal/store/store_translation_pg_test.go
git commit -m "feat(quiz): substitute translated question text by session content language"
```

---

## Task 7: web-student — Question-language control + send at session start

**Files:**
- Modify: `apps/web-student/src/pages/Settings.tsx` (add second control)
- Modify: the web-student API client for preferences (add `contentLanguage`) and the quiz-session-start call (send `language`)
- Test: `apps/web-student/src/pages/__tests__/Settings.content-language.test.tsx` (if web-student has a vitest setup; otherwise a focused component test mirroring existing tests)

**Interfaces:**
- Consumes: identity preferences (`contentLanguage`, Task 3), quiz `POST /sessions/start` (`language`, Task 5).

- [ ] **Step 1: Read the existing Settings language control**

Read `apps/web-student/src/pages/Settings.tsx` around the existing App Language control (lines ~246-279) and the preferences API call (~line 177 posting `{ language, dailyGoalMinutes }`). Identify the exact patterns (control component, state, save handler).

- [ ] **Step 2: Write the failing test**

Mirror an existing web-student Settings test. Assert: rendering Settings shows TWO language controls ("App language" and "Question language"); changing "Question language" to Hindi calls the preferences API with `{ contentLanguage: "hi" }` and does NOT include a changed `language`. (If web-student lacks a test harness, add the smallest vitest test that mounts the control and asserts the API payload, mirroring how `web-admin` tests mock the api client.)

- [ ] **Step 3: Implement**

- Add a **second** select/segmented control labeled **"Question language"**, options en/hi/ta/te/bn/mr (English/हिन्दी/தமிழ்/తెలుగు/বাংলা/मराठी), bound to its own state seeded from `preferences.contentLanguage` (default `en`).
- Its save handler calls the preferences API with `{ contentLanguage }` only (independent of the App Language control's save).
- Extend the preferences API client type + call to carry `contentLanguage`.
- At **practice start** (where the app POSTs to the quiz `/sessions/start`), include `language: preferences.contentLanguage` in the body. Find the session-start call in web-student and add the field.

- [ ] **Step 4: Run tests + typecheck**

Run the web-student test + `npx tsc --noEmit` (from `apps/web-student`). Expected: pass + clean. Don't introduce new failures beyond any pre-existing ones (record the baseline first with a full test run).

- [ ] **Step 5: Commit**

```bash
git add apps/web-student/src/pages/Settings.tsx apps/web-student/src/lib/ apps/web-student/src/pages/__tests__/
git commit -m "feat(web-student): question-language control + send content language at session start"
```

---

## Task 8: mobile — Question-language control + send at session start

**Files:**
- Modify: `apps/mobile/lib/screens/preferences_screen.dart` (add second control)
- Modify: the mobile API call for preferences (add `contentLanguage`) + the quiz session-start call (send `language`)
- Test: mirror an existing mobile widget/client test if present

**Interfaces:**
- Consumes: identity preferences (`contentLanguage`), quiz `/sessions/start` (`language`).

- [ ] **Step 1: Read the existing controls**

Read `apps/mobile/lib/screens/preferences_screen.dart` (the existing App Language control, ~lines 27-59 posting `{ 'language': _selected }` to `/profile/preferences`) and the mobile quiz-session-start call (in the quiz client, e.g. `apps/mobile/lib/quiz/quiz_client.dart`).

- [ ] **Step 2: Write/adjust a test**

If the mobile app has widget tests for preferences, mirror one to assert a second "Question language" control exists and posts `{'contentLanguage': ...}` independently. If there's no test harness for this screen, add the smallest client-level test asserting the preferences payload includes `contentLanguage`, and note in the report that UI-widget coverage follows existing conventions.

- [ ] **Step 3: Implement**

- Add a **second** control "Question language" (options en/hi/ta/te/bn/mr) to `preferences_screen.dart`, mirroring the existing App Language control but bound to a separate `_contentLanguage` state and posting `{ 'contentLanguage': _contentLanguage }` to `/profile/preferences`. Do not touch the existing app-language control.
- At **practice/mock start** in the mobile quiz client, include `'language': <profile contentLanguage>` in the `/sessions/start` body.

- [ ] **Step 4: Run mobile tests**

Run the mobile test suite (`cd apps/mobile && flutter test`) — at least the touched areas. Expected: no new failures vs. the pre-existing baseline (capture baseline first).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/screens/preferences_screen.dart apps/mobile/lib/quiz/ apps/mobile/test/
git commit -m "feat(mobile): question-language control + send content language at session start"
```

---

## Final verification

- [ ] Backend pipeline end-to-end (API, mirrors the workbench smoke): with the local stack up, log in as admin, ensure a published Hindi translation exists, run `POST /localisation/translations/backfill`, confirm a row appears in `quiz_schema.question_translations`. Then start a practice session as a student with `language: "hi"` and confirm `GET /quiz/sessions/{id}/next` returns the Hindi stem; repeat with `en` and confirm English.
- [ ] `cd services/learning && uv run pytest tests/localisation -q` → green.
- [ ] `cd services/identity && uv run pytest tests/profile -q` → green.
- [ ] `cd services/quiz && go build ./... && go test ./internal/... ` → green (DB/NATS tests run with the stack up).
- [ ] Run the one-time backfill in each deployed environment after release (operational note).

## Spec coverage check

| Spec section | Task(s) |
|---|---|
| §1 Propagation (event + quiz table + consumer) | 1, 4 |
| §2 Content-language param & capture (identity field, settings, session) | 3, 5, 7, 8 |
| §3 Delivery substitution (GetQuestion + threading) | 6 |
| §4 Backfill | 2 |
| §5 Error handling (best-effort emit, version guard, coerce-to-en) | 1, 4, 5 |
| §6 Testing | every task |
| New API/schema surface | 1 (event), 3 (identity), 4–5 (quiz migrations), 6 (GetQuestion), 7–8 (frontend) |
