# Redesign brief — `/analysis` (Analytics)

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora.md)
**Status:** Proposed
**Date:** 2026-05-13

---

## 1. Current state

Five stat tiles (AI Readiness 10.0 / Projected by May 1 = 95 / AI Ability Estimate -1.60 / Mastery Precision 10% / Learning Events 10), AI-generated insights block, "Readiness trajectory" line chart with very few data points, "Subject mastery" donut, "AI ability estimate" gauge, "Topic mastery breakdown — 1 topic" table.

**Problems:**
- Six KPIs above the fold, none labeled in context — "Projected by May 1 = 95" doesn't say *what* 95 is.
- "Mastery Precision 10%" — opaque jargon; students don't know what action to take.
- Trajectory chart is mostly empty — visual hyperbole hides sparse data.
- "AI ability estimate -1.60 Beginner" exposes IRT theta without translation.
- Topic mastery table has column headers (Subject / Mastery / Strength) and one row — empty-state UI absent.
- Whole page is descriptive, not prescriptive — no "what should I do" section.

---

## 2. Redesign rationale

Analytics page answers three questions in order:

1. **Where do I stand?** — composite "you are here" hero with the metrics that matter (readiness, rank, days, streak).
2. **What changed?** — week-over-week deltas with sparklines, by subject.
3. **What should I do?** — prioritized action list, deep-linked to topics, each with expected impact.

Drill-down via sticky `Tabs` (Overview / Sessions / Topics / Predictions / Saved).

---

## 3. Composition map

| Region | Components |
|---|---|
| TopBar | `TopBar` |
| Hero "Where you stand" | `Card` with composite layout: `ReadinessTrajectory` (left, large) + `StatCard` × 3 (right: rank / mastery / streak) + readiness band tag |
| Tabs | `Tabs` — Overview (default) / Sessions / Topics / Predictions / Saved |
| Overview tab — "What changed" | Grid of subject delta cards (one per enrolled subject); each has sparkline + delta + status |
| Overview tab — "What to do" | `PlanList` of prioritized actions; each row = topic + expected impact + duration + CTA |
| Overview tab — Subject mastery | `RadarChart` (or grouped bar) — Bloom levels by subject |
| Overview tab — AI insights | `AIInsightCard` × 2 with deep-link CTAs |
| Sessions tab | `DataGrid` of past sessions with accuracy, time, subject filter chips |
| Topics tab | `DataGrid` of all topics with mastery, accuracy, last attempt, sort by weakest |
| Predictions tab | `RankCard` per exam + projection trajectory; explanation of confidence interval |
| Saved tab | `DataGrid` of bookmarked patterns, mistakes |
| Right rail (xl) | Glossary helper `Card` ("What's readiness?" mini explainer) |

---

## 4. Wireframes

