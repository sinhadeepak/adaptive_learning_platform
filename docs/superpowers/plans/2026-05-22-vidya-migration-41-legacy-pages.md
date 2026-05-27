# Vidya Migration — 41 Legacy Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 41 student-portal pages that still use the legacy `<AppShell>` adapter (chrome-only Vidya) to native `<VidyaShell>` (full Vidya design language — slots, tokens, primitives).

**Architecture:** The 41 pages currently wrap their content in `<AppShell title="…">`, which the recently-introduced adapter forwards to VidyaShell so the sidebar and topbar look Vidya. But the page bodies still use Aurora-era classes (`pg-shell`, `pg-card`, `pg-filter-row`, `pg-grid`, `pg-empty`, `banner`, etc.). This plan replaces each page's body with Vidya primitives (`vidya-shell__chip`, `vidya-grid-N`, `vidya-card-block`, `vidya-heat-card`) and uses VidyaShell's `crumbs / title / subtitle / chips / actions` slots in place of the duplicated in-page `<header className="pg-header">` blocks.

**Tech Stack:** React 19, TypeScript 5, Vite, `@alp/ui` primitives, `@alp/design-system` (Vidya tokens at `packages/design-system/src/vidya/tokens.css`), `vidya-*` utility classes from `packages/design-system/src/shell.css`.

---

## Reference: the migration pattern

### Slot mapping

| Legacy (Aurora `pg-*`)                      | Vidya equivalent                                                  |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `<AppShell title="X">`                      | `<VidyaShell crumbs="…" title="X" subtitle="…" chips={…} actions={…}>` |
| `<div className="pg-shell">`                | *delete* — VidyaShell provides layout                              |
| `<header className="pg-header">…</header>`  | *delete* — move title/subtitle into VidyaShell slots               |
| `pg-header-actions` (right side)            | `actions={…}` slot                                                |
| `pg-filter-row`                             | `<div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>` |
| `pg-filter-chips` / `pg-chip` / `pg-chip.on`| `vidya-shell__chip` / `vidya-shell__chip--on`                     |
| `pg-search` + `pg-search-input`             | Vidya-styled inline `<input>` (see snippet below)                 |
| `pg-filter-sort` + `pg-filter-select`       | Vidya-styled inline `<select>` (see snippet below)                |
| `pg-grid`                                   | `vidya-grid-2` (2 cols) or `vidya-grid-3` (3 cols)                |
| `pg-card`                                   | `vidya-card-block` with `vidya-card-block__head` + `__title`      |
| `pg-card-thumb`                             | keep as a styled inner div; use design-token gradients            |
| `pg-empty` + `pg-empty-icon/title/body`     | Vidya empty-state pattern (snippet below)                          |
| `pg-btn` / `pg-btn-ghost`                   | `vidya-shell__chip` (ghost) or `vidya-shell__primary` (CTA)       |
| `banner banner-error`                       | inline `<div role="alert" style={{ background: "var(--bad)", color: "var(--paper)", … }}>` |

### Canonical snippets

**Vidya-styled search input** (replaces `pg-search`):

```tsx
<input
  type="search"
  placeholder="Search by name or expertise…"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  style={{
    flex: "1 1 240px",
    minWidth: 200,
    padding: "8px 12px",
    background: "var(--paper)",
    border: "1px solid var(--rule)",
    borderRadius: "var(--r-md, 8px)",
    color: "var(--ink)",
    fontSize: 13,
  }}
/>
```

**Vidya-styled select** (replaces `pg-filter-select`):

```tsx
<select
  value={sort}
  onChange={(e) => setSort(e.target.value as SortKey)}
  style={{
    padding: "7px 10px",
    background: "var(--paper)",
    border: "1px solid var(--rule)",
    borderRadius: "var(--r-md, 8px)",
    color: "var(--ink)",
    fontSize: 13,
  }}
>
  …options
</select>
```

**Vidya empty state** (replaces `pg-empty`):

```tsx
<section
  style={{
    textAlign: "center",
    padding: "var(--sp-6) var(--sp-4)",
    background: "var(--card)",
    border: "1px solid var(--rule)",
    borderRadius: "var(--r-lg, 14px)",
  }}
>
  <div style={{ fontSize: 36, marginBottom: "var(--sp-2)" }} aria-hidden>🔎</div>
  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
    No tutors match these filters
  </h2>
  <p style={{ margin: "var(--sp-2) auto var(--sp-3)", maxWidth: 460, fontSize: 13, color: "var(--ink-2)" }}>
    Try raising the price ceiling, clearing the search, or switching to "All tiers".
  </p>
  <button type="button" className="vidya-shell__chip" onClick={resetFilters}>
    Reset filters
  </button>
</section>
```

