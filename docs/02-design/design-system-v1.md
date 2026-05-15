# UI/UX Audit & Design System — AdaptiveLearn Student Portal

**Version**: 1.0  
**Date**: 2026-05-13  
**Status**: Strategic specification, ready for implementation kickoff (Week 1 of 12-week roadmap)

---

## Part 1 — Audit findings (the 10 problems)

1. **Density without hierarchy.** Home stacks 12+ panels with no scannable structure. A Class-8 student doesn't know where to start; a UPSC aspirant can't filter signal from noise.

2. **Microscopic typography.** Body type reads as 10–11px. Inaccessible for younger users and exhausting in a 2-hour drill session.

3. **Monochromatic wash.** Everything is the same pale lavender. "Weak", "urgent", "locked", "completed" all blur together.

4. **No iconography.** Sidebar is text-only; rows of identical labels become a wall of words, especially on mobile.

5. **Tables masquerading as products.** Leaderboards is a raw 51-row HTML table. Analysis is a stat-card grid with no narrative.

6. **Decoration without function.** Catalog uses random gradient + letter monograms — "C" on pink doesn't tell anyone it's Cell Biology under Biology.

7. **No visible mobile thinking.** Sidebar permanently open, horizontal-only stat rows, no breakpoint logic in any screenshot.

8. **Dark mode is identical to light.** Toggle exists; semantic shift doesn't.

9. **Primary action ambiguity.** Three buttons stacked vertically all labeled "Start →" with identical styling. Decision paralysis.

10. **One UI for every persona.** A 10-year-old learning fractions and a 25-year-old preparing for UPSC Mains see the same density, same vocabulary, same affordances.

---

## Part 2 — User personas (and the design implication of each)

| Attribute | Riya (Class 5–9, CBSE) | Arjun (NEET/JEE repeater) | Priya (UPSC/CAT/Pro) |
|-----------|------------------------|--------------------------|---------------------|
| Age | 10–14 | 17–19 | 22–30 |
| Session duration | 15–25 min | 60–120 min | 45–90 min |
| Needs | gamified loop, parent visibility | rank trajectory, mistake review, IRT depth | syllabus tracking, current affairs, exports |
| Vocabulary | "how well you know it" | "mastery", "Bloom level" | "concept correlation", "percentile" |
| Touch target min | ≥ 48px | ≥ 40px | ≥ 36px |
| Density mode | Comfortable | Standard | Compact |
| Decoration tolerance | High (mascots welcome) | Low | Very low |

**Design principle:** One system, three density modes auto-selected from the student's primary exam profile. Same components, different spacing + type ramp. Don't fork the UI per persona — fork the density.

> ★ **Insight** — This is exactly how Khanmigo, Notion, and Linear handle similar age/expertise spreads. They never ship two apps. They ship one component library, with one or two density tokens. It keeps engineering cost flat while the perceptual experience adapts.

---

## Part 3 — Design principles (the constitution)

1. **Clarity over cleverness.** Real subject icons, real progress, no abstract gradients.

2. **Status is color.** Weak/developing/proficient/mastered/locked/urgent each have one color used consistently across every screen.

3. **One primary action per view.** Brightest, biggest, single instance. Everything else is secondary or tertiary.

4. **Every number has a comparison.** No raw stat without "vs cohort", "vs yesterday", or "vs target".

5. **Predictable archetypes.** Topic page looks the same whether it's Kinematics or Modern History.

6. **Thumb-first, keyboard-OK.** Mobile is the canonical layout; desktop is the expansion.

7. **Restful for long sessions.** No vibrating gradients, no marquee animations, no flicker.

---

## Part 4 — Design tokens

### 4.1 Color system

#### Brand (Indigo — credible, exam-prep coded)

| Token | Light | Dark |
|-------|-------|------|
| brand/600 | #5B5BD6 | #7C7CE8 |
| brand/700 | #4949B8 | #6262D6 |
| brand/500 | #7B7BE0 | #9A9AEC |
| brand/100 | #EBEBFB | #2A2A4A |

#### Semantic (use these, never raw hex)

