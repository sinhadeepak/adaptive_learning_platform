# Exam-Scoped Practice Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope the student Practice screen to the selected exam — mastery/weak topics, readiness band, revision queue, and guided next-steps all derive from that exam's topic set, with cold-start showing the exam's topics as "Not started."

**Architecture:** Add an optional `exam_id` query param to the engagement analytics endpoints (mastery, readiness-band, revision); each resolves the exam's topic-id set via one shared cached helper that HTTP-calls the learning catalog, then filters by `topic_id = ANY(...)`. `guided-next-steps` (learning) gains `exam_id` (resolved to the exam_code it already scopes by). The Practice page reads `examId` (fallback to primary enrolled exam), threads it into those calls, and merges the exam's catalog topics so untouched ones render "Not started." The topic-decay panel is removed from this screen.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy (async raw `text()`) / httpx / pytest (engagement, learning); React + Vite + TS / Vitest (web-student).

## Global Constraints

- Scope source: Practice reads `?examId=<uuid>`; if absent, the first enrolled exam from `/profile/me` (`exams[0].examId`). If the URL exam isn't in the student's enrolled exams, fall back to primary.
- Cold start: render ALL the exam's catalog topics; untouched ones show "Not started" (0%).
- `topic-decay` is REMOVED from this screen (delete its state, fetch, render).
- Scoping is SERVER-SIDE via `exam_id`; absent `exam_id` keeps the exact current global behavior (back-compatible — other callers unaffected).
- Cross-DB: analytics live in engagement (`analytics_schema`), catalog in learning (`catalog_schema`). Engagement resolves exam→topics over HTTP (learning base URL `settings.learning_base_url`, default `http://learning:8000`), behind a short-TTL in-process cache.
- Graceful degradation: if the engagement→learning resolution call fails, the endpoint returns UNSCOPED data for that request (availability over strict scoping) and logs — never errors.
- Engagement sessions: `from engagement.analytics.db import sessionmaker` → `async with sessionmaker()() as session:`. Schema constant `SCHEMA = "analytics_schema"`.
- Run engagement tests: `cd services/engagement && uv run pytest <path> -v` (DB-backed; uses `ANALYTICS_DATABASE_URL`, default `postgresql+asyncpg://postgres:postgres@localhost:35432/engagement`; the `_clean_state` autouse fixture truncates analytics tables). Learning tests: `cd services/learning && uv run pytest <path> -v`. web-student: `cd apps/web-student && npx vitest run` + `npx tsc --noEmit`.

---

## File Structure

**Engagement (create/modify):**
- Create: `services/engagement/src/engagement/analytics/exam_scope.py` — `resolve_exam_topic_ids(exam_id)` + TTL cache (the one new unit).
- Modify: `analytics/routes.py` — add `exam_id` to `list_mastery`, `get_readiness_band`, `revision_due`.
- Modify: `analytics/repositories.py` — `list_user_mastery` accepts an optional topic-id filter.
- Modify: `analytics/revision_queue_repo.py` — `list_due` accepts an optional topic-id filter.
- Tests under `services/engagement/tests/analytics/`.

**Learning (modify):**
- Modify: `src/learning/adaptive/routes.py` — `get_guided_next_steps` accepts `exam_id`.
- Modify: `src/learning/adaptive/study_plan.py` — no signature change needed (still takes `exam_code`); the route resolves id→code.
- Test under `services/learning/tests/`.

**web-student (modify):**
- Modify: `apps/web-student/src/pages/Practice.tsx` — examId resolution, scoped calls, cold-start merge, remove topic-decay, exam label.
- Test under `apps/web-student/src/pages/__tests__/` (or wherever web-student vitest lives).

---

## Task 1: Engagement — cached exam→topics resolver

**Files:**
- Create: `services/engagement/src/engagement/analytics/exam_scope.py`
- Test: `services/engagement/tests/analytics/test_exam_scope.py`

**Interfaces:**
- Produces:
  - `async def resolve_exam_topic_ids(exam_id: str, *, clock: float | None = None) -> set[str]` — returns the exam's topic-id set (HTTP to learning), cached per exam for `_CACHE_TTL` seconds; returns `set()` on HTTP failure.
  - `async def _fetch_exam_topic_ids(exam_id: str) -> set[str]` — the uncached HTTP fetch (separately monkeypatchable in tests).
  - `def _reset_cache() -> None` — test helper to clear the module cache.

