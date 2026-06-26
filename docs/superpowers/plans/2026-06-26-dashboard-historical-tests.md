# Dashboard Historical Tests & Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake mock-history sparkline on the student exam dashboard with a real "Recent tests" list (mocks + practice, all exams) that deep-links to each attempt's review screen, and make the existing History page discoverable from the main nav.

**Architecture:** A new pure+fetch module (`lib/recentActivity.ts`) owns the data: it fetches the two real endpoints already used by `History.tsx`, normalizes them into a unified `RecentTest[]`, and merges/dedups/sorts. `ExamDetail.tsx` consumes it presentationally. `VidyaShell.tsx` gets a nav tweak. No backend changes; review/result screens are reused as-is.

**Tech Stack:** React 18 + TypeScript, React Router, Vitest. Auth/data via `auth.fetch` (`src/lib/api.ts`).

## Global Constraints

- App directory: `apps/web-student`. All paths below are relative to it.
- Test runner: `npx vitest run <path>` (script `"test": "vitest run"`).
- Data fetches use `auth.fetch(...)` returning a `Response` (`.ok`, `.json()`); every fetch is offline-tolerant (failure → empty list, never throws to the UI), matching `VidyaShell.tsx` / `History.tsx` patterns.
- Deep-link conventions (must match `History.tsx`): mock attempt → `/mock/result?attemptId=<id>`; practice session submitted/expired → `/quiz/<sessionId>/result`; practice session in-progress → `/quiz/<sessionId>`.
- Mock score percentage is computed as `round(rawScore / maxMarks * 100)` (consistent with `History.tsx:541`); the raw `accuracy` field is not used.
- Real endpoints: `GET /api/v1/profile/mock-attempts` → `{ items: MockAttempt[] }`; `GET /api/v1/quiz/sessions?userId=<id>&limit=<n>` → `{ items: Session[] }`.

---

### Task 1: `recentActivity.ts` — unified recent-tests data module

**Files:**
- Create: `src/lib/recentActivity.ts`
- Test: `src/lib/recentActivity.test.ts`

