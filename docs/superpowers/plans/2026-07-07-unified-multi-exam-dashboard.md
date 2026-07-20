# Unified Multi-Exam Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the web-student `/home` into a genuinely multi-exam dashboard — a per-exam readiness carousel plus per-exam "attention" cards — backed by one consolidated engagement endpoint.

**Architecture:** A new engagement read endpoint `GET /analytics/multi-exam-summary/{user_id}?examIds=…` rolls up per-exam readiness, weakest topic, and mistakes/revision due-counts by filtering existing mastery/revision/mistakes data through each exam's topic set (`resolve_exam_topic_ids`). Two new presentational React components (`ReadinessCarousel`, `ExamAttentionCards`) consume it. `Home.tsx` swaps the single-exam hero + `QuickActions` for these, and drops the `MultiTrackBody` home fork.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy async (engagement service, `uv` workspace); React 18 + TypeScript + Vite + Vitest + @testing-library/react (web-student).

## Global Constraints

- No database migration — reuse existing `analytics_schema` tables.
- All new endpoints guarded by `require_owner` (owner or platform-admin; internal-token bypass preserved by the shared dep).
- Pure cores are pure functions tested with injected row lists; routes are thin adapters.
- Per-exam scoping uses `resolve_exam_topic_ids(exam_id) -> set[str] | None` (topic-set based; `None` = resolver failure → degrade, `set()` = exam with no topics).
- `readiness_from_mastery(rows: list[MasteryRow]) -> float` is the ONLY readiness formula — do not re-derive.
- `examIds` query param capped at 12 exams per request.
- Frontend calls go through `auth.fetch` (from `apps/web-student/src/lib/api.ts`); base path prefix is `/api/v1`.
- No `print` in service `src/`; use existing logging. `QuickActions` stays used on exam-scoped pages — only its `/home` usage is removed.
- Local: web-served via Docker (no vite hot-reload) — rebuild image + recreate container to see changes.

---

## File Structure

**Backend (engagement):**
- Create `services/engagement/src/engagement/analytics/multi_exam_summary.py` — pure roll-up core (weakest-topic pick + per-exam assembly from injected rows/counts).
- Modify `services/engagement/src/engagement/analytics/mistakes_repo.py` — add `topic_ids` filter to `count_due`.
- Modify `services/engagement/src/engagement/analytics/revision_queue_repo.py` — add `count_due(...)`.
- Modify `services/engagement/src/engagement/analytics/routes.py` — add the `/analytics/multi-exam-summary/{user_id}` route.
- Create `services/engagement/tests/analytics/test_multi_exam_summary.py` — pure-core + repo-count tests.
- Modify `services/engagement/tests/analytics/test_events_and_routes.py` (or a new `test_multi_exam_route.py`) — route + owner-guard test.

**Frontend (web-student):**
- Create `apps/web-student/src/lib/multiExam.ts` — types, `buildEnrolledExams` merge helper, `fetchMultiExamSummary`.
- Create `apps/web-student/src/lib/multiExam.test.ts` — merge-helper unit test.
- Create `apps/web-student/src/components/vidya/ReadinessCarousel.tsx` + `.test.tsx`.
- Create `apps/web-student/src/components/vidya/ExamAttentionCards.tsx` + `.test.tsx`.
- Modify `apps/web-student/src/pages/Home.tsx` — wire both components, remove `MultiTrackBody` home fork + hero + `QuickActions` usages.

---

## Task 1: Per-exam roll-up pure core (engagement)

**Files:**
- Create: `services/engagement/src/engagement/analytics/multi_exam_summary.py`
- Test: `services/engagement/tests/analytics/test_multi_exam_summary.py`

**Interfaces:**
- Consumes: `MasteryRow` from `engagement.analytics.mastery` (`user_id, topic_id, ewa, n`), `readiness_from_mastery(rows) -> float`.
- Produces:
  - `pick_weakest(rows: list[MasteryRow], *, min_n: int = 3) -> MasteryRow | None`
  - `ExamSummary` dataclass: `exam_id: str, readiness_score: float, n_topics: int, weakest_topic_id: str | None, weakest_ewa: float | None, mistakes_due: int, revision_due: int`
  - `build_exam_summary(*, exam_id, mastery_rows, mistakes_due, revision_due) -> ExamSummary`

- [ ] **Step 1: Write the failing test**

```python
# services/engagement/tests/analytics/test_multi_exam_summary.py
"""Pure roll-up core for the multi-exam dashboard summary."""
from __future__ import annotations

from engagement.analytics.mastery import MasteryRow
from engagement.analytics.multi_exam_summary import (
    ExamSummary,
    build_exam_summary,
    pick_weakest,
)


def _row(topic: str, ewa: float, n: int) -> MasteryRow:
    return MasteryRow(user_id="u1", topic_id=topic, ewa=ewa, n=n)


def test_pick_weakest_ignores_low_n() -> None:
    rows = [_row("a", 0.10, 2), _row("b", 0.40, 5), _row("c", 0.30, 3)]
    # 'a' has the lowest EWA but n<3, so 'c' wins.
    assert pick_weakest(rows).topic_id == "c"


def test_pick_weakest_none_when_all_low_n() -> None:
    assert pick_weakest([_row("a", 0.1, 1)]) is None


def test_build_exam_summary_rolls_up_all_fields() -> None:
    rows = [_row("a", 0.6, 4), _row("b", 0.2, 5)]
    s = build_exam_summary(
        exam_id="e1", mastery_rows=rows, mistakes_due=4, revision_due=2
    )
    assert isinstance(s, ExamSummary)
    assert s.exam_id == "e1"
    assert s.readiness_score == 0.4  # mean of 0.6, 0.2
    assert s.n_topics == 2
    assert s.weakest_topic_id == "b"
    assert s.weakest_ewa == 0.2
    assert s.mistakes_due == 4
    assert s.revision_due == 2


def test_build_exam_summary_empty_mastery() -> None:
    s = build_exam_summary(
        exam_id="e2", mastery_rows=[], mistakes_due=0, revision_due=0
    )
    assert s.readiness_score == 0.0
    assert s.n_topics == 0
    assert s.weakest_topic_id is None
    assert s.weakest_ewa is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/engagement && uv run pytest tests/analytics/test_multi_exam_summary.py -v`