| State | Light | Dark | Where used |
|-------|-------|------|-----------|
| success / mastered | #16A34A | #22C55E | mastery ≥ 80%, streaks |
| proficient | #0891B2 | #22D3EE | 60–79% |
| developing | #D97706 | #FBBF24 | 30–59% |
| weak / danger | #DC2626 | #F87171 | < 30%, errors |
| locked | #94A3B8 | #52525B | prereqs not met |
| streak / reward | #F59E0B | #FBBF24 | gamification |
| ai / insight | #7C3AED | #A78BFA | AI tutor, recommendations |

#### Subject encoding (universal across catalog, topic, analysis, leaderboard)

| Subject | Color | Mnemonic |
|---------|-------|----------|
| Physics | #0EA5E9 (sky) | electricity blue |
| Chemistry | #F97316 (orange) | beaker flame |
| Biology | #10B981 (emerald) | leaf |
| Maths | #8B5CF6 (violet) | abstract |
| English | #EC4899 (pink) | language warmth |
| History/Polity | #A16207 (amber-brown) | archival |
| Geography | #0D9488 (teal) | atlas |
| General Studies | #6366F1 (indigo) | broad |

**Note:** The current "C / G / I / O / M / O" letter cards on randomized gradients should be retired — they convey nothing. Subject color + a real Lucide icon (leaf, flask-conical, atom, landmark) is instantly readable to a 10-year-old.

### 4.2 Typography

#### Font selection

| Role | Font | License |
|------|------|---------|
| Default UI | Inter | OFL — neutral, has tabular nums, excellent at 12–14px |
| Young-user (≤ Class 8) headlines | Nunito | OFL — friendlier rounded forms |
| Numbers / scores / IDs | JetBrains Mono | OFL — tabular, distinct 0/O, 1/l |
| Math content | STIX Two Math + KaTeX | OFL |

**Principle:** One font family across the system. Use Nunito only as a headline option, not body — keeps engineering simple.

#### Type scale (Standard density — Persona B baseline)

| Token | Size | Line | Weight | Tracking |
|-------|------|------|--------|----------|
| display | 36 | 44 | 700 | -0.02em |
| h1 | 28 | 36 | 700 | -0.015em |
| h2 | 22 | 30 | 600 | -0.01em |
| h3 | 18 | 26 | 600 | -0.005em |
| body-lg | 16 | 24 | 400 | 0 |
| body | 14 | 22 | 400 | 0 |
| caption | 12 | 16 | 500 | 0.01em |
| micro | 11 | 14 | 600 | 0.04em (chips, badges) |

**Density adaptation:**
- **Comfortable mode** (Class 5–9): shift every token up one step
- **Compact mode** (UPSC): shift body and caption down one step but never below 12px

### 4.3 Spacing (4pt grid)

```
xs:4  sm:8  md:12  lg:16  xl:24  2xl:32  3xl:48  4xl:64  5xl:96
```

### 4.4 Radii

```
sm:4  md:8  lg:12  xl:16  2xl:24  full:9999
```

Comfortable mode uses lg/xl by default. Compact uses sm/md.

### 4.5 Elevation

