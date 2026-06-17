# Redesign brief — `/catalog/topic/:topicId` (Topic detail)

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora.md)
**Status:** Proposed
**Date:** 2026-05-13

---

## 1. Current state

Long single-column scroll for Cell Biology:

- Hero: title, "Free · Weak · 10%", three buttons stacked (Start AI practice, Practice this topic, Replay my mistakes), "Read lesson notes" link.
- Watch & Learn: 4 YouTube thumbnails.
- Four narrow stat strips horizontally (Questions / Mastery / Sessions / PTS in 5 days).
- "Time to mastery: ~0.83h" callout with explanation paragraph.
- Prerequisite Map: two static boxes connected by a thin line.
- AI Recommendation banner.
- About this topic: 4 more narrow stat strips.
- Stuck on a problem (Snap it) CTA.
- Recent activity bullet list.

**Problems:**
- Five competing CTAs above the fold (3 buttons + "Read lesson notes" + AI start).
- Stat strips repeat data from the hero and from each other (Mastery + Mastery (EWA) appear twice).
- "Time to mastery" exposes a model output ("~0.83h focused / 22 questions to 70% mastery / At your current pace 10/day, about 2 days") with no way to adjust.
- Prerequisite Map is 2 boxes — adds no insight.
- Video thumbnails carry equal weight; no recommended starting clip.
- Recent activity is a bullet list — no scannable shape.

---

## 2. Redesign rationale

Topic detail should support three distinct intents — **Learn** the topic, **Practice** the topic, **Master** the topic. Today they're all mashed in one scroll.

Aurora restructures into 3 tabs + sticky right rail:

1. **Learn** — videos, lesson notes, key concepts.
2. **Practice** — start AI round, replay mistakes, browse question bank.
3. **Mastery** — interactive prerequisite graph, your attempts timeline, weakness drivers, mastery projection.

Sticky right rail (xl) shows mastery donut + key stats — always visible, never duplicated below.

---

## 3. Composition map

| Region | Components |
|---|---|
| TopBar | `TopBar` (with back chevron) |
| Hero | `Card` with subject color rail, ProgressRing (mastery), title, status Tag, single primary CTA |
| Tabs | `Tabs(variant=underlined)` — Learn / Practice / Mastery |
| Tab: Learn | Video grid (`Card` × N, "Recommended starter" highlighted), inline lesson notes (collapsible) |
| Tab: Practice | `Card` for "Start AI round" (primary action), `Card` for "Replay mistakes", `Card` for "Question bank" (count + browse) |
| Tab: Mastery | `PrerequisiteMap` (reactflow DAG), attempts timeline (sparkline), weakness driver list |
| Sticky right rail (xl) | `StatCard` ring (mastery) + 4 mini stats + AI tutor CTA |
| Bottom (always) | `AITutorPane` collapsed strip — expandable into bottom Sheet |

---

## 4. Wireframes

### 4.1 Desktop (xl ≥ 1280)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  AdaptiveLearn  ▾   ⌘K Search…              🔥 47    🔔    👤                              │
├────────┬───────────────────────────────────────────────────────────────────────────────────┤
│        │  ← NEET 2026 / Biology                                                              │
│  Home  │                                                                                    │
│ ▶Stdy  │  ┌────────────────────────────────────────────────────────┐ ┌──────────────────┐ │
│  Prac  │  │ 🌿  Cell Biology                                         │ │  YOUR MASTERY    │ │
│  Btl   │  │                                                          │ │   ╭───╮          │ │
│  Anls  │  │ Structure and function of cells (pee viigyan)            │ │  │ 10% │  weak  │ │
│  Frnds │  │  [weak]  · Free                                          │ │   ╰───╯          │ │
│  Clans │  │                                                          │ │   ●○○○○○○○      │ │
│  Ldrbd │  │ [  ▶  Start AI practice  →  ]   Continue · 5 left        │ ├──────────────────┤ │
│  Setn  │  │                                                          │ │ Questions  20    │ │
│  Prfl  │  └────────────────────────────────────────────────────────┘ │ Sessions   1     │ │
│        │                                                                │ Exam wt   12.5%  │ │
│        │                                                                │ Pts in 5d  +4.3  │ │
│        │  Learn   Practice   Mastery                                    │                  │ │
│        │  ─────                                                          │ ┌──────────────┐ │ │
│        │                                                                │ │ AI INSIGHT ✦ │ │ │
│        │  Recommended starter ✦                                          │ │ Your last 5  │ │ │
│        │  ┌────────────────────────────────────────────────────────┐  │ │ wrongs cluster│ │ │
│        │  │                                                          │  │ │ on organelle │ │ │
│        │  │   ▶  NEET 2026 Biology · NCERT 360 Cell                  │  │ │ functions.   │ │ │
│        │  │      Suss Pahuja · 31:24                                 │  │ │ Start a 10-q │ │ │
│        │  │                                                          │  │ │ targeted drill│ │ │
│        │  └────────────────────────────────────────────────────────┘  │ │ [ Start ✦ ]  │ │ │
│        │                                                                │ └──────────────┘ │ │
│        │  More videos                                                    │                  │ │
│        │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │ ┌──────────────┐ │ │
│        │  │ ▶ Cell Theory │ │ ▶ Mitochondria│ │ ▶ Complete   │            │ │ AI TUTOR     │ │ │
│        │  │  Cl 11 18:14  │ │  Cl 11 26:16  │ │  Bio 10 days  │            │ │ ✦ Ask about  │ │ │
│        │  └──────────────┘ └──────────────┘ └──────────────┘            │ │  Cell Biology│ │ │
│        │                                                                │ │ [ Ask AI ]   │ │ │
│        │  Lesson notes  ▾                                                │ └──────────────┘ │ │
│        │  ─ Cell is the basic structural and functional unit of life… │                  │ │
│        │                                                                │                  │ │
└────────┴───────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Mobile (xs 375)

