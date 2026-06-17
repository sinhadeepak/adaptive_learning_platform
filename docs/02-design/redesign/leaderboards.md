# Redesign brief — `/leaderboards` (Leaderboards)

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora.md)
**Status:** Proposed
**Date:** 2026-05-13

---

## 1. Current state

Raw 51-row HTML-style table. Columns: Rank, User, Score. Two tabs at top: Global XP, Weekly wins. No your-row anchor, no podium, no filters beyond the two tabs.

**Problems:**
- 51 rows rendered as plain text — flat. Top 3 should be a podium.
- Score column right-aligned numbers, no "what kind of score" hint.
- No filters — scope (global/friends/clan), time window (week/month/all), subject filter — even though backend supports them.
- No "Jump to me" affordance when scrolled.
- Future state (thousands of rows) crashes this UI — no virtualization.
- Pagination at 25 per page — modern apps use infinite scroll with virtualization.
- No rank-delta sparkline, no clan badge, no avatars.

---

## 2. Redesign rationale

Leaderboards are a retention lever. Three layers of engagement:

1. **Top-3 podium** — gold/silver/bronze visualization. Aspirational.
2. **Your neighbor band** — your row + ±5 around you, anchored. Personal stakes.
3. **Filtered virtualized DataGrid** — the full list, scannable.

Plus: floating "Jump to me" when scrolled away, group separators every 10 rows for visual scanning.

---

## 3. Composition map

| Region | Components |
|---|---|
| TopBar | `TopBar` |
| Filters strip | `Chip` cluster: Scope (Global / Friends / Clan) · Time (Week / Month / All-time) · Subject (All / Bio / Chem / …) · Exam (NEET / JEE / …) |
| Podium | `PodiumCard` — three avatars (gold/silver/bronze rings), scores, deltas |
| Your neighbor band | `Card` with you (highlighted) + ±5 rows around |
| Main DataGrid | `DataGrid` with virtualization (`@tanstack/react-virtual`), group separator every 10 rows |
| Sticky FAB | "Jump to me" `Button(secondary)` floating bottom-right when scrolled past neighbor band |
| Right rail (xl) | "What earns XP" mini glossary `Card` + "Promote to gold" goal `Card` |

**LeaderboardRow** anatomy:

```
 1   🟢 Student 4 (Kandriya Vid. ND)       NEET   ▁▂▄▅▆  1,307   ↑12
   ▲    ▲                                   ▲       ▲       ▲      ▲
 rank  avatar+status                       exam   trend   score  delta
       + clan badge
```

---

## 4. Wireframes

### 4.1 Desktop (xl ≥ 1280)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  Leaderboards                                                                                │
│  Rankings refresh every 15 minutes. New battles need 1 cycle before they affect the boards. │
│                                                                                              │
│  Scope:  [ Global ] [ Friends ] [ Clan ]    Time: [ Week ] [ Month ] [ All-time ]            │
│  Subject: [ All ▾ ]    Exam: [ NEET ▾ ]   🔍 Search…                                          │
│                                                                                              │
│  Top 3                                                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                  🥇                                                                   │  │
│  │            ╭──────────╮          🥈                          🥉                       │  │
│  │            │ Student4 │      ╭──────────╮              ╭──────────╮                  │  │
│  │            │  ND      │      │ Student1 │              │ Student7 │                  │  │
│  │            │  1,307   │      │  1,288   │              │  1,257   │                  │  │
│  │            │  ↑ 12    │      │  ↑ 8     │              │  ↓ 3     │                  │  │
│  │            ╰──────────╯      ╰──────────╯              ╰──────────╯                  │  │
│  └──────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                              │
│  Your neighbours                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  45 ⚪ Student 4 · NEET · 🔥18d · ▁▂▃▃▄ · 875 · ↑5                                    │  │
│  │  46 ⚪ Student 7 · NEET · 🔥3d  · ▂▁▂▂▁ · 827 · ↓1                                    │  │
│  │ ─ YOUR ROW (47) ────────────────────────────────────────────────────────────────────│  │
│  │  47 🟢 Deepak (you) · NEET · 🔥47d · ▂▃▄▅▆ · 824 · ↑8     [ View profile ]           │  │
│  │ ──────────────────────────────────────────────────────────────────────────────────── │  │
│  │  48 ⚪ Student 7 · NEET · 🔥0d · ─ · 819 · ─                                          │  │
│  │  49 ⚪ Student 8 · NEET · 🔥2d · ▁▁▂▂▁ · 797 · ↓2                                     │  │
│  └──────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                              │
│  All ranks (top → 51 of 51 shown; virtualized)                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Rank  User                          Exam   Streak   Trend     Score    Δ            │  │
│  │  ─────────────────────────────────────────────────────────────────────────────────── │  │
│  │   1    🥇 Student 4 (Kandriya ND)    NEET   🔥18d    ▁▂▃▄▅▆   1,307   ↑12            │  │
│  │   2    🥈 Student 1 (Vedanta Tut)    NEET   🔥9d     ▂▃▄▅▆▅   1,288   ↑8             │  │
│  │   3    🥉 Student 7 (Vedanta Tut)    NEET   🔥30d    ▃▄▅▆▆▆   1,257   ↓3             │  │
│  │  ─── group separator ─── 4–10                                                         │  │
│  │   4    ⚪ Student 4 (Allen Career)   JEE    🔥5d     ▂▂▃▃▄    1,220   ↑2             │  │
│  │   5    ⚪ Student 4 (Vedanta Tut)    NEET   🔥12d    ▂▃▄▄▅    1,197   ↑4             │  │
│  │   ...                                                                                 │  │
│  │  ─── group separator ─── 11–20                                                        │  │
│  │   ...                                                                                 │  │
│  │  ─── group separator ─── 41–51                                                        │  │
│  │  47    🟢 Deepak (you) ...                                                            │  │
│  │   ...                                                                                 │  │
│  └──────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                              │
│                                                    [ ⌃ Jump to me ]  (sticky FAB)            │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Mobile (xs 375)