**Interfaces:**
- Consumes: `auth` from `src/lib/api.ts` (`auth.fetch`).
- Produces (relied on by Task 2):
  - `interface RecentTest { id: string; kind: "mock"|"practice"; title: string; topicId?: string; status: "IN_PROGRESS"|"SUBMITTED"|"EXPIRED"; scoreLabel: string|null; accuracyPct: number|null; when: string; href: string }`
  - `normalizeMockAttempt(a: RawMockAttempt): RecentTest`
  - `normalizePracticeSession(s: RawSession): RecentTest`
  - `mergeRecent(mocks: RawMockAttempt[], sessions: RawSession[], limit: number): RecentTest[]`
  - `relativeTime(iso: string): string`
  - `fetchRecentTests(userId: string, opts: { limit: number }): Promise<RecentTest[]>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/recentActivity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  mergeRecent,
  normalizeMockAttempt,
  normalizePracticeSession,
  type RawMockAttempt,
  type RawSession,
} from "./recentActivity";

const mock = (over: Partial<RawMockAttempt> = {}): RawMockAttempt => ({
  id: "m1",
  examCode: "NEET",
  examName: "NEET full mock",
  rawScore: 612,
  maxMarks: 720,
  createdAt: "2026-06-20T10:00:00.000Z",
  ...over,
});

const session = (over: Partial<RawSession> = {}): RawSession => ({
  sessionId: "s1",
  topicId: "t1",
  mode: "PRACTICE",
  status: "SUBMITTED",
  servedCount: 10,
  correctCount: 7,
  startedAt: "2026-06-21T10:00:00.000Z",
  ...over,
});

describe("normalizeMockAttempt", () => {
  it("builds score label, accuracy %, and review href", () => {
    const r = normalizeMockAttempt(mock());
    expect(r.kind).toBe("mock");
    expect(r.title).toBe("NEET full mock");
    expect(r.scoreLabel).toBe("612 / 720");
    expect(r.accuracyPct).toBe(85);
    expect(r.href).toBe("/mock/result?attemptId=m1");
    expect(r.status).toBe("SUBMITTED");
  });

  it("falls back to examCode then generic title", () => {
    expect(normalizeMockAttempt(mock({ examName: null })).title).toBe("NEET");
    expect(
      normalizeMockAttempt(mock({ examName: null, examCode: null })).title,
    ).toBe("Mock test");
  });

  it("guards divide-by-zero on maxMarks", () => {
    expect(normalizeMockAttempt(mock({ maxMarks: 0 })).accuracyPct).toBeNull();
  });
});

describe("normalizePracticeSession", () => {
  it("computes accuracy and result href when submitted", () => {
    const r = normalizePracticeSession(session());
    expect(r.kind).toBe("practice");
    expect(r.accuracyPct).toBe(70);
    expect(r.scoreLabel).toBeNull();
    expect(r.topicId).toBe("t1");
    expect(r.href).toBe("/quiz/s1/result");
  });

  it("routes in-progress sessions to the resume href", () => {
    expect(
      normalizePracticeSession(session({ status: "IN_PROGRESS" })).href,
    ).toBe("/quiz/s1");
  });

  it("returns null accuracy when nothing answered", () => {
    expect(
      normalizePracticeSession(session({ servedCount: 0, correctCount: 0 }))
        .accuracyPct,
    ).toBeNull();
  });
});

describe("mergeRecent", () => {
  it("drops MOCK-mode sessions, sorts newest first, and respects limit", () => {
    const out = mergeRecent(
      [mock({ id: "m1", createdAt: "2026-06-20T10:00:00.000Z" })],
      [
        session({ sessionId: "s1", startedAt: "2026-06-22T10:00:00.000Z" }),
        session({ sessionId: "sMock", mode: "MOCK", startedAt: "2026-06-23T10:00:00.000Z" }),
      ],
      5,
    );
    expect(out.map((r) => r.id)).toEqual(["s1", "m1"]); // sMock dropped, newest first
  });

  it("slices to the limit", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session({ sessionId: `s${i}`, startedAt: `2026-06-${10 + i}T00:00:00.000Z` }),
    );
    expect(mergeRecent([], sessions, 3)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/recentActivity.test.ts`
Expected: FAIL — `Failed to resolve import "./recentActivity"` / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/recentActivity.ts`:

```ts
// Recent test activity — a unified, normalized view over a student's mock
// attempts and practice sessions, used by the exam dashboard's "Recent
// tests" section. Fetch + normalize + merge live here (not the page) so the
// merge/dedup rules are unit-testable and reusable.
//
// Endpoints (both already consumed by pages/History.tsx):
//   GET /api/v1/profile/mock-attempts          -> { items: MockAttempt[] }
//   GET /api/v1/quiz/sessions?userId=<id>&limit -> { items: Session[] }
//
// Deep-link conventions match History.tsx so the existing review/result
// screens are reused.

import { auth } from "./api";

export type RecentTestKind = "mock" | "practice";
export type RecentTestStatus = "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";

export interface RecentTest {
  id: string;
  kind: RecentTestKind;
  title: string;
  topicId?: string;
  status: RecentTestStatus;
  scoreLabel: string | null; // e.g. "612 / 720" (mocks only)
  accuracyPct: number | null; // 0–100, null when nothing answered
  when: string; // ISO timestamp — used for sorting + display
  href: string; // deep-link to the review/result/resume screen
}

// Raw API shapes — only the fields we consume.
export interface RawMockAttempt {
  id: string;
  examCode?: string | null;
  examName?: string | null;
  rawScore: number;
  maxMarks: number;
  createdAt: string;
}

export interface RawSession {
  sessionId: string;
  topicId: string;
  mode: "PRACTICE" | "MOCK";
  status: RecentTestStatus;
  servedCount: number;
  correctCount: number;
  startedAt: string;
}

