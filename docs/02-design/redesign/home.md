# Redesign brief — `/home` (Dashboard)

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora.md)
**Status:** Proposed
**Date:** 2026-05-13

---

## 1. Current state (annotated)

From the audit screenshot:

- 13 stacked panels of roughly equal visual weight: Today's Plan (3 items), Today's Mission, AI Intelligence Engine, Resume Practice, My exams & courses, Projected UPSC CSE Prelims rank, Stuck on a problem (Snap it), Cross-topic weakness diagnosis, Practice Cell Biology recommendation, Study health, Upcoming deadlines, Recent activity, All topics.
- All panels are thin rectangles on the same pale lavender wash. No anchor, no hierarchy.
- Three vertically stacked "Start →" buttons in Today's Plan compete with a fourth "Start mission →" in Today's Mission and a fifth "Continue" in Resume Practice. **Five primary CTAs above the fold.**
- 1-day streak indicator is a tiny chip top-right — the highest-leverage retention signal is the weakest visual.
- Projected rank `~8,75,000` is presented without comparison (no "vs last week", "vs cohort", "vs target").
- Cell Biology mastery 10% is repeated across three panels.
- Mobile layout (375 px) would stack into a ~14-screen scroll with no anchor.

---

## 2. Redesign rationale

The home screen has one job: **answer "what do I do next, right now?"** in under 2 seconds.

Aurora resolves this with a single hero (the Mission), one row of status (so users feel oriented), and lanes (Tabs) so secondary content doesn't compete with the primary CTA.

- **One Mission, one CTA.** Not five.
- **Status moves to a strip**, not stacked panels — orient quickly without scrolling.
- **Analytics rail (lg+)** keeps rank/mastery visible without making them the focus.
- **Tabs (Practice / Review / Discover / Social)** absorb the bottom 7 panels — same data, anchored.

---

## 3. Composition map