```
┌───────────────────────────────────┐
│ ☰  Leaderboards     🔥 47    👤   │
├───────────────────────────────────┤
│  [Global][Friends][Clan]           │
│  [Week▾]  [NEET▾]                  │
│                                    │
│  TOP 3                             │
│  ←── horizontal scroll ──→         │
│  ┌─────────┐ ┌─────────┐ ┌──────┐ │
│  │🥇1,307  │ │🥈1,288  │ │🥉1,257│ │
│  │Student4 │ │Student1 │ │Stdt7 │ │
│  │  ↑12    │ │  ↑8     │ │  ↓3  │ │
│  └─────────┘ └─────────┘ └──────┘ │
│                                    │
│  YOUR NEIGHBOURS                   │
│  ┌───────────────────────────────┐ │
│  │ 45 ⚪ Student 4    875  ↑5    │ │
│  │ 46 ⚪ Student 7    827  ↓1    │ │
│  │ ━ 47 🟢 YOU       824  ↑8 ━━━│ │
│  │ 48 ⚪ Student 7    819  ─     │ │
│  │ 49 ⚪ Student 8    797  ↓2    │ │
│  └───────────────────────────────┘ │
│                                    │
│  ALL RANKS                         │
│  ┌───────────────────────────────┐ │
│  │  1  🥇 Stdt4    1,307 ↑12     │ │
│  │  2  🥈 Stdt1    1,288 ↑8      │ │
│  │  3  🥉 Stdt7    1,257 ↓3      │ │
│  │ ──── 4–10 ────                 │ │
│  │  4   Stdt4    1,220 ↑2        │ │
│  │  5   Stdt4    1,197 ↑4        │ │
│  │  ... virtualized scroll ...    │ │
│  └───────────────────────────────┘ │
│                                    │
│  [ ⌃ Jump to me ]   ← sticky FAB   │
├───────────────────────────────────┤
│ 🏠 📚 ▶ ⚔️ 👤                       │
└───────────────────────────────────┘
```

---

## 5. Copy guidelines

- Podium uses 🥇🥈🥉 emoji; rank delta uses ↑↓→.
- Score is presented as a Mono-font number; subject score qualifier shown on hover/tooltip.
- "Your neighbours" header lowercase; your row highlighted with `--brand-100` background.
- Group separators every 10 rows have label "11–20", "21–30" — quick scan anchor.
- Refresh notice in subtitle: "Refreshes every 15 minutes" — sets expectation; no live polling jitter.

---

## 6. States

| State | Behavior |
|---|---|
| Loading | Skeletons: filter row + podium card + neighbour card + 10 DataGrid rows |
| Empty (no scores yet) | EmptyState: "No scores yet for this filter. Practice or take a mock to enter the board." |
| You're top 3 | Your row appears in podium; neighbour band shows ranks 1–7 (you centered) |
| You're rank 1 | Toast on view: "👑 You're #1 this {week|month|all time}!" + persistent gold ring on your avatar globally |
| Filter no results | Inline empty under filter chips |
| Battle in progress | Inline `Banner`: "Battle vs Pune Medicos active — refresh in 8 min" |

---

## 7. Engagement micro-moments

- Podium avatars animate up from below on first viewport entry (320ms stagger).
- Your row pulses on rank improvement (single ring pulse).
- "Jump to me" FAB only appears when your row is scrolled off-screen; bounces gently on appear.
- Crossing into top 10 triggers `--aurora-celebration` toast.

---

## 8. Accessibility notes

- DataGrid is keyboard-navigable (arrow keys move between rows; Enter to view profile).
- Virtualization announces total count via `aria-rowcount`.
- Sparkline `role="img"` with `aria-label="trend over last 7 days"`.
- "Jump to me" FAB has `aria-label="Jump to your rank"` and clear focus ring.
- Status emojis (🥇🥈🥉, 🔥) are decorative — accompanied by text rank / streak count.

---

## 9. Performance notes

- Backend pagination + cursor-based fetching; virtualize at >50 rows.
- Avatar images use `<Image>` component with fixed dimensions + lazy loading.
- Filter changes debounce (200ms) before refetch.
- Sparklines pre-computed server-side as SVG strings — no client-side chart lib for the leaderboard rows themselves (only one big chart on profile).