export function normalizeMockAttempt(a: RawMockAttempt): RecentTest {
  const accuracyPct =
    a.maxMarks > 0 ? Math.round((a.rawScore / a.maxMarks) * 100) : null;
  return {
    id: a.id,
    kind: "mock",
    title: a.examName ?? a.examCode ?? "Mock test",
    status: "SUBMITTED",
    scoreLabel: `${a.rawScore} / ${a.maxMarks}`,
    accuracyPct,
    when: a.createdAt,
    href: `/mock/result?attemptId=${a.id}`,
  };
}

export function normalizePracticeSession(s: RawSession): RecentTest {
  const accuracyPct =
    s.servedCount > 0
      ? Math.round((s.correctCount / s.servedCount) * 100)
      : null;
  const href =
    s.status === "IN_PROGRESS"
      ? `/quiz/${s.sessionId}`
      : `/quiz/${s.sessionId}/result`;
  return {
    id: s.sessionId,
    kind: "practice",
    title: "Practice",
    topicId: s.topicId,
    status: s.status,
    scoreLabel: null,
    accuracyPct,
    when: s.startedAt,
    href,
  };
}

// Mock attempts are authoritative for scored mocks; drop MOCK-mode sessions
// from quiz/sessions so they are not double-counted. Merge, sort newest
// first, slice to `limit`.
export function mergeRecent(
  mocks: RawMockAttempt[],
  sessions: RawSession[],
  limit: number,
): RecentTest[] {
  const rows: RecentTest[] = [
    ...mocks.map(normalizeMockAttempt),
    ...sessions
      .filter((s) => s.mode === "PRACTICE")
      .map(normalizePracticeSession),
  ];
  rows.sort((a, b) => Date.parse(b.when) - Date.parse(a.when));
  return rows.slice(0, limit);
}