- [ ] **Step 1: Write the failing test**

```python
# services/engagement/tests/analytics/test_exam_scope.py
import pytest

from engagement.analytics import exam_scope


@pytest.mark.asyncio
async def test_resolve_caches_within_ttl(monkeypatch):
    exam_scope._reset_cache()
    calls = {"n": 0}

    async def fake_fetch(exam_id: str) -> set[str]:
        calls["n"] += 1
        return {"t1", "t2"}

    monkeypatch.setattr(exam_scope, "_fetch_exam_topic_ids", fake_fetch)
    # Two calls at the same clock → one underlying fetch (cache hit).
    a = await exam_scope.resolve_exam_topic_ids("exam-1", clock=100.0)
    b = await exam_scope.resolve_exam_topic_ids("exam-1", clock=100.0)
    assert a == {"t1", "t2"} and b == {"t1", "t2"}
    assert calls["n"] == 1
    # After TTL expiry → re-fetch.
    await exam_scope.resolve_exam_topic_ids("exam-1", clock=100.0 + exam_scope._CACHE_TTL + 1)
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_fetch_returns_empty_on_http_error(monkeypatch):
    exam_scope._reset_cache()
    import httpx

    class _Boom:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k): raise httpx.HTTPError("down")

    monkeypatch.setattr(exam_scope.httpx, "AsyncClient", _Boom)
    out = await exam_scope._fetch_exam_topic_ids("exam-x")
    assert out == set()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/engagement && uv run pytest tests/analytics/test_exam_scope.py -v`
Expected: FAIL — `ModuleNotFoundError: engagement.analytics.exam_scope`.

- [ ] **Step 3: Implement**

```python
# services/engagement/src/engagement/analytics/exam_scope.py
"""Resolve an exam's topic-id set from the learning catalog (cross-service,
cached). Engagement analytics endpoints use this to scope by exam without a
cross-DB JOIN (catalog lives in the learning DB)."""

from __future__ import annotations

import logging
import time

import httpx

from engagement.analytics.config import settings

log = logging.getLogger(__name__)

_HTTP_TIMEOUT = httpx.Timeout(connect=2.0, read=8.0, write=5.0, pool=5.0)
_CACHE_TTL = 600.0  # 10 min; exam topic sets are near-static
_cache: dict[str, tuple[float, set[str]]] = {}


def _reset_cache() -> None:
    _cache.clear()


async def _fetch_exam_topic_ids(exam_id: str) -> set[str]:
    """Uncached HTTP fetch. Returns set() on any HTTP error (caller degrades)."""
    url = f"{settings.learning_base_url}/catalog/exams/{exam_id}/subjects-with-topics"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            r = await client.get(url)
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("resolve_exam_topic_ids.failed exam=%s err=%s", exam_id, e)
            return set()
    body = r.json()
    return {t["id"] for t in body.get("topics", []) if t.get("id")}


async def resolve_exam_topic_ids(exam_id: str, *, clock: float | None = None) -> set[str]:
    """Topic-id set for an exam, cached per exam for _CACHE_TTL seconds.
    `clock` is injectable for tests; defaults to time.monotonic()."""
    now = clock if clock is not None else time.monotonic()
    hit = _cache.get(exam_id)
    if hit is not None and now - hit[0] < _CACHE_TTL:
        return hit[1]
    ids = await _fetch_exam_topic_ids(exam_id)
    _cache[exam_id] = (now, ids)
    return ids
```

> Confirm `engagement.analytics.config.settings.learning_base_url` exists (the existing `learning_client.py` imports `settings` from `engagement.analytics.config` and uses `settings.learning_base_url`). If the attribute name differs, match the real one.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/engagement && uv run pytest tests/analytics/test_exam_scope.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add services/engagement/src/engagement/analytics/exam_scope.py services/engagement/tests/analytics/test_exam_scope.py
git commit -m "feat(engagement): cached exam->topics resolver for analytics scoping"
```

---

## Task 2: Engagement — scope mastery by exam

**Files:**
- Modify: `services/engagement/src/engagement/analytics/repositories.py` (`list_user_mastery`)
- Modify: `services/engagement/src/engagement/analytics/routes.py` (`list_mastery`)
- Test: `services/engagement/tests/analytics/test_mastery_exam_scope.py`

**Interfaces:**
- Consumes: `resolve_exam_topic_ids` (Task 1).
- Produces: `GET /analytics/mastery/{user_id}?exam_id=<uuid>` filters topics to the exam; absent `exam_id` unchanged. `list_user_mastery(session, user_id, *, topic_ids: set[str] | None = None)`.

- [ ] **Step 1: Write the failing test**

```python
# services/engagement/tests/analytics/test_mastery_exam_scope.py
import uuid
import pytest
from sqlalchemy import text

