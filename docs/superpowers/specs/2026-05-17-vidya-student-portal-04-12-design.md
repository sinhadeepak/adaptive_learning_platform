# Vidya Student-Portal Rebuild — Mockups 04 + 12

**Date**: 2026-05-17
**Branch**: `feature/vidya-foundation`
**Scope**: Vidya-styled rebuilds of 5 pre-Vidya pages in `apps/web-student`.
**Shipping**: 2 commits (one per mockup).

---

## Background

The Vidya v1 redesign has rebuilt 8/12 student-portal screens (mockups 2–11):
Home, ExamDetail, StudyMap, Quiz, QuizResult, Analysis, Experts, plus the
auth flow (Login/Register/Verify per mockups 01/03).

The remaining unrebuilt screens map to:

- **Mockup 04 — Profile & Settings**: `pages/Profile.tsx` (735 LOC) and
  `pages/Settings.tsx` (613 LOC).
- **Mockup 12 — Leaderboard**: `pages/Leaderboards.tsx` (353 LOC),
  `pages/League.tsx` (248 LOC), `pages/Rank.tsx` (642 LOC).

Mockup 01 (welcome-register) is already complete — Login + Register + Verify
were Vidya-rebuilt during the foundation arc (memory entry confirms; commit
log shows the Vidya auth UI landed alongside the design-system v1).

The HTML mockup files in `docs/ui/01_StudentPortal_Web/` (01, 04, 12) are
47-line empty stubs — they label the screen but contain no design content.
The visual language for the rebuilds is therefore taken from already-shipped
Vidya pages (Home, ExamDetail, Analysis) plus the design-system tokens in
ADR-0034 — not from the empty stub files.

---

## Scope

| Mockup | File | LOC before | Strategy |
|---|---|---|---|
| 04 | `apps/web-student/src/pages/Profile.tsx` | 735 | full rewrite, hooks preserved |
| 04 | `apps/web-student/src/pages/Settings.tsx` | 613 | full rewrite, hooks preserved |
| 12 | `apps/web-student/src/pages/Leaderboards.tsx` | 353 | full rewrite, hooks preserved |
| 12 | `apps/web-student/src/pages/League.tsx` | 248 | full rewrite, hooks preserved |
| 12 | `apps/web-student/src/pages/Rank.tsx` | 642 | full rewrite, hooks preserved |

Total: 5 files, ~2,600 LOC.

---

## Architecture & convention

The pattern mirrors every already-shipped Vidya page (Home, ExamDetail,
Analysis, Quiz, Experts):

```tsx
// pages/Profile.tsx  (post-rebuild)
import { VidyaShell } from "../components/vidya/VidyaShell";

export function Profile() {
  // 1. ALL existing hooks/state/data-fetching preserved verbatim
  const { user } = useAuth();
  const [stats, setStats] = useState(...);
  // ...

  // 2. Return wrapped in VidyaShell, content rebuilt with Vidya tokens
  return (
    <VidyaShell crumbs="ACCOUNT · PROFILE" title="Your profile" subtitle="…">
      {/* Vidya-styled cards replace legacy markup */}
    </VidyaShell>
  );
}
```

**Rules**:

- One file per page. No decomposition into `components/vidya/` subcomponents
  in this pass — matches Analysis.tsx (which is also a single large file).
  Reusable extraction can be a follow-up if patterns repeat across pages.
- All `useAuth`, `useEffect` data fetches, API calls, mutations, route
  navigations → preserved byte-equivalent. Only the JSX `return` block
  changes.
- Pages keep their existing route in `routes.tsx` — no router changes.
- Existing tests (`Insights.test.tsx` is the lone test today) continue to
  pass; no new tests required for a 1:1 UI rewrite.
- Named exports (e.g. `XPHeader` from League.tsx) are preserved with the
  same signature even when they have zero callers — guards regressions.

---

## Per-page layout sketches

### 04.a — Profile.tsx