Expected: FAIL with `ModuleNotFoundError: engagement.analytics.multi_exam_summary`

- [ ] **Step 3: Write minimal implementation**

```python
# services/engagement/src/engagement/analytics/multi_exam_summary.py
"""Pure roll-up core for the multi-exam dashboard summary.

Given a user's per-exam mastery rows plus the exam's due-counts, produce the
compact per-exam summary the web-student dashboard renders (readiness score,
weakest topic, mistakes/revision due). No I/O — the route layer fetches rows
and calls these functions so the math stays unit-testable with fakes.
"""
from __future__ import annotations

from dataclasses import dataclass

from engagement.analytics.mastery import MasteryRow, readiness_from_mastery


def pick_weakest(rows: list[MasteryRow], *, min_n: int = 3) -> MasteryRow | None:
    """Lowest-EWA topic with at least `min_n` observations (avoids tiny-n noise).

    Returns None when no row clears the min_n bar.
    """
    eligible = [r for r in rows if r.n >= min_n]
    if not eligible:
        return None
    return min(eligible, key=lambda r: r.ewa)


@dataclass(frozen=True)
class ExamSummary:
    exam_id: str
    readiness_score: float
    n_topics: int
    weakest_topic_id: str | None
    weakest_ewa: float | None
    mistakes_due: int
    revision_due: int


def build_exam_summary(
    *,
    exam_id: str,
    mastery_rows: list[MasteryRow],
    mistakes_due: int,
    revision_due: int,
) -> ExamSummary:
    weakest = pick_weakest(mastery_rows)
    return ExamSummary(
        exam_id=exam_id,
        readiness_score=readiness_from_mastery(mastery_rows),
        n_topics=len(mastery_rows),
        weakest_topic_id=weakest.topic_id if weakest else None,
        weakest_ewa=weakest.ewa if weakest else None,
        mistakes_due=mistakes_due,
        revision_due=revision_due,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/engagement && uv run pytest tests/analytics/test_multi_exam_summary.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add services/engagement/src/engagement/analytics/multi_exam_summary.py services/engagement/tests/analytics/test_multi_exam_summary.py
git commit -m "feat(engagement): per-exam summary roll-up pure core"
```

---

## Task 2: Topic-filtered due counts (engagement repos)

**Files:**
- Modify: `services/engagement/src/engagement/analytics/mistakes_repo.py` (`count_due`)
- Modify: `services/engagement/src/engagement/analytics/revision_queue_repo.py` (new `count_due`)
- Test: `services/engagement/tests/analytics/test_multi_exam_summary.py` (append DB-backed count tests)

**Interfaces:**
- Consumes: existing tables `analytics_schema.mistakes` (+ `mistake_review_state`), `analytics_schema.revision_queue`.
- Produces:
  - `mistakes_repo.count_due(session, user_id, *, now, topic_ids: set[str] | None = None) -> int`
  - `revision_queue_repo.count_due(session, user_id, *, now, topic_ids: set[str] | None = None) -> int`

Both: `topic_ids=None` → all topics (unchanged behavior for mistakes); a set → restrict to those topics; `set()` → zero.

- [ ] **Step 1: Write the failing test (append to test_multi_exam_summary.py)**

```python
# --- append to services/engagement/tests/analytics/test_multi_exam_summary.py ---
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from engagement.analytics import db, mistakes_repo, revision_queue_repo


@pytest.mark.asyncio
async def test_mistakes_count_due_respects_topic_set() -> None:
    uid = str(uuid4())
    t_in, t_out = str(uuid4()), str(uuid4())
    now = datetime.now(tz=UTC)
    async with db.sessionmaker()() as session:
        for tid in (t_in, t_out):
            mid = await mistakes_repo.upsert_mistake(
                session, user_id=uid, session_id=str(uuid4()), item_idx=0,
                topic_id=tid, question_id=str(uuid4()), error_tag="conceptual_gap",
                stem_snapshot="s", chosen_text="x", correct_text="y",
                explanation_snapshot="e",
            )
            await mistakes_repo.seed_review_state(
                session, mistake_id=mid, user_id=uid, now=now
            )
        await session.commit()
    async with db.sessionmaker()() as session:
        all_due = await mistakes_repo.count_due(session, uid, now=now)
        scoped = await mistakes_repo.count_due(session, uid, now=now, topic_ids={t_in})
        empty = await mistakes_repo.count_due(session, uid, now=now, topic_ids=set())
    assert all_due == 2
    assert scoped == 1
    assert empty == 0


@pytest.mark.asyncio
async def test_revision_count_due_respects_topic_set() -> None:
    uid = str(uuid4())
    t_in, t_out = str(uuid4()), str(uuid4())
    past = datetime(2020, 1, 1, tzinfo=UTC)
    now = datetime.now(tz=UTC)
    async with db.sessionmaker()() as session:
        for tid in (t_in, t_out):
            await revision_queue_repo.upsert(
                session, user_id=uid, topic_id=tid, last_attempt_at=past,
                due_at=past, interval_days=1, ease_factor=2.5, attempts=1,
            )
        await session.commit()
    async with db.sessionmaker()() as session:
        all_due = await revision_queue_repo.count_due(session, uid, now=now)
        scoped = await revision_queue_repo.count_due(session, uid, now=now, topic_ids={t_in})
    assert all_due == 2
    assert scoped == 1
```