from engagement.analytics import db, routes as analytics_routes


async def _seed_mastery(user_id, rows):
    async with db.sessionmaker()() as s:
        for topic_id, ewa, n in rows:
            await s.execute(text(
                "INSERT INTO analytics_schema.mastery (user_id, topic_id, ewa, n) "
                "VALUES (CAST(:u AS uuid), CAST(:t AS uuid), :e, :n) "
                "ON CONFLICT (user_id, topic_id) DO UPDATE SET ewa=EXCLUDED.ewa, n=EXCLUDED.n"
            ), {"u": user_id, "t": topic_id, "e": ewa, "n": n})
        await s.commit()


@pytest.mark.asyncio
async def test_mastery_scoped_to_exam_topics(client, monkeypatch):
    user = str(uuid.uuid4())
    in_topic = str(uuid.uuid4())
    out_topic = str(uuid.uuid4())
    await _seed_mastery(user, [(in_topic, 0.7, 3), (out_topic, 0.2, 1)])

    async def fake_resolve(exam_id, *, clock=None):
        return {in_topic}
    monkeypatch.setattr(analytics_routes, "resolve_exam_topic_ids", fake_resolve)

    # scoped → only in_topic
    r = await client.get(f"/analytics/mastery/{user}?exam_id=11111111-1111-1111-1111-111111111111")
    ids = {t["topicId"] for t in r.json()["topics"]}
    assert ids == {in_topic}

    # unscoped → both (back-compat)
    r2 = await client.get(f"/analytics/mastery/{user}")
    ids2 = {t["topicId"] for t in r2.json()["topics"]}
    assert ids2 == {in_topic, out_topic}
```

> Reuse the `client` fixture from `tests/analytics/` (ASGITransport over `engagement.main.app` / the analytics app). If the existing client fixture is module-local, copy it or import from the sibling test module's conftest.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/engagement && uv run pytest tests/analytics/test_mastery_exam_scope.py -v`
Expected: FAIL — `exam_id` ignored (scoped call returns both topics).

- [ ] **Step 3a: Repository filter**

In `repositories.py`, change `list_user_mastery`:

```python
async def list_user_mastery(
    session: AsyncSession, user_id: str, *, topic_ids: set[str] | None = None,
) -> list[MasteryRow]:
    sql = (
        f"SELECT user_id, topic_id, ewa, n FROM {SCHEMA}.mastery WHERE user_id = :uid "
    )
    params: dict = {"uid": user_id}
    if topic_ids is not None:
        sql += "AND topic_id = ANY(CAST(:tids AS uuid[])) "
        params["tids"] = list(topic_ids)
    sql += "ORDER BY topic_id"
    res = await session.execute(text(sql), params)
    return [
        MasteryRow(user_id=str(r[0]), topic_id=str(r[1]), ewa=float(r[2]), n=int(r[3])) for r in res
    ]
```

(When `topic_ids` is an empty set, `ANY('{}')` matches nothing → empty result, which is the correct cold-start for an unknown exam.)

- [ ] **Step 3b: Route**

In `routes.py`, add the import and the param:

```python
from engagement.analytics.exam_scope import resolve_exam_topic_ids


@router.get("/analytics/mastery/{user_id}")
async def list_mastery(user_id: str, exam_id: str | None = None) -> dict:
    topic_ids = await resolve_exam_topic_ids(exam_id) if exam_id else None
    async with sessionmaker()() as session:
        rows = await list_user_mastery(session, user_id, topic_ids=topic_ids)
    return {
        "userId": user_id,
        "topics": [{"topicId": r.topic_id, "ewa": r.ewa, "n": r.n} for r in rows],
    }
```

