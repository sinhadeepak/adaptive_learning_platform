# Redesign brief — `/catalog` (Browse exams)

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora.md)
**Status:** Proposed
**Date:** 2026-05-13

---

## 1. Current state

Flat vertical list of 9 exam rows (JEE Main, NEET, UPSC CSE, CAT, CBSE Class 8, CBSE Class 9, Class 7, Vedic Maths). All equal weight. Right-side chevron only. No filter, no search, no grouping, no progress preview, no "your active exam" emphasis.

**Problems:**
- A Class 7 student has to read past CAT and UPSC to reach their content.
- No indication which exam the user is currently active on (NEET is active per other screens).
- No mastery / progress preview — students can't tell what they've started.
- No discovery — "Browse by stream", "Most popular for your grade" absent.
- Letter monograms with random gradients (visible elsewhere) carry into this page too.

---

## 2. Redesign rationale

Catalog answers "which exam am I working on?" and "what else is available?". The answer should be visually instant, grouped by relevance, and provide progress at a glance.

Three zones:

1. **"Continue your exam"** — hero card for the most recently active exam.
2. **"Your enrolled"** — compact row of ExamCards for any other enrolled exams.
3. **"Browse by stream"** — Engineering / Medical / Civil Services / Management / School / Skills. Each stream has 1–5 ExamCards.

---

## 3. Composition map

| Region | Components |
|---|---|
| Top bar | `TopBar` (same as Home) |
| Hero | `MissionCard`-shaped (large), themed for active exam |
| Enrolled row | Horizontal scroll of `ExamCard` (compact) |
| Browse stream sections | `Accordion`-like grouping; each stream = label + `ExamCard` grid (3-col xl, 2-col md, 1-col xs) |
| Filter strip | `Chip` cluster: Stream / Grade / Free-only / Has-mock |
| Search | `Input` with Lucide search icon — focuses on the catalog only |

**ExamCard anatomy:**

```
┌─────────────────────────────────────────────┐
│  ╔═══════════════════════════════════════╗  │  ← subject-mix donut as cover
│  ║  Physics 35%  Chem 35%  Bio 30%       ║  │
│  ╚═══════════════════════════════════════╝  │
│  NEET 2026                       [ Active ] │  ← tag if active
│  Medical entrance · Class 11-12              │
│                                              │
│  📅 153 days to exam                         │
│  🎯 Your mastery 10%                         │
│  📝 120 questions · 6 chapters               │
│                                              │
│  [  Continue  →  ]                           │
└─────────────────────────────────────────────┘
```

For not-enrolled exams: the donut shows the official syllabus weighting; mastery row replaced by "Begin" CTA.

---

## 4. Wireframes

### 4.1 Desktop (xl ≥ 1280)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  AdaptiveLearn ▾    ⌘K  Search exams, topics, friends…       🔥 47    🔔    👤             │
├────────┬───────────────────────────────────────────────────────────────────────────────────┤
│  Home  │  Browse exams                                                                      │
│ ▶Stdy  │  Pick an exam to explore its subjects and topics.                                  │
│  Prac  │                                                                                    │
│  Btl   │  ┌───────────────────────────────────────────────────────────────────────────┐    │
│  Anls  │  │ CONTINUE YOUR EXAM   ~ aurora ai ~                                          │    │
│  Frnds │  │                                                                              │    │
│  Clans │  │   NEET 2026  ★ Active                                                        │    │
│  Ldrbd │  │   Medical entrance · 153 days to exam                                        │    │
│  Setn  │  │   Your mastery 10%   ●○○○○○○○                                                │    │
│  Prfl  │  │                                                                              │    │
│        │  │   [  Continue practice  →  ]   [  View syllabus  ]                          │    │
│        │  └───────────────────────────────────────────────────────────────────────────┘    │
│        │                                                                                    │
│        │   Filter:  [All streams ▾]  [All grades ▾]  [Free only ▢]   🔍 Search…           │
│        │                                                                                    │
│        │  YOUR ENROLLED                                                                     │
│        │  ←─────────────────── horizontal scroll ───────────────────→                      │
│        │  ┌────────────┐  ┌────────────┐                                                   │
│        │  │ NEET 2026  │  │ CBSE Cl 11 │                                                   │
│        │  │ 🎯 10%     │  │ 🎯 22%     │                                                   │
│        │  │ [Continue] │  │ [Continue] │                                                   │
│        │  └────────────┘  └────────────┘                                                   │
│        │                                                                                    │
│        │  BROWSE BY STREAM                                                                  │
│        │                                                                                    │
│        │  ▾ Engineering                                                                     │
│        │  ┌────────────┐  ┌────────────┐  ┌────────────┐                                  │
│        │  │ JEE Main   │  │ JEE Adv.   │  │ GATE 2026  │                                  │
│        │  │ Phy/Chem/  │  │ Phy/Chem/  │  │ CS/EC/...  │                                  │
│        │  │  Maths     │  │  Maths     │  │            │                                  │
│        │  │ [ Begin ]  │  │ [ Begin ]  │  │ [ Begin ]  │                                  │
│        │  └────────────┘  └────────────┘  └────────────┘                                  │
│        │                                                                                    │
│        │  ▾ Medical                                                                         │
│        │  ┌────────────┐  ┌────────────┐                                                   │
│        │  │ NEET 2026  │  │ NEET PG    │                                                   │
│        │  │ ★ Active   │  │            │                                                   │
│        │  │ [Continue] │  │ [ Begin ]  │                                                   │
│        │  └────────────┘  └────────────┘                                                   │
│        │                                                                                    │
│        │  ▾ Civil Services                                                                  │
│        │  ┌────────────┐                                                                   │
│        │  │ UPSC CSE   │                                                                   │
│        │  │ [ Begin ]  │                                                                   │
│        │  └────────────┘                                                                   │
│        │                                                                                    │
│        │  ▾ School (CBSE)                                                                   │
│        │  ┌────────────┐  ┌────────────┐  ┌────────────┐                                  │
│        │  │ Class 8    │  │ Class 9    │  │ Class 7    │                                  │
│        │  │            │  │            │  │            │                                  │
│        │  │ [ Begin ]  │  │ [ Begin ]  │  │ [ Begin ]  │                                  │
│        │  └────────────┘  └────────────┘  └────────────┘                                  │
│        │                                                                                    │
│        │  ▾ Skills                                                                          │
│        │  ┌────────────┐                                                                   │
│        │  │ Vedic Math │                                                                   │
│        │  │ [ Begin ]  │                                                                   │
│        │  └────────────┘                                                                   │
└────────┴───────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Mobile (xs 375)