**Vidya tutor/course card** (replaces `pg-card`):

```tsx
<Link to={`/tutors/${t.userId}`} className="vidya-card-block" style={{ textDecoration: "none", color: "inherit" }}>
  <div style={{
    height: 110,
    background: tintFor(t.userId),
    borderRadius: "var(--r-md, 8px) var(--r-md, 8px) 0 0",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--paper)", fontSize: 48, fontWeight: 700,
  }}>
    {initialFor(t.displayName)}
  </div>
  <div className="vidya-card-block__head" style={{ marginTop: "var(--sp-3)" }}>
    <h3 className="vidya-card-block__title">{t.displayName}</h3>
  </div>
  <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "var(--sp-1) 0 var(--sp-2)" }}>
    {t.headline}
  </p>
  <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
    <span className="vidya-shell__chip">📚 {subjectCount} subjects</span>
    <span className="vidya-shell__chip">{tierLabel}</span>
  </div>
  <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "baseline",
    paddingTop: "var(--sp-3)", borderTop: "1px solid var(--rule)",
  }}>
    <div>
      <strong style={{ fontSize: 18 }}>{paiseToRupees(t.hourlyRatePaise)}</strong>
      <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 4 }}>/hr</span>
    </div>
    <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
      {t.ratingAvg ? `★ ${t.ratingAvg.toFixed(1)} (${t.ratingCount})` : "New tutor"}
    </span>
  </div>
</Link>
```

---

## Tranche overview

| # | Tranche      | Pages | Status | Plan section |
|---|--------------|-------|--------|--------------|
| 1 | Marketplace  | 7     | DETAILED tasks | Task 1.1–1.7 |
| 2 | Practice     | 9     | Pattern + page list | Task 2 |
| 3 | Insight      | 4     | Pattern + page list | Task 3 |
| 4 | Compete      | 4     | Pattern + page list | Task 4 |
| 5 | Learn        | 8     | Pattern + page list | Task 5 |
| 6 | Me / Other   | 9     | Pattern + page list | Task 6 |

**Execution order:** Tranche 1 first (it's the user's complaint and establishes/refines the pattern). After Tranche 1 ships and the user confirms the visual result, expand the detailed steps for Tranche 2 from the pattern, then proceed through 3–6.

After ALL tranches ship, delete the legacy `pg-*` CSS from `shell.css` and delete the `<AppShell>` adapter file — but only at the very end, with a verification step that no other consumer remains.

---

## Phase 0: Establish pattern (Task 0)

### Task 0: Verify the migration pattern works on one canonical page (Tutors)

This is a dry-run to validate the snippets above. If anything in the pattern doesn't translate cleanly, fix the snippets here before proceeding to the rest of the tranche.

**Files:**
- Modify: `apps/web-student/src/pages/Tutors.tsx`

- [ ] **Step 0.1: Snapshot the legacy Tutors page** — load `localhost:35173/tutors` in the browser, take a screenshot, save as `docs/superpowers/specs/migration-snapshots/tutors-before.png`. This is the visual baseline.

- [ ] **Step 0.2: Replace the `AppShell` import**

  In `apps/web-student/src/pages/Tutors.tsx` line 9, change:
  ```tsx
  import { AppShell } from "../components/AppShell";
  ```
  to:
  ```tsx
  import { VidyaShell } from "../components/vidya/VidyaShell";
  ```

- [ ] **Step 0.3: Replace the wrapper, slots, and `pg-shell` div**

  Replace lines 82–99 (the `<AppShell>` wrapper + `<div className="pg-shell">` + `<header className="pg-header">…</header>` block) with:

  ```tsx
  return (
    <VidyaShell
      crumbs="MARKETPLACE · FIND A TUTOR"
      title="Find a tutor"
      subtitle="Browse vetted 1:1 tutors. Filter by price and seniority; tap any card to see qualifications, weekly availability, and book a session."
      chips={
        <>
          {(["all", "premium", "standard"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`vidya-shell__chip${tierFilter === t ? " vidya-shell__chip--on" : ""}`}
              onClick={() => setTierFilter(t)}
            >
              {t === "all" ? "All tiers" : t === "premium" ? "Premium verified" : "Standard"}
            </button>
          ))}
        </>
      }
      actions={
        <Link to="/bookings" className="vidya-shell__chip">
          My bookings
        </Link>
      }
    >
  ```

  And replace the closing `</div></AppShell>` with `</VidyaShell>`.

