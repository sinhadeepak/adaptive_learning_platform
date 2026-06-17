# Redesign brief — `/friends` (Friends)

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora.md)
**Status:** Proposed
**Date:** 2026-05-13

---

## 1. Current state

Three stacked sections — "Add a friend" (email input), "Incoming requests" (empty / "none"), "Your friends" (empty / "No friends yet. Send a request above"). Vast empty page.

**Problems:**
- Three empty states stacked vertically — no illustrative empty CTA, no discovery.
- "Friends" concept is undersold — no preview of what friends *do* (battle / compare / leaderboard).
- No discovery affordances — find from school, import contacts, share invite link.
- On mobile the page would feel desolate.

---

## 2. Redesign rationale

The page must do three things at once: explain *why* you'd want friends, *who* you can connect with, and *how* to add them. Aurora collapses the three empty boxes into an illustrated EmptyState with three discovery paths and value-prop preview cards.

Once the user has friends, the page becomes a connected-activity feed.

---

## 3. Composition map

### Empty state (no friends)

| Region | Components |
|---|---|
| TopBar | `TopBar` |
| Hero `EmptyState` | Illustration (Aurora-tinted, friends + speech bubbles, abstract) + title + description + three discovery `Card` CTAs |
| "What friends unlock" | 3-up `Card` row: Battle / Compare / Leaderboard |
| Add by email | `Card` with `FormField` + `Button` |
| Incoming requests | `Card` with `EmptyState` mini |

### Connected state (has friends)

| Region | Components |
|---|---|
| TopBar | `TopBar` |
| Hero | `Card` with friend stats (X online · Y this week · Z streaks) |
| Search / add | Sticky strip with `Input` + `Button` |
| Incoming requests | `Card` listing requests with Accept/Decline |
| Friends grid/list | `Card` per friend with avatar + status dot + streak + current mastery delta + Battle/Message CTA; `Chip` filters (Online / In a streak / Same exam) |
| Activity feed | Right rail (xl): "What your friends did today" |

---

## 4. Wireframes

### 4.1 Desktop (xl ≥ 1280) — Empty state

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  AdaptiveLearn  ▾   ⌘K Search…              🔥 47    🔔    👤                              │
├────────┬───────────────────────────────────────────────────────────────────────────────────┤
│        │  Friends                                                                            │
│  Home  │                                                                                    │
│  Stdy  │  ┌──────────────────────────────────────────────────────────────────────────┐    │
│  Prac  │  │                                                                            │    │
│  Btl   │  │             [Aurora-tinted illustration: two avatars chatting]            │    │
│  Anls  │  │                                                                            │    │
│ ▶Frnd  │  │            Add friends. Battle. Climb the leaderboard.                    │    │
│  Clans │  │      Study together — even when you're studying alone.                    │    │
│  Ldrbd │  │                                                                            │    │
│  Setn  │  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │    │
│  Prfl  │  │   │ 🔍 Find from    │  │ 📱 Invite via   │  │ 👥 Browse same  │          │    │
│        │  │   │   school        │  │   WhatsApp      │  │   exam / clan   │          │    │
│        │  │   │ [ Search ]      │  │ [ Share link ]  │  │ [ Browse ]      │          │    │
│        │  │   └─────────────────┘  └─────────────────┘  └─────────────────┘          │    │
│        │  └──────────────────────────────────────────────────────────────────────────┘    │
│        │                                                                                    │
│        │  What friends unlock                                                               │
│        │  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐         │
│        │  │ ⚔  1v1 Battle      │  │ 🎯 Compare progress│  │ 🏆 Friends         │         │
│        │  │ Race through 5     │  │ See where you rank │  │   leaderboard      │         │
│        │  │ quick questions    │  │ vs your friends    │  │ Win the week       │         │
│        │  └────────────────────┘  └────────────────────┘  └────────────────────┘         │
│        │                                                                                    │
│        │  Add a friend by email                                                             │
│        │  ┌──────────────────────────────────────────────────────────────────────────┐    │
│        │  │ friend@example.com                            [ Send request ]            │    │
│        │  └──────────────────────────────────────────────────────────────────────────┘    │
│        │                                                                                    │
│        │  Incoming requests                                                                 │
│        │   None yet.                                                                        │
└────────┴───────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Desktop — Connected state

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  Friends · 12                                                                                │
│                                                                                              │
│  ┌──────────────────────────────────────────────────────────┐ ┌──────────────────────────┐ │
│  │ 4 online · 7 in a streak · 3 study same exam              │ │ ACTIVITY                  ││
│  │ [ + Add friend by email ]  [ 📱 Invite ]  🔍 Search…      │ │ Riya finished Cell Bio 80%││
│  │                                                            │ │ Arjun started 7-day streak││
│  ├──────────────────────────────────────────────────────────┤ │ Priya placed 3rd in clan  ││
│  │ Incoming · 2                                              │ │ ...                       ││
│  │  Aman Verma · NEET 2026   [Accept] [Decline]              │ │                          ││
│  │  Sara Iyer · UPSC CSE     [Accept] [Decline]              │ │                          ││
│  ├──────────────────────────────────────────────────────────┤ │                          ││
│  │ Filters:  [All] [Online] [Same exam] [In streak]          │ │                          ││
│  │                                                            │ │                          ││
│  │ ┌────────────────────────┐  ┌────────────────────────┐    │ │                          ││
│  │ │ 🟢 Riya Sharma           │  │ ⚪ Arjun Kumar          │  │ │                          ││
│  │ │   NEET · 🔥 12d · 22% ↑  │  │   NEET · 🔥 30d · 35%  │  │ │                          ││
│  │ │   [ ⚔ Battle ]  [Msg]    │  │   [ ⚔ Battle ]  [Msg]  │  │ │                          ││
│  │ └────────────────────────┘  └────────────────────────┘    │ │                          ││
│  │ ┌────────────────────────┐  ┌────────────────────────┐    │ │                          ││
│  │ │ 🟢 Priya N               │  │ ⚪ Vikram S             │  │ │                          ││
│  │ │   UPSC · 🔥 47d · 18%   │  │   JEE · 🔥 5d · 30%    │  │ │                          ││
│  │ │   [ Compare ]  [Msg]     │  │   [ ⚔ Battle ]  [Msg]  │  │ │                          ││
│  │ └────────────────────────┘  └────────────────────────┘    │ │                          ││
│  └──────────────────────────────────────────────────────────┘ └──────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Mobile (xs 375) — Empty state

