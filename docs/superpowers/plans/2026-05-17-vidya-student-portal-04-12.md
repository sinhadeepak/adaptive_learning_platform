# Vidya Student-Portal Rebuild (Mockups 04 + 12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 5 pre-Vidya student-portal pages (`Profile`, `Settings`, `Leaderboards`, `League`, `Rank`) with Vidya-styled versions wrapped in `VidyaShell`, preserving 100% of existing features and data-fetching.

**Architecture:** Per-file rewrite. Each page keeps every hook, `useEffect`, API call, mutation, and named export byte-equivalent — only the JSX `return` block changes. Pages stay single-file (no decomposition into `components/vidya/` subcomponents). Two commits: one per mockup arc.

**Tech Stack:** React 18 + TypeScript + Vite, pnpm workspace `@alp/web-student`, Vitest. Vidya design tokens already shipped via `components/vidya/VidyaShell.tsx` + global CSS (class prefixes `vidya-shell__`, `vidya-card-block`, `vidya-heat-card`, `vidya-grid-3`).

**Spec:** [`docs/superpowers/specs/2026-05-17-vidya-student-portal-04-12-design.md`](../specs/2026-05-17-vidya-student-portal-04-12-design.md)

**Branch:** `feature/vidya-foundation` (already current).

**Test posture:** This is a 1:1 UI rewrite. **No new tests** are added — the existing test suite (`Insights.test.tsx`) must continue to pass, and `vitest` + `build` + `lint` are the automated gates. Verification of feature parity is **manual smoke** with the seeded test user (`Password123!`).

---

## File Structure

| Path | Action |
|---|---|
| `apps/web-student/src/pages/Profile.tsx` | rewrite in place (~735 → ~400-500 LOC) |
| `apps/web-student/src/pages/Settings.tsx` | rewrite in place (~613 → ~400 LOC) |
| `apps/web-student/src/pages/Leaderboards.tsx` | rewrite in place (~353 → ~250 LOC) |
| `apps/web-student/src/pages/League.tsx` | rewrite in place (~248 → ~200 LOC); preserve `XPHeader` named export |
| `apps/web-student/src/pages/Rank.tsx` | rewrite in place (~642 → ~450 LOC); preserve inline `Podium` component |
| `apps/web-student/src/routes.tsx` | **no change** |
| `apps/web-student/src/components/vidya/*` | **no change** (consume existing VidyaShell) |
| Global CSS files (e.g. `apps/web-student/src/index.css` or design-system) | **no change** — legacy classes like `.pg-section`, `.ai-header`, `.topic-section` stay defined globally; we just stop emitting them from rewritten files |

---

## Vidya Pattern Reference (used by every rewrite)

**Read this once before Task 1; every page rewrite uses these conventions.**

Reference page: [`apps/web-student/src/pages/Analysis.tsx`](../../../apps/web-student/src/pages/Analysis.tsx) — the cleanest fully-shipped Vidya page. Read it end-to-end before starting Task 1.

**Skeleton every rewritten page follows:**

```tsx
import { useEffect, useState /* + others as needed */ } from "react";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";
import { VidyaShell } from "../components/vidya/VidyaShell";

// === types (copy verbatim from current file) ===
interface ProfileResponse { /* unchanged */ }

// === helpers (copy verbatim from current file) ===
function daysUntil(iso: string | null) { /* unchanged */ }

export function Profile() {
  // === STATE + HOOKS (copy verbatim from current file, do not edit) ===
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  // ... every useState, every useEffect, every callback ...

  // === RENDER (NEW — Vidya-styled, replaces legacy JSX) ===
  return (
    <VidyaShell
      crumbs="ACCOUNT · PROFILE"
      title="Your profile"
      subtitle="Snapshot of who you are on ALP"
    >
      {/* cards */}
    </VidyaShell>
  );
}
```

**Vidya class vocabulary (shipped globally; do not redefine):**