- [ ] **Step 0.4: Replace the filter row (lines 101–150)**

  Replace the entire `<div className="pg-filter-row">…</div>` with:

  ```tsx
  <div style={{
    display: "flex",
    gap: "var(--sp-3)",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: "var(--sp-4)",
  }}>
    <input
      type="search"
      placeholder="Search by name or expertise…"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      style={{
        flex: "1 1 240px",
        minWidth: 200,
        padding: "8px 12px",
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        color: "var(--ink)",
        fontSize: 13,
      }}
    />
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "var(--ink-3)" }}>
      <span>Max ₹{maxRate.toLocaleString("en-IN")}</span>
      <input
        type="range"
        min={100}
        max={5000}
        step={100}
        value={maxRate}
        onChange={(e) => setMaxRate(parseInt(e.target.value, 10))}
        style={{ width: 160 }}
      />
    </label>
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" }}>
      <span>SORT</span>
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as SortKey)}
        style={{
          padding: "7px 10px",
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          borderRadius: 8,
          color: "var(--ink)",
          fontSize: 13,
        }}
      >
        <option value="price-asc">Price · low to high</option>
        <option value="price-desc">Price · high to low</option>
        <option value="rating">Top rated</option>
        <option value="newest">Newest</option>
      </select>
    </label>
  </div>
  ```

- [ ] **Step 0.5: Replace the error banner (line 152)**

  ```tsx
  {error && (
    <div role="alert" style={{
      padding: "var(--sp-3) var(--sp-4)",
      marginBottom: "var(--sp-4)",
      background: "var(--bad)",
      color: "var(--paper)",
      borderRadius: 8,
      fontSize: 13,
    }}>
      {error}
    </div>
  )}
  ```

- [ ] **Step 0.6: Replace the loading skeleton (lines 154–165)**

  ```tsx
  {items === null && !error && (
    <div className="vidya-grid-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="vidya-card-block"
          style={{ minHeight: 220, opacity: 0.5 }}
          aria-hidden
        />
      ))}
    </div>
  )}
  ```

- [ ] **Step 0.7: Replace the empty state (lines 167–187)**

  ```tsx
  {filtered !== null && filtered.length === 0 && (
    <section style={{
      textAlign: "center",
      padding: "var(--sp-6) var(--sp-4)",
      background: "var(--card)",
      border: "1px solid var(--rule)",
      borderRadius: 14,
    }}>
      <div style={{ fontSize: 36, marginBottom: "var(--sp-2)" }} aria-hidden>🔎</div>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
        No tutors match these filters
      </h2>
      <p style={{ margin: "var(--sp-2) auto var(--sp-3)", maxWidth: 460, fontSize: 13, color: "var(--ink-2)" }}>
        Try raising the price ceiling, clearing the search, or switching to "All tiers". New tutors join every week.
      </p>
      <button
        type="button"
        className="vidya-shell__chip"
        onClick={() => {
          setSearch("");
          setMaxRate(5000);
          setTierFilter("all");
        }}
      >
        Reset filters
      </button>
    </section>
  )}
  ```