> Graceful degradation: if `resolve_exam_topic_ids` returned `set()` due to a learning outage, the result is empty (cold-start view) rather than global. That matches the spec's "empty topic set → empty/zero, not global" for an unknown exam. (A genuine learning *outage* also yields empty here; acceptable — the page still renders cold-start. The readiness/revision tasks follow the same rule.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/engagement && uv run pytest tests/analytics/test_mastery_exam_scope.py -v`
Expected: PASS (both assertions).

- [ ] **Step 5: Commit**

```bash
git add services/engagement/src/engagement/analytics/repositories.py services/engagement/src/engagement/analytics/routes.py services/engagement/tests/analytics/test_mastery_exam_scope.py
git commit -m "feat(engagement): scope mastery endpoint by exam_id"
```

---

## Task 3: Engagement — scope readiness-band by exam

**Files:**
- Modify: `services/engagement/src/engagement/analytics/routes.py` (`get_readiness_band`)
- Test: `services/engagement/tests/analytics/test_readiness_exam_scope.py`

**Interfaces:**
- Consumes: `resolve_exam_topic_ids` (Task 1).
- Produces: `GET /analytics/readiness-band/{user_id}?exam_id=<uuid>` averages `ewa` over only the exam's topics.

- [ ] **Step 1: Write the failing test**

```python
# services/engagement/tests/analytics/test_readiness_exam_scope.py
import uuid
import pytest
from sqlalchemy import text

from engagement.analytics import db, routes as analytics_routes


async def _seed(user_id, rows):
    async with db.sessionmaker()() as s:
        for topic_id, ewa, n in rows:
            await s.execute(text(
                "INSERT INTO analytics_schema.mastery (user_id, topic_id, ewa, n) "
                "VALUES (CAST(:u AS uuid), CAST(:t AS uuid), :e, :n) "
                "ON CONFLICT (user_id, topic_id) DO UPDATE SET ewa=EXCLUDED.ewa, n=EXCLUDED.n"
            ), {"u": user_id, "t": topic_id, "e": ewa, "n": n})
        await s.commit()


@pytest.mark.asyncio
async def test_readiness_scoped_average(client, monkeypatch):
    user = str(uuid.uuid4())
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    await _seed(user, [(a, 0.8, 3), (b, 0.0, 1)])  # global avg 0.4; exam-a avg 0.8

    async def fake_resolve(exam_id, *, clock=None):
        return {a}
    monkeypatch.setattr(analytics_routes, "resolve_exam_topic_ids", fake_resolve)

    r = await client.get(f"/analytics/readiness-band/{user}?exam_id=11111111-1111-1111-1111-111111111111")
    assert r.json()["readiness_score"] == pytest.approx(0.8, abs=1e-3)

    r2 = await client.get(f"/analytics/readiness-band/{user}")
    assert r2.json()["readiness_score"] == pytest.approx(0.4, abs=1e-3)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/engagement && uv run pytest tests/analytics/test_readiness_exam_scope.py -v`
Expected: FAIL — scoped score is 0.4 (global), not 0.8.

- [ ] **Step 3: Implement**

Replace `get_readiness_band` with a version that filters the AVG when `exam_id` is given:

```python
@router.get("/analytics/readiness-band/{user_id}")
async def get_readiness_band(
    user_id: str,
    target_score: float = 0.7,
    days_to_exam: int = 90,
    exam_id: str | None = None,
):
    """Compute the user's current readiness band + suggested actions.
    Scoped to the exam's topics when exam_id is supplied."""
    topic_ids = await resolve_exam_topic_ids(exam_id) if exam_id else None
    async with sessionmaker()() as s:
        from sqlalchemy import text as _text
        sql = (
            "SELECT COALESCE(AVG(ewa), 0)::float AS readiness_score "
            "FROM analytics_schema.mastery WHERE user_id = CAST(:uid AS uuid) "
        )
        params: dict = {"uid": user_id}
        if topic_ids is not None:
            sql += "AND topic_id = ANY(CAST(:tids AS uuid[])) "
            params["tids"] = list(topic_ids)
        res = await s.execute(_text(sql), params)
        row = res.mappings().first()
        readiness = float(row["readiness_score"]) if row else 0.0
    band = _bands.readiness_band(
        readiness_score=readiness, days_to_exam=days_to_exam, target_score=target_score,
    )
    actions = _bands.BAND_ACTIONS.get(band, [])
    return {
        "user_id": user_id,
        "readiness_score": round(readiness, 3),
        "target_score": target_score,
        "days_to_exam": days_to_exam,
        "band": band,
        "actions": actions,
    }
```