```
┌───────────────────────────────────┐
│ ☰  Catalog            🔥 47   👤  │
├───────────────────────────────────┤
│  ┌───────────────────────────────┐ │
│  │ CONTINUE  ~aurora~             │ │
│  │ NEET 2026  ★ Active            │ │
│  │ 153 days · 10% mastery         │ │
│  │ [ Continue → ]                 │ │
│  └───────────────────────────────┘ │
│                                    │
│  [Stream▾] [Grade▾]  🔍            │
│                                    │
│  YOUR ENROLLED                     │
│  ←── scroll ──→                    │
│  ┌──────┐ ┌──────┐                │
│  │NEET  │ │CBSE  │                │
│  │  10% │ │  22% │                │
│  └──────┘ └──────┘                │
│                                    │
│  ENGINEERING                       │
│  ┌─────────────────────────────┐  │
│  │ JEE Main · Phy/Chem/Maths   │  │
│  │ [ Begin ]                    │  │
│  └─────────────────────────────┘  │
│  ┌─────────────────────────────┐  │
│  │ JEE Advanced                 │  │
│  │ [ Begin ]                    │  │
│  └─────────────────────────────┘  │
│                                    │
│  MEDICAL                           │
│  ┌─────────────────────────────┐  │
│  │ NEET 2026 ★                  │  │
│  │ [ Continue ]                 │  │
│  └─────────────────────────────┘  │
│  ...                               │
├───────────────────────────────────┤
│  🏠   📚   ▶    ⚔️    👤          │
└───────────────────────────────────┘
```

---

## 5. Copy guidelines

- **Stream labels:** sentence case ("Engineering", "Medical", "Civil Services", "School (CBSE)", "Skills"). Sorted by personalization signal: relevant streams first based on user's grade/age.
- **ExamCard subtitle:** one line — "Medical entrance · Class 11–12", "Civils · Prelims + Mains".
- **Active tag:** `Tag(tone=brand, variant=soft, size=sm)` "Active" with bullet prefix `★`.
- **Search placeholder:** "Search exams, subjects, topics…"

---

## 6. States

| State | Behavior |
|---|---|
| Loading | 1 hero `Skeleton` + 5 enrolled-row `Skeleton` cards + 3 stream sections, each with 3 card skeletons |
| Empty (new user, no enrollment) | Hero replaced with `EmptyState`: "Pick your first exam to begin. We'll generate a 5-minute diagnostic and a personalized plan." + secondary "Browse all exams" |
| No search results | Inline `EmptyState`: "No exams match 'GMAT' yet. [ Suggest this exam ]" |
| Filter applied | Sticky chips show active filters with X to remove; result count "Showing 3 of 12" |
| One enrolled, multiple available | Hero shows enrolled; "Browse by stream" defaults to expanded for streams matching the user's grade |

---

## 7. Engagement micro-moments

- ExamCard subject-mix donut animates in (200ms stagger) on first viewport entry.
- Active exam card has a subtle Aurora-progress shimmer on its border.
- Tapping "Begin" on a not-enrolled exam opens the diagnostic flow (a Sheet that walks through 3-question quick onboarding before enrollment).

---

## 8. Accessibility notes

- Stream sections are `<section>` with `<h2>` labels.
- ExamCards are interactive `<a>` (with Link wrapper) — full card clickable; "Begin/Continue" Button is the explicit affordance.
- Donut decoration is `aria-hidden="true"`; subject mix is announced via `aria-label` on the card.
- Filter chips: `aria-pressed` for toggle state.
- Search input has `aria-label="Search catalog"`.