- [ ] **Step 0.8: Replace the card grid (lines 189–end of return)**

  **Intentional drop:** the Aurora-era floating `★ Verified` ribbon that overlaid the thumb on premium cards is NOT carried forward. The chip-row "Premium verified" pill provides this signal in Vidya's chip-based tagging idiom; doubling it up as a thumb overlay is Aurora vocabulary.


  ```tsx
  {filtered !== null && filtered.length > 0 && (
    <div className="vidya-grid-3">
      {filtered.map((t) => {
        const isPremium = t.tier === "PREMIUM_VERIFIED";
        const subjectCount = t.topicIds?.length ?? 0;
        return (
          <Link
            key={t.userId}
            to={`/tutors/${t.userId}`}
            className="vidya-card-block"
            style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column" }}
          >
            <div style={{
              height: 110,
              background: tintFor(t.userId),
              borderRadius: "8px 8px 0 0",
              margin: "calc(-1 * var(--sp-4)) calc(-1 * var(--sp-4)) var(--sp-3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 48, fontWeight: 700,
            }}>
              {initialFor(t.displayName)}
            </div>
            <div className="vidya-card-block__head">
              <h3 className="vidya-card-block__title">{t.displayName}</h3>
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "var(--sp-1) 0 var(--sp-2)" }}>
              {t.headline ?? "—"}
            </p>
            <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
              <span className="vidya-shell__chip">📚 {subjectCount} subject{subjectCount === 1 ? "" : "s"}</span>
              <span className="vidya-shell__chip">{isPremium ? "Premium verified" : "Standard tier"}</span>
            </div>
            <div style={{
              marginTop: "auto",
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              paddingTop: "var(--sp-3)", borderTop: "1px solid var(--rule)",
            }}>
              <div>
                <strong style={{ fontSize: 18 }}>{paiseToRupees(t.hourlyRatePaise)}</strong>
                <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 4 }}>/hr</span>
              </div>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {t.ratingAvg ? `★ ${t.ratingAvg.toFixed(1)} (${t.ratingCount})` : "New tutor"}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  )}
  ```

- [ ] **Step 0.9: Verify type-check passes**

  Run: `pnpm --filter @alp/web-student typecheck`
  Expected: PASS (no new errors).

- [ ] **Step 0.10: Rebuild + recreate web-student**

  ```bash
  docker compose -f infrastructure/docker/docker-compose.yml build web-student
  docker compose -f infrastructure/docker/docker-compose.yml up -d --force-recreate web-student
  ```

- [ ] **Step 0.11: Visual verification**

  Load `localhost:35173/tutors`, hard-reload (Ctrl+Shift+R). Take a screenshot and save as `docs/superpowers/specs/migration-snapshots/tutors-after.png`. Compare to baseline. Confirm:
  - VidyaShell title/subtitle replaces in-page `<h1><p>` block
  - Sidebar unchanged
  - Tier filter chips work and toggle the `--on` state
  - Search/range/sort all functional
  - Card grid renders with Vidya borders/typography
  - Empty state renders correctly when filters yield 0 results
  - Error banner only appears on backend failure

- [ ] **Step 0.12: Commit the pattern**

  ```bash
  git add apps/web-student/src/pages/Tutors.tsx
  git commit -m "refactor(vidya): migrate Tutors page to VidyaShell + Vidya primitives (pattern reference)"
  ```

---

## Phase 1: Marketplace tranche (Tasks 1.1–1.7)

After Task 0 validates the pattern, apply it to the remaining 6 Marketplace pages.

### Task 1.1: Courses.tsx

**File:** `apps/web-student/src/pages/Courses.tsx` (286 lines)

The page mirrors Tutors layout (same `pg-shell → pg-header → pg-filter-row → pg-grid of pg-cards` structure per its own header comment). The Vidya translation is structurally identical to Tutors but the chip filter is `["all", "free", "under-200", "200-500", "500-plus"]` price buckets and the sort options differ.

- [ ] **Step 1.1.1:** Read `apps/web-student/src/pages/Courses.tsx` end-to-end.
- [ ] **Step 1.1.2:** Apply Steps 0.2–0.8 with these per-page substitutions:
  - `crumbs="MARKETPLACE · COURSES"`
  - `title="Self-paced courses"`
  - `subtitle="Asynchronous content authored by community creators. Work at your own pace; rate the course after you finish."`
  - `actions={<><Link to="/tutors" className="vidya-shell__chip">Live 1:1 tutoring →</Link><Link to="/courses-mine" className="vidya-shell__chip">My purchases</Link></>}`
  - chip values: price buckets per existing `PriceBucket` type
- [ ] **Step 1.1.3:** Run `pnpm --filter @alp/web-student typecheck`. Expect PASS.
- [ ] **Step 1.1.4:** Rebuild + recreate web-student (commands from Step 0.10).
- [ ] **Step 1.1.5:** Visually verify at `localhost:35173/courses`.
- [ ] **Step 1.1.6:** Commit: `refactor(vidya): migrate Courses page to VidyaShell + Vidya primitives`.

### Task 1.2: MyBookings.tsx