| Class | Purpose |
|---|---|
| `vidya-shell__chip` / `vidya-shell__chip--on` | Pill button (filter / toggle). `--on` for selected state. |
| `vidya-card-block` | Standard card wrapper. |
| `vidya-card-block__head` | Card header row. |
| `vidya-card-block__title` | Card title text. |
| `vidya-heat-card` / `vidya-heat-card__eyebrow` / `vidya-heat-card__title` | Hero card (larger, gradient bg). |
| `vidya-grid-3` | 3-column responsive row of cards. |

**Anti-patterns to avoid** (these flag a non-Vidya rewrite):

- Hardcoded hex colors (use existing CSS custom properties: `--color-blue`, `--color-green`, `--color-red`, `--text-faint`, etc.).
- Emitting `.pg-section`, `.ai-header`, `.topic-section`, `.rank-podium-card` from a rewritten file.
- Wrapping content in `<AppShell>` instead of `<VidyaShell>`.
- New named exports beyond what existed before.
- Removing any existing named export (e.g. `XPHeader` from League.tsx).

**Hook-preservation rule (mechanical):**

1. Open the current page file.
2. Copy the entire region from the start of the `export function ComponentName()` body down to (but not including) the `return (` line. This is the "hook block".
3. Open the new file. Paste the hook block verbatim — no edits, even if a hook looks redundant.
4. After the hook block, write the new `return (...)` with `<VidyaShell>` + Vidya cards.
5. Also copy any helper functions (defined outside the component) and types (interfaces) verbatim.
6. Re-add imports — `react`, `auth`, `useAuth`, `VidyaShell`, plus anything the new JSX needs (e.g. `<Link>` from `react-router-dom` if needed).

This rule guarantees no behavioral regression even before manual smoke runs.

---

## Task 1: Profile.tsx — Vidya rewrite

**Files:**
- Modify: `apps/web-student/src/pages/Profile.tsx` (full rewrite in place)

- [ ] **Step 1: Read reference page**

Read `apps/web-student/src/pages/Analysis.tsx` end-to-end. Internalize the VidyaShell wrapping pattern, chip usage in `chips=` and `actions=`, and card block structure.

- [ ] **Step 2: Read current Profile.tsx in full**

Read `apps/web-student/src/pages/Profile.tsx` end-to-end. Identify and list:
- All `useState` calls (preserve verbatim)
- All `useEffect` calls (preserve verbatim)
- All callbacks (preserve verbatim)
- All helper functions defined at module scope (`daysUntil`, `badgeFor`, etc. — preserve verbatim)
- All interface/type declarations (preserve verbatim)

- [ ] **Step 3: Capture baseline build/lint/test status**

Run from repo root:
```bash
pnpm --filter=@alp/web-student build
pnpm --filter=@alp/web-student lint
pnpm --filter=@alp/web-student test
```
Expected: all three green. **Record any pre-existing failures** — those are not introduced by this work and stay tolerated until the smoke step.

- [ ] **Step 4: Rewrite Profile.tsx**

Per the Hook-Preservation Rule above:
1. Keep all imports (add `VidyaShell` from `../components/vidya/VidyaShell`; remove any imports that only the old JSX used, e.g. legacy shell components).
2. Keep all module-scope helpers and interfaces verbatim.
3. Keep the entire hook block inside `export function Profile()` verbatim.
4. Replace the `return (...)` with the Vidya layout from Section 04.a of the spec:

```tsx
return (
  <VidyaShell
    crumbs="ACCOUNT · PROFILE"
    title="Your profile"
    subtitle="Snapshot of who you are on ALP"
  >
    {/* HERO card */}
    <section className="vidya-card-block">
      <div className="vidya-card-block__head">
        <span className="vidya-card-block__title">Identity</span>
      </div>
      {/* avatar (use existing avatar URL from profile state) */}
      {/* upload/remove buttons (reuse existing onClick handlers) */}
      {/* sign-out button (reuse existing logout handler) */}
    </section>

    <div className="vidya-grid-3">
      {/* EXAMS card */}
      <section className="vidya-card-block">
        <div className="vidya-card-block__head">
          <span className="vidya-card-block__title">Exams</span>
        </div>
        {/* enrolled exams pills + Add CTA — reuse existing examsMeta state */}
      </section>

      {/* STATS card */}
      <section className="vidya-card-block">
        <div className="vidya-card-block__head">
          <span className="vidya-card-block__title">Stats</span>
        </div>
        {/* streak / topics tracked / target date — reuse existing state */}
      </section>
    </div>

    {/* ACHIEVEMENTS card */}
    <section className="vidya-card-block">
      <div className="vidya-card-block__head">
        <span className="vidya-card-block__title">Achievements</span>
      </div>
      {/* earned + locked grid; reuse achievements state + badgeFor helper */}
    </section>

    {/* RECENT ACTIVITY card */}
    <section className="vidya-card-block">
      <div className="vidya-card-block__head">
        <span className="vidya-card-block__title">Recent activity</span>
      </div>
      {/* recent sessions list — reuse existing fetch state */}
    </section>
  </VidyaShell>
);
```

Use `vidya-shell__chip` / `vidya-shell__chip--on` for any toggle/filter buttons. Use existing CSS custom properties for color (no hex literals).

- [ ] **Step 5: Build + lint + tests**

```bash
pnpm --filter=@alp/web-student build
pnpm --filter=@alp/web-student lint
pnpm --filter=@alp/web-student test
```
Expected: all three green (matching the baseline from Step 3 — no new failures).

- [ ] **Step 6: Grep for forbidden classes in the rewritten file**

```bash
grep -E "pg-section|ai-header|topic-section" apps/web-student/src/pages/Profile.tsx
```
Expected: no matches. If any match, replace with Vidya equivalents.

- [ ] **Step 7: Confirm no commit yet**

Do NOT commit. Profile + Settings ship together as the mockup 04 commit after Task 3.

---

## Task 2: Settings.tsx — Vidya rewrite

**Files:**
- Modify: `apps/web-student/src/pages/Settings.tsx` (full rewrite in place)

- [ ] **Step 1: Read current Settings.tsx in full**

Identify hooks, callbacks (`toggleNotifType`, `savePreferences`, `onSignOut`), helpers (`ThemeDensitySection`), and interfaces.

- [ ] **Step 2: Rewrite Settings.tsx**

Per the Hook-Preservation Rule. Keep `ThemeDensitySection` defined inline at the bottom of the file (do not extract). Replace the `return (...)` with Vidya layout from spec Section 04.b:

```tsx
return (
  <VidyaShell
    crumbs="ACCOUNT · SETTINGS"
    title="Settings"
    subtitle="Preferences for your study experience"
  >
    {/* STUDY LANGUAGE */}
    <section className="vidya-card-block">
      <div className="vidya-card-block__head">
        <span className="vidya-card-block__title">Study language</span>
      </div>
      {/* segmented English/हिन्दी using vidya-shell__chip + --on */}
    </section>

    {/* DAILY GOAL */}
    <section className="vidya-card-block">
      <div className="vidya-card-block__head">
        <span className="vidya-card-block__title">Daily goal</span>
      </div>
      {/* 15/30/45/60 pills using vidya-shell__chip + --on */}
    </section>

    {/* NOTIFICATIONS */}
    <section className="vidya-card-block">
      <div className="vidya-card-block__head">
        <span className="vidya-card-block__title">Notifications</span>
      </div>
      {/* 7 notif type rows; reuse notifPrefs + toggleNotifType */}
    </section>

    {/* THEME & DENSITY */}
    <ThemeDensitySection />

    {/* ACCOUNT */}
    <section className="vidya-card-block">
      <div className="vidya-card-block__head">
        <span className="vidya-card-block__title">Account</span>
      </div>
      {/* onboarding link + sign-out CTA */}
    </section>

    {/* sticky save footer — keep visual at bottom of page, not VidyaShell-managed */}
    <div className="vidya-settings-actions">
      <button className="vidya-shell__chip" onClick={() => { /* reuse existing cancel handler */ }}>
        Cancel
      </button>
      <button
        className="vidya-shell__chip vidya-shell__chip--on"
        onClick={savePreferences}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save preferences"}
      </button>
    </div>
    {savedAt && <div className="vidya-toast">Saved</div>}
  </VidyaShell>
);
```