```
VidyaShell crumbs="ACCOUNT · PROFILE"  title="Your profile"  subtitle="Snapshot of who you are on ALP"
─────────────────────────────────────────────────────────────
┌─ HERO card ────────────────────────────────────────────┐
│ [Avatar 96px] Name · email · role pill                │
│               [Upload] [Remove] [Sign out]            │
│               Streak · Days-until-target · Topics tr.│
└────────────────────────────────────────────────────────┘
┌─ EXAMS card ──────────────┐ ┌─ STATS card ──────────┐
│ exam pills + target dates │ │ readiness · streak ·   │
│ [+ Add exam]              │ │ topics tracked · mocks│
└───────────────────────────┘ └───────────────────────┘
┌─ ACHIEVEMENTS card ────────────────────────────────────┐
│ earned grid + "Up next" dimmed locked badges          │
└────────────────────────────────────────────────────────┘
┌─ RECENT ACTIVITY card ─────────────────────────────────┐
│ last N sessions (links to /quiz/:id/result)           │
└────────────────────────────────────────────────────────┘
```

Features preserved: avatar upload/remove, achievement grid with locked
previews (`badgeFor` helper kept), exam enrolment list, streak +
target-date countdown (`daysUntil` helper kept), sign-out, links to
recent quizzes. Pre-Vidya `.pg-section` class names retired from this
file (but their global CSS definitions remain — see Risks).

### 04.b — Settings.tsx

```
VidyaShell crumbs="ACCOUNT · SETTINGS"  title="Settings"  subtitle="Preferences for your study experience"
─────────────────────────────────────────────────────────────
┌─ STUDY LANGUAGE card ─────────────┐
│ [English] [हिन्दी] segmented        │
└───────────────────────────────────┘
┌─ DAILY GOAL card ─────────────────┐
│ [15] [30] [45] [60] min pills      │
└───────────────────────────────────┘
┌─ NOTIFICATIONS card ───────────────────┐
│ rows: 7 types × on/off toggles         │
└────────────────────────────────────────┘
┌─ THEME & DENSITY card ────────────┐
│ Light/Dark/Auto · Compact/Cozy    │
└───────────────────────────────────┘
┌─ ACCOUNT card ────────────────────────┐
│ Onboarding shortcut · Sign out CTA    │
└───────────────────────────────────────┘
[Cancel] [Save preferences] sticky footer
```

Features preserved: language toggle, daily-goal picker, 7 notification
mute toggles (`toggleNotifType`), `ThemeDensitySection` helper component
(kept inline at bottom of file), onboarding restart link, sign-out flow
with `signingOut` busy state, save flow with `savedAt` toast and `saving`
state.

### 12.a — Leaderboards.tsx

```
VidyaShell crumbs="COMPETE · LEADERBOARDS"  title="Leaderboards"  chips=[cohort | global | friends]  actions=[Refresh]
─────────────────────────────────────────────────────────────
┌─ HERO row ──────────────────────────────────────────────┐
│ Selected board name · your row highlighted              │
│ rank · points · delta-this-week                         │
└─────────────────────────────────────────────────────────┘
┌─ STANDINGS table ───────────────────────────────────────┐
│ #  Avatar  Name      Pts   Δ        [you]              │
│ 1  …       …         …     ▲                            │
│ …                                                       │
└─────────────────────────────────────────────────────────┘
┌─ OTHER RANKINGS card ──────────────────────────────────┐
│ links to League · Predicted AIR (Rank) · Clans         │
└────────────────────────────────────────────────────────┘
```

Features preserved: `BOARDS` array (cohort/global/friends) tab switching,
row fetch on board change, current-user highlight, links to League/Rank/
Clans (existing `Other rankings` section kept).

### 12.b — League.tsx

```
VidyaShell crumbs="COMPETE · LEAGUE"  title="Weekly league"  subtitle="Promotes Sunday 23:59 IST"
─────────────────────────────────────────────────────────────
┌─ STATUS card ──────────────────────────────────────────┐
│ Current tier (Bronze/Silver/Gold) · XP this week       │
│ progress bar · "earn N more XP to promote"             │
└────────────────────────────────────────────────────────┘
┌─ STANDINGS card ───────────────────────────────────────┐
│ This week's rankings within tier · you highlighted     │
│ promotion-line + demotion-line markers                 │
└────────────────────────────────────────────────────────┘
```