> Before writing the test body, open `mistakes_repo.upsert_mistake`, `mistakes_repo.seed_review_state`, and `revision_queue_repo.upsert` and confirm the keyword argument names match the calls above; adjust the test call sites to the real signatures if they differ (do NOT change the repo signatures to fit the test).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/engagement && uv run pytest tests/analytics/test_multi_exam_summary.py -k count_due -v`
Expected: FAIL — `count_due() got an unexpected keyword argument 'topic_ids'` (mistakes) and `AttributeError: module 'engagement.analytics.revision_queue_repo' has no attribute 'count_due'`.

- [ ] **Step 3a: Implement mistakes_repo.count_due topic filter**

Replace the existing `count_due` in `services/engagement/src/engagement/analytics/mistakes_repo.py` with:

```python
async def count_due(
    session: AsyncSession,
    user_id: str,
    *,
    now: datetime,
    topic_ids: set[str] | None = None,
) -> int:
    """Count of due mistakes for the user; optionally restricted to `topic_ids`.

    When `topic_ids` is a set we JOIN the mistakes row to filter by its
    `topic_id`; `topic_ids=set()` yields 0 (no topics in scope).
    """
    if topic_ids is not None and not topic_ids:
        return 0
    params: dict[str, Any] = {"uid": user_id, "now": now}
    if topic_ids is None:
        sql = f"""
            SELECT COUNT(*) FROM {SCHEMA}.mistake_review_state
             WHERE user_id = :uid AND due_at <= :now
        """
    else:
        sql = f"""
            SELECT COUNT(*)
              FROM {SCHEMA}.mistake_review_state s
              JOIN {SCHEMA}.mistakes m ON m.id = s.mistake_id
             WHERE s.user_id = :uid AND s.due_at <= :now
               AND m.topic_id = ANY(CAST(:tids AS uuid[]))
        """
        params["tids"] = list(topic_ids)
    row = (await session.execute(text(sql), params)).first()
    return int(row[0]) if row else 0
```

- [ ] **Step 3b: Add revision_queue_repo.count_due**

Append to `services/engagement/src/engagement/analytics/revision_queue_repo.py`:

```python
async def count_due(
    session: AsyncSession,
    user_id: str,
    *,
    now: datetime,
    topic_ids: set[str] | None = None,
) -> int:
    """Count of revision-queue rows due (`due_at <= now`), optionally scoped
    to `topic_ids`. `topic_ids=set()` → 0."""
    if topic_ids is not None and not topic_ids:
        return 0
    sql = f"""
        SELECT COUNT(*) FROM {SCHEMA}.revision_queue
         WHERE user_id = :uid AND due_at <= :now
    """
    params: dict[str, Any] = {"uid": user_id, "now": now}
    if topic_ids is not None:
        sql += " AND topic_id = ANY(CAST(:tids AS uuid[]))"
        params["tids"] = list(topic_ids)
    row = (await session.execute(text(sql), params)).first()
    return int(row[0]) if row else 0
```

> Confirm `text`, `AsyncSession`, `Any`, and `SCHEMA` are already imported at the top of each file (they are used by the existing functions); if `Any` is missing in a file, add `from typing import Any`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/engagement && uv run pytest tests/analytics/test_multi_exam_summary.py -v`
Expected: PASS (all — pure core + both count tests). Note: the two DB tests require the local Postgres on `localhost:35432`.

- [ ] **Step 5: Commit**

```bash
git add services/engagement/src/engagement/analytics/mistakes_repo.py services/engagement/src/engagement/analytics/revision_queue_repo.py services/engagement/tests/analytics/test_multi_exam_summary.py
git commit -m "feat(engagement): topic-scoped due counts for mistakes + revision queue"
```

---

## Task 3: multi-exam-summary route (engagement)

**Files:**
- Modify: `services/engagement/src/engagement/analytics/routes.py`
- Test: `services/engagement/tests/analytics/test_multi_exam_route.py` (new)

**Interfaces:**
- Consumes: `resolve_exam_topic_ids`, `list_user_mastery`, `build_exam_summary`, `_mistakes_repo.count_due`, `_revision_repo.count_due`, `require_owner`.
- Produces: `GET /analytics/multi-exam-summary/{user_id}?examIds=a,b,c` →
  ```json
  {"userId":"…","exams":[{"examId":"…","readinessScore":0.53,"nTopics":42,
    "weakestTopicId":"…","weakestEwa":0.31,"mistakesDue":4,"revisionDue":2}]}
  ```

- [ ] **Step 1: Write the failing test**

```python
# services/engagement/tests/analytics/test_multi_exam_route.py
"""Route test for GET /analytics/multi-exam-summary/{user_id}."""
from __future__ import annotations

import base64
import json
from uuid import uuid4

import pytest


def _bearer(sub: str, role: str = "STUDENT") -> dict[str, str]:
    def _seg(obj: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")
    tok = f"{_seg({'alg':'HS256'})}.{_seg({'sub': sub, 'role': role})}.sig"
    return {"Authorization": f"Bearer {tok}"}


@pytest.mark.asyncio
async def test_owner_guard_blocks_other_user(client) -> None:
    victim, attacker = str(uuid4()), str(uuid4())
    r = await client.get(
        f"/analytics/multi-exam-summary/{victim}?examIds=e1",
        headers=_bearer(attacker),
    )
    assert r.status_code == 403
    anon = await client.get(f"/analytics/multi-exam-summary/{victim}?examIds=e1")
    assert anon.status_code == 401


@pytest.mark.asyncio
async def test_returns_one_entry_per_exam(client, monkeypatch) -> None:
    uid = str(uuid4())
    # Stub the catalog resolver so no learning service is needed: e1 -> {t1}, e2 -> empty.
    from engagement.analytics import routes as routes_mod

    async def _fake_resolve(exam_id, *, clock=None):
        return {"t1"} if exam_id == "e1" else set()

    monkeypatch.setattr(routes_mod, "resolve_exam_topic_ids", _fake_resolve)

    r = await client.get(
        f"/analytics/multi-exam-summary/{uid}?examIds=e1,e2",
        headers=_bearer(uid),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["userId"] == uid
    assert [e["examId"] for e in body["exams"]] == ["e1", "e2"]
    # Fresh user: zeroed but well-formed.
    e2 = next(e for e in body["exams"] if e["examId"] == "e2")
    assert e2["readinessScore"] == 0.0 and e2["nTopics"] == 0
    assert e2["mistakesDue"] == 0 and e2["revisionDue"] == 0
    assert e2["weakestTopicId"] is None
```