**File:** `apps/web-student/src/pages/MyBookings.tsx` (327 lines)

This page has tabs (Upcoming / Past / Cancelled) and a list-of-bookings layout (no card grid). Tabs become a `chips` row in VidyaShell; the list uses `vidya-card-block` rows instead of `vidya-grid-3`.

- [ ] **Step 1.2.1:** Read the file.
- [ ] **Step 1.2.2:** Apply the same pattern with:
  - `crumbs="MARKETPLACE · MY BOOKINGS"`
  - `title="My bookings"`
  - `subtitle="Your scheduled 1:1 tutor sessions. Join live sessions directly from this page; cancellations up to 24h before the slot are fully refundable."`
  - `chips={tabs.map(…)}` for Upcoming/Past/Cancelled
  - `actions={<Link to="/tutors" className="vidya-shell__primary">+ Book a tutor</Link>}`
  - Bookings list as a `<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>` of `vidya-card-block` rows.
- [ ] **Step 1.2.3:** Typecheck, rebuild, recreate, verify at `localhost:35173/bookings`.
- [ ] **Step 1.2.4:** Commit: `refactor(vidya): migrate MyBookings page to VidyaShell + Vidya primitives`.

### Task 1.3: MyPurchases.tsx

**File:** `apps/web-student/src/pages/MyPurchases.tsx`

Course list. Similar to MyBookings shape; reuse the row pattern.

- [ ] Steps 1.3.1–1.3.4 mirror Task 1.2 with `crumbs="MARKETPLACE · MY PURCHASES"`, `title="My purchases"`, no tabs needed unless the page already has them.

### Task 1.4: TutorDetail.tsx

**File:** `apps/web-student/src/pages/TutorDetail.tsx`

Single tutor detail view (hero + sections). Uses `vidya-heat-card` for the hero (mirrors Leaderboards hero pattern), `vidya-card-block` for each section (qualifications / availability / reviews / book CTA).

- [ ] Steps 1.4.1–1.4.4 with `crumbs="MARKETPLACE · TUTOR · <name>"`, page-specific sections in `vidya-card-block` containers.

### Task 1.5: CourseDetail.tsx

**File:** `apps/web-student/src/pages/CourseDetail.tsx`

Course landing page. Hero card with course gradient + initial + price/CTA; sections for syllabus / what you'll learn / reviews. Same pattern as TutorDetail.

### Task 1.6: CourseRead.tsx

**File:** `apps/web-student/src/pages/CourseRead.tsx`

Course content reader (lesson view). Likely needs a left rail (lesson list) + main content area. Use a 2-column inline layout — left column for lesson nav, right for content. Use `vidya-card-block` for the lesson body.

### Task 1.7: Marketplace tranche checkpoint

- [ ] **Step 1.7.1:** Spot-check all 7 Marketplace pages in the browser (Tutors, Courses, MyBookings, MyPurchases, TutorDetail, CourseDetail, CourseRead). Confirm each looks consistent with Vidya design and with each other.
- [ ] **Step 1.7.2:** Confirm `pnpm --filter @alp/web-student typecheck` is clean.
- [ ] **Step 1.7.3:** Pause and get user sign-off on the Marketplace tranche before proceeding to Tranche 2.

---

## Phase 2: Practice tranche (9 pages)

Apply the same pattern. Pages:

| File                                | Crumbs                            | Title                       | Notes                                                                       |
|-------------------------------------|-----------------------------------|-----------------------------|-----------------------------------------------------------------------------|
| `Practice.tsx`                      | `PRACTICE · WORKOUT`              | "Practice"                  | Topic picker + start CTA. Chips = mode filters (concept/decay/PYQ).         |
| `StudyPlan.tsx`                     | `PRACTICE · PLAN`                 | "Study plan"                | Already partially Vidya (Plan editor). Confirm slots used correctly.        |
| `MockExam.tsx`                      | `PRACTICE · MOCK`                 | "Mock test"                 | Form-heavy. Use vidya-card-block sections.                                  |
| `MockResult.tsx`                    | `PRACTICE · MOCK · RESULT`        | "Mock result"               | Score hero + section breakdown. Use vidya-heat-card for hero.               |
| `MyTests.tsx`                       | `PRACTICE · MY TESTS`             | "My tests"                  | List + AI-suggested chips. The recent commit (925c072) merged AISuggestedTests in. |
| `TestBuilder.tsx`                   | `PRACTICE · BUILD A TEST`         | "Build a test"              | Form. Sections in vidya-card-block.                                         |
| `Flashcards.tsx`                    | `PRACTICE · FLASHCARDS`           | "Flashcards"                | Card-flip UI. Keep flip behavior, restyle outer frame.                      |
| `DiagnosticPlacement.tsx`           | `PRACTICE · DIAGNOSTIC`           | "Diagnostic placement"      | Question runner with start CTA. Use vidya-heat-card for instructions.       |
| `DiagnosticDeepDive.tsx`            | `PRACTICE · DIAGNOSTIC · DEEP DIVE` | "Diagnostic deep dive"    | Result drill-down. Mirrors MockResult layout.                               |

