# Redesign brief — `/clans` (Clans)

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora.md)
**Status:** Proposed
**Date:** 2026-05-13

---

## 1. Current state

"Start your own" form (clan name + about) at top, "Browse public clans" below with two minimal entries ("ddd", "Test clan v1") and Join buttons.

**Problems:**
- Creation form sits above browsing — most users want to browse first.
- Clan cards show only name + visibility — no member count, no weekly score, no recent activity.
- No segmentation ("Trending", "Your school", "Near you", "Same exam").
- "Join" is the only affordance — no preview, no member list peek.
- Visibility badges ("PUBLIC") are noisy when 100% of browsable clans are public anyway.

---

## 2. Redesign rationale

Clans answer "who else is studying like me, and can I join them?" Browse-first, with rich preview cards. Creation collapses into a single CTA at the top — not a form competing with browse.

---

## 3. Composition map

| Region | Components |
|---|---|
| TopBar | `TopBar` |
| Hero | If user has a clan: `Card` showing their clan summary with CTA to view; else `Banner` "You're not in a clan yet" + "Start one" `Button(ghost)` and "Browse below" hint |
| Filter strip | `Chip` cluster: Same exam / Same school / Trending / Near me (location opt-in) + Search |
| Trending clans | Horizontal scroll of `ClanCard` (compact) |
| Browse | Grid of `ClanCard` (3-col xl, 1-col mobile) |
| Sticky footer (xs) | Persistent "+ Start a clan" `Button(aurora)` |

**ClanCard anatomy:**