**Note on `ThemeDensitySection`:** call it as `<ThemeDensitySection />`. Internally, it should also be updated to use `vidya-card-block` instead of `.topic-section`. If touching its JSX, keep its hooks intact.

- [ ] **Step 3: Build + lint + tests**

```bash
pnpm --filter=@alp/web-student build
pnpm --filter=@alp/web-student lint
pnpm --filter=@alp/web-student test
```
Expected: all green (matching baseline).

- [ ] **Step 4: Grep for forbidden classes**

```bash
grep -E "pg-section|ai-header|topic-section" apps/web-student/src/pages/Settings.tsx
```
Expected: no matches.

---

## Task 3: Smoke + commit mockup 04 (Profile + Settings)

**Files:**
- Stage and commit: `apps/web-student/src/pages/Profile.tsx`, `apps/web-student/src/pages/Settings.tsx`

- [ ] **Step 1: Start local stack (if not already up)**

Verify the dev stack is reachable (the seeded test user lives in `identity` DB). Stack URL per CLAUDE.md is the local Docker Compose at `localhost`. If the user already has stack running, skip.

- [ ] **Step 2: Run web-student dev server**

```bash
pnpm --filter=@alp/web-student dev
```
Note the URL (typically `http://localhost:5173`).

- [ ] **Step 3: Manual smoke — Profile**

Login as the seeded user (password `Password123!` per memory `local_test_users.md`). Navigate to `/profile` and verify:
- Avatar renders, Upload triggers file picker, Remove clears avatar.
- Achievement grid shows earned + dimmed locked previews.
- Streak number, days-until-target, topics tracked all render with non-zero data for the seeded user.
- Sign-out button logs out and routes to `/login`.
- Visual: sidebar nav present, topbar shows crumbs + title, cards have rounded corners matching Home/Analysis.

- [ ] **Step 4: Manual smoke — Settings**

Navigate to `/settings`:
- Change language English → हिन्दी → Save → reload page → persisted as हिन्दी.
- Change daily goal 30 → 45 → Save → reload → persisted.
- Toggle one notification type off → Save → reload → still off.
- Toggle theme Light → Dark → density Compact → Cozy (UI updates immediately).
- Onboarding shortcut routes to `/onboarding/exam`.
- Cancel + Save buttons render at bottom; Saved toast appears briefly after save.

- [ ] **Step 5: Stop the dev server**

Ctrl-C the dev server process.

- [ ] **Step 6: Commit**