Features preserved: `XpStatus` + `StandingsEntry` fetches, promotion /
demotion zone rendering, `XPHeader` named export retained (no external
callers today, kept for regression safety).

### 12.c — Rank.tsx

```
VidyaShell crumbs="COMPETE · PREDICTED AIR"  title="Your predicted rank"
  chips=[exam-tabs]  actions=[Period: weekly|monthly|all] [Scope: institute|cohort|global]
─────────────────────────────────────────────────────────────
┌─ HERO ──────────────────────────────────────────────────┐
│ Predicted AIR · readiness % · trajectory arrow         │
│ percentileSource pill (cohort / fallback) + cohortSize │
└─────────────────────────────────────────────────────────┘
┌─ PODIUM card (top 3 in scope) ─────────────────────────┐
│  2 · 1 · 3 with avatars + scores                       │
└────────────────────────────────────────────────────────┘
┌─ FULL TABLE (collapsed by default, "Show all" expands) ┐
│ rank rows · you highlighted                             │
└────────────────────────────────────────────────────────┘
```

Features preserved: profile + readiness + streak + mastery + exam-tab
switching (`activeExamId`), `scope` + `period` filters, `Podium` helper
component (kept inline), `showAll` toggle, honest fallback signalling
when cohort < 30 (`percentileSource` pill).

---

## Verification

Per-page protocol, run before each commit:

1. **Build / type check**: `pnpm --filter=@alp/web-student build` → 0 errors
   (Vite + tsc runs as part of the build script; the package has no
   standalone `typecheck` script).
2. **Lint**: `pnpm --filter=@alp/web-student lint` → 0 warnings (`--max-warnings 0`).
3. **Unit tests**: `pnpm --filter=@alp/web-student test` → all green (vitest).
3. **Manual smoke** with seeded user (Password123!) on local stack:
   - Profile: avatar upload, achievement reveal, recent-activity link works.
   - Settings: change language → reload → persisted. Toggle notif type →
     reload → persisted. Theme/density switches.
   - Leaderboards: tab switch fires fetch, current user highlighted.
   - League: status + standings render; promotion/demotion line visible.
   - Rank: exam tab switch, scope/period filters, podium renders,
     fallback pill shows when cohort < 30.
4. **Visual diff vs. shipped Vidya page** (Home or Analysis): topbar
   height, card radius, typography tokens, sidebar nav presence all match.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Removing a legacy CSS class breaks another page that imports it | grep each `.pg-section`, `.ai-header`, `.topic-section`, `.rank-podium-card` class for cross-page usage before removing. Keep class definitions in their global CSS file if used elsewhere; only stop emitting from rewritten files. |
| `XPHeader` named export from League.tsx silently breaks | Preserve the export with same signature (rewrite body, keep declaration). Grep confirms 0 external callers today — preserving guards a future regression. |
| Data hooks accidentally simplified during rewrite | Mechanical rule: copy hooks block verbatim from old file to new, *then* rebuild JSX. Reviewer sees a clean before/after on the JSX section only. |
| Mockup-implied features not visible in the empty HTML stubs | Sketches above are based on existing feature parity, not on the empty mockup files. Any richer mockup (Figma, slack) should be shared before the affected page starts; otherwise the rebuild implements what's currently shipped. |
| Vidya design tokens drift between pages | Cross-reference Analysis.tsx (a shipped Vidya page) for spacing/radius/typography on each new page. |

---

## Non-goals

- No new endpoints; no backend changes.
- No new tests (UI rewrite at 1:1 parity).
- No router changes, no new routes.
- No decomposition into reusable `components/vidya/` subcomponents
  (deferred to a follow-up).
- No IA changes (Profile.tsx stays one page, Settings.tsx stays one page).
- No mobile (Flutter) port — out of scope.
- No removal of legacy global CSS — only stop emitting classes from
  rewritten files.

---

## Definition of done

- 2 commits land on `feature/vidya-foundation` (one per mockup).
- Every existing feature works against the seeded user (Password123!).
- `pnpm --filter=@alp/web-student build`, `lint`, and `test` all green.
- Visual consistency matches Home/Analysis: VidyaShell topbar present,
  card style consistent, no pre-Vidya class names emitted from rewritten
  files.