```
┌───────────────────────────────────┐
│ ☰  Friends           🔥 47    👤  │
├───────────────────────────────────┤
│  ┌───────────────────────────────┐ │
│  │  [aurora illustration]         │ │
│  │  Add friends.                  │ │
│  │  Battle.                       │ │
│  │  Climb leaderboards.           │ │
│  │                                │ │
│  │ ┌────────────────────────────┐ │ │
│  │ │ 🔍 Find from school        │ │ │
│  │ └────────────────────────────┘ │ │
│  │ ┌────────────────────────────┐ │ │
│  │ │ 📱 Invite via WhatsApp     │ │ │
│  │ └────────────────────────────┘ │ │
│  │ ┌────────────────────────────┐ │ │
│  │ │ 👥 Browse same exam        │ │ │
│  │ └────────────────────────────┘ │ │
│  └───────────────────────────────┘ │
│                                    │
│  What friends unlock               │
│  ┌───────────────────────────────┐ │
│  │ ⚔ 1v1 Battle                   │ │
│  └───────────────────────────────┘ │
│  ┌───────────────────────────────┐ │
│  │ 🎯 Compare progress            │ │
│  └───────────────────────────────┘ │
│  ┌───────────────────────────────┐ │
│  │ 🏆 Friends leaderboard         │ │
│  └───────────────────────────────┘ │
│                                    │
│  Add by email                      │
│  [ friend@example.com         ]   │
│  [ Send request ]                  │
│                                    │
│  Incoming requests · none yet      │
├───────────────────────────────────┤
│ 🏠 📚 ▶ ⚔️ 👤                       │
└───────────────────────────────────┘
```

---

## 5. Copy guidelines

- Hero copy: short, action-led. "Add friends. Battle. Climb leaderboards."
- Discovery cards: emoji icon + verb + secondary action label.
- "What friends unlock" cards: emoji + feature + one-line value prop.
- Friend status dot: 🟢 online (active in last 15 min), ⚪ offline. Tooltip on hover shows last seen.
- Streak indicator uses 🔥 emoji + count, never a number alone.

---

## 6. States

| State | Behavior |
|---|---|
| Loading | Skeletons for hero + 3 cards + 4 friend cards |
| Empty (no friends, no requests) | Full empty-state hero (wireframe above) |
| Incoming requests only | Show requests prominently; empty state below |
| Has friends | Replace hero with stats strip + activity rail |
| Search no results | Inline empty: "No friends match 'aman'. Want to invite by email?" |
| Friend accepted | Toast: "You and Riya are now friends 🎉" + auto-scroll to their card |

---

## 7. Engagement micro-moments

- Accept request → success toast with `--aurora-celebration`, brief confetti (Junior only).
- New friend's first activity appears in the activity rail with a soft Aurora highlight.
- 1v1 Battle button has a subtle pulse if friend is online.

---

## 8. Accessibility notes

- Status dot has `aria-label="Riya, online"`.
- Discovery cards are buttons (`<button>`) with full accessible names.
- "What friends unlock" cards are decorative descriptions, not interactive (info only).
- Email input has `type="email"` and `inputMode="email"`; validation announces errors via `aria-live`.