### 4.1 Desktop (xl ≥ 1280) — Overview tab

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  AdaptiveLearn  ▾   ⌘K Search…              🔥 47    🔔    👤                              │
├────────┬───────────────────────────────────────────────────────────────────────────────────┤
│        │  Analysis  ·  NEET 2026                                          [ Share report ] │
│  Home  │                                                                                    │
│ ▶Anly  │  ┌────────────────────────────────────────────────────────────┐ ┌──────────────┐ │
│  Stdy  │  │ WHERE YOU STAND                                              │ │  GLOSSARY     ││
│  Prac  │  │                                                              │ │  Readiness =  ││
│  Btl   │  │   READINESS  Trajectory + projection                         │ │  weighted     ││
│  Frnds │  │     ┃                          ╱  target band                │ │  mastery of   ││
│  Clans │  │     ┃                       ╱╱                               │ │  all topics in││
│  Ldrbd │  │     ┃                    ╱╱   ─ ─ ─ ─ ─ ─                    │ │  syllabus.    ││
│  Setn  │  │     ┃                ●─●─                                    │ │  Higher =     ││
│  Prfl  │  │     ┃             ●●                                          │ │  more exam-   ││
│        │  │     ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━→                    │ │  ready.       ││
│        │  │      May            Jul          Sep          Nov            │ │               ││
│        │  │                                                              │ │ Why -1.60?    ││
│        │  │     [ off-track ]                                            │ │ It's your     ││
│        │  │                                                              │ │  ability      ││
│        │  │   RANK         MASTERY        STREAK         DAYS TO EXAM    │ │  estimate     ││
│        │  │   2.1M ↓12k    10% +3%/wk     🔥 47          153             │ │  vs cohort.   ││
│        │  └────────────────────────────────────────────────────────────┘ │               ││
│        │                                                                  │               ││
│        │  Overview   Sessions   Topics   Predictions   Saved              │               ││
│        │  ────────                                                        │               ││
│        │                                                                  │               ││
│        │  WHAT CHANGED THIS WEEK                                          │               ││
│        │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐│               ││
│        │  │ 🌿 Biology       │  │ 🧪 Chemistry     │  │ ⚛ Physics        ││               ││
│        │  │  10% ↑ +3%       │  │  0%  ─ stable    │  │  0%  ─ stable    ││               ││
│        │  │  ▁▂▃▂▃▄▄         │  │  ▁▁▁▁▁▁▁         │  │  ▁▁▁▁▁▁▁         ││               ││
│        │  │  1 topic active  │  │  0 topics active │  │  0 topics active ││               ││
│        │  └──────────────────┘  └──────────────────┘  └──────────────────┘│               ││
│        │                                                                  │               ││
│        │  WHAT TO DO NEXT  (ranked by expected impact)                    │               ││
│        │  1. 🌿 Cell Biology · 20-min drill                               │               ││
│        │     Expected: +8% mastery · +0.4% readiness          [ Start ✦ ] │               ││
│        │  2. 🌿 Genetics · Begin (it's a prereq)                          │               ││
│        │     Expected: unlocks 2 downstream topics            [ Begin ]   │               ││
│        │  3. 🧪 Inorganic · Begin                                         │               ││
│        │     Expected: +6% readiness if mastered to 70%        [ Begin ]  │               ││
│        │                                                                  │               ││
│        │  SUBJECT MASTERY  (Bloom)                                        │               ││
│        │       Remember   Understand   Apply   Analyze   Evaluate   Create│               ││
│        │  Bio    ●●         ●●           ●        ─         ─          ─   │               ││
│        │  Chem    ─         ─            ─        ─         ─          ─   │               ││
│        │  Phy     ─         ─            ─        ─         ─          ─   │               ││
│        │                                                                  │               ││
│        │  AI INSIGHTS                                                     │               ││
│        │  ✦ Your wrong answers in Cell Biology cluster on organelle      │               ││
│        │    functions — 60% of your errors. Targeted drill recommended.   │               ││
│        │  [ Start drill ✦ ]                                               │               ││
└────────┴───────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Mobile (xs 375) — Overview

```
┌───────────────────────────────────┐
│ ☰  Analysis · NEET    🔥 47    👤  │
├───────────────────────────────────┤
│  WHERE YOU STAND                   │
│  ┌───────────────────────────────┐ │
│  │ Readiness 10% ↗ off-track      │ │
│  │ ▁▂▃▂▄▃▅▄▆                      │ │
│  │ Rank 2.1M · 153d · 🔥 47       │ │
│  └───────────────────────────────┘ │
│                                    │
│  Ovrvw  Sssns  Tpcs  Pred  Sved   │
│  ─────                             │
│                                    │
│  WHAT CHANGED                      │
│  ┌───────────────────────────────┐ │
│  │ 🌿 Biology +3% ▁▂▃▂▃           │ │
│  └───────────────────────────────┘ │
│  ┌───────────────────────────────┐ │
│  │ 🧪 Chemistry  ─ stable          │ │
│  └───────────────────────────────┘ │
│  ┌───────────────────────────────┐ │
│  │ ⚛ Physics    ─ stable          │ │
│  └───────────────────────────────┘ │
│                                    │
│  WHAT TO DO                        │
│  1. 🌿 Cell Bio · 20m drill        │
│     +8% mastery                    │
│     [ Start ✦ ]                    │
│  2. 🌿 Genetics · Begin            │
│     unlocks 2 topics               │
│     [ Begin ]                      │
│  3. 🧪 Inorganic · Begin           │
│     +6% readiness                  │
│     [ Begin ]                      │
├───────────────────────────────────┤
│ 🏠 📚 ▶ ⚔️ 👤                       │
└───────────────────────────────────┘
```

---

## 5. Copy guidelines

- "Where you stand" headings sentence case; KPIs in `--t-display`.
- Readiness band tags: `[off-track]` (`--danger-600` soft), `[on-track]` (`--success-600` soft), `[ahead]` (`--aurora-progress` soft).
- "What changed" delta: `+3%` green, `─ stable` neutral, `-2%` red. Always pair with a sparkline.
- "What to do next" rows have **expected impact** in real numbers — never "improve your skills".
- AI insights: pattern-based ("Your wrongs cluster on…") + actionable CTA. ≤ 22 words.

---

## 6. States

| State | Behavior |
|---|---|
| Loading | Skeleton for hero + 3 subject cards + 3 action rows |
| New user (no data) | `EmptyState` for hero: "Take the 10-minute diagnostic to unlock analytics" + `Button(aurora)` "Start diagnostic" |
| One subject active | Hide empty subjects; show single big card with full breakdown; AI insight asks if user wants to start a second subject |
| Trajectory regression | Hero band shifts to amber; AI insight is supportive ("We can adjust your daily target — want help?") |
| Predictions tab — low confidence | Show plain-English caveat ("Based on 1 session. Estimates will sharpen after 5+.") + smaller projected number |

---

## 7. Engagement micro-moments

- Sparklines in subject cards animate in (stagger 50ms each).
- Readiness band crossing into "on-track" → `--aurora-progress` toast.
- "What to do next" row hover (md+) reveals a sub-line: "Why this is #1: highest expected delta / weakest topic with active streak / etc."

---

## 8. Accessibility notes

- All numbers paired with text label ("Readiness 10 percent off-track").
- Trajectory chart has a screen-reader-only `<table>` fallback.
- Sparklines have `role="img"` with `aria-label="trend over last 7 days, increasing"`.
- "Glossary" right rail items expand on focus (keyboard-friendly).
- Tabs use Radix Tabs.