Dark mode replaces shadows with lightness steps (#0A0A0B → #161618 → #1F1F23 → #2A2A2F) plus an inner 1px border.

### 4.6 Motion

| Token | Duration | Easing | Use |
|-------|----------|--------|-----|
| micro | 120ms | ease-out | hover, focus rings |
| short | 200ms | (0.4, 0, 0.2, 1) | tabs, accordions |
| entrance | 320ms | (0.16, 1, 0.3, 1) | modals, sheets |
| celebration | 600ms | spring | mastery unlocks |

**Note:** All animations honor `prefers-reduced-motion`.

---

## Part 5 — Component library

### 5.1 Simple controls (primitives)

- **Button** — 5 variants (primary / secondary / tertiary / ghost / danger), 4 sizes (sm 32 / md 40 / lg 48 / xl 56). Loading + disabled states. Icon-leading + icon-trailing.
- **Icon Button** — same sizes, square, tooltip required.
- **Input** — outlined default, filled for dense tables. Built-in label, helper, error, prefix/suffix slot.
- **Combobox / Select** — keyboard-first, virtualized lists (catalog has 9 exams now, will be 50+).
- **Checkbox / Radio / Switch** — large hit area in Comfortable mode.
- **Slider** — for confidence rating (1–5), difficulty preview.
- **Chip / Tag / Badge** — semantic colors only. Three sizes.
- **Avatar** — initials fallback, status dot, sizes 24/32/40/56.
- **Progress** — linear, circular, segmented (6-step Bloom).
- **Tooltip** — 4 placements, focus-trap on touch.
- **Skeleton** — match the shape of what's loading, not generic rectangles.
- **Icon set** — Lucide (MIT, 1400+ icons, consistent 1.5px stroke).

### 5.2 Complex controls (composed)

| Component | Composition | Replaces |
|-----------|-------------|----------|
| **MasteryCell** | subject icon + topic name + Bloom segmented progress + mastery bar + status chip | the current dense catalog rows |
| **TopicCard** | colored subject band + topic name + mastery donut + 3 stats + CTA | letter-monogram gradient cards |
| **SessionTile** | left subject color rail + title + duration + type icon + score chip | recent activity rows |
| **InsightCard** | sparkle icon + category chip + headline + supporting data + "Why?" expand | bulleted AI insights list |
| **ActionRow** | time chip + title + meta + state (start/resume/done) | the three identical "Start →" rows |
| **StatHero** | display number + delta + sparkline + comparator | the 6 disconnected stat cards on Analysis |
| **LeaderboardRow** | rank badge (gold/silver/bronze for top 3) + avatar + name + delta + you-pin | raw HTML table |
| **PrerequisiteMap** | interactive node graph, click-to-expand | the faint static diagram |
| **ConfidenceSlider** | 5 emoji + label, large hit area | current numeric slider |
| **QuestionRenderer** | polymorphic shell for MCQ/multi/blank/match/integer/descriptive | inconsistent renderers |
| **AITutorBubble** | purple accent + sparkle icon + markdown body + copy/regenerate | plain text response |
| **ExamCard** | subject-mix donut + days-to-exam + your mastery overlay + CTA | flat catalog list |
| **PodiumCard** | top-3 only, large avatars, score, delta | first 3 rows of the table |

---

## Part 6 — Information architecture restructure

### 6.1 Sidebar

Group by purpose, add icons:

- **Learn** (icon: book-open) — Exams, Topics, Catalog
- **Practice** (icon: zap) — Sessions, Assignments, Drills
- **Compete** (icon: trophy) — Leaderboards, Battles, Clans
- **Analyze** (icon: chart-bar) — Analysis, Progress, Predictions
- **Me** (icon: user) — Profile, Preferences, Downloads

Collapsible groups, icon-only mode at <1024px, bottom-tab nav at <768px.

### 6.2 Home — current vs. proposed

**Current:** 13 stacked panels of equal weight (Today's plan, Today's mission, AI intelligence, Resume practice, My exams, Projected rank, Snap a doubt, Cross-topic diagnosis, Practice recommendation, Study health, Upcoming deadlines, Recent activity, All topics).

**Proposed — 3 zones:**

**Zone A (Hero):** Today's focus. Single primary action with countdown. "Start your 25-min Cell Biology drill" + one secondary "Pick something else".

**Zone B (Status row, 4 chips):**
- streak
- mastery delta this week
- days to exam
- rank trajectory mini-sparkline

**Zone C (Tabs):** Practice / Review / Discover / Social. Each tab loads only its lane.

**Mobile:** Zone A fills viewport; Zone B horizontal-scrolls; Zone C becomes bottom-nav tabs.

### 6.3 Catalog — current vs. proposed

**Current:** flat list of 9 exams, equal weight, no visual cues.

**Proposed:**

1. "Continue your exam" hero card (most recent activity)
2. "Your enrolled" row (compact ExamCards)
3. "Browse by stream": Engineering / Medical / Civil Services / School / Skills

Each ExamCard: subject-mix donut, mastery overlay, days-to-exam pill

### 6.4 Topic detail — current vs. proposed

**Current:** 9 sections vertically stacked.

**Proposed — 2-column with sticky rail:**

**Main (scroll):**
- hero (topic + state)
- big "Start practice" CTA
- interactive prerequisite map
- curated videos
- recent activity
- AI tutor inline

**Right rail (sticky):**
- mastery donut
- attempts
- accuracy
- rank in topic
- time-to-mastery estimate
- exam weight

### 6.5 Analysis — current vs. proposed

**Current:** 6 stat cards + chart + breakdown — disconnected.

**Proposed — narrative-led:**

1. **"Where you stand"** — composite hero: rank + projection + readiness band
2. **"What changed this week"** — delta cards per subject with sparklines
3. **"What to do next"** — prioritized action list, deep-linked to topics

Drill-down tabs — Sessions / Topics / Predictions / Confidence

### 6.6 Leaderboards — current vs. proposed

**Current:** raw 51-row table.

**Proposed:**

1. **PodiumCard** for top 3 (gold/silver/bronze, large avatars, scores)
2. **"You and your neighbors"** — rows around the current user, anchored
3. **Filters:** scope (global / clan / friends) · time (week / month / all) · exam
4. **Sticky "Jump to me"** floating button when scrolled away from user's rank
5. **Group separators** every 10 rows for scan-ability

---

## Part 7 — Responsive strategy

### Breakpoints (mobile-first)

| Range | Layout |
|-------|--------|
| xs (0–479) | bottom-tab nav, full-width cards, single column |
| sm (480–767) | same, looser spacing |
| md (768–1023) | optional left rail, 2-col for dashboards |
| lg (1024–1439) | persistent sidebar |
| xl (1440+) | persistent sidebar + right rail |

**Note:** Tables collapse to MastyCells below md. Never horizontal-scroll a 10-column table on a phone.

---

## Part 8 — Dark mode strategy

Not inverted — re-tuned:

- **Surfaces** use lightness elevation (#0A0A0B → #161618 → #1F1F23 → #2A2A2F) instead of shadows
- **Semantic colors** shift saturation: greens become slightly muted, reds become warmer, ambers more golden
- **Brand** bumps lightness ~15% (5B5BD6 → 7C7CE8) so it doesn't disappear on dark
- **Subject colors** stay vivid — they're the visual anchor
- **Focus rings** get a soft outer glow (4px @ 30% brand) instead of shadow-based depth
- **Chart palettes** have explicit dark variants (current defaults are illegible)

---

## Part 9 — Quick redesign sketches

- Home hero (Persona B, Standard density)
- Catalog card (replaces letter monogram)
- MasteryCell (row in catalog table)
- LeaderboardRow
- Analysis hero (narrative-led, replaces 6 stat cards)

*(Sketches to be added as Figma embeds or PNG attachments in the implementation phase.)*

---

## Part 10 — Implementation roadmap (12 weeks)

| Week | Deliverable |
|------|-------------|
| 1–2 | Token foundation (CSS vars, dark mode), Inter + Nunito + Lucide swap |
| 3–4 | Button / Input / Card / Chip primitives, global codemod |
| 5–6 | Home redesign (hero + status + tabs) |
| 7 | Catalog + Topic detail with sticky rail |
| 8 | Analysis narrative restructure |
| 9 | Leaderboards podium + neighbor view, Friends + Clans pass |
| 10 | Mobile bottom-nav + responsive sweep |
| 11 | Dark mode tuning (not just invert) |
| 12 | WCAG AA audit, motion polish, density-mode plumbing |

**Tooling:** Tailwind + shadcn/ui as the implementation layer, overriding their tokens with ours. Storybook for the component library so engineers can adopt incrementally without re-design churn.

> ★ **Insight** — The reason to choose Tailwind + shadcn/ui + Lucide + Inter (rather than something fancier like Radix-only or hand-rolled) is cost of consistency. Your app has 30+ screens, multiple admin and student portals, and a Flutter mobile. A token-first system that compiles to CSS variables is the only way to keep light/dark/density modes synchronized across all three platforms (web-student, web-admin, mobile via design tokens → JSON → Flutter theme).

---

## Next steps

1. **Persist this specification** — Lives at `docs/02-design/design-system-v1.md` alongside ADRs and gap register.
2. **Pick first vertical slice** — Home hero is the highest-leverage. Produce working React + Tailwind implementation against existing API contracts as a demo to convert doc to code.
3. **Kickoff Week 1** — Token foundation, font swap, Lucide migration.