| Region | Components |
|---|---|
| Top bar | `TopBar` (logo + Cmd-K + StreakChip + Bell + Avatar menu) |
| Mission hero | `MissionCard` (Card with `tone=aurora`, ProgressRing, Button-aurora, celebration state) |
| Status strip | 4× `StatCard` (compact, sm size): Streak / Mastery delta / Days to exam / Rank trajectory mini |
| Tabs region | `Tabs` (Practice / Review / Discover / Social) |
| Practice tab | `PlanList` (today's plan rows as ActionRow) + `AIInsightCard` |
| Review tab | `MasteryCell` rows for weak topics + `Banner` (replay mistakes CTA) |
| Discover tab | `TopicCard` × N (suggested topics) + recently watched videos `Card` |
| Social tab | Friends activity feed (compact `LeaderboardRow`) + clan signal `Card` |
| Right rail (lg+) | `RankCard` + `ReadinessTrajectory` (mini, last 30d) + `AIInsightCard` |
| Floating | `Button(aurora) "Continue practice"` FAB on scroll past hero (mobile) |

---

## 4. Wireframes

### 4.1 Desktop (xl ≥ 1280)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  AdaptiveLearn  ▾                  ⌘K  Search…              🔥 47   🔔 3   👤 Deepak ▾    │
├────────┬───────────────────────────────────────────────────────────────────────────────────┤
│        │  Hi, Deepak 👋                                                                    │
│  Home  │  Today is 13 May 2026 · 153 days to NEET                                          │
│        │                                                                                    │
│  Study │  ┌──────────────────────────────────────────────────────────┐  ┌─────────────────┐│
│        │  │  TODAY'S MISSION  ·  ~ aurora background ~                │  │ RANK            ││
│ Prctc  │  │                                                            │  │  ~8,75,000      ││
│        │  │   20 min   ●●●○○○○○                                       │  │  ↓ 12,000 / wk  ││
│ Btl    │  │   Quick mock segment                                       │  │  ▁▂▃▂▄▃▅▄▆     ││
│        │  │   ─────────────────────────                                │  │  Off-track     ││
│ Anlys  │  │   Mock pace is your weakest signal — last mock was         │  │                 ││
│        │  │   199 days ago.                                            │  ├─────────────────┤│
│ Frnds  │  │                                                            │  │ READINESS       ││
│        │  │   [  ▶  Start mission  →  ]   [ Not today · snooze ]      │  │  10%            ││
│ Clans  │  │                                                            │  │ ▁▂▂▃▃▄▄▅▅▆     ││
│        │  └──────────────────────────────────────────────────────────┘  │  Trend  ↗       ││
│ Ldrbd  │                                                                  ├─────────────────┤│
│        │  ┌─────────┬─────────┬─────────┬─────────┐                       │ AI INSIGHT      ││
│ Setngs │  │ STREAK  │ MASTERY │ TO EXAM │ RANK Δ  │                       │  ✦ Cell Biology ││
│        │  │  🔥 47  │  10%   │   153   │ ↓ -12k  │                       │   is your big   ││
│ Prfle  │  │  +2 wk  │ +3% wk │  days   │  / wk   │                       │   drop. Try a   ││
│        │  └─────────┴─────────┴─────────┴─────────┘                       │   10-min drill. ││
│        │                                                                  │   [ Start  ✦ ]  ││
│        │  Practice   Review   Discover   Social                          │                 ││
│        │  ────────  ───────  ────────  ──────                            │                 ││
│        │                                                                  │                 ││
│        │  ┌────────────────────────────────────────────────────────────┐ │                 ││
│        │  │ TODAY'S PLAN                                                │ │                 ││
│        │  │   ⏱ 30m · Mock — full pattern         [ Start  ▶  ]        │ │                 ││
│        │  │   ⏱ 10m · Take a short break           ▢                    │ │                 ││
│        │  │   ⏱  5m · Reflection                  [ Start  ▶  ]        │ │                 ││
│        │  └────────────────────────────────────────────────────────────┘ │                 ││
│        │                                                                  │                 ││
│        │  ┌────────────────────────────────────────────────────────────┐ │                 ││
│        │  │ RESUME PRACTICE                                             │ │                 ││
│        │  │   Cell Biology · 5 left · 50% so far    [ Continue  →  ]   │ │                 ││
│        │  └────────────────────────────────────────────────────────────┘ │                 ││
└────────┴───────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Tablet (md 768)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ☰   AdaptiveLearn         🔥 47    🔔    👤                         │
├─────────────────────────────────────────────────────────────────────┤
│  Hi, Deepak 👋        Today · 153 days to NEET                       │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ TODAY'S MISSION   ~ aurora ~                                     │ │
│  │  20 min · Quick mock segment                                     │ │
│  │  [  ▶  Start mission  →  ]                [ Not today ]          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────┬────────┬────────┬────────┐                               │
│  │STREAK  │MASTERY │TO EXAM │RANK Δ  │                               │
│  │ 🔥 47  │ 10%    │ 153d   │ ↓-12k  │                               │
│  └────────┴────────┴────────┴────────┘                               │
│                                                                       │
│  Practice  Review  Discover  Social                                   │
│  ────────                                                             │
│                                                                       │
│  ⏱ 30m · Mock — full pattern              [ Start  ▶  ]              │
│  ⏱ 10m · Take a short break                ▢                          │
│  ⏱  5m · Reflection                        [ Start  ▶  ]              │
│                                                                       │
│  ┌─────────────────────────────────────────┐                         │
│  │  RESUME PRACTICE                         │                         │
│  │  Cell Biology · 5 left                   │  [ Continue  →  ]       │
│  └─────────────────────────────────────────┘                         │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ AI INSIGHT  ✦                                                   │ │
│  │ Cell Biology is your big drop. Try a 10-min drill.              │ │
│  │ [ Start ✦ ]                                                      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Mobile (xs 375)

```
┌───────────────────────────────────┐
│ ☰  AdaptiveLearn        🔥47   👤 │
├───────────────────────────────────┤
│  Hi Deepak                         │
│  153 days to NEET                  │
│                                    │
│ ┌───────────────────────────────┐ │
│ │ MISSION  ~aurora~              │ │
│ │  20m · Quick mock segment      │ │
│ │  [  ▶ Start  →  ]              │ │
│ │  Not today · snooze            │ │
│ └───────────────────────────────┘ │
│                                    │
│ ←──────── horizontal scroll ────→ │
│ ┌──────┬──────┬──────┬──────┐    │
│ │STREAK│MSTRY │EXAM  │RANK  │    │
│ │🔥 47 │ 10%  │ 153d │↓-12k │    │
│ └──────┴──────┴──────┴──────┘    │
│                                    │
│  Practice  Review  Discover  Soc  │
│  ────────                          │
│                                    │
│  ⏱ 30m  Mock  [Start ▶]            │
│  ⏱ 10m  Break  ▢                   │
│  ⏱  5m  Reflect [Start ▶]          │
│                                    │
│  ┌────────────────────────────┐   │
│  │ RESUME                      │   │
│  │ Cell Biology  · 5 left      │   │
│  │ [ Continue → ]              │   │
│  └────────────────────────────┘   │
│                                    │
│  ┌────────────────────────────┐   │
│  │ AI INSIGHT  ✦               │   │
│  │ Cell Biology is your drop.  │   │
│  │ [ Start ✦ ]                 │   │
│  └────────────────────────────┘   │
│                                    │
├───────────────────────────────────┤
│  🏠    📚   ▶    ⚔️    👤         │
│ Home  Study Prc  Btl  Me           │
└───────────────────────────────────┘
   FAB on scroll: [ ▶ Continue ]
```

---

## 5. Copy guidelines

- **Greeting:** "Hi, {firstName} 👋" — first name only, single emoji, never "Welcome back" (clinical).
- **Mission title:** present-tense imperative — "Quick mock segment", "Drill Cell Biology weak points". Never "You should…".
- **Status chips:** lead with the number; supporting text below in `--neutral-500`.
- **AI Insight:** start with the *what*, end with the action. ≤ 14 words.
- **Empty plan:** "Nothing scheduled today. Want a quick 10-minute round?" + secondary "Plan my week".

---

## 6. States

| State | What renders |
|---|---|
| **Loading** | `Skeleton` for MissionCard + 4 StatCard placeholders + 3 ActionRow skeletons. No spinner. |
| **Empty (new user, no diagnostic)** | `EmptyState` instead of MissionCard: illustration + "Let's start with a quick diagnostic — 10 questions, 5 minutes" + `Button(aurora) "Begin diagnostic"` |
| **Mission complete** | MissionCard morphs: `--aurora-celebration` background, "Day saved 🎉" + ProgressRing complete + `Button(primary) "Continue practicing"` + share button |
| **Error (server)** | Inline `Banner` on top: "We can't load your home right now. Retry?" + cached last-known state below if available |
| **Offline** | Toast: "You're offline. Showing cached data." + read-only mode (no Start buttons fire) |
| **Streak about to break (after midnight reminder)** | `Banner(tone=warning)` at top: "Save your 47-day streak — 8 minutes of practice does it." + `Button(reward)` |

---

## 7. Engagement micro-moments

- **First load of the day:** subtle Aurora shimmer across the Mission card (1.2s, once).
- **Mission complete:** confetti (Junior only) + Aurora gradient burst on Mission card + toast.
- **Streak milestone (7/30/100/365):** full-screen celebration modal (Junior); toast (Aspirant/Pro).
- **Rank improvement (e.g. -12k):** delta chip pulses once (Junior + Aspirant) on first view; persistent green arrow.

---

## 8. Accessibility notes

- Mission heading is `<h1>`; status strip is a labelled region (`aria-label="Today's status"`).
- Tab list is keyboard-navigable (Arrow keys); panels announced on switch.
- Skeleton has `aria-busy="true"`.
- FAB on mobile has 56 px target (above floor) + `aria-label="Continue practice"`.
- ProgressRing in MissionCard is `role="progressbar"` with `aria-valuenow`, `aria-valuemax`.

---

## 9. Open questions specific to Home

- Default tab? **Recommendation:** Practice tab (most actionable).
- When user has zero topics started: skip tabs, render full-width diagnostic CTA hero. Confirm with product.
- StreakChip in TopBar at xs/sm — keep visible or move into a Profile drawer? **Recommendation:** keep visible (it's the retention lever).