> The route imports `resolve_exam_topic_ids` by name at module top, so `monkeypatch.setattr(routes_mod, "resolve_exam_topic_ids", …)` correctly overrides the name the route calls.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/engagement && uv run pytest tests/analytics/test_multi_exam_route.py -v`
Expected: FAIL — 404 (route not registered) on both tests.

- [ ] **Step 3: Implement the route**

Add near the other `/analytics/...` routes in `services/engagement/src/engagement/analytics/routes.py` (place it after the `readiness` route, ~line 60). It relies on `_mistakes_repo` and `_revision_repo`, which are imported lower in the file (module-level, so available at call time):

```python
from datetime import UTC, datetime  # add to the top-of-file imports if not present


@router.get(
    "/analytics/multi-exam-summary/{user_id}",
    dependencies=[Depends(require_owner)],
)
async def multi_exam_summary(user_id: str, examIds: str = Query(default="")) -> dict:
    """Per-exam dashboard roll-up: readiness, weakest topic, and mistakes/
    revision due-counts for each of the student's enrolled exams.

    `examIds` is a comma-separated list (capped at 12). Unknown/empty exams
    return a zeroed entry so the UI renders an empty state rather than 404.
    """
    from engagement.analytics.multi_exam_summary import build_exam_summary

    ids = [e.strip() for e in examIds.split(",") if e.strip()][:12]
    now = datetime.now(tz=UTC)
    exams: list[dict] = []
    async with sessionmaker()() as session:
        for exam_id in ids:
            topic_ids = await resolve_exam_topic_ids(exam_id)
            # Resolver failure (None) → treat as no-scope: zeroed entry, don't crash.
            scoped = topic_ids if topic_ids is not None else set()
            mastery_rows = await list_user_mastery(
                session, user_id, topic_ids=scoped
            )
            mistakes_due = await _mistakes_repo.count_due(
                session, user_id, now=now, topic_ids=scoped
            )
            revision_due = await _revision_repo.count_due(
                session, user_id, now=now, topic_ids=scoped
            )
            s = build_exam_summary(
                exam_id=exam_id,
                mastery_rows=mastery_rows,
                mistakes_due=mistakes_due,
                revision_due=revision_due,
            )
            exams.append(
                {
                    "examId": s.exam_id,
                    "readinessScore": s.readiness_score,
                    "nTopics": s.n_topics,
                    "weakestTopicId": s.weakest_topic_id,
                    "weakestEwa": s.weakest_ewa,
                    "mistakesDue": s.mistakes_due,
                    "revisionDue": s.revision_due,
                }
            )
    return {"userId": user_id, "exams": exams}
```

> If `from datetime import UTC, datetime` is already imported at the top of routes.py, do not duplicate it. The `_mistakes_repo` / `_revision_repo` aliases are defined at lines ~2513 / ~385; because they are module-level imports they are bound by the time any request runs, so referencing them inside this handler is safe even though the `def` appears earlier in the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/engagement && uv run pytest tests/analytics/test_multi_exam_route.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Run the analytics suite to check no regression**

Run: `cd services/engagement && uv run pytest tests/analytics -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add services/engagement/src/engagement/analytics/routes.py services/engagement/tests/analytics/test_multi_exam_route.py
git commit -m "feat(engagement): GET /analytics/multi-exam-summary per-exam dashboard roll-up"
```

---

## Task 4: Frontend data layer (web-student)

**Files:**
- Create: `apps/web-student/src/lib/multiExam.ts`
- Test: `apps/web-student/src/lib/multiExam.test.ts`

**Interfaces:**
- Consumes: `auth.fetch` from `../lib/api`.
- Produces:
  - `interface EnrolledExam { examId: string; code: string; name: string; targetDate: string | null; }`
  - `interface ExamSummary { examId: string; readinessScore: number; nTopics: number; weakestTopicId: string | null; weakestEwa: number | null; mistakesDue: number; revisionDue: number; }`
  - `buildEnrolledExams(profileExams, catalog) -> EnrolledExam[]` — merges profile `[{examId,targetDate}]` with catalog `[{id,code,name}]`, degrading to `code=examId` when a catalog entry is missing (never drops an enrolled exam).
  - `fetchMultiExamSummary(userId, examIds) -> Promise<Record<string, ExamSummary>>` — GETs the endpoint, returns a map keyed by examId (empty map on failure).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web-student/src/lib/multiExam.test.ts
import { describe, expect, test } from "vitest";
import { buildEnrolledExams } from "./multiExam";

describe("buildEnrolledExams", () => {
  test("merges catalog code/name onto profile exams", () => {
    const out = buildEnrolledExams(
      [
        { examId: "e1", targetDate: "2027-05-01" },
        { examId: "e2", targetDate: null },
      ],
      [
        { id: "e1", code: "NEET", name: "NEET UG" },
        { id: "e2", code: "UPSC_CSE", name: "UPSC Civil Services" },
      ],
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      examId: "e1",
      code: "NEET",
      name: "NEET UG",
      targetDate: "2027-05-01",
    });
    expect(out[1].code).toBe("UPSC_CSE");
  });

  test("keeps enrolled exam even when catalog lookup is missing", () => {
    const out = buildEnrolledExams(
      [{ examId: "e9", targetDate: null }],
      [{ id: "e1", code: "NEET", name: "NEET UG" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].examId).toBe("e9");
    expect(out[0].code).toBe("e9"); // degrades to id, not dropped
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-student && npx vitest run src/lib/multiExam.test.ts`
Expected: FAIL — cannot resolve `./multiExam`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/web-student/src/lib/multiExam.ts
// Data layer for the unified multi-exam dashboard (readiness carousel +
// per-exam attention cards). Merges the student's enrolled exams with the
// engagement multi-exam-summary roll-up.
import { auth } from "./api";