For EACH page, run the same 6 steps from Task 1.1:
1. Read the file
2. Apply pattern (import, slots, filter row, error banner, empty state, content)
3. Typecheck
4. Rebuild + recreate web-student
5. Visually verify at `/<route>`
6. Commit per-page with message `refactor(vidya): migrate <Page> to VidyaShell + Vidya primitives`

Practice tranche checkpoint: pause for user sign-off after all 9 ship.

---

## Phase 3: Insight tranche (4 pages)

| File                                | Crumbs                          | Title                  | Notes                                                  |
|-------------------------------------|---------------------------------|------------------------|--------------------------------------------------------|
| `Insights.tsx`                      | `INSIGHT · ANALYTICS`           | "Insights"             | Chart-heavy. Use vidya-card-block for each chart card. |
| `RevisionRitual.tsx`                | `INSIGHT · REVISION RITUAL`     | "Revision ritual"      | Already has dedicated revision-ritual CSS in shell.css. Migrate outer shell only; preserve internal ritual UI. |
| `SessionDeepDive.tsx`               | `INSIGHT · SESSION DEEP DIVE`   | "Session deep dive"    | Per-session breakdown. Tabbed sections.                |
| `StudyPortfolio.tsx`                | `INSIGHT · STUDY PORTFOLIO`     | "Study portfolio"      | Mastery summary. Use vidya-heat-card for hero.         |

Same 6 steps per page. Checkpoint at end.

---

## Phase 4: Compete tranche (4 pages)

| File              | Crumbs                  | Title           | Notes                                                       |
|-------------------|-------------------------|-----------------|-------------------------------------------------------------|
| `Battle.tsx`      | `COMPETE · BATTLE`      | "Battle"        | Lobby + active battle view. Two-mode (idle vs in-battle).    |
| `Clans.tsx`       | `COMPETE · CLANS`       | "Clans"         | Clan list. Card grid (vidya-grid-3).                         |
| `ClanDetail.tsx`  | `COMPETE · CLAN · <name>` | "Clan"        | Roster + activity feed. Hero + sections.                     |
| `Friends.tsx`     | `COMPETE · FRIENDS`     | "Friends"       | Friend list + requests. Tabbed (chips row).                  |

Same 6 steps per page. Checkpoint at end.

---

## Phase 5: Learn tranche (8 pages)

| File                  | Crumbs                          | Title                | Notes                                                          |
|-----------------------|---------------------------------|----------------------|----------------------------------------------------------------|
| `Catalog.tsx`         | `LEARN · CATALOG`               | "Catalog"            | Exam grid. vidya-grid-3.                                       |
| `CatalogExam.tsx`     | `LEARN · CATALOG · <exam>`      | "<Exam name>"        | Subject list. vidya-grid-2 or 3.                               |
| `Library.tsx`         | `LEARN · LIBRARY`               | "Library"            | Saved-content list with filter chips.                          |
| `Doubts.tsx`          | `LEARN · DOUBTS`                | "Doubts"             | Doubt list with status chips.                                   |
| `DoubtDetail.tsx`     | `LEARN · DOUBT · <id-short>`    | "Doubt"              | Thread view. Single column.                                     |
| `TopicDetail.tsx`     | `LEARN · TOPIC · <name>`        | "<Topic name>"       | Drill-down with sub-sections.                                   |
| `ConceptProfile.tsx`  | `LEARN · CONCEPT · <name>`      | "<Concept name>"     | Per-concept analytics. Hero + sections.                         |
| `TutorChatHistory.tsx`| `LEARN · AI TUTOR · HISTORY`    | "Chat history"       | Conversation list. List rows in vidya-card-block.               |

