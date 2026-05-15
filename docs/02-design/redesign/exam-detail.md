# Redesign brief — `/catalog/exam/:examId` (Exam detail)

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora.md)
**Status:** Proposed
**Date:** 2026-05-13

---

## 1. Current state

Two parallel presentations of the same data, toggled by a top-right switcher:

- **Table view:** Subject → Chapter rows, mastery bars, Practice/Open buttons.
- **Cards view:** Six gradient cards with single letters: `C / G / I / O / M / O` (Cell Biology / Genetics / Inorganic / Organic / Mechanics / Optics).

**Problems:**
- Letter monograms carry **no information**. "C" appears twice (Cell Biology and Chemistry "Inorganic"), and "O" appears twice (Organic and Optics) — the only distinguishing signal (the gradient) is randomized.
- View toggle exists because neither view is good — two mediocre presentations of the same data, not two viable choices.
- Subject grouping is in the cards view (text labels) but disappears in table view (subject column repeats per row).
- Hero stat tiles ("Overall Mastery 2% / Topics Started 1 of 6 / Total Chapters 6 / Question Bank 120") are sparse, narrow, low-information.
- Mastery bar uses red for both "10% Cell Biology" and "Not started" — encoding collision.
- Days-to-exam, projected rank, AI insights all absent from this page (they live on Home).

---

## 2. Redesign rationale

This page should answer: **"Across this exam, where am I weakest and where should I work next?"**

Aurora replaces both views with a single **SubjectMasteryGrid** — heatmap-cards grouped by subject. The hero is restructured to put the readiness band, days-to-exam, and projected rank in front (same components reused from Home).

- **One view, no toggle.** Heatmap-cards are functional *and* legible.
- **Subject color + icon** as the visual anchor — not random gradients.
- **Mastery as color-encoded ring** consistent with the rest of the design system.
- **Hero shows rank + readiness + days-to-exam** — orient before scanning.
- **AI "next-best-chapter" CTA** above the grid — actionable prescription.

---

## 3. Composition map

| Region | Components |
|---|---|
| TopBar | `TopBar` |
| Hero | `Card` with subject-mix donut + `StatCard` × 3 (rank, readiness, days) + AI next-best-chapter CTA |
| Filter strip | `Chip` cluster (Subject filter, Mastery filter, Sort) + Search |
| Main | `SubjectMasteryGrid` — 2-col xl, 1-col mobile, grouped by subject with `<h2>` subject headers |
| Sticky right rail (xl) | `AIInsightCard` + `RankCard` mini + jump-to-subject nav |

**SubjectMasteryGrid** is a new organism — heat-mapped grid of `MasteryCell` cards grouped by subject:

```
┌─────────────────────────────────────────────────────────────┐
│ 🌿 BIOLOGY   2 chapters · Your mastery 5%                    │
│ ┌────────────────────────┐  ┌────────────────────────┐      │
│ │ Cell Biology           │  │ Genetics               │      │
│ │ ━━━━━━━━━━━━ 10%       │  │ ─────── 0% Not started │      │
│ │ 20 q · 1 attempt       │  │ 20 q · 0 attempts      │      │
│ │ [ Practice ] [ Open ]  │  │ [ Begin ]              │      │
│ └────────────────────────┘  └────────────────────────┘      │
│                                                              │
│ 🧪 CHEMISTRY  2 chapters · Your mastery 0%                   │
│ ┌────────────────────────┐  ┌────────────────────────┐      │
│ │ Inorganic Chemistry    │  │ Organic Chemistry      │      │
│ │ ─────── 0% Not started │  │ ─────── 0% Not started │      │
│ │ 20 q · 0 attempts      │  │ 20 q · 0 attempts      │      │
│ │ [ Begin ]              │  │ [ Begin ]              │      │
│ └────────────────────────┘  └────────────────────────┘      │
│                                                              │
│ ⚛ PHYSICS    2 chapters · Your mastery 0%                    │
│ ┌────────────────────────┐  ┌────────────────────────┐      │
│ │ Mechanics & Waves      │  │ Optics                 │      │
│ │ ─────── 0% Not started │  │ ─────── 0% Not started │      │
│ │ 20 q · 0 attempts      │  │ 20 q · 0 attempts      │      │
│ │ [ Begin ]              │  │ [ Begin ]              │      │
│ └────────────────────────┘  └────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

Each cell card has a subtle background tint by mastery bucket:
- Not started: `--neutral-50` (light) / `--neutral-100` (dark)
- Weak: `--danger-50` (light) / faint red-tinted dark
- Developing: `--developing-50` (light)
- Strong: `--success-50` (light)
- Mastered: subtle `--aurora-progress` overlay

---

## 4. Wireframes

### 4.1 Desktop (xl ≥ 1280)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  AdaptiveLearn  ▾   ⌘K Search…              🔥 47    🔔    👤                              │
├────────┬───────────────────────────────────────────────────────────────────────────────────┤
│        │  ← All exams                                                                       │
│  Home  │                                                                                    │
│ ▶Stdy  │  NEET 2026   Medical entrance                                                      │
│  Prac  │                                                                                    │
│  Btl   │  ┌────────────────────────────────────────────────────────────┐ ┌────────────────┐│
│  Anls  │  │   Subject mix donut         RANK         READINESS   DAYS  │ │ AI INSIGHT     ││
│  Frnds │  │   ╱      ╲                  2.1M ↓12k    10% ↗     153    │ │ ✦ Cell Biology ││
│  Clans │  │   │ Bio  │                  Off-track   Off-track   to go  │ │   is your big  ││
│  Ldrbd │  │   ╲ Chem ╱                                                  │ │   drop. Try a  ││
│  Setn  │  │    Phy                       ┌──────────────────────────┐  │ │   10-min drill.││
│  Prfl  │  │                              │ AI next:  Cell Biology   │  │ │ [ Start ✦ ]    ││
│        │  │                              │ Move you 8% in 20 min    │  │ │                ││
│        │  │                              │ [ Start ✦ ]              │  │ ├────────────────┤│
│        │  │                              └──────────────────────────┘  │ │ JUMP TO        ││
│        │  └────────────────────────────────────────────────────────────┘ │  Biology       ││
│        │                                                                  │  Chemistry     ││
│        │  [Subject ▾] [Mastery ▾] [Sort: weakest first ▾]  🔍 Search    │  Physics       ││
│        │                                                                  │                 ││
│        │  🌿 BIOLOGY   2 chapters · 5%                                    │ ┌────────────┐ ││
│        │  ┌─────────────────────────────┐ ┌─────────────────────────────┐│ │ RANK       │ ││
│        │  │ Cell Biology   10% [weak]   │ │ Genetics    Not started     ││ │ 2,100,000  │ ││
│        │  │ ━━━━━━━━━━━ 10%             │ │ ─────────── 0%              ││ │ ↓ 12k/wk   │ ││
│        │  │ 20 q · 1 attempt            │ │ 20 q · 0 attempts           ││ │ ▁▂▃▂▄▃▅    │ ││
│        │  │ [ Practice ] [ Open ]       │ │ [ Begin ]                   ││ └────────────┘ ││
│        │  └─────────────────────────────┘ └─────────────────────────────┘│                 ││
│        │                                                                  │                 ││
│        │  🧪 CHEMISTRY  2 chapters · 0%                                   │                 ││
│        │  ┌─────────────────────────────┐ ┌─────────────────────────────┐│                 ││
│        │  │ Inorganic                   │ │ Organic                     ││                 ││
│        │  │ ─────────── 0%              │ │ ─────────── 0%              ││                 ││
│        │  │ 20 q · 0 attempts           │ │ 20 q · 0 attempts           ││                 ││
│        │  │ [ Begin ]                   │ │ [ Begin ]                   ││                 ││
│        │  └─────────────────────────────┘ └─────────────────────────────┘│                 ││
│        │                                                                  │                 ││
│        │  ⚛ PHYSICS    2 chapters · 0%                                    │                 ││
│        │  ...                                                              │                 ││
└────────┴───────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Mobile (xs 375)

```
┌───────────────────────────────────┐
│ ☰  NEET 2026         🔥 47    👤  │
├───────────────────────────────────┤
│  Medical entrance                  │
│  ┌───────────────────────────────┐ │
│  │  HERO                          │ │
│  │  Rank 2.1M ↓12k                │ │
│  │  Readiness 10% ↗               │ │
│  │  153 days to exam              │ │
│  └───────────────────────────────┘ │
│                                    │
│  ┌───────────────────────────────┐ │
│  │ AI ✦  Cell Biology is weak.    │ │
│  │ [ Start drill ✦ ]              │ │
│  └───────────────────────────────┘ │
│                                    │
│  [Subj▾][Sort▾]  🔍                │
│                                    │
│  🌿 BIOLOGY · 5%                    │
│  ┌───────────────────────────────┐ │
│  │ Cell Biology  10% [weak]       │ │
│  │ ━━━━━━━━━━━━ 10%               │ │
│  │ 20 q · 1 attempt               │ │
│  │ [ Practice ]  [ Open ]         │ │
│  └───────────────────────────────┘ │
│  ┌───────────────────────────────┐ │
│  │ Genetics  · Not started        │ │
│  │ ────── 0%                      │ │
│  │ [ Begin ]                      │ │
│  └───────────────────────────────┘ │
│                                    │
│  🧪 CHEMISTRY · 0%                  │
│  ┌───────────────────────────────┐ │
│  │ Inorganic Chemistry            │ │
│  │ ────── 0%                      │ │
│  │ [ Begin ]                      │ │
│  └───────────────────────────────┘ │
│  ...                               │
├───────────────────────────────────┤
│ 🏠 📚 ▶ ⚔️ 👤                       │
└───────────────────────────────────┘
```

---

## 5. Copy guidelines

- Subject header includes emoji icon, name, chapter count, and your mastery: `🌿 BIOLOGY · 2 chapters · 5%`.
- Chapter mastery tag: `Tag(tone=danger|developing|success, size=sm)` `[weak]` `[developing]` `[strong]` `[mastered]`. "Not started" shown as muted text, no tag.
- Buttons: weak/dev → `[ Practice ]` primary + `[ Open ]` secondary. Not started → `[ Begin ]` aurora.
- AI next-best CTA: "Start a {duration} drill on {topic} — moves you ~{deltaPct}%" — concrete numbers, no fluff.

---

## 6. States

| State | Behavior |
|---|---|
| Loading | Hero `Skeleton` + 6 MasteryCell skeletons |
| New user (no attempts) | All cells "Not started"; hero shows "Begin diagnostic" instead of rank/readiness; AI CTA = "Start with a 5-minute diagnostic" |
| All chapters mastered | Hero shows celebration `--aurora-celebration` background + "🎉 Syllabus mastered. Now sharpen via mock exams." + `Button(aurora) "Take a mock"` |
| Filter applied | Chip shows active filter; result count "Showing 3 of 6 chapters" |
| Sort by weakest | Chapters reordered within subjects; subject groups still in canonical order (Biology → Chemistry → Physics for NEET) |

---

## 7. Engagement micro-moments

- On hover (md+): MasteryCell elevates with `--sh-md`; mastery bar's currently-mastered portion shimmers (200ms).
- On hover of a chapter, the corresponding slice in the hero donut highlights (cross-component link).
- Mastery crossing into "strong" anywhere triggers a per-cell celebration ring pulse.

---

## 8. Accessibility notes

- Subject groups are `<section>` with `<h2 class="visually-hidden">{subject name}</h2>` plus visible row.
- Mastery bar has both visual fill + `aria-valuenow` + text alternative ("10% mastered").
- Color-coded backgrounds never the sole signal — every cell has a text mastery percent.
- Jump-to-subject nav in right rail is `<nav aria-label="Jump to subject">` with anchor links.