export interface EnrolledExam {
  examId: string;
  code: string;
  name: string;
  targetDate: string | null;
}

export interface ExamSummary {
  examId: string;
  readinessScore: number;
  nTopics: number;
  weakestTopicId: string | null;
  weakestEwa: number | null;
  mistakesDue: number;
  revisionDue: number;
}

interface ProfileExam {
  examId: string;
  targetDate: string | null;
}
interface CatalogExam {
  id: string;
  code: string;
  name: string;
}

/** Merge profile-enrolled exams with catalog metadata. An enrolled exam with
 *  no catalog match still renders (code/name fall back to its id) so the
 *  dashboard never silently drops an exam the student is enrolled in. */
export function buildEnrolledExams(
  profileExams: ProfileExam[],
  catalog: CatalogExam[],
): EnrolledExam[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  return profileExams.map((pe) => {
    const meta = byId.get(pe.examId);
    return {
      examId: pe.examId,
      code: meta?.code ?? pe.examId,
      name: meta?.name ?? pe.examId,
      targetDate: pe.targetDate,
    };
  });
}

/** Fetch the per-exam roll-up and return it keyed by examId. Returns an empty
 *  map on any failure — callers render from the exam list alone. */
export async function fetchMultiExamSummary(
  userId: string,
  examIds: string[],
): Promise<Record<string, ExamSummary>> {
  if (!examIds.length) return {};
  try {
    const qs = encodeURIComponent(examIds.join(","));
    const r = await auth.fetch(
      `/api/v1/analytics/multi-exam-summary/${userId}?examIds=${qs}`,
    );
    if (!r.ok) return {};
    const body = (await r.json()) as { exams?: ExamSummary[] | null };
    const out: Record<string, ExamSummary> = {};
    for (const e of Array.isArray(body.exams) ? body.exams : []) {
      out[e.examId] = e;
    }
    return out;
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web-student && npx vitest run src/lib/multiExam.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/web-student/src/lib/multiExam.ts apps/web-student/src/lib/multiExam.test.ts
git commit -m "feat(web-student): multi-exam data layer (enrolled-exam merge + summary fetch)"
```

---

## Task 5: ReadinessCarousel component (web-student)

**Files:**
- Create: `apps/web-student/src/components/vidya/ReadinessCarousel.tsx`
- Test: `apps/web-student/src/components/vidya/ReadinessCarousel.test.tsx`

**Interfaces:**
- Consumes: `EnrolledExam`, `ExamSummary` from `../../lib/multiExam`.
- Produces: `ReadinessCarousel({ exams, summaries }: { exams: EnrolledExam[]; summaries: Record<string, ExamSummary> })`.
  - Renders one slide per exam: `<code> Readiness`, `score/900` (score = `round(readinessScore*900)`), days-to-exam from `targetDate`, dots + prev/next buttons. Active slide tracked in `useState`. No auto-rotate. Empty `exams` → an empty-state prompt.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web-student/src/components/vidya/ReadinessCarousel.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ReadinessCarousel } from "./ReadinessCarousel";
import type { EnrolledExam, ExamSummary } from "../../lib/multiExam";

const exams: EnrolledExam[] = [
  { examId: "e1", code: "NEET", name: "NEET UG", targetDate: "2027-05-01" },
  { examId: "e2", code: "UPSC_CSE", name: "UPSC", targetDate: null },
];
const summaries: Record<string, ExamSummary> = {
  e1: { examId: "e1", readinessScore: 0.5, nTopics: 10, weakestTopicId: "t", weakestEwa: 0.2, mistakesDue: 1, revisionDue: 0 },
  e2: { examId: "e2", readinessScore: 0.7, nTopics: 8, weakestTopicId: null, weakestEwa: null, mistakesDue: 0, revisionDue: 2 },
};

describe("ReadinessCarousel", () => {
  test("shows the first exam's readiness and switches on next", () => {
    render(<ReadinessCarousel exams={exams} summaries={summaries} />);
    expect(screen.getByText(/NEET Readiness/i)).toBeInTheDocument();
    expect(screen.getByText("450")).toBeInTheDocument(); // 0.5 * 900
    fireEvent.click(screen.getByRole("button", { name: /next exam/i }));
    expect(screen.getByText(/UPSC_CSE Readiness/i)).toBeInTheDocument();
    expect(screen.getByText("630")).toBeInTheDocument(); // 0.7 * 900
  });

  test("renders empty state with no exams", () => {
    render(<ReadinessCarousel exams={[]} summaries={{}} />);
    expect(screen.getByText(/Practice 10 more questions/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-student && npx vitest run src/components/vidya/ReadinessCarousel.test.tsx`
Expected: FAIL — cannot resolve `./ReadinessCarousel`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/web-student/src/components/vidya/ReadinessCarousel.tsx
// Per-exam readiness hero. One slide per enrolled exam; manual navigation
// (dots + prev/next), no auto-rotate — a readiness number is read, not
// glanced. Reuses the existing .vidya-hero CSS family for a single slide.
import { useEffect, useState } from "react";
import type { EnrolledExam, ExamSummary } from "../../lib/multiExam";

interface Props {
  exams: EnrolledExam[];
  summaries: Record<string, ExamSummary>;
}

function daysToExam(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const t = new Date(targetDate).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / 86_400_000));
}

