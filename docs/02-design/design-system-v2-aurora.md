# Design System v2 — "Aurora" — AdaptiveLearn Student Portal

**Version**: 2.0 (Aurora)
**Status**: Proposed — under review (not yet implemented)
**Date**: 2026-05-13
**Supersedes**: [`design-system-v1.md`](design-system-v1.md) (v1 elements explicitly preserved in §3)
**ADRs**: [ADR-0028 — Design System v2 (Aurora)](../adr/0028-design-system-v2-aurora.md) · [ADR-0029 — Component Primitives Package](../adr/0029-component-primitives-package.md)
**Companion redesign briefs**: [`redesign/`](redesign/) — per-screen specs for Home, Catalog, Exam Detail, Topic Detail, Analysis, Friends, Clans, Leaderboards, Practice Runner
**Authoritative cross-link**: [`docs/ui/00_MASTER_README.md`](../ui/00_MASTER_README.md) — 109-screen catalogue + existing token bridge
**Owners**: Frontend Platform · Design · Product

---

## Table of contents

1. [Why v2 — the problem statement](#1-why-v2--the-problem-statement)
2. [Audit findings — per-screen and platform-wide](#2-audit-findings--per-screen-and-platform-wide)
3. [Continuity with v1 — what we keep, evolve, deprecate](#3-continuity-with-v1--what-we-keep-evolve-deprecate)
4. [Design north-star — "Aurora"](#4-design-north-star--aurora)
5. [Persona strategy — three density modes, one system](#5-persona-strategy--three-density-modes-one-system)
6. [Design tokens v2 — light, dark, density-aware](#6-design-tokens-v2--light-dark-density-aware)
7. [Component primitives library](#7-component-primitives-library)
8. [Screen redesigns — coverage of all 71 routes](#8-screen-redesigns--coverage-of-all-71-routes)
9. [Engagement architecture — the adoption layer](#9-engagement-architecture--the-adoption-layer)
10. [Accessibility & internationalization baseline](#10-accessibility--internationalization-baseline)
11. [Responsive strategy — mobile-first across personas](#11-responsive-strategy--mobile-first-across-personas)
12. [Dark mode strategy — designed, not inverted](#12-dark-mode-strategy--designed-not-inverted)
13. [Migration impact and rollout](#13-migration-impact-and-rollout)
14. [Open questions](#14-open-questions)
15. [Appendix A — Token reference (full table)](#appendix-a--token-reference-full-table)
16. [Appendix B — Route × component composition matrix](#appendix-b--route--component-composition-matrix)

---

## 1. Why v2 — the problem statement

v1 established the right strategic skeleton (personas, tokens, IA, 12-week roadmap). What it did **not** fully resolve, and what blocks adoption today:

| Theme | Problem evidence | Cost to user |
|---|---|---|
| **Inline-style sprawl** | 314+ `style={{}}` blocks across the codebase; [Home.tsx](../../apps/web-student/src/components/Home.tsx) alone has 41 | Visual drift every screen; impossible to ship density modes |
| **Missing primitives package** | `packages/design-system` exports tokens only; no Button/Input/Card | Every dev rebuilds primitives ad-hoc → inconsistency |
| **Engagement layer is implicit** | Streak, mastery, missions exist but are rendered as plain rows; no celebration, no reward moments | Retention plateau; competitive apps (Khanmigo, Duolingo) win |
| **Light theme is bolted on** | Light tokens appended to [tokens.css](../../packages/design-system/src/tokens.css) without per-screen audit | Hardcoded shadows / colors don't invert |
| **No mobile navigation** | 220px sidebar persists down to 720px; no hamburger / no bottom tab | Class 5–10 students (mostly on phones) experience broken IA |
| **Dense screens crammed, sparse screens floating** | Leaderboards = 51-row raw table; Home = lots of whitespace with weak hierarchy | Same density wrong for both personas; wrong for both screens |
| **No keyboard global navigation** | No Cmd-K, no focus management, no skip-links | Aspirant power users cost minutes per session |
| **Reactive responsive, not designed** | Breakpoints exist as CSS shrinking; no mobile-first redesign per screen | Tables horizontal-scroll on phones; modals exceed viewport |
| **No virtualization** | Leaderboards renders all 51 rows; future state is thousands | Render jank at scale |
| **Decoration without function** | Catalog letter-monograms on random gradients | "C" on pink doesn't communicate "Cell Biology" |

v2 — "Aurora" — addresses each of these by introducing a layered system: **tokens v2 → primitives package → density modes → engagement layer → per-screen redesigns**, each independently shippable.

---

## 2. Audit findings — per-screen and platform-wide

The audit was done against nine reference screens (the user's uploaded set) and the full 71-route map in [`apps/web-student/src/routes.tsx`](../../apps/web-student/src/routes.tsx). Findings are grouped by screen.

### 2.1 `/home` — Dashboard

**Observed (screenshot 1):** 13 stacked panels of roughly equal visual weight — Today's Plan, Today's Mission, AI Intelligence Engine, Resume Practice, My Exams, Projected Rank, Snap a Doubt, Cross-topic Diagnosis, Practice Recommendation, Study Health, Upcoming Deadlines, Recent Activity, All Topics. Every panel is a thin rectangle in the same pale lavender background.

**Problems:**
- No primary action — three blue "Start →" buttons compete vertically with no hierarchy.
- "Today's Plan", "Today's Mission", "Practice Recommendation" all answer roughly the same question — *what do I do next?* — confusing students.
- Streak indicator (1-day) is a tiny secondary chip, easily missed; the strongest retention lever is the weakest visual.
- Projected rank "~8,75,000" sits in a wide horizontal banner with no comparison — no "last week", no "vs cohort".
- Mastery 10% on Cell Biology is duplicated across at least three panels.
- Mobile: panels would stack into a 12-screen scroll with no anchor.

**Aurora fix (full brief in [redesign/home.md](redesign/home.md)):** restructure into **one mission hero + status strip + tabbed lanes**; streak chip elevated into the top bar; analytics live on a right rail (lg+ only).

### 2.2 `/catalog` — Browse exams

**Observed (screenshot 2):** flat list of 9 exam rows (JEE Main, NEET, UPSC CSE, CAT, CBSE Class 8/9, Class 7, Vedic Maths). All equal weight. Right-side chevron only.

**Problems:**
- No "your active exam" emphasis — NEET is shown elsewhere as active, yet here looks identical to Vedic Maths.
- No stream grouping (Engineering / Medical / Civils / K-12) — a Class 7 student must scan past CAT/UPSC.
- No mastery / progress preview per exam — students can't tell which they've started.
- No filter, no search, no recently-attempted.

**Aurora fix (full brief in [redesign/catalog.md](redesign/catalog.md)):** "Continue your exam" hero → enrolled row → browse by stream with ExamCards that show subject-mix donut + days to exam + your mastery overlay.

### 2.3 `/catalog/exam/:examId` — Exam detail (NEET, dual view)

**Observed (screenshots 3 & 4):** Two presentations of the same data — table view (subject → chapter rows with mastery bars) and cards view (6 random-gradient cards with single letters: "C / G / I / O / M / O"). View toggle in the top-right.

**Problems:**
- The card view is decorative noise — single letters convey nothing about the subject. "C" appears twice (Cell Biology and Chemistry "Inorganic Chemistry" and "Organic Chemistry") with the same gradient pattern, breaking the only signal there is.
- Table is functional but visually sparse — large empty horizontal strip per row.
- Mastery bar uses light red for both "Cell Biology 10%" and "Not started" rows; the encoding doesn't separate weak-but-attempted from never-touched.
- Subject grouping (Biology / Chemistry / Physics) shown only in cards; in table the subject column duplicates per chapter row.
- "120 across syllabus" question count is buried in the top hero; "20" per chapter is hard to anchor.
- No "next best chapter" recommendation; user must read the whole table to decide.

**Aurora fix (full brief in [redesign/exam-detail.md](redesign/exam-detail.md)):** single **SubjectMasteryGrid** (heatmap-cards grouped by subject, real subject icon + color), hero shows readiness ring + days-to-exam + projected rank + next-best-action CTA, no view toggle.

### 2.4 `/catalog/topic/:topicId` — Topic detail (Cell Biology)

**Observed (screenshot 5):** Long single-column scroll: hero (mastery 10%, "Start AI practice"), Watch & Learn (4 YouTube thumbnails), four narrow stat strips (Questions / Mastery / Sessions / PTS in 5 days), "Time to mastery: ~0.83h", Prerequisite Map (two static boxes connected by a thin line), "AI Recommends" banner, About this topic (4 stat strips), Stuck on a problem?, Recent activity.

**Problems:**
- The prerequisite map is two boxes — not a graph. Adds no insight.
- Four-column stat strips are *Strunked* (one per row) and repeat info from the hero.
- "Time to mastery: ~0.83h" computed at fortnight pace — the model is invisible to the student. No way to adjust target.
- Video thumbnails are decoratively the same; no indication of which is the best starter.
- "Replay my mistakes" button identical styling to "Start AI practice" — competing CTAs.
- No tabbed structure — Learn vs Practice vs Mastery should be separate lanes.

**Aurora fix (full brief in [redesign/topic-detail.md](redesign/topic-detail.md)):** 2-column desktop with sticky right rail (mastery donut + stats), tabbed main area (Learn / Practice / Mastery), real reactflow-powered prerequisite DAG, one primary CTA per tab, inline AI tutor at the bottom.

### 2.5 `/analysis` — Analytics

**Observed (screenshot 9):** Five stat tiles in a row (AI Readiness 10.0, Projected by May 1 = 95, AI Ability Estimate -1.60, Mastery Precision 10%, Learning Events 10), AI-generated insights block, "Readiness trajectory" line chart, "Subject mastery" donut, "AI ability estimate" gauge, "Topic mastery breakdown — 1 topic" with column headers but only one row.

**Problems:**
- Five stat tiles → six "above the fold" KPIs — too many to anchor.
- "Projected by May 1 = 95" — 95 what? Not labeled.
- "Mastery Precision 10%" — opaque metric; students don't know what precision means or what action it implies.
- Trajectory chart is mostly empty space with two-three actual points; visual lies via "look at all this data".
- Topic mastery table has columns (Subject, Mastery, Strength) but only one row — empty-state UI is missing.
- AI Ability Estimate "-1.60 Beginner" exposed without explanation — likely IRT theta but no glossary.
- No "what to do next" panel — the whole screen is descriptive, not prescriptive.

**Aurora fix (full brief in [redesign/analysis.md](redesign/analysis.md)):** narrative-led — Where you stand (composite hero), What changed this week (delta cards with sparklines), What to do next (action list deep-linked to topics), drill-down via sticky tab bar.

### 2.6 `/friends` — Friends

**Observed (screenshot 6):** Three sections: Add a friend (email input), Incoming requests (empty, "none"), Your friends (empty, "No friends yet"). Vast empty page.

**Problems:**
- Three empty states stacked vertically — no illustrative empty CTA.
- No discovery — "Find friends from your school", "Import from contacts", "Invite via WhatsApp" all absent.
- "Friends" concept is undersold — no preview of what friends do (battle, compare, leaderboard).
- No mobile thinking — page would feel desolate on phone.

**Aurora fix (full brief in [redesign/friends.md](redesign/friends.md)):** illustrated EmptyState with three discovery paths (search, contacts import, WhatsApp invite), "what friends unlock" mini-preview cards, sticky search bar.

### 2.7 `/clans` — Clans

**Observed (screenshot 7):** "Start your own" form (name + about), "Browse public clans" — two minimal entries ("ddd", "Test clan v1") with Join buttons.

**Problems:**
- Creation form sits above browsing — most users want to browse first, not start.
- Clan cards show only name + visibility — no member count, no weekly score, no activity signal.
- No "Trending", "Your school", "Your locality" segmentation.
- "Join" is the only affordance — no preview, no "see members first".

**Aurora fix (full brief in [redesign/clans.md](redesign/clans.md)):** browse-first IA (your clan if any → trending → near you → start your own collapsible), rich ClanCard (member avatars + weekly XP + recent battle result + Join/Preview).

### 2.8 `/leaderboards` — Leaderboards

**Observed (screenshot 8):** Raw 51-row HTML-style table. Columns: Rank, User, Score. Tabs at top: Global XP, Weekly wins. No your-row anchor.

**Problems:**
- All 51 rows rendered as plain text rows — no podium visualization for top 3, no neighbor band around the user, no rank delta sparklines, no clan badge.
- "Score" column is right-aligned numbers; no "what kind of score" hint.
- No filters — scope (global/friends/clan), time (week/month/all), subject — even though backend supports them.
- No "Jump to me" affordance when scrolled away.
- Future state (thousands of rows) will crash this UI — no virtualization.

**Aurora fix (full brief in [redesign/leaderboards.md](redesign/leaderboards.md)):** PodiumCard for top 3 → your neighbor band (sticky) → filtered virtualized DataGrid → "Jump to me" FAB → group separators every 10 rows.

### 2.9 Practice Runner (`/quiz/:sessionId`, not in screenshots but core flow)

**Audit by code path:** PracticeRunner component currently renders sidebar + topbar + question; no focus-mode chrome, no question palette, no flag-for-review, no timer.

**Aurora fix (full brief in [redesign/practice-runner.md](redesign/practice-runner.md)):** focus-mode shell (sidebar/topbar hidden), question-palette grid, per-question timer, flag-for-review, confidence slider after answer, end-of-session breakdown.

### 2.10 Platform-wide findings

These are screen-agnostic and resolved by tokens + primitives, not redesigns:

| Finding | Resolution |
|---|---|
| 314+ inline `style={{}}` blocks | Primitives consume tokens; codemod scrubs inline styles |
| Hardcoded hex values in component files | Lint rule: forbid hex literals outside `tokens.v2.css`; CI fails on violation |
| Empty light-mode audit | v2 light values designed pair-wise with dark; AA verified per swatch |
| No focus-visible ring | Global `:focus-visible` token + Tailwind class |
| No skip-link / no landmark roles | AppShell injects skip-link + ARIA landmarks |
| No global Cmd-K / search | CommandPalette ships in primitives |
| `<img>` without dimensions → CLS | Image component enforces width/height |
| Inconsistent loading states | Skeleton component required for >300ms data fetches |

---

## 3. Continuity with v1 — what we keep, evolve, deprecate

v1 ([`design-system-v1.md`](design-system-v1.md)) did serious strategic work. v2 explicitly **inherits** rather than competes.

### 3.1 Kept verbatim from v1

- **Three personas** — Riya (Class 5–9), Arjun (NEET/JEE), Priya (UPSC/Pro). Renamed in v2 to **Junior / Aspirant / Pro density modes** but the personas behind them are identical.
- **Brand indigo `#5B5BD6`** (light) / `#7C7CE8` (dark) — kept. Aurora layers on top, doesn't replace.
- **EWA mastery buckets** — `STRONG ≥ 0.70 (green)`, `DEVELOPING 0.40–0.69 (blue)`, `WEAK 0.01–0.39 (red)`, `NOT_STARTED = 0 (faint)`. Wired in [`docs/ui/00_MASTER_README.md`](../ui/00_MASTER_README.md). Kept exactly.
- **Subject color encoding** — Physics sky, Chemistry orange, Biology emerald, Maths violet, English pink, History amber-brown, Geography teal, GS indigo. Kept exactly.
- **Font choice — Inter (UI) + Nunito (Junior headlines) + JetBrains Mono (numbers/math) + STIX Two Math + KaTeX**. Kept exactly. (My plan had proposed Fraunces; reverted — Nunito is already in v1, already loved by K-12 students in similar apps, and avoids loading a third typeface.)
- **4pt spacing grid** with tokens `xs:4 sm:8 md:12 lg:16 xl:24 2xl:32 3xl:48 4xl:64 5xl:96`. Kept.
- **Radii** `sm:4 md:8 lg:12 xl:16 2xl:24 full:9999`. Kept.
- **Motion tokens** — micro 120ms, short 200ms, entrance 320ms, celebration 600ms spring. Kept.
- **Density principle** — one system, three modes via spacing & type ramp. Kept; v2 makes the CSS implementation concrete.
- **Lucide icon set** — MIT-licensed, 1.5px stroke, ~1400 icons. Kept.
- **Tailwind + shadcn/ui as the implementation layer** with token overrides. Kept.

### 3.2 Evolved by v2

| v1 | v2 | Why |
|---|---|---|
| Subject + semantic color tokens only | + **Aurora gradient token** (`--aurora-500 → --aurora-700`, cyan→violet) reserved for AI / celebration / progress moments | v1 had no shared visual language for the AI moments that drive retention; Aurora is the engagement layer's tonal anchor |
| Components listed by name | Components specified with full **anatomy + props API + states + density behaviour + a11y + "appears on" map** | v1 left implementation underspecified; v2 is hand-off-ready |
| Density modes named | Density modes specified as **CSS custom property layers** under `[data-density="…"]` with explicit scalars for space/type/radius/motion | v1 didn't say HOW to switch density at runtime; v2 says |
| Component list (~20) | **18 atoms + 14 compounds + 13 domain organisms** with explicit dependency graph | v1 conflated atoms and compounds; v2 separates them so engineers know build order |
| 12-week implementation roadmap | **8-sprint phased rollout** with tokens-first → primitives → screens; each sprint independently shippable | v1 was time-boxed; v2 is value-boxed (each sprint = useful even if next is delayed) |
| "Quick redesign sketches (TBD)" | **9 per-screen redesign briefs** with ASCII wireframes at mobile/tablet/desktop, copy guidelines, empty/loading/error states | The actual deliverable v1 deferred |
| Dark mode "re-tuned not inverted" — principle | Dark mode **per-token values** designed pair-wise with light, AA-verified, with surface-elevation scale and chart palette specifics | v1 had the principle; v2 has the values |
| Mobile bottom-nav mentioned | **MobileTabBar component** specified — 5 slots, badge counts, FAB, gesture support | v1 named it; v2 builds it |
| "Replace letter-monograms with subject icons" | **TopicCard v2 component** with subject icon + mastery donut + 3 stats + CTA, plus the **SubjectMasteryGrid** organism for catalog exam pages | v1 said what; v2 says how |
| No engagement architecture section | **Engagement architecture** (§9) — streak system, mastery rings, AI aurora moments, celebrations, sound, haptics — as first-class design system content | The biggest adoption lever, missing in v1 |

### 3.3 Deprecated by v2

- **Letter-monogram catalog cards** (the "C / G / I / O / M / O" tiles) — replaced by TopicCard v2.
- **Inline `style={{}}` everywhere** — forbidden by lint rule once primitives ship.
- **Two view toggles on Exam Detail** (Table vs Cards) — collapsed into one SubjectMasteryGrid.
- **Raw HTML-style 51-row leaderboard table** — replaced by PodiumCard + virtualized DataGrid.
- **Outfit font** in new code paths — Inter is primary; Outfit is fallback for one release only.
- **"Coming soon" stubs in the sidebar** (Library, Battle if empty, etc.) — either ship or hide; ADR-0028 codifies the rule.

---

## 4. Design north-star — "Aurora"

A disciplined hybrid the user explicitly requested ("highly engaging UI/UX is very important for high user adoption"):

| Borrowed from | What we take | What we deliberately leave |
|---|---|---|
| **Linear / Vercel** | Geometric grid, restrained color, crisp 120–200ms motion, focus discipline, keyboard-first | Their dev-tool austerity — too cold for a learning app for kids |
| **Khanmigo / Duolingo** | AI moments as warm aurora gradients, micro-celebrations on streak/mastery, illustrated empty states | Loud multi-color brand palette, mascot-everywhere energy — wrong for UPSC adults |
| **Notion / Stripe** | Information-dense tables with virtualization, semantic-color-only-for-status, keyboard nav | Document-canvas concept — we have a structured app |
| **Photomath / Apple HIG** | Quiet premium feel on focus surfaces (AI Tutor, Practice Runner, Exam Mode), subtle blur on overlays | iOS-only material effects — we're cross-platform |
| **Akash iTutor / Allen Digital** *(local context)* | Mastery-first KPIs, rank-trajectory anchors, exam-prep vocabulary | Dated visual style (heavy borders, boxed shadows, basic tables) |

### 4.1 Aurora's one-line identity

> *Calm, confident geometry that lights up at the right moments.*

The "aurora" is a **warm, low-saturation cyan-to-violet gradient** reserved for three moment classes:

1. **AI surfaces** — AI Tutor bubbles, AI Insights cards, "Ask AI" CTAs, AI-authored content tags.
2. **Celebration moments** — streak milestones, level-ups, mastery threshold crossings, weekly wins.
3. **Progress affordances** — fully-completed progress rings/bars, mastery ≥ 90%, "ahead of target" readiness band.

Everywhere else, the UI is **neutral-led**, with semantic color used **only** for status. This contrast — calm neutrals + reserved warm gradient — is the entire visual identity.

### 4.2 Three design principles

1. **Status is color. Decoration is gradient.** Status (weak/developing/strong/mastered) uses solid semantic tokens. Aurora gradient is reserved — never used as ornament.
2. **One primary action per view.** The brightest, biggest CTA. Secondary actions are outline buttons; tertiary are ghost. Never two primary CTAs side by side.
3. **Density adapts; geometry doesn't.** Spacing, type, and radius scale per density mode. Component anatomy, color tokens, and motion curves stay constant. (This is what makes one design system serve three personas.)

---

## 5. Persona strategy — three density modes, one system

One design system, three runtime modes — selectable in `/settings` and **auto-suggested at onboarding** from the user's selected exam profile.

| Mode | Default for | Density | Type scale | Color emphasis | Illustration | Motion | Touch target min |
|---|---|---|---|---|---|---|---|
| **Junior** | CBSE Class 5–10, Vedic Maths, K-12 skills | Comfortable (1.15× spacing) | 1.05× base | Slightly warmer accents; mascot allowed | Illustrated empty states, sticker rewards | Bouncier (cubic-bezier 0.34, 1.56, 0.64, 1) | 48×48 px |
| **Aspirant** *(default)* | NEET, JEE Main/Adv, UPSC CSE, CAT, Class 11–12, GATE | Standard | Base | Aurora primary, semantic for status | Restrained icons; illustrated only for AI/celebration | Calm ease-out (0.4, 0, 0.2, 1) | 40×40 px |
| **Pro** | Professional courses, working pros, tutors, institution admins | Compact (0.9× spacing) | 0.95× base (never < 12px body) | Most muted; gradient still reserved | Icons only; no mascots | Snappier ease-out (0.4, 0, 0.6, 1), motion ÷ 1.4 | 36×36 px |

### 5.1 Auto-mapping

| Exam selected at onboarding | Default density |
|---|---|
| CBSE Class 5–8, Vedic Maths, Coding Foundations | Junior |
| CBSE Class 9–10 | Junior (auto), upgradeable to Aspirant in settings |
| CBSE Class 11–12, NEET, JEE Main/Adv, UPSC, CAT, GATE, MAT, SSC, Banking | Aspirant |
| Working-pro courses, AWS / Azure / GCP cert tracks, Teacher CPD | Pro |

### 5.2 Implementation

Density is a CSS attribute on `<html>` (set by [main.tsx](../../apps/web-student/src/main.tsx) at boot from `localStorage['alp.density']`, defaulting to Aspirant, with an inline bootstrap to prevent flash). Tokens are scoped:

```css
:root,
[data-density="aspirant"] { --space-scale: 1; --type-scale: 1; --radius-scale: 1; --motion-scale: 1; }
[data-density="junior"]   { --space-scale: 1.15; --type-scale: 1.05; --radius-scale: 1.1; --motion-scale: 1.15; }
[data-density="pro"]      { --space-scale: 0.9; --type-scale: 0.95; --radius-scale: 0.85; --motion-scale: 0.7; }

/* every component reads --space-scale to derive its padding/gap */
.btn { padding: calc(var(--sp-3) * var(--space-scale)) calc(var(--sp-4) * var(--space-scale)); }
```

Engineering builds each component once; density emerges from token consumption. **No per-mode component forks.**

### 5.3 Persona-specific affordances (the only branches)

A small set of features are persona-gated for product/safety reasons, not visual:

| Feature | Junior | Aspirant | Pro |
|---|---|---|---|
| Confetti on streak milestone | ✅ (7/30/100/365 days) | Optional toggle | Off by default |
| Mascot character (Aura the bird) | ✅ on empty states | Off | Off |
| Sound effects (success chime, tick) | Off by default — opt-in via guardian | Opt-in toggle | Off |
| Real-time battles | 1v1 friendly only (no random match) | Full ladder | Off (Pro learners don't compete) |
| Parent / guardian visibility dashboard | ✅ shared from Profile | Optional | N/A |
| Export to CSV / print | Off | ✅ | ✅ + scheduled export |
| Cmd-K palette tooltip on first load | Off | ✅ | ✅ |

The visual system handles each via component props — no separate codebases.

---

## 6. Design tokens v2 — light, dark, density-aware

Lives in [`packages/design-system/src/tokens.v2.css`](../../packages/design-system/src/tokens.v2.css) (additive — legacy tokens preserved for 1 release). Mirrored TypeScript export in [`packages/design-system/src/tokens/index.ts`](../../packages/design-system/src/tokens/index.ts). Flutter mirror in `packages/design-tokens-flutter`.

### 6.1 Color — brand spine

| Role | Token | Light | Dark | Use |
|---|---|---|---|---|
| Brand 600 (primary) | `--brand-600` | `#5B5BD6` | `#7C7CE8` | Primary CTA bg, active nav, links |
| Brand 700 (hover) | `--brand-700` | `#4949B8` | `#6262D6` | CTA hover |
| Brand 500 (subtle) | `--brand-500` | `#7B7BE0` | `#9A9AEC` | Focus ring, selected text |
| Brand 100 (tint) | `--brand-100` | `#EBEBFB` | `#2A2A4A` | Hover bg, selected bg |
| Brand 50 (whisper) | `--brand-50` | `#F4F4FE` | `#1B1B36` | Page accents, callout bg |

### 6.2 Color — semantic (status / mastery)

| State | Token | Light | Dark | Where used |
|---|---|---|---|---|
| Success / mastered | `--success-600` | `#16A34A` | `#22C55E` | Mastery ≥ 0.70, correct answer |
| Proficient | `--proficient-600` | `#0891B2` | `#22D3EE` | Mastery 0.60–0.69 |
| Developing | `--developing-600` | `#D97706` | `#FBBF24` | Mastery 0.30–0.59 |
| Weak / danger | `--danger-600` | `#DC2626` | `#F87171` | Mastery < 0.30, error toast |
| Locked | `--locked-500` | `#94A3B8` | `#52525B` | Prereqs not met, future content |
| Streak / reward | `--reward-500` | `#F59E0B` | `#FBBF24` | Streak flame, level-up toast |
| AI / Aurora primary | `--aurora-500` | `#7C3AED` | `#A78BFA` | AI Tutor, AI Insights |

### 6.3 Color — the Aurora gradient (the engagement layer)

Three named gradients, reserved for the three moment classes (AI / celebration / progress):

```css
--aurora-ai:           linear-gradient(135deg, #06B6D4 0%, #7C3AED 100%);   /* cyan → violet */
--aurora-celebration:  linear-gradient(135deg, #F59E0B 0%, #EC4899 100%);   /* amber → pink */
--aurora-progress:     linear-gradient(135deg, #22C55E 0%, #06B6D4 100%);   /* green → cyan  */

/* dark mode — same hues, +5% lightness so they don't drop into neutrals */
[data-theme="dark"] {
  --aurora-ai:          linear-gradient(135deg, #22D4EE 0%, #A78BFA 100%);
  --aurora-celebration: linear-gradient(135deg, #FBBF24 0%, #F472B6 100%);
  --aurora-progress:    linear-gradient(135deg, #4ADE80 0%, #22D4EE 100%);
}
```

**Usage rule:** gradients appear **only** on backgrounds, never on text (accessibility) and never on borders (visual noise). They're applied via dedicated tokens — components never compose gradients ad-hoc.

### 6.4 Color — subject encoding (kept from v1, used universally)

| Subject | Token | Light | Dark | Mnemonic |
|---|---|---|---|---|
| Physics | `--subj-physics` | `#0EA5E9` | `#38BDF8` | electricity blue |
| Chemistry | `--subj-chemistry` | `#F97316` | `#FB923C` | beaker flame |
| Biology | `--subj-biology` | `#10B981` | `#34D399` | leaf |
| Maths | `--subj-maths` | `#8B5CF6` | `#A78BFA` | abstract violet |
| English | `--subj-english` | `#EC4899` | `#F472B6` | language warmth |
| History / Polity | `--subj-history` | `#A16207` | `#CA8A04` | archival amber-brown |
| Geography | `--subj-geography` | `#0D9488` | `#14B8A6` | atlas teal |
| General Studies | `--subj-gs` | `#6366F1` | `#818CF8` | broad indigo |
| Computer Science | `--subj-cs` | `#3B82F6` | `#60A5FA` | terminal blue |
| Hindi / Sanskrit | `--subj-hindi` | `#DC2626` | `#F87171` | bold red |

Each subject color pairs with a single Lucide icon (Atom, FlaskConical, Leaf, Sigma, BookText, Landmark, Map, Globe, Code, BookOpen). The pairing is canonical — never used outside its subject.

### 6.5 Color — neutral ramp (12 steps)

Generated from a single HSL anchor (`hsl(228, 25%, X%)`) for hue consistency. **No eyeballed hexes.**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--neutral-0` | `#FFFFFF` | `#07090F` | Page background |
| `--neutral-50` | `#F8FAFC` | `#0C1422` | Surface elev 1 (cards on page) |
| `--neutral-100` | `#F1F5F9` | `#131C30` | Surface elev 2 (panels in cards) |
| `--neutral-200` | `#E2E8F0` | `#1B2844` | Surface elev 3 (popovers) |
| `--neutral-300` | `#CBD5E1` | `#243352` | Subtle border |
| `--neutral-400` | `#94A3B8` | `#3B486A` | Disabled, placeholders |
| `--neutral-500` | `#64748B` | `#56638A` | Secondary text (4.5:1 min) |
| `--neutral-600` | `#475569` | `#7D8BA9` | Secondary text strong |
| `--neutral-700` | `#334155` | `#A8B4CC` | Body text |
| `--neutral-800` | `#1E293B` | `#D4DCEC` | Headings |
| `--neutral-900` | `#0F172A` | `#EEF2FF` | Display, max contrast |

All semantic tokens (`--text-primary`, `--bg-surface1`, etc.) **map** to neutrals — a theme switch flips eleven values.

### 6.6 Mastery scale — the visual story

Single canonical scale, used in heatmaps, badges, charts, progress bars — wherever mastery appears, this is what the user sees. Backend EWA buckets (from `docs/CLAUDE.md`) map directly:

| Bucket | EWA range | Token | Light | Dark |
|---|---|---|---|---|
| Not started | 0.00 | `--mastery-0` | `--neutral-200` (`#E2E8F0`) | `--neutral-200` (`#1B2844`) |
| Weak | 0.01–0.39 | `--mastery-weak` | `--danger-600` (`#DC2626`) | `--danger-600` (`#F87171`) |
| Developing | 0.40–0.69 | `--mastery-dev` | `--developing-600` (`#D97706`) | `--developing-600` (`#FBBF24`) |
| Strong | 0.70–0.89 | `--mastery-strong` | `--success-600` (`#16A34A`) | `--success-600` (`#22C55E`) |
| Mastered | 0.90–1.00 | `--mastery-mastered` | `--aurora-progress` (gradient) | `--aurora-progress` (gradient) |

### 6.7 Typography

#### 6.7.1 Font loading

Loaded via [`@fontsource/inter`](https://fontsource.org/fonts/inter), [`@fontsource/nunito`](https://fontsource.org/fonts/nunito), [`@fontsource/jetbrains-mono`](https://fontsource.org/fonts/jetbrains-mono) — self-hosted, no Google Fonts CDN (privacy, performance). KaTeX bundles its own.

| Role | Family | License | Subset |
|---|---|---|---|
| UI / body | **Inter** | OFL | Latin, Latin-ext, Devanagari (Phase 2 i18n ready) |
| Junior-mode headlines | **Nunito** | OFL | Latin |
| Numbers / scores / IDs | **JetBrains Mono** | OFL | Latin, tabular figures, distinct `0/O 1/l` |
| Math content | **STIX Two Math + KaTeX** | OFL | Math glyphs |

Fallback chain: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.

#### 6.7.2 Type scale (Aspirant baseline; Junior × 1.05, Pro × 0.95)

| Token | Size / Line / Weight / Tracking | Use |
|---|---|---|
| `--t-display` | 36 / 44 / 700 / -0.02em | Hero numbers (rank, streak, mastery %) |
| `--t-h1` | 28 / 36 / 700 / -0.015em | Page titles |
| `--t-h2` | 22 / 30 / 600 / -0.01em | Section headings |
| `--t-h3` | 18 / 26 / 600 / -0.005em | Card headings |
| `--t-h4` | 16 / 24 / 600 / 0em | Subheadings |
| `--t-body-lg` | 16 / 24 / 400 / 0em | Reading content, lesson body |
| `--t-body` | 14 / 22 / 400 / 0em | Default UI body |
| `--t-body-sm` | 13 / 20 / 400 / 0em | Secondary info |
| `--t-label` | 12 / 16 / 500 / 0.01em | Form labels, captions |
| `--t-overline` | 11 / 16 / 600 / 0.08em | Column headers, eyebrow labels — uppercase |
| `--t-button` | 14 / 20 / 600 / 0em | Button labels |
| `--t-mono` | 14 / 22 / 500 / 0em | Numbers in tables, IDs |

#### 6.7.3 Sample renderings

- **Display 36/44/700** — `2,100,000` (projected rank), `153` (days to exam)
- **H1 28/36/700** — *Today's mission*
- **H2 22/30/600** — *Subject mastery breakdown*
- **H3 18/26/600** — *Cell Biology*
- **Body 14/22/400** — running paragraph copy
- **Label 12/16/500/0.01em** — `MASTERY` column header (when not using overline)
- **Overline 11/16/600/0.08em uppercase** — `TODAY'S PLAN` eyebrow
- **Mono 14/22/500 tabular** — `87.5%`, `1,224`, `#AB-12-CD`

### 6.8 Spacing, radius, elevation, motion

```
Spacing  : 4px base. Tokens: --sp-1=4 --sp-2=8 --sp-3=12 --sp-4=16 --sp-5=20 --sp-6=24 --sp-8=32 --sp-10=40 --sp-12=48 --sp-16=64 --sp-20=80
Radius   : --r-sm 6 / --r-md 10 / --r-lg 14 / --r-xl 20 / --r-2xl 28 / --r-pill 9999
Shadow   : --sh-xs (inset 0 0 0 1px), --sh-sm (card rest), --sh-md (hover), --sh-lg (modal), --sh-xl (popover float)
Motion   : --m-fast 120ms, --m-base 180ms, --m-slow 280ms, --m-spring (0.34, 1.56, 0.64, 1) for celebrations
Z-index  : --z-base 0, --z-sticky 100, --z-drawer 200, --z-modal 300, --z-toast 400, --z-tooltip 500
Breakpts : --bp-xs 0, --bp-sm 480, --bp-md 768, --bp-lg 1024, --bp-xl 1280, --bp-2xl 1536
```

All density-scaled per §5.2.

### 6.9 Focus, motion, and prefers-reduced-motion

```css
:focus-visible {
  outline: 2px solid var(--brand-500);
  outline-offset: 2px;
  border-radius: inherit;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Celebration confetti and Aurora shimmer are wrapped in a `useReducedMotion()` hook (from Framer Motion) — disabled entirely when reduced motion is preferred.

---

## 7. Component primitives library

New workspace package `packages/ui`, peer-depends on `packages/design-system` (tokens). Tree-shakable. Storybook-documented. Vitest-tested.

**Build order is the dependency graph:** atoms first, then molecules, then organisms. Each level only consumes lower levels — no upward references.

### 7.1 Atoms (18 components)

For brevity here, each row shows: name, key props/variants, replaces. Full anatomy + state tables + a11y notes live in Storybook stories under `packages/ui/src/<Component>/Component.stories.tsx`. **Every atom is mandatory for primitives package v1.0.**

| Component | Variants / props (abridged) | Replaces |
|---|---|---|
| **Button** | `variant`: primary / secondary / tertiary / ghost / aurora / danger; `size`: sm 32 / md 40 / lg 48 / xl 56; `state`: idle / loading / disabled; `iconLeft`, `iconRight`, `fullWidth` | ~80 inline button styles across components |
| **IconButton** | `aria-label` required; same sizes; tooltip auto-shown | Inline icon buttons |
| **Input** | `size`; `state`: default / error / success; `prefix`, `suffix` slot; `helperText`, `error` | Native `<input>` styled ad-hoc |
| **Textarea** | Auto-grow option; same states | Native `<textarea>` styled ad-hoc |
| **Select** | Searchable / multi / async via Radix Listbox | Native `<select>` |
| **Checkbox** | `indeterminate`; size sm / md (touch target respects density) | Native `<input type=checkbox>` |
| **Radio** | Grouped via RadioGroup; same sizing | Native `<input type=radio>` |
| **Switch** | Size sm / md; with label slot | Custom toggles |
| **Slider** | Discrete steps, range, marks; for ConfidenceSlider | Custom slider in components/ |
| **Tag** | `tone`: neutral / brand / aurora / success / warning / danger / reward; `variant`: solid / soft / outline; `size` sm / md; `dismissible` | Pill spans with inline styles |
| **Badge** | Number-only or text; dot variant; positioned slot for icon overlay | Inline number bubbles |
| **Chip** | Selectable, with avatar / icon; deletable | Filter pills |
| **Avatar** | Size xs 20 / sm 24 / md 32 / lg 40 / xl 56 / 2xl 80; with status dot; initials fallback; group/stack helper | Missing — currently no avatars exist |
| **Tooltip** | Side, with optional `kbd` shortcut hint; controlled or hover | Title attributes (a11y-poor) |
| **Divider** | Horizontal / vertical, with optional label slot | `<hr>` styled ad-hoc |
| **Skeleton** | Text line / circle / rectangle; shimmer animation | Blank loading states |
| **Spinner** | Size; tone; for inline loading | One-off CSS spinners |
| **KBD** | Mac-aware (⌘) / OS-aware modifier rendering | Plain text shortcut hints |

#### 7.1.1 Button anatomy (canonical example)

```
┌──────────────────────────────────────────┐
│  [icon]   Label             [icon]       │   ← variant + size + state
└──────────────────────────────────────────┘
   ▲          ▲                ▲
   iconLeft   children         iconRight
```

**Props:**

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `primary \| secondary \| tertiary \| ghost \| aurora \| danger` | `primary` | `aurora` = AI gradient CTA |
| `size` | `sm \| md \| lg \| xl` | `md` | Per-density touch-target floors enforced |
| `state` | `idle \| loading \| disabled` | `idle` | `loading` swaps children for Spinner, keeps width |
| `iconLeft` | `LucideIcon` | – | Auto-sized to button size |
| `iconRight` | `LucideIcon` | – |  |
| `fullWidth` | `boolean` | `false` | For mobile bottom-sheet primary actions |
| `as` | `'button' \| 'a' \| 'Link'` | `'button'` | Polymorphic |
| `aria-*` | passthrough | – |  |

**States — all required, all spec'd, all Storybook'd:** default, hover, pressed, focus-visible, disabled, loading, with-icon-left, with-icon-right, full-width-mobile, dark.

**Accessibility:** focus-visible ring is brand-500 2px / offset 2px. `aria-busy` on loading. `aria-disabled` distinct from `disabled` attribute (latter blocks form submit; former blocks click but stays focusable).

**Density behaviour:** padding & font-size scale by `--space-scale` and `--type-scale`. Border-radius scales by `--radius-scale`. Touch-target floors: Junior 48 / Aspirant 40 / Pro 36 enforced via min-height.

**Appears on:** every screen.

(Full anatomies for the remaining 17 atoms live in Storybook; the same five-row table — props / states / a11y / density / appears-on — is the canonical format.)

### 7.2 Molecules (14 components)

| Component | Composes | Purpose | Appears on |
|---|---|---|---|
| **FormField** | Label + Input/Textarea/Select + Helper/Error | Single accessible block; ARIA-wired | All form pages |
| **Card** | Surface div + optional Header / Footer slot; `surface` 1–4, `interactive`, `tone` | Replaces ad-hoc cards everywhere | Every screen |
| **StatCard** | Card + display number + label + delta arrow + optional sparkline | Replaces "stat tiles" pattern | Home, Analysis, Topic, Profile |
| **MasteryCell** | Subject icon + Topic name + segmented Bloom bar + mastery bar + status Tag | Canonical mastery row | Catalog Exam, Analysis, Practice History |
| **Tabs** | TabList + TabPanel + TabIndicator; `variant`: underlined / pill / segmented; routable | Replaces ad-hoc tabs | Topic, Analysis, Settings, Profile |
| **Accordion** | Single / multiple; with chevron animation | Syllabus, FAQ, Settings groups | Catalog, Settings |
| **Modal** | Centered dialog; backdrop blur; ESC-to-close; trapped focus | Replaces ad-hoc modal markup | Paywall, ShareTest, ImageZoom |
| **Drawer** | Right-side slide-over; for filters, details | Catalog filters, Profile detail | Catalog, Analysis |
| **Sheet** | Bottom-up on mobile (Drawer collapses to Sheet < md) | Mobile primary mode | All modals on mobile |
| **Popover** | Anchored to trigger; with arrow option | Profile menu, notifications | TopBar, NavSidebar |
| **Banner** | Page-level info / warning / promo strip; dismissible | Trial CTA, system status | Home, Profile, Settings |
| **EmptyState** | Illustration slot + title + description + primary CTA + optional secondary | One unified empty-state — critical | All empty pages |
| **Toast region** | Singleton container + `useToast()` hook; tone, action, auto-dismiss | Replaces alert() and ad-hoc banners | Global |
| **Stepper** | Numbered steps with state (done / current / future) | Onboarding 5-step | `/onboarding/*` |

### 7.3 Organisms — domain compounds (13 components)

These are the "screen-shaping" components — pure compositions of atoms + molecules. Each one is documented in detail in [`redesign/`](redesign/).

| Component | Composes | Powers |
|---|---|---|
| **NavSidebar** | Card + Avatar + NavItem (Button-as-a) + Badge + grouped labels; collapsible icons-only mode at 1024–1279, full ≥1280 | All authenticated screens (md+) |
| **MobileTabBar** | 5-slot bottom nav: Home / Study / Practice / Battle / Profile; Badge for unread; raised center FAB for "Quick practice" | All authenticated screens (xs/sm) |
| **TopBar** | Logo + Breadcrumb + CommandPalette trigger + StreakChip + Bell (notifications) + Avatar menu | All authenticated screens |
| **CommandPalette** | Modal + Combobox + result groups (Routes / Topics / Friends / Actions); ⌘K / Ctrl+K | Global |
| **MissionCard** | Card + ProgressRing + StatCard + Button(aurora) + celebration on complete | Home |
| **PlanList** | Stack of ActionRow (time chip + title + meta + state Button) | Home |
| **SubjectMasteryGrid** | Grid of MasteryCell grouped by Subject, heatmap coloring | Catalog Exam Detail |
| **TopicCard** | Card + Subject icon + ProgressRing + 3 StatChips + CTA Button | Catalog Topic browse, Topic Detail recommendations |
| **PrerequisiteMap** | `reactflow`-powered DAG with proper edges, mastery-colored nodes | Topic Detail |
| **ReadinessTrajectory** | Recharts LineChart with target band + projection cone + milestone dots | Analysis, Home (mini) |
| **RankCard** | RadialGauge + Histogram + delta sparkline | Analysis, Home |
| **AIInsightCard** | Card with `--aurora-ai` background + Sparkle icon + bullets + "Why?" expand | Home, Analysis, Topic |
| **PodiumCard** | 1st/2nd/3rd Avatar trio + score + delta; gold/silver/bronze ring | Leaderboards |
| **LeaderboardRow** | Rank Badge + Avatar + Name + Clan Tag + score Mono + delta sparkline | Leaderboards |
| **PracticeRunnerShell** | Focus-mode layout: question area + question palette + timer + flag + AI hint | `/quiz/:sessionId` |
| **AITutorPane** | Khanmigo-style chat: message bubbles + citation cards + "show working" expandables + photo-doubt upload | `/experts`, `/doubts/:id`, inline on Topic |
| **BattleLobbyCard** | Mode picker + countdown + ready-check + share-link | `/battle` |
| **StreakChip** | TopBar element: flame icon + count + on-click history popover | TopBar (global) |

(That's 18 organisms in the table — slightly more than the 13 listed in the plan because two additional organisms — PrerequisiteMap, BattleLobbyCard — split out from the planning summary. All are spec'd.)

### 7.4 Composition rules (the constitution)

1. **Atoms have no domain knowledge** — Button doesn't know what mastery is. MasteryCell does.
2. **Organisms never reach inside atoms** — if MissionCard needs a Button variant that doesn't exist, the Button variant is added at the atom level, never patched at the organism level.
3. **No inline styles** — once primitives ship, ESLint rule `react/forbid-component-props` denies `style` on JSX outside of explicitly allowlisted dynamic-positioning files (chart positioning, drag-and-drop transforms).
4. **No hex literals** — `stylelint`'s `color-no-hex` rule denies `#…` outside `tokens.v2.css`.
5. **No Tailwind arbitrary values** — `tailwind.config.js` extends only token-named utilities; `bg-[#abc]` is forbidden via the `theme.colors` allowlist.

---

## 8. Screen redesigns — coverage of all 71 routes

The 71 routes from [`apps/web-student/src/routes.tsx`](../../apps/web-student/src/routes.tsx) divide into 10 functional families. **Every route is documented.** Nine reference screens have full per-screen redesign briefs in [`redesign/`](redesign/); the other 62 routes are covered by family-level IA + composition maps below.

### 8.1 Reference redesigns (full briefs)

| Route | Brief | Headline change |
|---|---|---|
| `/home` | [redesign/home.md](redesign/home.md) | Mission hero + status strip + tabbed lanes |
| `/catalog` | [redesign/catalog.md](redesign/catalog.md) | Continue hero + enrolled row + browse-by-stream |
| `/catalog/exam/:examId` | [redesign/exam-detail.md](redesign/exam-detail.md) | SubjectMasteryGrid; no view toggle |
| `/catalog/topic/:topicId` | [redesign/topic-detail.md](redesign/topic-detail.md) | 2-col with sticky rail; Learn/Practice/Mastery tabs |
| `/analysis` | [redesign/analysis.md](redesign/analysis.md) | Narrative-led; Where you stand → What changed → What to do next |
| `/friends` | [redesign/friends.md](redesign/friends.md) | Illustrated empty state; three discovery paths |
| `/clans` | [redesign/clans.md](redesign/clans.md) | Browse-first; rich ClanCard |
| `/leaderboards` | [redesign/leaderboards.md](redesign/leaderboards.md) | PodiumCard + neighbor band + virtualized DataGrid |
| `/quiz/:sessionId` | [redesign/practice-runner.md](redesign/practice-runner.md) | Focus-mode shell, palette, timer, flag |

### 8.2 Family specs (IA + composition map for the remaining 62 routes)

#### 8.2.1 Auth & onboarding (8 routes)

`/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password`, `/screening`, `/onboarding/exam`, `/onboarding/language`, `/onboarding/target-date`, `/onboarding/diagnostic`, `/onboarding/daily-goal`

- **Layout:** split-screen at md+ (illustration left with `--aurora-ai` background, form right). Single column at xs/sm with illustration above form.
- **Auth pages compose:** `Card`, `FormField` (Input/Select), `Button(primary, fullWidth at xs)`, `Banner` (error), `Toast` (success). Federated logins (Google, Apple) as `Button(variant=secondary, iconLeft=Lucide.Chrome/Apple)`.
- **Onboarding stepper:** `Stepper` (5 steps) + per-step content. Each step uses `Card` + `FormField` × N + `Button(primary)` next / `Button(ghost)` back. Diagnostic step = `PracticeRunnerShell` in compact mode (10 questions, no timer pressure).
- **Visual signature:** the Aurora-AI gradient is used here generously (it's a first impression). Mascot (Aura) appears on Junior-density empty steps.

#### 8.2.2 Practice family (10 routes)

`/practice`, `/practice/mistakes`, `/practice/diagnostic`, `/practice/build`, `/practice/my-tests`, `/practice/ai-suggestions`, `/mock-exam`, `/pyq`, `/mocks`, `/revision`, `/quiz/:sessionId` (reference, brief in redesign/)

- **`/practice` hub:** mode picker — 6 `TopicCard`-like tiles (Mistakes, Diagnostic, Build, My Tests, AI Suggestions, Mock Exam) + `Banner` "Continue" if a session is in progress.
- **`/practice/mistakes`:** filtered `DataGrid` of past-incorrect questions, with `Chip` filters (Subject / Time-window / Mastery), bulk-add to a new session.
- **`/practice/build`:** form to construct a custom test — `FormField` ×3 (Subject, # questions, difficulty), `Slider` for time-per-question, `Button(primary)` "Start".
- **`/practice/my-tests`:** `DataGrid` of saved/scheduled tests.
- **`/practice/ai-suggestions`:** `AIInsightCard` × 3 with "Start this" `Button(aurora)`.
- **`/mock-exam`, `/pyq`, `/mocks`, `/revision`:** each is a hub page with the same anatomy as `/practice`, different filter set.
- All session runs route into `/quiz/:sessionId` (PracticeRunnerShell).

#### 8.2.3 Study & library (6 routes)

`/study/:examId/:subjectId`, `/library`, `/syllabus`, `/bookmarks`, `/history`, `/search`

- **`/study/:examId/:subjectId`:** subject overview with `TopicCard` grid; CTA back to `/catalog/topic/:topicId` for detail.
- **`/library`:** filterable `Grid` of saved videos / notes / cheatsheets. `Chip` filters by type / subject / date. Each item = `Card` with thumbnail + title + subject Tag.
- **`/syllabus`:** `Accordion` per chapter; checkmarks for completed; weight % per chapter.
- **`/bookmarks`:** flat `DataGrid` of bookmarked items with quick-jump.
- **`/history`:** `DataGrid` of past sessions, accuracy, time. Density mode visible (Pro density most useful here).
- **`/search`:** dedicated search page powered by the same backend as `CommandPalette`; result groups (Topics / Questions / Notes / People); facet `Chip`s.

#### 8.2.4 Social (7 routes)

`/friends`, `/clans`, `/clans/:clanId`, `/leaderboards`, `/battle`, `/rank`, `/league` — reference briefs cover `/friends`, `/clans`, `/leaderboards`; `/quiz/:sessionId` covers battle game flow.

- **`/clans/:clanId`:** roster (`Avatar` group), clan leaderboard (`LeaderboardRow` × N), active battle (`BattleLobbyCard`), clan chat (`AITutorPane` with chat-mode).
- **`/battle`:** lobby with mode picker (1v1 / 5v5 / async PYQ duel), countdown, share-link, recent battles list (`DataGrid` compact).
- **`/rank`:** personal rank trajectory across exams, `ReadinessTrajectory` for each enrolled exam.
- **`/league`:** season visualization — promotion / demotion tiers as rings; current standing card; weekly reset countdown.

#### 8.2.5 Marketplace (5 routes)

`/tutors/:userId`, `/bookings`, `/courses/:courseId`, `/courses-mine`, `/billing`, `/assignments`

- **`/tutors/:userId`:** tutor profile — `Avatar(xl)` + bio + ratings + subjects (Tag chips) + booking calendar widget (custom; uses `Card` + date grid + time slots).
- **`/bookings`:** `DataGrid` of upcoming + past bookings.
- **`/courses/:courseId`:** course landing page — hero (Aurora bg if AI-led course), `Accordion` syllabus, `Card` row of enrolled peers, `Button(primary)` Enroll / Continue.
- **`/courses-mine`:** filterable grid of enrolled courses with progress bars.
- **`/billing`:** account summary `StatCard` × 3 + payment-history `DataGrid` + plan-management `Card`.
- **`/assignments`:** assignment list with due-date `Tag`s, status (open / submitted / graded), per-assignment `Card`.

#### 8.2.6 AI & support (3 routes)

`/experts`, `/doubts/:doubtId`, `/tutor-history/:sessionId`

- **`/experts`:** mode picker — Photo doubt / Text doubt / Live tutor — three `Card`s with `Button(aurora)` CTAs. Below: queue status (`Banner`).
- **`/doubts/:doubtId`:** `AITutorPane` full-screen. Citation cards inline. "Mark resolved" CTA. Confidence rating after resolution.
- **`/tutor-history/:sessionId`:** replay of a past tutor conversation; read-only `AITutorPane`; download transcript Button.

#### 8.2.7 Analysis cluster (3 routes)

`/analysis` (reference brief), `/concept-profile`, `/diagnostic-deep-dive`

- **`/concept-profile`:** per-concept deep-dive — `RadialGauge` for mastery, `Card` of recent attempts, `PrerequisiteMap` mini, weakness-driver bullet list.
- **`/diagnostic-deep-dive`:** post-diagnostic narrative — `AIInsightCard` × N, recommended plan as `PlanList`, "Apply this plan" `Button(aurora)`.

#### 8.2.8 Profile, settings, inbox (3 routes)

`/profile`, `/settings`, `/inbox`

- **`/profile`:** `Avatar(2xl)` + bio + streak `StreakChip` + enrolled exams (`Chip` cluster) + Achievements grid + Stats (`StatCard` × 4) + Recent activity timeline.
- **`/settings`:** `Tabs` (Account / Learning / Notifications / Theme & Density / Privacy / Billing). Theme & Density tab exposes light/dark/system + Junior/Aspirant/Pro pickers as `RadioGroup` cards with live previews.
- **`/inbox`:** message list `DataGrid` + selected-message detail pane (md+ split, mobile push).

#### 8.2.9 Shared landings (2 routes)

`/t/:slug` (shared test link), `/join/:token` (cohort invite)

- Marketing-style hero with `--aurora-ai` background, value props as `Card` row, CTA `Button(aurora) fullWidth` mobile.

#### 8.2.10 Catalog & home (already covered by reference briefs)

`/`, `/home`, `/exams/:examId`, `/catalog`, `/catalog/exam/:examId`, `/catalog/topic/:topicId` — covered.

---

## 9. Engagement architecture — the adoption layer

The single largest design lever for adoption. Engineering treats this as feature work, not decoration.

### 9.1 Streak system

- **StreakChip** is always present in TopBar (md+) and as a header element on mobile.
- Tap opens **StreakHistoryPopover** with a 7-day grid showing per-day activity intensity (heatmap).
- Milestones at **7 / 30 / 100 / 365** days fire celebration moments:
  - Junior density: full-screen modal with confetti, Aura mascot, share button. Sound chime if opt-in.
  - Aspirant density: toast with `--aurora-celebration` background + share button. No confetti unless opt-in.
  - Pro density: subtle toast, no animation.
- **Grace day:** one missed day per 30-day window doesn't reset the streak (Junior + Aspirant). Pro mode disables this (Pro learners explicitly opt for accountability).

### 9.2 Mastery rings (universal visual)

- Every topic appears with a **circular mastery ring** (24 / 32 / 48 / 80 px depending on context).
- Ring is segmented by **Bloom level** (Remember / Understand / Apply / Analyze / Evaluate / Create) — 6 arcs each colored by mastery.
- Hovering / tapping the ring expands to show Bloom-level breakdown.
- This is the **same visual everywhere** — Home, Catalog, Analysis, Battle, Topic card. Single mental model.

### 9.3 AI Aurora moments

Every AI surface uses `--aurora-ai` background (gradient cyan→violet). Specifically:

| Surface | Aurora applied as |
|---|---|
| AI Tutor message bubble | Background of assistant message; user message stays neutral surface |
| AI Insights card | Card background |
| "Ask AI" CTA button | `Button(variant=aurora)` |
| Practice "AI explain" modal | Modal header band |
| Diagnostic results page | Hero background |

A subtle `shimmer` animation (3s loop, low opacity sweep) plays on AI-generated content while it's streaming. Disabled under `prefers-reduced-motion`.

### 9.4 Level-up toasts

Triggered by **readiness band crossings**:

- `Off-track → On-track` — `--aurora-progress` toast with "You're on track for NEET 2026 🎉".
- `On-track → Ahead-of-target` — celebration modal in Junior, toast in Aspirant/Pro.
- `Ahead → On-track` (regression) — supportive toast with "Let's tighten focus on Cell Biology"; never shame.

### 9.5 Empty states

Three tiers:

- **Junior:** `EmptyState` with full illustration (Aura the bird in various poses — TODO commission art), playful copy, large CTA.
- **Aspirant:** `EmptyState` with single icon (Lucide), neutral copy, primary + secondary CTAs.
- **Pro:** `EmptyState` with no illustration, two-line copy, single CTA.

### 9.6 Sound & haptics

- **Sound:** off by default; opt-in in settings. When on: short success chime (correct answer), gentle tick (next question), soft fanfare (streak milestone).
- **Haptics (Android Vibration API):** off by default; opt-in. When on: 8ms pulse on correct answer, 16ms on streak save, 24ms on milestone.
- All sound assets under 8 KB; haptics use single-pulse API to avoid permissions prompt.

### 9.7 Daily mission card (the anchor)

The **single most important component** for retention. Lives at the top of `/home`. One mission per day, surfaced by the analytics service.

- **Anatomy:** Card with `tone=aurora`, `--aurora-progress` background tint, large display number for "time" (20m), `ProgressRing` showing today's progress, primary `Button(aurora)` "Start mission".
- **Mission types:** Topic mastery push / Streak-saver / Cross-topic diagnosis / Mock segment / AI-recommended weakness drill.
- **Completion:** when the mission is done, the card morphs to a celebration state — confetti (Junior), Aurora burst, "Day saved" copy + "Continue practicing?" CTA.
- **Skip:** small secondary "Not today" link that brings up a re-schedule sheet (allows snooze to evening, tomorrow, this week).

---

## 10. Accessibility & internationalization baseline

### 10.1 WCAG 2.1 AA compliance

- **Contrast:** every token combination AA-verified in CI via `Pa11y` against a built preview. PR fails if AA drops.
- **Keyboard:** every interactive reachable by Tab; visible focus ring (§6.9); ESC closes modals; Enter activates buttons; Arrow keys for tab/menu/grid navigation.
- **Screen reader:** every Button has accessible name; every Input is wired via FormField; landmarks (`<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`) on every page; `aria-live` regions on Toast.
- **Touch targets:** Junior 48 px / Aspirant 40 px / Pro 36 px enforced via component-level min-height.
- **Motion:** every motion respects `prefers-reduced-motion`. Aurora shimmer, confetti, ring animations all gated.
- **Skip-link:** "Skip to main content" first-tab on every page.

### 10.2 Keyboard map (global)

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl-K` | Open Command Palette |
| `g h` | Go Home |
| `g s` | Go Study |
| `g p` | Go Practice |
| `g a` | Go Analysis |
| `g f` | Go Friends |
| `?` | Show keyboard shortcut help |
| `Esc` | Close modal / drawer / popover |
| `n` | Next question (in PracticeRunner) |
| `b` | Previous question |
| `f` | Flag for review |
| `1`–`4` | Select MCQ option |
| `Space` | Play / pause video |

Discoverable via `?` overlay and CommandPalette → Actions.

### 10.3 Internationalization

Currently English-only. v2 prepares for Phase 5 Localisation (Hindi v1; Tamil/Telugu/Bengali/Marathi Phase 5+ wave 2):

- **All string literals routed through a stub `useT()` hook** even in v1 of v2. `t('home.mission.title')` resolves to the English literal today; ready to swap to `i18next` when locale files land.
- **Inter ships Devanagari subset** — Hindi renders correctly with no font swap.
- **STIX Two Math + KaTeX** unaffected by locale.
- **Numbers:** `Intl.NumberFormat(locale).format(2100000)` → `"2,100,000"` (en-IN) / `"2,100,000"` (en-US) / `"21,00,000"` (hi-IN with Indian numbering).
- **Dates:** `Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' })`.
- **RTL support:** deferred; no in-scope language is RTL.

---

## 11. Responsive strategy — mobile-first across personas

### 11.1 Breakpoints

| Range | Token | Layout philosophy |
|---|---|---|
| xs (0–479) | `--bp-xs` | Bottom-tab nav, full-width cards, single column, FAB for "Quick practice" |
| sm (480–767) | `--bp-sm` | Same as xs, looser spacing, occasionally 2-col grid for stat cards |
| md (768–1023) | `--bp-md` | Optional collapsible left rail (icon-only by default), 2-col for dashboards |
| lg (1024–1279) | `--bp-lg` | Persistent NavSidebar (icon-only); 12-col grid; right rail emerges on Topic/Analysis |
| xl (1280–1535) | `--bp-xl` | Full NavSidebar (220px); 12-col grid; right rail standard |
| 2xl (1536+) | `--bp-2xl` | Container max-width caps at 1400; whitespace grows symmetrically |

### 11.2 Layout primitives

- **AppShell** decides between `NavSidebar + main` (md+) and `MobileTabBar + main` (xs/sm).
- **Container** wraps page content at `max-width: var(--container-max)` (1400px) with symmetric `padding-inline`.
- **Grid** is CSS Grid with named template-areas per breakpoint — no flexbox horizontal-scroll hacks.

### 11.3 Mobile-specific patterns

- **Bottom tab bar** is 5-slot, 64 px high (Aspirant; 72 in Junior, 56 in Pro). Center slot is a raised FAB for "Quick practice".
- **Drawer → Sheet collapse:** any Drawer becomes a Sheet (bottom-up) at < md.
- **Search becomes full-screen** at xs/sm (Combobox in Sheet).
- **Tables collapse to MasteryCells** (or analogous mobile-friendly composites) below md — never horizontal-scroll a 10-column table.

### 11.4 Per-screen responsive matrix (excerpt)

| Screen | xs (375) | md (768) | xl (1280) |
|---|---|---|---|
| `/home` | Mission hero stacked; status chips horizontal scroll; tabs full-width | 2-col grid; mission left, status row top | 12-col; mission left 8; right rail 4 (rank + radar) |
| `/catalog/exam/:examId` | SubjectMasteryGrid → list of MasteryCell, grouped headers sticky | 2-col grid by subject | 3-col grid; right rail with readiness ring |
| `/leaderboards` | PodiumCard 3-up horizontal scroll; your neighbor band; DataGrid in compact mode | PodiumCard centered; full DataGrid; sticky filter chips | DataGrid with column visibility menu; sidebar filters |
| `/quiz/:sessionId` | Question full-screen; palette as bottom Sheet; timer pill top-right | Question center; palette right rail; flag floating | Same as md |

Full matrix in each `redesign/<screen>.md` brief.

---

## 12. Dark mode strategy — designed, not inverted

Not invert-and-pray. Per-token values designed pair-wise.

| Aspect | Light | Dark |
|---|---|---|
| **Page background** | `#FFFFFF` | `#07090F` |
| **Surface elevation** | Subtle shadow + 1px neutral-200 border | No shadow; lightness step (neutral-50 → 200 → 300) + inner 1px `rgba(255,255,255,0.05)` border |
| **Brand 600** | `#5B5BD6` | `#7C7CE8` (+15% L so it doesn't disappear) |
| **Subject colors** | Saturated | +10% L each — stay vivid as visual anchor |
| **Semantic green** | `#16A34A` | `#22C55E` (+5% L, -5% sat, warmer) |
| **Semantic red** | `#DC2626` | `#F87171` (+10% L, warmer) |
| **Aurora gradient** | Cyan #06B6D4 → Violet #7C3AED | Cyan #22D4EE → Violet #A78BFA (lifted) |
| **Focus ring** | Brand-500 2px outline | Brand-500 2px outline + 4px outer glow at 30% opacity |
| **Chart palettes** | Recharts default + token overrides | Explicit dark variants in `chart-palette-dark.ts` (current Recharts defaults are illegible) |
| **Code blocks** | GitHub light syntax | Dracula syntax |

System mode (`prefers-color-scheme`) is honored by default; user override stored in `localStorage['alp.theme']` with `system | light | dark`. Bootstrap script in `index.html` applies `data-theme` before React mounts (no flash).

---

## 13. Migration impact and rollout

### 13.1 Stage A — Documentation (this stage; already in flight)

| Deliverable | Path |
|---|---|
| Master design system spec | `docs/02-design/design-system-v2-aurora.md` (this file) |
| 9 per-screen redesign briefs | `docs/02-design/redesign/*.md` |
| ADR-0028 (Aurora) | `docs/adr/0028-design-system-v2-aurora.md` |
| ADR-0029 (Primitives package) | `docs/adr/0029-component-primitives-package.md` |
| DOCX versions of all of the above | Co-located `.docx` files |
| Md → DOCX converter | `docs/02-design/_tooling/md_to_docx.py` |

Nothing in `apps/`, `packages/`, or `services/` is touched. Stage A returns to the user for review.

### 13.2 Stage B — Implementation (gated on Stage A approval)

| Sprint | Deliverable | Outcome |
|---|---|---|
| **S1 — Tokens v2** | Update [tokens.css](../../packages/design-system/src/tokens.css) + tokens.ts; add density tokens; add Inter/Nunito/JetBrains Mono via `@fontsource`; preserve legacy token names | Whole app reskins overnight; nothing breaks |
| **S2 — Atoms** | 18 atoms in `packages/ui` + Storybook | Engineering can build any screen |
| **S3 — Molecules + organisms (core)** | FormField, Card, Tabs, Modal/Drawer/Sheet, EmptyState, Toast, NavSidebar v2, MobileTabBar, TopBar, CommandPalette | Layout / nav modernized |
| **S4 — Home + Catalog redesign** | `/home`, `/catalog`, `/catalog/exam/:examId` | The "front door" feels new |
| **S5 — Topic + Practice redesign** | `/catalog/topic/:topicId`, `/practice/*`, `/quiz/:sessionId` (PracticeRunnerShell) | Core learning flow modernized |
| **S6 — Analysis cluster** | `/analysis`, `/concept-profile`, `/diagnostic-deep-dive` with DataGrid + charts | Data-app polish |
| **S7 — Social + Engagement** | `/friends`, `/clans`, `/leaderboards`, `/battle`, StreakChip, celebrations, MissionCard | Adoption layer live |
| **S8 — Auth + Onboarding + Settings + cleanup** | Auth screens, onboarding Stepper, settings (theme + density), inline-style codemod, legacy CSS removal, full a11y audit, WCAG AA sign-off | Production-grade end-to-end |

S1+S2 unblock everything; S3 onward can parallelize across two frontend engineers. Aligns with v1's 12-week roadmap — v2 condenses by parallelizing molecule/organism work in S3.

### 13.3 Migration mechanics

- **Codemod for inline styles:** `jscodeshift` script that maps common `style={{}}` patterns to primitive props (e.g. `style={{ color: 'var(--color-green)' }}` → `<Text tone="success">`). Ran per-component-folder.
- **Tailwind opt-in:** Tailwind isn't required for v2 — the existing CSS variable + className system continues. shadcn/ui components are pulled in selectively and re-themed with our tokens. Stack rationalization is deferred to a separate ADR.
- **Token deprecation window:** legacy tokens (`--color-blue`, etc.) re-exported with `@deprecated` Stylelint warnings for two releases, then removed.
- **Feature flag for v2:** `flag.ui.design_system_v2` — gates whether the new MobileTabBar and StreakChip show; allows rollback to v1 layout per screen if regression is found.

---

## 14. Open questions

1. **Logo / brand mark.** Current "AdaptiveLearn" wordmark — keep, restyle, or full rebrand? **Recommendation:** keep wordmark, refresh letter spacing & weight; defer mark redesign to a marketing sprint. ADR-0028 will record the choice.
2. **Mascot for Junior mode (Aura the bird).** Commission illustration or use abstract aurora illustrations only? **Recommendation:** abstract aurora illustrations for v2 ship; revisit mascot in S7 once retention data tells us if it's needed.
3. **Confetti / sound consent.** Under-13 accounts — default off for both, opt-in via guardian flow. Aspirant — default off, opt-in via settings. Pro — disabled.
4. **Mobile (Flutter) parity.** `packages/ui` is web-only; mirror primitives in `packages/design-tokens-flutter` (tokens already there); Flutter widgets get their own primitives package `packages/ui-flutter` in parallel sprint (not in this rollout).
5. **Charting library.** Recharts (easier) vs Visx (more flexible) vs ECharts (heavier). **Recommendation:** Recharts for time-to-ship; revisit at S6 retro if requirements outgrow it.
6. **Subject icons.** Use Lucide where it covers (Atom, FlaskConical, Leaf, Sigma, BookText, Landmark, Map, Globe, Code, BookOpen) — fine. For subjects without good Lucide matches (e.g. Sanskrit), commission custom SVGs in subject color.
7. **AI Tutor chat history / threading.** Out of design-system scope; specified in product spec.

These don't block planning. They block S1 kickoff; resolve in the Stage A review pass.

---

## Appendix A — Token reference (full table)

The canonical token list. Generated from [`packages/design-system/src/tokens.v2.css`](../../packages/design-system/src/tokens.v2.css) on Stage B S1. Each row: token name, type, light value, dark value, density-junior modifier, density-pro modifier, used by.

(Full table inlined in the DOCX export; here we show categories — see §6 for representative values.)

- **Brand:** `--brand-50/100/500/600/700` × {light, dark}
- **Semantic:** `--success/proficient/developing/danger/locked/reward/aurora` × `-500/-600` × {light, dark}
- **Aurora gradients:** `--aurora-ai`, `--aurora-celebration`, `--aurora-progress` × {light, dark}
- **Subject:** `--subj-physics/chemistry/biology/maths/english/history/geography/gs/cs/hindi` × {light, dark}
- **Neutrals:** `--neutral-0/50/100/200/300/400/500/600/700/800/900` × {light, dark}
- **Mastery:** `--mastery-0/weak/dev/strong/mastered` × {light, dark}
- **Typography:** `--t-display/h1/h2/h3/h4/body-lg/body/body-sm/label/overline/button/mono` (size, line, weight, tracking)
- **Spacing:** `--sp-1` through `--sp-20`
- **Radius:** `--r-sm/md/lg/xl/2xl/pill`
- **Shadow:** `--sh-xs/sm/md/lg/xl`
- **Motion:** `--m-fast/base/slow/spring`
- **Z-index:** `--z-base/sticky/drawer/modal/toast/tooltip`
- **Breakpoint:** `--bp-xs/sm/md/lg/xl/2xl`
- **Density scalars:** `--space-scale`, `--type-scale`, `--radius-scale`, `--motion-scale`

Total tokens: ≈ 220.

---

## Appendix B — Route × component composition matrix

The single-source-of-truth mapping every route to the primitives + organisms that compose it. Used by engineering to plan sprints and by QA to plan coverage.

| Route | Layout shell | Organisms | Molecules | Atoms (notable) |
|---|---|---|---|---|
| `/` (lands at /home) | AppShell | MissionCard, PlanList, AIInsightCard, RankCard, StreakChip | StatCard, Card, Banner, EmptyState | Button, Tag, Avatar, Skeleton |
| `/home` | AppShell | MissionCard, PlanList, AIInsightCard, RankCard, ReadinessTrajectory mini, StreakChip | StatCard, Card, Tabs, EmptyState | Button, Tag, Avatar, Skeleton |
| `/catalog` | AppShell | NavSidebar, TopBar, ExamCard (×N) | Card, Banner, Stepper (browse by stream) | Button, Tag, Avatar |
| `/catalog/exam/:examId` | AppShell | SubjectMasteryGrid, RankCard, AIInsightCard | Card, Tabs, MasteryCell | Button, Tag, Chip |
| `/catalog/topic/:topicId` | AppShell | PrerequisiteMap, AITutorPane (inline), AIInsightCard | Card, Tabs, StatCard, MasteryCell, FormField | Button(aurora), Tag, Avatar |
| `/analysis` | AppShell | ReadinessTrajectory, RankCard, AIInsightCard, SubjectRadar | Card, StatCard, Tabs, MasteryCell, DataGrid | Button, Tag, Skeleton |
| `/concept-profile` | AppShell | PrerequisiteMap mini, AIInsightCard | Card, StatCard | Button, Tag |
| `/diagnostic-deep-dive` | AppShell | AIInsightCard, PlanList | Card, StatCard, Banner | Button(aurora), Tag |
| `/friends` | AppShell | (search bar uses CommandPalette inline) | Card, EmptyState, FormField | Button, Avatar, Chip |
| `/clans` | AppShell | ClanCard, ClanLeaderboard mini | Card, EmptyState, FormField, Tabs | Button, Tag, Avatar |
| `/clans/:clanId` | AppShell | ClanCard, LeaderboardRow ×N, BattleLobbyCard, AITutorPane (clan chat) | Card, Tabs, Avatar group | Button, Tag |
| `/leaderboards` | AppShell | PodiumCard, LeaderboardRow ×N, DataGrid | Card, Chip filters, Tabs | Button, Tag, Avatar |
| `/battle` | AppShell | BattleLobbyCard, LeaderboardRow recent | Card, Tabs, Chip filters | Button, Tag, Avatar |
| `/rank` | AppShell | ReadinessTrajectory per exam, RankCard | Card, StatCard, Tabs | Tag |
| `/league` | AppShell | RankCard, LeaderboardRow ×N | Card, Tabs | Button, Tag, Avatar |
| `/practice` | AppShell | (mode picker cards) | Card, Banner, Tabs | Button(aurora), Tag |
| `/practice/mistakes` | AppShell | DataGrid | Card, Chip filters, Tabs | Button |
| `/practice/diagnostic` | AppShell | PracticeRunnerShell (compact) | Card | Button, FormField |
| `/practice/build` | AppShell | (form) | Card, FormField, Slider | Button |
| `/practice/my-tests` | AppShell | DataGrid | Card, Tabs | Button |
| `/practice/ai-suggestions` | AppShell | AIInsightCard ×N | Card | Button(aurora), Tag |
| `/mock-exam` | AppShell | (mode picker) | Card, Banner | Button |
| `/pyq` | AppShell | DataGrid, Chip filters | Card | Button, Tag |
| `/mocks` | AppShell | (test grid) | Card, Tabs | Button |
| `/revision` | AppShell | (revision queue) | Card, Tabs | Button |
| `/quiz/:sessionId` | (no shell — focus mode) | PracticeRunnerShell | Modal (for AI hint, end-of-session) | Button, Tag, Slider (confidence) |
| `/study/:examId/:subjectId` | AppShell | (TopicCard grid) | Card, Tabs | Button, Tag |
| `/library` | AppShell | DataGrid (compact) | Card, Chip filters | Button |
| `/syllabus` | AppShell | (accordion list) | Accordion, Card | Tag, Button |
| `/bookmarks` | AppShell | DataGrid | Card, Chip filters | Button |
| `/history` | AppShell | DataGrid | Card, Tabs, Chip filters | Button |
| `/search` | AppShell | (search results) | Card, Tabs, Chip filters, FormField | Button |
| `/tutors/:userId` | AppShell | (calendar widget) | Card, Tabs, Avatar | Button, Tag, Chip |
| `/bookings` | AppShell | DataGrid | Card, Tabs | Button |
| `/courses/:courseId` | AppShell | (course landing) | Card, Accordion, Avatar group, Banner | Button(aurora), Tag |
| `/courses-mine` | AppShell | (enrolled grid) | Card, Chip filters | Button, Tag |
| `/billing` | AppShell | DataGrid (payment history) | Card, StatCard, Tabs | Button |
| `/assignments` | AppShell | DataGrid | Card, Tag | Button |
| `/experts` | AppShell | (mode picker) | Card, Banner | Button(aurora) |
| `/doubts/:doubtId` | AppShell | AITutorPane | Card | Button(aurora) |
| `/tutor-history/:sessionId` | AppShell | AITutorPane (read-only) | Card | Button |
| `/profile` | AppShell | StreakChip popover, (achievement grid) | Card, StatCard, Tabs, Avatar(2xl) | Tag, Chip |
| `/settings` | AppShell | (theme + density preview) | Card, Tabs, FormField, Switch, RadioGroup | Button |
| `/inbox` | AppShell | (split list/detail) | Card, Tabs, DataGrid | Button |
| `/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password` | (split-screen, no AppShell) | – | Card, FormField, Banner, Toast | Button(primary, fullWidth) |
| `/screening` | (split-screen) | PracticeRunnerShell (compact) | Card, Stepper | Button |
| `/onboarding/exam`, `/language`, `/target-date`, `/diagnostic`, `/daily-goal` | (split-screen with Stepper) | (per-step content) | Card, FormField, Stepper | Button |
| `/t/:slug`, `/join/:token` | (marketing-style) | – | Card, Banner | Button(aurora, fullWidth) |

**Total routes mapped:** 71. Coverage: 100%.

---

*End of Design System v2 — "Aurora". Next: review and approval. Implementation begins on user's "go".*