```
┌───────────────────────────────────┐
│ ← Cell Biology       🔥 47    👤  │
├───────────────────────────────────┤
│  🌿  Biology                       │
│  ╭───╮                             │
│  │10%│  [weak]                     │
│  ╰───╯                             │
│                                    │
│  [ ▶ Start AI practice → ]         │
│   Continue · 5 left                │
│                                    │
│  Learn   Practice   Mastery        │
│  ─────                             │
│                                    │
│  Recommended ✦                     │
│  ┌───────────────────────────────┐ │
│  │  ▶ NEET 360 Cell · 31:24       │ │
│  └───────────────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ │
│  │ ▶ Cell Theory │ │ ▶ Mito       │ │
│  └──────────────┘ └──────────────┘ │
│                                    │
│  Lesson notes ▾                    │
│  Cell is the basic structural...   │
│                                    │
│  ┌───────────────────────────────┐ │
│  │ AI INSIGHT ✦                   │ │
│  │ Your wrongs cluster on         │ │
│  │ organelle functions.           │ │
│  │ [ Start ✦ ]                    │ │
│  └───────────────────────────────┘ │
├───────────────────────────────────┤
│ 🏠 📚 ▶ ⚔️ 👤                       │
└───────────────────────────────────┘
   FAB: [ ✦ Ask AI ]
```

### 4.3 Mastery tab — Desktop

```
                                                                    [Mastery tab content]
                Prerequisite graph
                ─────────────────
                                                                    
                  ┌─────────────┐                                   
                  │ Cell Bio    │   ← current topic (highlighted)   
                  │   10%       │                                   
                  └─────┬───────┘                                   
                        │                                            
                        ▼                                            
                  ┌─────────────┐                                   
                  │ Genetics    │   ← downstream (not started)      
                  │  not strtd  │                                   
                  └─────────────┘                                   

                Attempts timeline
                ─────────────────
                  ─●──────●─────────────────●──→
                  1st     2nd               last
                  60% acc 45% acc           50% acc
                
                Weakness drivers
                ─────────────────
                  • Organelle functions (3/5 wrong)
                  • Membrane transport (2/3 wrong)
                  • Mitosis stages (1/2 wrong)
                  
                [ Start targeted drill on top weakness ]
```

---

## 5. Copy guidelines

- Hero title: subject icon + topic name; subtitle = brief description (use existing `pee viigyan` style — sentence case).
- Status tag uses canonical mastery wording: `[weak]`, `[developing]`, `[strong]`, `[mastered]`, `[not started]`.
- Primary CTA varies by mastery: not-started → "Begin practice", weak → "Practice weak points", developing → "Continue practice", strong/mastered → "Quick refresher".
- Tab labels: short verbs (Learn / Practice / Mastery).
- AI Insight: pattern-based, never generic — "Your last 5 wrongs cluster on {pattern}".

---

## 6. States

| State | Behavior |
|---|---|
| Loading | Hero `Skeleton` + tab skeletons + 4 video card placeholders |
| Not started | Hero CTA = "Begin practice" (aurora variant); Learn tab default; AI Insight = "We'll learn your weak points after a short round" |
| Mastered | Hero shows `--aurora-celebration` background, "Mastered 🎉", CTA = "Refresh / Help others" |
| Locked (prereq not met) | Hero shows `Locked` tag; CTA = "Complete {prereq topic} first" + breadcrumb |
| Empty video list | EmptyState in Learn tab: "Videos coming soon. Try the lesson notes or AI Tutor." |

---

## 7. Engagement micro-moments

- ProgressRing animates from 0 → current mastery on first load (320ms).
- Practice tab "Start AI round" button has a slow Aurora shimmer (2.5s loop).
- Crossing a mastery threshold during a practice round triggers a toast on return + ring re-animation.
- Prerequisite graph expands on click (zoom/pan supported via reactflow).

---

## 8. Accessibility notes

- Tab list uses Radix Tabs primitive with full keyboard support.
- Sticky right rail has `aria-label="Topic summary"`.
- ProgressRing has dual representation (visual + percentage text).
- PrerequisiteMap has a fallback ordered list view for screen readers (toggle in same component).
- AI Tutor CTA's keyboard shortcut shown via `KBD` ⌘K.