export function ReadinessCarousel({ exams, summaries }: Props) {
  const [idx, setIdx] = useState(0);
  // Clamp when the exam list shrinks (defensive; list is stable in practice).
  useEffect(() => {
    if (idx > exams.length - 1) setIdx(0);
  }, [exams.length, idx]);

  if (!exams.length) {
    return (
      <section className="vidya-hero" aria-labelledby="hero-readiness">
        <p className="vidya-hero__eyebrow" id="hero-readiness">
          Readiness · AI estimate
        </p>
        <div className="vidya-hero__number">—</div>
        <p className="vidya-hero__caption" style={{ marginTop: "var(--sp-4)" }}>
          Practice 10 more questions to see your readiness.
        </p>
      </section>
    );
  }

  const exam = exams[Math.min(idx, exams.length - 1)];
  const s = summaries[exam.examId];
  const scaled = s ? Math.round(s.readinessScore * 900) : 0;
  const dte = daysToExam(exam.targetDate);
  const prev = () => setIdx((i) => (i - 1 + exams.length) % exams.length);
  const next = () => setIdx((i) => (i + 1) % exams.length);

  return (
    <section className="vidya-hero" aria-labelledby="hero-readiness">
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <p className="vidya-hero__eyebrow" id="hero-readiness">
          {exam.code} Readiness · AI estimate
        </p>
        {exams.length > 1 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              aria-label="Previous exam"
              className="vidya-hero__nav"
              onClick={prev}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next exam"
              className="vidya-hero__nav"
              onClick={next}
            >
              ›
            </button>
          </div>
        )}
      </div>
      <div className="vidya-hero__number">
        {scaled || "—"}
        <span className="vidya-hero__number-unit">/ 900</span>
      </div>
      <div className="vidya-hero__meta-row">
        <span className="vidya-hero__theta">{s?.nTopics ?? 0} topics tracked</span>
        {dte !== null && (
          <span className="vidya-hero__delta">{dte} days to exam</span>
        )}
      </div>
      {exams.length > 1 && (
        <div
          className="vidya-hero__dots"
          role="tablist"
          aria-label="Exam readiness slides"
          style={{ display: "flex", gap: 6, marginTop: "var(--sp-4)" }}
        >
          {exams.map((e, i) => (
            <button
              key={e.examId}
              type="button"
              role="tab"
              aria-selected={i === idx}
              aria-label={`${e.code} readiness`}
              onClick={() => setIdx(i)}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                background: i === idx ? "var(--paper)" : "var(--ink-3)",
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web-student && npx vitest run src/components/vidya/ReadinessCarousel.test.tsx`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/web-student/src/components/vidya/ReadinessCarousel.tsx apps/web-student/src/components/vidya/ReadinessCarousel.test.tsx
git commit -m "feat(web-student): ReadinessCarousel — per-exam readiness hero"
```

---

## Task 6: ExamAttentionCards component (web-student)

**Files:**
- Create: `apps/web-student/src/components/vidya/ExamAttentionCards.tsx`
- Test: `apps/web-student/src/components/vidya/ExamAttentionCards.test.tsx`

**Interfaces:**
- Consumes: `EnrolledExam`, `ExamSummary` from `../../lib/multiExam`; `Link` from `react-router-dom`; `topicTitles: Record<string,string>` (topic-id → title, resolved by the parent — same pattern Home already uses).
- Produces: `ExamAttentionCards({ exams, summaries, topicTitles }: { exams: EnrolledExam[]; summaries: Record<string, ExamSummary>; topicTitles: Record<string, string> })`.
  - One card per exam: code + name, readiness `/900`, days-to-exam, weakest-topic chip (title via `topicTitles`, else "—"), `N mistakes due` / `N revision due` (or `All clear ✓` when both 0), primary CTA `Resume →` deep-linking `/practice?examId=<id>[&topic=<weakestTopicId>]`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web-student/src/components/vidya/ExamAttentionCards.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { ExamAttentionCards } from "./ExamAttentionCards";
import type { EnrolledExam, ExamSummary } from "../../lib/multiExam";

const exams: EnrolledExam[] = [
  { examId: "e1", code: "NEET", name: "NEET UG", targetDate: "2027-05-01" },
  { examId: "e2", code: "CBSE_9", name: "CBSE Class 9", targetDate: null },
];
const summaries: Record<string, ExamSummary> = {
  e1: { examId: "e1", readinessScore: 0.5, nTopics: 10, weakestTopicId: "t1", weakestEwa: 0.2, mistakesDue: 4, revisionDue: 2 },
  e2: { examId: "e2", readinessScore: 0.9, nTopics: 5, weakestTopicId: null, weakestEwa: null, mistakesDue: 0, revisionDue: 0 },
};

function renderCards() {
  return render(
    <MemoryRouter>
      <ExamAttentionCards exams={exams} summaries={summaries} topicTitles={{ t1: "Thermodynamics" }} />
    </MemoryRouter>,
  );
}

describe("ExamAttentionCards", () => {
  test("shows per-exam due counts and weakest topic", () => {
    renderCards();
    expect(screen.getByText("NEET")).toBeInTheDocument();
    expect(screen.getByText(/4 mistakes due/i)).toBeInTheDocument();
    expect(screen.getByText(/Thermodynamics/i)).toBeInTheDocument();
  });

  test("shows all-clear when nothing due", () => {
    renderCards();
    expect(screen.getByText(/All clear/i)).toBeInTheDocument();
  });

  test("CTA deep-links into the exam with the weakest topic", () => {
    renderCards();
    const cta = screen.getByRole("link", { name: /Resume NEET/i });
    expect(cta).toHaveAttribute("href", "/practice?examId=e1&topic=t1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web-student && npx vitest run src/components/vidya/ExamAttentionCards.test.tsx`
Expected: FAIL — cannot resolve `./ExamAttentionCards`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/web-student/src/components/vidya/ExamAttentionCards.tsx
// Per-exam "needs attention" cards — replaces the non-contextual QuickActions
// row on the unified dashboard. One card per enrolled exam, each deep-linking
// into that exam's practice flow. Reuses the .vidya-quick CSS family.
import { Link } from "react-router-dom";
import type { EnrolledExam, ExamSummary } from "../../lib/multiExam";

interface Props {
  exams: EnrolledExam[];
  summaries: Record<string, ExamSummary>;
  topicTitles: Record<string, string>;
}

function daysToExam(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const t = new Date(targetDate).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / 86_400_000));
}

export function ExamAttentionCards({ exams, summaries, topicTitles }: Props) {
  if (!exams.length) return null;

  return (
    <section className="vidya-quick" aria-label="Needs attention">
      <div className="vidya-quick__head">
        <span className="vidya-quick__eyebrow">Needs attention</span>
        <span className="vidya-quick__sub">
          Across your {exams.length} {exams.length === 1 ? "exam" : "exams"}.
        </span>
      </div>
      <div className="vidya-quick__grid">
        {exams.map((exam) => {
          const s = summaries[exam.examId];
          const scaled = s ? Math.round(s.readinessScore * 900) : 0;
          const dte = daysToExam(exam.targetDate);
          const weakTitle = s?.weakestTopicId
            ? topicTitles[s.weakestTopicId] ?? "—"
            : "—";
          const mistakes = s?.mistakesDue ?? 0;
          const revision = s?.revisionDue ?? 0;
          const allClear = mistakes === 0 && revision === 0;
          const href = s?.weakestTopicId
            ? `/practice?examId=${encodeURIComponent(exam.examId)}&topic=${encodeURIComponent(s.weakestTopicId)}`
            : `/practice?examId=${encodeURIComponent(exam.examId)}`;
          return (
            <div key={exam.examId} className="vidya-quick__card">
              <div className="vidya-quick__title">{exam.code}</div>
              <p className="vidya-quick__body" style={{ marginBottom: 4 }}>
                {exam.name}
              </p>
              <div className="vidya-quick__meta-row" style={{ display: "flex", gap: 12, fontSize: 13 }}>
                <span>{scaled || "—"}/900</span>
                {dte !== null && <span>{dte}d to exam</span>}
              </div>
              <p className="vidya-quick__body">
                Weakest: <strong>{weakTitle}</strong>
              </p>
              <p className="vidya-quick__body">
                {allClear ? (
                  <span style={{ color: "var(--accent)" }}>All clear ✓</span>
                ) : (
                  <>
                    {mistakes > 0 && <span>{mistakes} mistakes due</span>}
                    {mistakes > 0 && revision > 0 && <span> · </span>}
                    {revision > 0 && <span>{revision} revision due</span>}
                  </>
                )}
              </p>
              <Link
                to={href}
                className="vidya-quick__cta"
                aria-label={`Resume ${exam.code}`}
              >
                Resume →
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web-student && npx vitest run src/components/vidya/ExamAttentionCards.test.tsx`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/web-student/src/components/vidya/ExamAttentionCards.tsx apps/web-student/src/components/vidya/ExamAttentionCards.test.tsx
git commit -m "feat(web-student): ExamAttentionCards — per-exam needs-attention row"
```

---

## Task 7: Wire into Home.tsx + remove MultiTrackBody home fork

**Files:**
- Modify: `apps/web-student/src/pages/Home.tsx`

**Interfaces:**
- Consumes: `buildEnrolledExams`, `fetchMultiExamSummary`, `EnrolledExam`, `ExamSummary` (Task 4); `ReadinessCarousel` (Task 5); `ExamAttentionCards` (Task 6).
- Produces: a `/home` that renders the carousel + attention cards for all enrolled exams; no behavioral dependency for later tasks.

- [ ] **Step 1: Add imports**

In `apps/web-student/src/pages/Home.tsx`, add near the other component imports (after the `QuickActions` import line):

```tsx
import { ReadinessCarousel } from "../components/vidya/ReadinessCarousel";
import { ExamAttentionCards } from "../components/vidya/ExamAttentionCards";
import {
  buildEnrolledExams,
  fetchMultiExamSummary,
  type EnrolledExam,
  type ExamSummary,
} from "../lib/multiExam";
```

- [ ] **Step 2: Add enrolled-exam + summary state and effects**

Add state near the other `useState` calls in `Home()`:

```tsx
  const [enrolledExams, setEnrolledExams] = useState<EnrolledExam[]>([]);
  const [examSummaries, setExamSummaries] = useState<Record<string, ExamSummary>>({});
```

In the profile effect (the one that fetches `/profile/me` + `/catalog/exams`), after `setEnrolledCatalog(...)`, also build the enrolled-exam list. Replace the `if (alive) { setEnrolledCatalog(...) }` block with:

```tsx
          if (alive) {
            const merged = buildEnrolledExams(
              (Array.isArray(profileData.exams) ? profileData.exams : []).map(
                (e) => ({ examId: e.examId, targetDate: e.targetDate }),
              ),
              catalog.map((c) => ({ id: c.id, code: c.code, name: c.name })),
            );
            setEnrolledCatalog(catalog.filter((c) => enrolledIds.has(c.id)));
            setEnrolledExams(merged);
          }
```

> `MultiExamMeta` (the `catalog` element type) has `id`, `code`, `name` fields — confirm by opening `apps/web-student/src/pages/MultiTrack.tsx` `ExamMeta`. If `name` is optional there, use `c.name ?? c.code`.

Add a new effect (after the mastery effect) to fetch the summary once the exam list + user are known:

```tsx
  useEffect(() => {
    if (!user?.id || enrolledExams.length === 0) return;
    let alive = true;
    (async () => {
      const map = await fetchMultiExamSummary(
        user.id,
        enrolledExams.map((e) => e.examId),
      );
      if (alive) setExamSummaries(map);
    })();
    return () => { alive = false; };
  }, [user?.id, enrolledExams]);
```

- [ ] **Step 3: Build topicTitles for the attention cards**

The mastery effect already resolves topic titles into `mastery` (`TopicCard.title`). Add a derived map after the `subjectRows` memo:

```tsx
  const topicTitles = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of mastery) m[t.topicId] = t.title;
    return m;
  }, [mastery]);
```

> This covers weakest topics that appear in the user's mastery list. A weakest topic absent from `mastery` falls back to "—" in the card (acceptable; the card still deep-links by id).

- [ ] **Step 4: Replace the hero section with the carousel**

In the returned JSX, replace the entire `{/* Hero readiness card */}` `<section className="vidya-hero" …>…</section>` block with:

```tsx
        {/* Hero readiness — per-exam carousel */}
        <ReadinessCarousel exams={enrolledExams} summaries={examSummaries} />
```

- [ ] **Step 5: Replace the QuickActions usage with attention cards**

Replace the single-exam `<QuickActions firstExamId={profile?.exams?.[0]?.examId} nextBestTopicId={nextBest?.topicId} />` block (the one after `</div>` closing `vidya-grid-3`) with:

```tsx
      <ExamAttentionCards
        exams={enrolledExams}
        summaries={examSummaries}
        topicTitles={topicTitles}
      />
```

- [ ] **Step 6: Remove the MultiTrackBody home fork**

Delete the entire `if (enrolledCatalog.length >= 2) { … return ( <VidyaShell …> <QuickActions …/> <MultiTrackBody …/> </VidyaShell> ); }` block. Then remove the now-unused imports:
- `import { QuickActions } from "../components/vidya/QuickActions";`
- the `MultiTrackBody, buildTracksFromExams, type ExamMeta as MultiExamMeta` import from `./MultiTrack` — **but** `MultiExamMeta` is still used as the `enrolledCatalog` state type. Keep the `type ExamMeta as MultiExamMeta` import; drop only `MultiTrackBody` and `buildTracksFromExams`:

```tsx
import { type ExamMeta as MultiExamMeta } from "./MultiTrack";
```

> `enrolledCatalog` state can remain (harmless), or be removed along with its setter and the filtering line if you prefer a clean diff. If you remove it, also drop `setEnrolledCatalog` usage. Keeping it is fine — YAGNI-neutral, avoids touching the merge block again.

- [ ] **Step 7: Typecheck + run web-student tests**

Run: `cd apps/web-student && npx tsc --noEmit && npx vitest run src/lib/multiExam.test.ts src/components/vidya/ReadinessCarousel.test.tsx src/components/vidya/ExamAttentionCards.test.tsx`
Expected: tsc clean; all component/lib tests pass.

> If `App.test.tsx` or a Home smoke test asserts on the old hero copy ("NEET Readiness" static text or the "Jump in" heading), update those assertions to the new copy ("Needs attention", carousel eyebrow). Run `npx vitest run` and fix any such fallout.

- [ ] **Step 8: Commit**

```bash
git add apps/web-student/src/pages/Home.tsx
git commit -m "feat(web-student): unified dashboard — readiness carousel + per-exam attention cards; drop MultiTrackBody home fork"
```

---

## Task 8: Deploy + manual verification

**Files:** none (deploy + manual QA).

- [ ] **Step 1: Rebuild + redeploy engagement**

```bash
cd infrastructure/docker
docker compose build engagement && docker compose up -d engagement
```
Expected: container recreated, healthy.

- [ ] **Step 2: Smoke-test the endpoint (owner token)**

Obtain a student access token (login as `student@alp.dev` / `Password123!`, read `.tokens.accessToken` nested), then:

```bash
curl -s "http://localhost:35173/api/v1/analytics/multi-exam-summary/<studentUserId>?examIds=<e1>,<e2>" \
  -H "Authorization: Bearer <token>" | jq
```
Expected: `{ "userId": "...", "exams": [ { "examId": "...", "readinessScore": …, "mistakesDue": …, "revisionDue": … }, … ] }` — one entry per requested exam.

- [ ] **Step 3: Rebuild + redeploy web-student**

```bash
cd infrastructure/docker
docker compose build web-student && docker compose up -d web-student
```

- [ ] **Step 4: Browser verification**

Log in as the 3-exam student at http://localhost:35173 and confirm on `/home`:
- Hero is a **carousel** — arrows/dots switch between NEET / UPSC_CSE / CBSE_9, each showing that exam's `/900` readiness and days-to-exam.
- The old "Jump in" row is replaced by **per-exam attention cards** — each shows readiness, weakest topic, mistakes-due / revision-due (or "All clear ✓"), and a **Resume →** CTA.
- Clicking a card's **Resume →** lands on `/practice?examId=…` scoped to that exam.
- No console errors; the dashboard renders even if the summary call is slow (exam list shows first).

- [ ] **Step 5: Final commit (if any test-copy fixups were needed)**

```bash
git add -A
git commit -m "test(web-student): update dashboard assertions for multi-exam layout"
```

---

## Notes for the executor

- The engagement DB tests (Task 2) need local Postgres on `localhost:35432`; the pure-core tests (Task 1) do not.
- Do not touch `QuickActions.tsx` — it stays in use on exam-scoped pages.
- No migration in this plan. If `resolve_exam_topic_ids` returns `None` (catalog down) the route degrades to a zeroed entry rather than erroring — this is intended.
- Keep new API contract mobile-friendly (plain JSON, no web-only assumptions) for later parity; no mobile code changes now.