```bash
git add apps/web-student/src/pages/Profile.tsx apps/web-student/src/pages/Settings.tsx
git commit -m "$(cat <<'EOF'
feat(Vidya): Profile + Settings — mockup 04 Vidya rebuild

Replaces legacy .pg-section / .ai-header / .topic-section layouts
with VidyaShell + vidya-card-block. Hooks, data fetching, callbacks,
and helpers (daysUntil, badgeFor, ThemeDensitySection) preserved
byte-equivalent; only JSX return blocks rewritten.

Closes mockup 04 of the Vidya student-portal rebuild arc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Verify commit landed**

```bash
git log -1 --stat
```
Expected: 2 files modified (`Profile.tsx`, `Settings.tsx`).

---

## Task 4: Leaderboards.tsx — Vidya rewrite

**Files:**
- Modify: `apps/web-student/src/pages/Leaderboards.tsx` (full rewrite in place)

- [ ] **Step 1: Read current Leaderboards.tsx in full**

Note: `BOARDS` constant array (cohort/global/friends), `boardId` state, row fetch effect, `Row` type.

- [ ] **Step 2: Rewrite Leaderboards.tsx**

Per the Hook-Preservation Rule. Replace `return (...)` with spec Section 12.a layout:

```tsx
return (
  <VidyaShell
    crumbs="COMPETE · LEADERBOARDS"
    title="Leaderboards"
    chips={
      <>
        {BOARDS.map((b) => (
          <button
            key={b.id}
            className={`vidya-shell__chip${b.id === boardId ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setBoardId(b.id)}
          >
            {b.label}
          </button>
        ))}
      </>
    }
    actions={
      // Use whichever fetch callback the current Leaderboards.tsx already
      // wires to its existing Refresh button. The current file imports
      // useCallback — find that memoized fetch function in Step 1 and
      // reuse it here by name.
      <button className="vidya-shell__chip" onClick={/* existing fetch callback */}>
        Refresh
      </button>
    }
  >
    {/* HERO row — your standing on the selected board */}
    <section className="vidya-heat-card">
      <div className="vidya-heat-card__head">
        <div>
          <div className="vidya-heat-card__eyebrow">
            {BOARDS.find((b) => b.id === boardId)?.label}
          </div>
          <div className="vidya-heat-card__title">Your standing</div>
        </div>
      </div>
      {/* current user rank + points + delta */}
    </section>

    {/* STANDINGS table */}
    <section className="vidya-card-block">
      <div className="vidya-card-block__head">
        <span className="vidya-card-block__title">Top 20</span>
      </div>
      {/* rows table — highlight current user row */}
    </section>

    {/* OTHER RANKINGS — keep existing links to /league, /rank, /clans */}
    <section className="vidya-card-block">
      <div className="vidya-card-block__head">
        <span className="vidya-card-block__title">Other rankings</span>
      </div>
      {/* links list */}
    </section>
  </VidyaShell>
);
```

Use existing `error` state and `rows` state directly. Use `<Link>` from `react-router-dom` for the Other Rankings entries.

- [ ] **Step 3: Build + lint + tests**

```bash
pnpm --filter=@alp/web-student build
pnpm --filter=@alp/web-student lint
pnpm --filter=@alp/web-student test
```
Expected: all green.

- [ ] **Step 4: Grep for forbidden classes**

```bash
grep -E "pg-section|ai-header|topic-section|rank-podium-card" apps/web-student/src/pages/Leaderboards.tsx
```
Expected: no matches.

---

## Task 5: League.tsx — Vidya rewrite

**Files:**
- Modify: `apps/web-student/src/pages/League.tsx` (full rewrite in place; **preserve `XPHeader` named export**)

- [ ] **Step 1: Read current League.tsx in full**

Note: `XpStatus` + `StandingsEntry` interfaces, `status` + `standings` state, the two `useEffect` blocks, **`export function XPHeader()`** at module scope.

- [ ] **Step 2: Rewrite League.tsx**

Per the Hook-Preservation Rule. **`XPHeader` named export must remain** — even though no callers exist today, the export signature is part of the public module surface. Rewrite its body to use Vidya classes as well, but keep the function declaration intact.

Replace the `League` `return (...)` with spec Section 12.b layout:

```tsx
return (
  <VidyaShell
    crumbs="COMPETE · LEAGUE"
    title="Weekly league"
    subtitle="Promotes Sunday 23:59 IST"
  >
    {/* STATUS card */}
    <section className="vidya-heat-card">
      <div className="vidya-heat-card__head">
        <div>
          <div className="vidya-heat-card__eyebrow">
            Current tier · {status?.tier ?? "—"}
          </div>
          <div className="vidya-heat-card__title">
            {status?.xpThisWeek ?? 0} XP this week
          </div>
        </div>
      </div>
      {/* progress bar toward promotion */}
    </section>

    {/* STANDINGS card */}
    <section className="vidya-card-block">
      <div className="vidya-card-block__head">
        <span className="vidya-card-block__title">League standings — this week</span>
      </div>
      {/* standings rows with promotion-line + demotion-line markers */}
    </section>
  </VidyaShell>
);
```

- [ ] **Step 3: Rewrite XPHeader body (optional but preferred)**

Keep `export function XPHeader()` declaration. Inside, replace any legacy markup with Vidya class equivalents — but keep the same return shape (a small inline header strip). If unsure, leave the body unchanged in this pass.

- [ ] **Step 4: Build + lint + tests**

```bash
pnpm --filter=@alp/web-student build
pnpm --filter=@alp/web-student lint
pnpm --filter=@alp/web-student test
```
Expected: all green.

- [ ] **Step 5: Verify XPHeader export preserved**

```bash
grep -n "export function XPHeader" apps/web-student/src/pages/League.tsx
```
Expected: 1 match.

- [ ] **Step 6: Grep for forbidden classes**

```bash
grep -E "pg-section|ai-header|topic-section|rank-podium-card" apps/web-student/src/pages/League.tsx
```
Expected: no matches.

---

## Task 6: Rank.tsx — Vidya rewrite

**Files:**
- Modify: `apps/web-student/src/pages/Rank.tsx` (full rewrite in place; **preserve inline `Podium` component**)

- [ ] **Step 1: Read current Rank.tsx in full**

Note: `Profile`, `ReadinessResponse`, `StreakResponse`, `MasteryListResponse`, `ExamMeta`, `Scope`, `Period` types; `activeExamId`, `scope`, `period`, `showAll` state; both `useEffect` blocks; inline `Podium` helper component at module bottom.

- [ ] **Step 2: Rewrite Rank.tsx**

Per the Hook-Preservation Rule. Keep inline `Podium` component defined at module bottom — do not extract. Replace the main `Rank` `return (...)` with spec Section 12.c layout:

```tsx
return (
  <VidyaShell
    crumbs="COMPETE · PREDICTED AIR"
    title="Your predicted rank"
    chips={
      <>
        {exams.map((ex) => (
          <button
            key={ex.id}
            className={`vidya-shell__chip${ex.id === activeExamId ? " vidya-shell__chip--on" : ""}`}
            onClick={() => setActiveExamId(ex.id)}
          >
            {ex.code || ex.name}
          </button>
        ))}
      </>
    }
    actions={
      <>
        {/* period toggle: weekly / monthly / all */}
        <button
          className={`vidya-shell__chip${period === "weekly" ? " vidya-shell__chip--on" : ""}`}
          onClick={() => setPeriod("weekly")}
        >
          Weekly
        </button>
        <button
          className={`vidya-shell__chip${period === "monthly" ? " vidya-shell__chip--on" : ""}`}
          onClick={() => setPeriod("monthly")}
        >
          Monthly
        </button>
        <button
          className={`vidya-shell__chip${period === "all" ? " vidya-shell__chip--on" : ""}`}
          onClick={() => setPeriod("all")}
        >
          All
        </button>
        {/* scope toggle: institute / cohort / global */}
        <button
          className={`vidya-shell__chip${scope === "institute" ? " vidya-shell__chip--on" : ""}`}
          onClick={() => setScope("institute")}
        >
          Institute
        </button>
        <button
          className={`vidya-shell__chip${scope === "cohort" ? " vidya-shell__chip--on" : ""}`}
          onClick={() => setScope("cohort")}
        >
          Cohort
        </button>
        <button
          className={`vidya-shell__chip${scope === "global" ? " vidya-shell__chip--on" : ""}`}
          onClick={() => setScope("global")}
        >
          Global
        </button>
      </>
    }
  >
    {/* HERO — predicted AIR + readiness + trajectory + source pill */}
    <section className="vidya-heat-card">
      <div className="vidya-heat-card__head">
        <div>
          <div className="vidya-heat-card__eyebrow">
            Predicted AIR · {readiness?.percentileSource ?? "—"}
            {readiness?.cohortSize != null && ` · cohort ${readiness.cohortSize}`}
          </div>
          <div className="vidya-heat-card__title">
            {readiness?.predictedAir ?? "—"}
          </div>
        </div>
      </div>
      {/* trajectory arrow + supporting copy */}
    </section>

    {/* PODIUM */}
    <section className="vidya-card-block">
      <div className="vidya-card-block__head">
        <span className="vidya-card-block__title">Top 3 in scope</span>
      </div>
      <Podium /* pass same props as before */ />
    </section>

    {/* FULL TABLE — collapsed by default */}
    <section className="vidya-card-block">
      <div className="vidya-card-block__head">
        <span className="vidya-card-block__title">Full rankings</span>
        <button
          className="vidya-shell__chip"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show top 10" : "Show all"}
        </button>
      </div>
      {/* rows; highlight current user */}
    </section>
  </VidyaShell>
);
```

- [ ] **Step 3: Build + lint + tests**

```bash
pnpm --filter=@alp/web-student build
pnpm --filter=@alp/web-student lint
pnpm --filter=@alp/web-student test
```
Expected: all green.

- [ ] **Step 4: Verify Podium preserved**

```bash
grep -n "^function Podium" apps/web-student/src/pages/Rank.tsx
```
Expected: 1 match (Podium remains an inline helper).

- [ ] **Step 5: Grep for forbidden classes**

```bash
grep -E "pg-section|ai-header|topic-section|rank-podium-card" apps/web-student/src/pages/Rank.tsx
```
Expected: no matches.

---

## Task 7: Smoke + commit mockup 12 (Leaderboards + League + Rank)

**Files:**
- Stage and commit: `apps/web-student/src/pages/Leaderboards.tsx`, `apps/web-student/src/pages/League.tsx`, `apps/web-student/src/pages/Rank.tsx`

- [ ] **Step 1: Run web-student dev server**

```bash
pnpm --filter=@alp/web-student dev
```

- [ ] **Step 2: Manual smoke — Leaderboards**

Login as seeded user. Navigate to `/leaderboards`:
- Click each tab (cohort, global, friends) → fetch fires → rows render.
- Current user row visually highlighted in the table.
- Other Rankings card links to `/league`, `/rank`, `/clans` work.
- Refresh button re-fetches.

- [ ] **Step 3: Manual smoke — League**

Navigate to `/league`:
- Current tier (Bronze/Silver/Gold) + this-week XP render.
- Promotion-line + demotion-line markers visible on the standings list.
- Current user highlighted.

- [ ] **Step 4: Manual smoke — Rank**

Navigate to `/rank`:
- Predicted AIR + readiness + trajectory render (or honest "—" when no data).
- Source pill shows `cohort` or `fallback`; cohortSize visible when present.
- Exam tab switching fires re-fetch.
- Period (weekly/monthly/all) + scope (institute/cohort/global) chips toggle.
- Podium renders top 3.
- "Show all" expands the full table.

- [ ] **Step 5: Cross-page visual diff**

Open Home (`/home`) in one tab and the 5 new pages in others. Confirm:
- VidyaShell topbar height, crumbs styling, title typography are identical.
- Sidebar nav is identical (same nav items, same active-state styling).
- Card border-radius and spacing match.

- [ ] **Step 6: Stop dev server**

Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add apps/web-student/src/pages/Leaderboards.tsx apps/web-student/src/pages/League.tsx apps/web-student/src/pages/Rank.tsx
git commit -m "$(cat <<'EOF'
feat(Vidya): Leaderboards + League + Rank — mockup 12 Vidya rebuild

Replaces legacy .rank-podium-card / .pg-section layouts with
VidyaShell + vidya-card-block + vidya-heat-card. Preserves all
data fetching, BOARDS / scope / period state machines, the inline
Podium helper component, and the XPHeader named export.

Closes mockup 12 of the Vidya student-portal rebuild arc.
Completes the Vidya rebuild arc for student-portal mockups 04 + 12.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Verify commit landed**

```bash
git log -1 --stat
```
Expected: 3 files modified.

- [ ] **Step 9: Final verification — full repo state**

```bash
git log --oneline -5
git status
```
Expected: Last two commits are the mockup 04 + mockup 12 Vidya rebuilds. Working tree clean.

---

## Definition of Done (mirrors spec)

- 2 commits land on `feature/vidya-foundation` (mockup 04 + mockup 12).
- Every existing feature works against the seeded user.
- `pnpm --filter=@alp/web-student build`, `lint`, `test` all green.
- Visual consistency matches Home/Analysis: VidyaShell topbar present on all 5 pages, card style consistent, no `.pg-section` / `.ai-header` / `.topic-section` / `.rank-podium-card` emitted from rewritten files.
- `XPHeader` named export on League.tsx and inline `Podium` component on Rank.tsx both preserved.