Same 6 steps per page.

---

## Phase 6: Me / Other tranche (9 pages)

| File                       | Crumbs                       | Title                  | Notes                                                  |
|----------------------------|------------------------------|------------------------|--------------------------------------------------------|
| `Bookmarks.tsx`            | `ME · BOOKMARKS`             | "Bookmarks"            | Filter chips by content type.                          |
| `History.tsx`              | `ME · HISTORY`               | "History"              | Activity timeline.                                     |
| `Inbox.tsx`                | `ME · INBOX`                 | "Inbox"                | Notification list. Read/unread chips.                  |
| `Search.tsx`               | `ME · SEARCH`                | "Search"               | Query + results. Search input prominent.               |
| `Billing.tsx`              | `ME · BILLING`               | "Billing"              | Plan + invoices.                                       |
| `SharedTestLanding.tsx`    | (no crumbs — public landing) | "Take this test"       | Public route; keep simpler header.                     |
| `JoinCohort.tsx`           | (no crumbs — public landing) | "Join cohort"          | Public route; keep simpler header.                     |
| `Assignments.tsx`          | `LEARN · ASSIGNMENTS`        | "Assignments"          | Could move to LEARN nav, but file is in "Me" group for now. |
| `AssignmentDetail.tsx`     | `LEARN · ASSIGNMENT · <id>`  | "<Assignment title>"   | Submission view.                                        |

Same 6 steps per page.

---

## Phase 7: Cleanup (final tranche)

### Task 7: Remove dead legacy code

After ALL 41 pages migrate and pass visual verification:

- [ ] **Step 7.1:** `grep -l "from \"../components/AppShell\"" apps/web-student/src/pages/*.tsx` — confirm 0 hits.
- [ ] **Step 7.2:** `grep -l "pg-shell\|pg-header\|pg-filter-row\|pg-grid\|pg-card\|pg-empty\|pg-btn" apps/web-student/src/pages/*.tsx` — confirm 0 hits.
- [ ] **Step 7.3:** Delete the `AppShell` adapter file: `rm apps/web-student/src/components/AppShell.tsx`. Update `apps/web-student/src/components/index.ts` (or equivalent) to drop the export.
- [ ] **Step 7.4:** Identify the `pg-*` CSS block in `packages/design-system/src/shell.css` and delete it. Search for any remaining `.pg-` selectors to be thorough.
- [ ] **Step 7.5:** Typecheck + full build.
- [ ] **Step 7.6:** Smoke test: load every Vidya-native page and confirm no styling regression from the CSS deletion (in case any non-page file still referenced `pg-*` classes).
- [ ] **Step 7.7:** Commit: `chore(vidya): remove legacy AppShell adapter + pg-* CSS now that all 41 pages are Vidya-native`.

---

## Self-review notes

- **Spec coverage:** every legacy page identified in the inventory grep is assigned to a tranche. Total: 41 pages (7 + 9 + 4 + 4 + 8 + 9 = 41). ✓
- **Placeholder scan:** Tranches 2–6 deliberately use a per-tranche table instead of per-page enumerated steps, because the 6-step recipe is identical for every page after Task 0 establishes the pattern. The table specifies the page-specific crumbs/title/notes — those ARE the substitutions an executor needs. The "Same 6 steps per page" instruction references the explicit Task 1.1 step list, not a TBD.
- **Type consistency:** `VidyaShell` props (`crumbs`, `title`, `subtitle`, `chips`, `actions`) are used identically across all tasks. `vidya-shell__chip` / `vidya-shell__chip--on` / `vidya-card-block` / `vidya-grid-2` / `vidya-grid-3` / `vidya-heat-card` / `vidya-shell__primary` classes are referenced consistently.

---

## Execution handoff

This plan is intentionally large — 7 phases over ~41 pages. Recommended approach:

1. Execute **Task 0** (Tutors as canonical) first. Pause for user visual sign-off.
2. Execute **Tranche 1 (Marketplace)** as a batch. Pause for user visual sign-off.
3. After Marketplace passes, execute Tranches 2–6 in sequence with a user checkpoint between each.
4. Execute **Phase 7 (Cleanup)** only after all 6 tranches pass.

Each tranche should land as its own commit series. Do not delete legacy `pg-*` CSS until Phase 7.