```
┌─────────────────────────────────────────────────────────┐
│ 🟢🟢⚪🟢⚪⚪⚪  ← member avatars stack (max 5 + "+47")    │
│                                                          │
│ Mumbai NEET Aspirants                                   │
│ 52 members · 🌿 Biology focus · 🔥 47-day streak         │
│                                                          │
│ Weekly XP   ▁▂▄▃▅▄▆▅       1,224 pts                    │
│ Last battle vs "Pune Medicos" — won 3-2                  │
│                                                          │
│ [ Preview ]    [ Join clan ]                             │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Wireframes

### 4.1 Desktop (xl ≥ 1280) — Not in a clan

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  Clans                                                                                       │
│                                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ You're not in a clan yet. Find one below, or [ + Start a clan ]                        │  │
│  └──────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                              │
│  Filters: [Same exam] [Same school] [Trending] [Near me]  🔍 Search clans…                  │
│                                                                                              │
│  Trending this week                                                                          │
│  ←──── horizontal scroll ────→                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                              │
│  │ 🟢🟢⚪🟢🟢       │  │ 🟢⚪🟢🟢⚪       │  │ 🟢🟢🟢⚪🟢       │                              │
│  │ Mumbai NEET     │  │ JEE Toppers     │  │ UPSC History    │                              │
│  │ 52m · 🔥47       │  │ 124m · 🔥28      │  │ 31m · 🔥12       │                              │
│  │ ▁▂▄▃▅▄▆ 1,224   │  │ ▁▃▄▅▆▅▆ 2,891   │  │ ▁▁▂▃▄▃▄ 743     │                              │
│  │ [ Join ]        │  │ [ Join ]        │  │ [ Join ]        │                              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                              │
│                                                                                              │
│  All clans                                                                                   │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐                          │
│  │ Mumbai NEET Aspirants        │  │ JEE Toppers                  │                          │
│  │ 52m · Biology focus · 🔥47    │  │ 124m · Maths focus · 🔥28     │                          │
│  │ ▁▂▄▃▅▄▆ 1,224 wkly XP        │  │ ▁▃▄▅▆▅▆ 2,891 wkly XP        │                          │
│  │ Last won vs Pune Medicos     │  │ Last won vs Delhi IIT-Aim    │                          │
│  │ [Preview] [Join]             │  │ [Preview] [Join]             │                          │
│  └─────────────────────────────┘  └─────────────────────────────┘                          │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐                          │
│  │ UPSC History Buffs            │  │ Test clan v1                 │                          │
│  │ 31m · History · 🔥12          │  │ 1m · –                       │                          │
│  │ [Preview] [Join]             │  │ [Preview] [Join]             │                          │
│  └─────────────────────────────┘  └─────────────────────────────┘                          │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Desktop — In a clan

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  Clans                                                                                       │
│                                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ YOUR CLAN  ~ aurora ~                                                                   │  │
│  │                                                                                          │  │
│  │   Mumbai NEET Aspirants  · 52 members                                                  │  │
│  │   This week:  1,224 XP  ·  Rank 3rd in Mumbai bracket                                  │  │
│  │   Streak 🔥 47 days  ·  Next battle: Pune Medicos in 2 days                            │  │
│  │                                                                                          │  │
│  │   [ Open clan ]  [ Invite friends ]  [ Leave clan ]                                    │  │
│  └──────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                              │
│  Explore more clans                                                                          │
│  ... (browse layout same as above, but with "Switch clan?" warning on Join) ...             │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Mobile (xs 375)

```
┌───────────────────────────────────┐
│ ☰  Clans            🔥 47    👤   │
├───────────────────────────────────┤
│  ┌───────────────────────────────┐ │
│  │ Not in a clan yet              │ │
│  │ [ + Start a clan ]             │ │
│  └───────────────────────────────┘ │
│                                    │
│  [Exam▾][Near▾][Trend]  🔍         │
│                                    │
│  TRENDING                          │
│  ←── scroll ──→                    │
│  ┌──────────┐ ┌──────────┐        │
│  │ Mumbai   │ │ JEE Top  │        │
│  │ NEET 52m │ │  124m    │        │
│  │ [ Join ] │ │ [ Join ] │        │
│  └──────────┘ └──────────┘        │
│                                    │
│  ALL CLANS                         │
│  ┌───────────────────────────────┐ │
│  │ 🟢🟢⚪🟢🟢                       │ │
│  │ Mumbai NEET Aspirants          │ │
│  │ 52m · 🌿 Biology · 🔥 47        │ │
│  │ ▁▂▄▃▅▄▆ 1,224 wkly             │ │
│  │ Last won vs Pune Medicos       │ │
│  │ [ Preview ]   [ Join ]         │ │
│  └───────────────────────────────┘ │
│  ┌───────────────────────────────┐ │
│  │ JEE Toppers · 124m              │ │
│  │ ...                             │ │
│  └───────────────────────────────┘ │
├───────────────────────────────────┤
│  + Start a clan                    │ ← sticky FAB-style bar
├───────────────────────────────────┤
│ 🏠 📚 ▶ ⚔️ 👤                       │
└───────────────────────────────────┘
```

---

## 5. Copy guidelines

- Clan cards lead with name, then 3 metadata items separated by `·`: members, focus subject (with emoji), streak.
- Streak shown as `🔥 47` with no "days" suffix (universal in app).
- "Last battle" line skipped if no battles in last 7 days.
- "Preview" opens a Sheet/Drawer with member list, recent activity, and stats — without committing to Join.
- Join transitions through a confirm Sheet ("Joining {name}? Your XP contributes here from now on.").

---

## 6. States

| State | Behavior |
|---|---|
| Loading | Skeletons: 1 hero + 3 trending + 4 all-clans cards |
| No clans exist | EmptyState: "No public clans yet. [ Start the first one ]" |
| No clans match filter | Inline empty under filter chips |
| Already in clan, trying to join another | Confirm Sheet: "You're in Mumbai NEET. Switch to {new name}? You'll lose your contribution to this week's XP." |
| Clan at max capacity | Join button → "Full · Join waitlist" |

---

## 7. Engagement micro-moments

- Avatar stack on ClanCard has a subtle stagger-in animation on viewport entry.
- "Your clan won" toast with `--aurora-celebration` after battle results.
- Trending clans have a small ↗ "trending" badge with subtle pulse.

---

## 8. Accessibility notes

- Avatar stack: only the count is announced ("5 of 52 members shown, plus 47 more").
- Sparklines have `role="img"` with text alternative.
- Join is a destructive-ish action when already in a clan — confirm Sheet has explicit "Cancel" focused by default.
- ClanCard is interactive (full card tap → preview); explicit Buttons inside surface specific actions.