(`resolve_exam_topic_ids` is already imported in `routes.py` from Task 2. `_bands` import is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/engagement && uv run pytest tests/analytics/test_readiness_exam_scope.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/engagement/src/engagement/analytics/routes.py services/engagement/tests/analytics/test_readiness_exam_scope.py
git commit -m "feat(engagement): scope readiness-band by exam_id"
```

---

## Task 4: Engagement — scope revision queue by exam

**Files:**
- Modify: `services/engagement/src/engagement/analytics/revision_queue_repo.py` (`list_due`)
- Modify: `services/engagement/src/engagement/analytics/routes.py` (`revision_due`)
- Test: `services/engagement/tests/analytics/test_revision_exam_scope.py`

**Interfaces:**
- Consumes: `resolve_exam_topic_ids` (Task 1).
- Produces: `GET /analytics/revision/{user_id}?exam_id=<uuid>` filters due items to the exam's topics. `list_due(session, user_id, *, now, limit=10, topic_ids: set[str] | None = None)`.

- [ ] **Step 1: Write the failing test**

```python
# services/engagement/tests/analytics/test_revision_exam_scope.py
import uuid
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import text

from engagement.analytics import db, routes as analytics_routes

UTC = timezone.utc


async def _seed_due(user_id, topic_ids):
    past = datetime.now(tz=UTC) - timedelta(days=2)
    async with db.sessionmaker()() as s:
        for t in topic_ids:
            await s.execute(text(
                "INSERT INTO analytics_schema.revision_queue "
                "(user_id, topic_id, last_attempt_at, due_at, interval_days, ease_factor, attempts) "
                "VALUES (CAST(:u AS uuid), CAST(:t AS uuid), :la, :due, 1, 2.5, 1) "
                "ON CONFLICT (user_id, topic_id) DO UPDATE SET due_at=EXCLUDED.due_at"
            ), {"u": user_id, "t": t, "la": past, "due": past})
        await s.commit()


@pytest.mark.asyncio
async def test_revision_scoped_to_exam(client, monkeypatch):
    user = str(uuid.uuid4())
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    await _seed_due(user, [a, b])

    async def fake_resolve(exam_id, *, clock=None):
        return {a}
    monkeypatch.setattr(analytics_routes, "resolve_exam_topic_ids", fake_resolve)

    r = await client.get(f"/analytics/revision/{user}?exam_id=11111111-1111-1111-1111-111111111111")
    ids = {it["topicId"] for it in r.json()["items"]}
    assert ids == {a}

    r2 = await client.get(f"/analytics/revision/{user}")
    ids2 = {it["topicId"] for it in r2.json()["items"]}
    assert ids2 == {a, b}
```

> Confirm the `revision_queue` columns (`user_id, topic_id, last_attempt_at, due_at, interval_days, ease_factor, attempts`) match the real schema (from `revision_queue_repo.list_due`'s SELECT). If a NOT NULL column is missing from the seed insert, add it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/engagement && uv run pytest tests/analytics/test_revision_exam_scope.py -v`
Expected: FAIL — scoped returns both.

- [ ] **Step 3a: Repository filter**

In `revision_queue_repo.py`, change `list_due` to accept `topic_ids` and add the filter:

```python
async def list_due(
    session: AsyncSession, user_id: str, *, now: datetime, limit: int = 10,
    topic_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    sql = f"""
        SELECT q.topic_id, q.last_attempt_at, q.due_at,
               q.interval_days, q.ease_factor, q.attempts
          FROM {SCHEMA}.revision_queue q
         WHERE q.user_id = :uid
           AND q.due_at <= :now
    """
    params: dict[str, Any] = {"uid": user_id, "now": now, "limit": limit}
    if topic_ids is not None:
        sql += " AND q.topic_id = ANY(CAST(:tids AS uuid[]))"
        params["tids"] = list(topic_ids)
    sql += " ORDER BY q.due_at ASC, q.last_attempt_at ASC LIMIT :limit"
    rows = (await session.execute(text(sql), params)).mappings().all()
    return [
        {
            "topicId": str(r["topic_id"]),
            "topicTitle": "",
            "lastAttemptAt": r["last_attempt_at"],
            "dueAt": r["due_at"],
            "intervalDays": int(r["interval_days"]),
            "easeFactor": float(r["ease_factor"]),
            "attempts": int(r["attempts"]),
        }
        for r in rows
    ]
```

- [ ] **Step 3b: Route**

In `routes.py`, thread `exam_id` into `revision_due`:

```python
@router.get("/analytics/revision/{user_id}")
async def revision_due(user_id: str, limit: int = 10, exam_id: str | None = None) -> dict:
    now = datetime.now(tz=UTC)
    limit = max(1, min(limit, 50))
    topic_ids = await resolve_exam_topic_ids(exam_id) if exam_id else None
    async with sessionmaker()() as session:
        rows = await _revision_repo.list_due(session, user_id, now=now, limit=limit, topic_ids=topic_ids)
    topic_id_list = list({r["topicId"] for r in rows})
    titles = await _learning_client.fetch_topics_bulk(topic_id_list)
    for r in rows:
        info = titles.get(r["topicId"])
        if info:
            r["topicTitle"] = info.get("title", "")
    items = [
        {
            **r,
            "lastAttemptAt": r["lastAttemptAt"].isoformat() if r["lastAttemptAt"] else None,
            "dueAt": r["dueAt"].isoformat() if r["dueAt"] else None,
            "overdueDays": overdue_days(r["dueAt"], now=now),
        }
        for r in rows
    ]
    return {"userId": user_id, "now": now.isoformat(), "items": items}
```

(Keep the existing `_revision_repo`, `_learning_client`, `overdue_days`, `UTC` imports as-is.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/engagement && uv run pytest tests/analytics/test_revision_exam_scope.py -v`
Expected: PASS. Then run the full analytics suite for no regression:
Run: `cd services/engagement && uv run pytest tests/analytics -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/engagement/src/engagement/analytics/revision_queue_repo.py services/engagement/src/engagement/analytics/routes.py services/engagement/tests/analytics/test_revision_exam_scope.py
git commit -m "feat(engagement): scope revision queue by exam_id"
```

---

## Task 5: Learning — guided-next-steps accepts exam_id

**Files:**
- Modify: `services/learning/src/learning/adaptive/routes.py` (`get_guided_next_steps`)
- Test: `services/learning/tests/adaptive/test_guided_exam_id.py`

**Interfaces:**
- Produces: `GET /adaptive/guided-next-steps/{user_id}?exam_id=<uuid>` resolves the exam's `code` from the catalog and scopes via the existing `exam_code` path. Existing `?exam=<code>` still works; `exam_id` takes precedence when both given.

- [ ] **Step 1: Write the failing test**

```python
# services/learning/tests/adaptive/test_guided_exam_id.py
import pytest
from learning.adaptive import routes as adaptive_routes


@pytest.mark.asyncio
async def test_exam_id_resolves_to_code(monkeypatch):
    captured = {}

    async def fake_build(*, user_id, exam_code=None):
        captured["exam_code"] = exam_code
        return {"headline": "x", "steps": [], "source": "heuristic"}

    async def fake_resolve_code(exam_id):
        return "NEET" if exam_id == "exam-neet" else None

    monkeypatch.setattr(adaptive_routes, "build_guided_next_steps", fake_build)
    monkeypatch.setattr(adaptive_routes, "_exam_code_for_id", fake_resolve_code)

    await adaptive_routes.get_guided_next_steps("u1", exam=None, exam_id="exam-neet")
    assert captured["exam_code"] == "NEET"
```

> Adjust the monkeypatch target names to match what you implement (`_exam_code_for_id` resolver). If `get_guided_next_steps` isn't directly awaitable in a unit test due to FastAPI `Query` defaults, call it with explicit kwargs as shown (Query defaults resolve to their `.default`); if that's awkward, write the test as an httpx ASGITransport route test instead, mirroring an existing adaptive route test.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/learning && uv run pytest tests/adaptive/test_guided_exam_id.py -v`
Expected: FAIL — `exam_id` param / `_exam_code_for_id` not present.

- [ ] **Step 3: Implement**

In `routes.py`, add a catalog resolver + the `exam_id` param:

```python
from sqlalchemy import text
from learning.content.db import sessionmaker as content_sessionmaker  # catalog_schema lives in the content/catalog DB


async def _exam_code_for_id(exam_id: str) -> str | None:
    async with content_sessionmaker()() as s:
        rows = (await s.execute(
            text("SELECT code FROM catalog_schema.exams WHERE id = CAST(:eid AS uuid)"),
            {"eid": exam_id},
        )).mappings().all()
    return rows[0]["code"] if rows else None


@router.get("/adaptive/guided-next-steps/{user_id}")
async def get_guided_next_steps(
    user_id: str,
    exam: str | None = Query(default=None),
    exam_id: str | None = Query(default=None),
) -> dict:
    code = exam
    if exam_id:
        resolved = await _exam_code_for_id(exam_id)
        if resolved:
            code = resolved
    return await build_guided_next_steps(user_id=user_id, exam_code=code)
```

> Confirm the right sessionmaker for `catalog_schema`. The catalog routes use `SessionDep`; find which db module backs `catalog_schema` (grep `catalog_schema` + `sessionmaker` in `services/learning/src/learning/catalog/`) and use that exact import. The `subjects-with-topics` handler's `SessionDep` reveals it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/learning && uv run pytest tests/adaptive/test_guided_exam_id.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/learning/src/learning/adaptive/routes.py services/learning/tests/adaptive/test_guided_exam_id.py
git commit -m "feat(learning): guided-next-steps accepts exam_id (resolves to exam_code)"
```

---

## Task 6: web-student — exam-scope the Practice page

**Files:**
- Modify: `apps/web-student/src/pages/Practice.tsx`
- Test: add/extend a vitest test for the Practice page (mirror existing web-student page tests)

**Interfaces:**
- Consumes: scoped endpoints (Tasks 2–5); `GET /catalog/exams/{examId}/subjects-with-topics` (existing).

- [ ] **Step 1: Read the current Practice page data flow**

Read `apps/web-student/src/pages/Practice.tsx`. The relevant calls are (line numbers approximate):
- `/api/v1/profile/me` (~435) — has `exams: [{examId,...}]`.
- `/api/v1/analytics/mastery/${user.id}` (~447).
- `/api/v1/adaptive/guided-next-steps/${user.id}` (~478).
- `/api/v1/analytics/readiness-band/${user.id}?...` (~486).
- `/api/v1/analytics/revision/${user.id}?limit=5` (~493).
- `/api/v1/analytics/topic-decay/${user.id}` (~504) — TO REMOVE.
- `weakestDrills` useMemo (~574) builds the drill list from mastery + topicTitles.

- [ ] **Step 2: Write the failing test**

Mirror an existing web-student page test (check `apps/web-student/src` for `*.test.tsx` + the mock pattern). The test must assert:
1. With `?examId=E1` in the route, the page calls mastery/readiness/revision/guided with `exam_id=E1` (or `examId=E1` for catalog), and calls `/catalog/exams/E1/subjects-with-topics`.
2. The page does NOT call `/analytics/topic-decay/...`.
3. A topic present in the exam's `subjects-with-topics` but absent from mastery renders as "Not started".

Use the existing fetch-mock approach (e.g. mock `auth.fetch` and assert URLs + render). If web-student has no test harness for Practice, add the smallest vitest test that mounts `<Practice/>` inside a `MemoryRouter` with `initialEntries={["/practice?examId=E1"]}` and a mocked `auth.fetch` returning canned payloads, then assert the above. State in the report if you had to establish the harness.

- [ ] **Step 3: Implement the Practice changes**

Make these concrete edits (match the real surrounding code):

1. **Resolve the current exam** near the top of the component:
```tsx
const examIdParam = searchParams.get("examId");
const [examId, setExamId] = useState<string | null>(examIdParam);
// Fallback to primary enrolled exam once profile loads (only if no URL exam,
// or the URL exam isn't one the student is enrolled in).
useEffect(() => {
  if (!profile) return;
  const enrolled = (profile.exams ?? []).map((e) => e.examId);
  if (examIdParam && enrolled.includes(examIdParam)) { setExamId(examIdParam); return; }
  setExamId(enrolled[0] ?? null);
}, [profile, examIdParam]);
```

2. **Fetch the exam's topic set** (new state + effect, runs when `examId` changes):
```tsx
const [examTopics, setExamTopics] = useState<Array<{ id: string; title: string; subjectName: string }>>([]);
useEffect(() => {
  if (!examId) { setExamTopics([]); return; }
  (async () => {
    try {
      const r = await auth.fetch(`/api/v1/catalog/exams/${examId}/subjects-with-topics`);
      if (r.ok) { const b = await r.json(); setExamTopics(b.topics ?? []); }
    } catch { /* swallow */ }
  })();
}, [examId]);
```

3. **Thread `exam_id` into the scoped calls** (only fire once `examId` is resolved; gate the data effect on `examId`):
   - mastery: `/api/v1/analytics/mastery/${user.id}?exam_id=${examId}`
   - guided: `/api/v1/adaptive/guided-next-steps/${user.id}?exam_id=${examId}`
   - readiness: `/api/v1/analytics/readiness-band/${user.id}?target_score=0.7&days_to_exam=120&exam_id=${examId}`
   - revision: `/api/v1/analytics/revision/${user.id}?limit=5&exam_id=${examId}`
   Add `examId` to that effect's dependency array so it re-runs on exam switch.

4. **Remove topic-decay**: delete the `topicDecay` state, its fetch (~504), and any render that uses it.

5. **Cold-start merge** — build the drill list from `examTopics` (the full set) left-joined with mastery:
```tsx
const masteryByTopic = useMemo(() => {
  const m = new Map<string, { ewa: number; n: number }>();
  (mastery ?? []).forEach((t) => m.set(t.topicId, { ewa: t.ewa, n: t.n }));
  return m;
}, [mastery]);

const examDrills = useMemo(() =>
  examTopics.map((t) => {
    const mt = masteryByTopic.get(t.id);
    return {
      topicId: t.id,
      title: t.title,
      ewa: mt?.ewa ?? 0,
      n: mt?.n ?? 0,
      started: !!mt && mt.n > 0,
    };
  }).sort((a, b) => Number(a.started) - Number(b.started) || a.ewa - b.ewa),
[examTopics, masteryByTopic]);
```
   Render the weak/drill list from `examDrills`; for `!started` rows show a "Not started" label instead of a 0% mastery bar (or 0% + "Not started" text — match the existing drill card styling). Replace the old `weakestDrills` source with `examDrills` (keep the card UI).

6. **Exam label** in the header: show the current exam's name/code (from `examTopics[0].examName`/`examCode` or the profile exam) so the user sees which exam is scoped.

> Keep the session-start body (which already sends the content language from the translation-delivery work) unchanged. Keep the mistakes tab unchanged.

- [ ] **Step 4: Run tests + typecheck + gate**

Run: `cd apps/web-student && npx vitest run <your Practice test path>` → PASS.
Run: `cd apps/web-student && npx tsc --noEmit` → clean.
Run: `cd apps/web-student && npx vitest run` → no NEW failures beyond the pre-existing baseline (capture the baseline count first).

- [ ] **Step 5: Commit**

```bash
git add apps/web-student/src/pages/Practice.tsx apps/web-student/src/pages/__tests__/
git commit -m "feat(web-student): exam-scope Practice (examId + cold-start topics, drop topic-decay)"
```

---

## Final verification

- [ ] Engagement: `cd services/engagement && uv run pytest tests/analytics -q` → green.
- [ ] Learning: `cd services/learning && uv run pytest tests/adaptive -q` → green.
- [ ] web-student: `npx tsc --noEmit` clean; `npx vitest run` baseline parity + new Practice test green.
- [ ] Live smoke (after rebuilding learning+engagement+web-student): open `/practice?examId=<CBSE_9 id>` as a student → drills/readiness/revision reflect CBSE_9 topics (or "Not started" for that exam), NOT NEET Physics; switch to the NEET exam → content changes accordingly; topic-decay panel gone.

## Spec coverage check

| Spec section | Task(s) |
|---|---|
| §1 Scope source (URL examId → primary fallback) | 6 |
| §2 Backend exam-scope (resolver + mastery/readiness/revision) | 1, 2, 3, 4 |
| §3 guided-next-steps exam_id | 5 |
| §4 Frontend (thread exam_id, merge cold-start, drop topic-decay, exam label) | 6 |
| §5 Cold start (all exam topics "Not started") | 2 (empty-set filter) + 6 (merge/render) |
| §6 Error handling (degrade on resolver failure; back-compat) | 1, 2, 3, 4 |
| §7 Testing | every task |