export function relativeTime(iso: string): string {
  try {
    const delta = Date.now() - new Date(iso).getTime();
    const m = Math.floor(delta / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

async function fetchMockAttempts(): Promise<RawMockAttempt[]> {
  try {
    const r = await auth.fetch(`/api/v1/profile/mock-attempts`);
    if (!r.ok) return [];
    const body = (await r.json()) as
      | RawMockAttempt[]
      | { items?: RawMockAttempt[] | null };
    return Array.isArray(body)
      ? body
      : Array.isArray(body.items)
        ? body.items
        : [];
  } catch {
    return [];
  }
}

async function fetchSessions(userId: string): Promise<RawSession[]> {
  try {
    const r = await auth.fetch(
      `/api/v1/quiz/sessions?userId=${encodeURIComponent(userId)}&limit=100`,
    );
    if (!r.ok) return [];
    const body = (await r.json()) as { items?: RawSession[] | null };
    return Array.isArray(body.items) ? body.items : [];
  } catch {
    return [];
  }
}

export async function fetchRecentTests(
  userId: string,
  opts: { limit: number },
): Promise<RecentTest[]> {
  const [mocks, sessions] = await Promise.all([
    fetchMockAttempts(),
    fetchSessions(userId),
  ]);
  return mergeRecent(mocks, sessions, opts.limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/recentActivity.test.ts`
Expected: PASS — all tests in 3 describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recentActivity.ts src/lib/recentActivity.test.ts
git commit -m "feat(web-student): recentActivity module for unified mock+practice history"
```

---

### Task 2: Wire real "Recent tests" into the exam dashboard

**Files:**
- Modify: `src/pages/ExamDetail.tsx` (remove stub `deriveMockHistory` ~lines 620-632 + its use ~348-360; replace the `MockTestSparkline` block ~518-544; remove the `MockTestSparkline` import line 33)

**Interfaces:**
- Consumes (from Task 1): `fetchRecentTests`, `relativeTime`, `type RecentTest`.
- Produces: none (presentational; logic covered by Task 1's tests).

- [ ] **Step 1: Add the import**

In `src/pages/ExamDetail.tsx`, replace the dashboardParts import block (lines 30-34):

```tsx
import {
  GoalBar,
  SubjectCoverage,
} from "../components/vidya/dashboardParts";
import {
  fetchRecentTests,
  relativeTime,
  type RecentTest,
} from "../lib/recentActivity";
```

(`MockTestSparkline` is removed from the import — it is no longer used.)

- [ ] **Step 2: Replace the stub state with a real fetch**

Replace the mock-history `useMemo` block (lines ~348-360, the `mockScores` + `mockStats` memos):

```tsx
  // Recent tests (real) — unified mock + practice history across all exams.
  const [recentTests, setRecentTests] = useState<RecentTest[] | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    void fetchRecentTests(user.id, { limit: 5 }).then((rows) => {
      if (alive) setRecentTests(rows);
    });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  // Mock-only stat strip (latest/best/avg/taken) from real scored mocks.
  const mockStats = useMemo(() => {
    if (!recentTests) return null;
    const scores = recentTests
      .filter((r) => r.kind === "mock" && r.accuracyPct !== null)
      .map((r) => r.accuracyPct as number);
    if (!scores.length) return null;
    const latest = scores[0]!; // recentTests is newest-first
    const best = Math.max(...scores);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    return { latest, best, avg, count: scores.length };
  }, [recentTests]);
```

- [ ] **Step 3: Replace the sparkline render block**

Replace the heading sub-label + sparkline + stats block (lines ~518-544, from `<div className="vidya-mocks__sub">Recent attempts</div>` through the closing of the `mockStats ?` block):

```tsx
          <div className="vidya-mocks__sub">Recent tests</div>
          {recentTests === null ? (
            <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Loading…</p>
          ) : recentTests.length === 0 ? (
            <p style={{ color: "var(--ink-3)", fontSize: 13 }}>
              No tests yet — start a mock or a practice session to see your
              history and review mistakes here.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--sp-2)",
                marginBottom: "var(--sp-3)",
              }}
            >
              {recentTests.map((r) => {
                const label =
                  r.kind === "practice" && r.topicId
                    ? topics.find((t) => t.id === r.topicId)?.title ?? r.title
                    : r.title;
                return (
                  <div
                    key={`${r.kind}-${r.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(r.href)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(r.href);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--sp-3)",
                      padding: "var(--sp-2) var(--sp-3)",
                      border: "1px solid var(--rule)",
                      borderRadius: 10,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>
                        {label}
                      </p>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--ink-3)",
                          marginTop: 2,
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        <span>{r.kind === "mock" ? "Mock" : "Practice"}</span>
                        <span>·</span>
                        <span>
                          {r.status === "IN_PROGRESS"
                            ? "In progress"
                            : r.scoreLabel
                              ? r.scoreLabel
                              : r.accuracyPct !== null
                                ? `${r.accuracyPct}%`
                                : "—"}
                        </span>
                        <span>·</span>
                        <span>{relativeTime(r.when)}</span>
                      </div>
                    </div>
                    <span className="vidya-shell__chip" style={{ flexShrink: 0 }}>
                      {r.status === "IN_PROGRESS" ? "Resume →" : "Review →"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {mockStats ? (
            <div className="vidya-mocks__stats">
              <div>
                <div className="vidya-mocks__stat-label">Latest</div>
                <div className="vidya-mocks__stat-value">{mockStats.latest}%</div>
              </div>
              <div>
                <div className="vidya-mocks__stat-label">Best</div>
                <div
                  className="vidya-mocks__stat-value"
                  style={{ color: "var(--good)" }}
                >
                  {mockStats.best}%
                </div>
              </div>
              <div>
                <div className="vidya-mocks__stat-label">Avg</div>
                <div className="vidya-mocks__stat-value">{mockStats.avg}%</div>
              </div>
              <div>
                <div className="vidya-mocks__stat-label">Mocks taken</div>
                <div className="vidya-mocks__stat-value">{mockStats.count}</div>
              </div>
            </div>
          ) : null}
```

- [ ] **Step 4: Delete the dead stub helper**

Delete the `deriveMockHistory` function (the `function deriveMockHistory(currentReadiness: number) { ... }` block near the end of the file, ~lines 620-632) and any remaining reference to `mockScores`. Confirm none remain:

Run: `grep -n "deriveMockHistory\|mockScores\|MockTestSparkline" src/pages/ExamDetail.tsx`
Expected: no output.

- [ ] **Step 5: Verify typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean (no errors); all tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/pages/ExamDetail.tsx
git commit -m "feat(web-student): real Recent tests section on exam dashboard"
```

---

### Task 3: Surface History in the main nav

**Files:**
- Modify: `src/components/vidya/VidyaShell.tsx` (Progress nav group ~lines 116-124; avatar dropdown list ~lines 302-309)

**Interfaces:**
- Consumes: existing `IconClock` (already imported — used by the dropdown today).
- Produces: none.

- [ ] **Step 1: Add History to the Progress nav group**

In `buildNav`, change the Progress group (lines ~116-124) to include History as the first item:

```tsx
    {
      heading: "Progress",
      items: [
        { href: "/history", label: "History", icon: <IconClock /> },
        { href: "/analysis", label: "My analysis", icon: <IconChart /> },
        { href: "/insights", label: "Insights", icon: <IconSparkles /> },
        { href: "/syllabus", label: "Syllabus", icon: <IconLibrary /> },
        { href: "/rank", label: "Rank predictor", icon: <IconTrophy /> },
      ],
    },
```

- [ ] **Step 2: Remove the redundant History entry from the avatar dropdown**

In the avatar dropdown list (lines ~302-309), remove the History row so it reads:

```tsx
              {(
                [
                  { href: "/search",    label: "Search",   icon: <IconSearch /> },
                  { href: "/bookmarks", label: "Saved",    icon: <IconStar /> },
                  { href: "/profile",   label: "Profile",  icon: <IconUser /> },
                  { href: "/settings",  label: "Settings", icon: <IconCog /> },
                ] as const
              ).map(({ href, label, icon }) => (
```

- [ ] **Step 3: Verify typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass. (If `IconClock` reports unused, it is still used by the new Progress item — confirm it is referenced.)

- [ ] **Step 4: Commit**

```bash
git add src/components/vidya/VidyaShell.tsx
git commit -m "feat(web-student): surface History in main Progress nav"
```

---

## Self-Review

**Spec coverage:**
- "Dashboard's Recent attempts is fake" → Task 2 removes `deriveMockHistory`/sparkline, renders real `fetchRecentTests` rows. ✓
- "Unified mock + practice, all exams" → Task 1 `mergeRecent` (no exam filter), Task 2 limit 5. ✓
- "Deep-link to review screens" → Task 1 `href` per convention; Task 2 row `onClick`. ✓
- "Real 4-stat strip" → Task 2 `mockStats` from real mock rows. ✓
- "Empty state" → Task 2 Step 3 empty branch. ✓
- "Surface History in Progress nav; remove from dropdown" → Task 3. ✓
- "Unit tests for normalize/merge incl. dedup, sort, limit, href, divide-by-zero" → Task 1 Step 1. ✓
- "Offline-tolerant fetches" → Task 1 `fetchMockAttempts`/`fetchSessions` try/catch → []. ✓
- Out of scope (no backend, no History redesign, no exam filter, no per-mistake breakdown) → honored. ✓

**Placeholder scan:** No TBD/TODO; all code steps include full code. ✓

**Type consistency:** `RecentTest` shape, `fetchRecentTests(userId, {limit})`, `relativeTime` used identically across Task 1 (definition) and Task 2 (consumption). Mock stats use `accuracyPct` (0–100). ✓
