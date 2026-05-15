# Redesign brief — `/quiz/:sessionId` (Practice Runner)

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora.md)
**Status:** Proposed
**Date:** 2026-05-13

---

## 1. Current state

The current PracticeRunner renders inside AppShell (sidebar + topbar visible). Question text in the center, MCQ options below, Submit button. No question palette, no flag-for-review, no timer, no AI hint.

**Problems:**
- AppShell chrome distracts from the question (sidebar nav competes for attention).
- No question palette — can't see how many questions remain or which are flagged.
- No timer — students can't pace themselves; impossible to simulate mock conditions.
- No flag-for-review — students can't park hard questions and return.
- No confidence rating after answer — adaptive engine missing a key calibration signal.
- No "AI explain" affordance — students stuck on an answer have to leave the session.
- End-of-session summary is plain — no celebration, no breakdown.

---

## 2. Redesign rationale

A practice/quiz session is a **focus-mode experience**. AppShell hides. The screen is structured as three primary regions: question (canonical center), palette (compact right rail or bottom Sheet on mobile), and a thin top utility bar (timer, flag, exit).

The post-answer flow adds **confidence calibration** + **inline AI explain**. End-of-session is celebratory with breakdown.

---

## 3. Composition map

| Region | Components |
|---|---|
| Top utility bar | `Card` strip: Exit (×) · Session title · Timer (Mono) · Pause · Flag (Toggle) · Question N/total |
| Main question area | `Card(surface=1, padding=lg)` with QuestionRenderer (polymorphic per type) |
| Answer area | Per question-type renderer (MCQ buttons, FIB input, Numeric input, Match drag-and-drop, etc.) |
| Confidence slider | `Slider(5 steps with emoji)` — appears immediately after Submit, before reveal |
| Reveal panel | Correct/Incorrect tag + correct answer + explanation + "Why?" `Button(aurora)` → AITutorPane bottom Sheet |
| Question palette | `Card` grid: numbered cells colored by state (Answered / Flagged / Unanswered / Current) |
| Navigation | `Button(secondary) "Prev"` + `Button(primary) "Next" or "Submit"` |
| End-of-session | Full-screen `Card` with celebration (Aurora) + breakdown (accuracy / time / mastery delta / weak patterns) + `Button(aurora) "Practice weak points"` |

---

## 4. Wireframes

### 4.1 Desktop (xl ≥ 1280)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  ×    Cell Biology · 20-min drill          ⏱ 14:23   ⏸   🚩 Flag      8 / 20                │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│                                                              ┌───────────────────────────┐ │
│   Question 8                                                  │ QUESTION PALETTE           │ │
│   Which organelle is responsible for protein synthesis        │                           │ │
│   in eukaryotic cells?                                        │  1 ✓  2 ✓  3 ✓  4 ✓        │ │
│                                                                │  5 ✓  6 ✗  7 ✓  ●8●        │ │
│   ◯  Mitochondria                                              │  9    10   11   12         │ │
│   ◯  Ribosomes                                                  │ 13   14   15   16          │ │
│   ◯  Golgi apparatus                                            │ 17   18   19  🚩20         │ │
│   ◯  Nucleus                                                    │                           │ │
│                                                                │  ✓ correct  ✗ wrong       │ │
│   Confidence (after submit):                                   │  ● current  🚩 flagged    │ │
│   1 ── 2 ── 3 ── 4 ── 5    ← appears after Submit              │                           │ │
│  😟  🙂                  💪                                     │                           │ │
│                                                                ├───────────────────────────┤ │
│                                                                │ TIME PER QUESTION         │ │
│  [  Prev  ←  ]                       [  Submit  ▶  ]           │  avg 48s · this 1m 12s ⚠   │ │
│                                                                └───────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

After Submit:

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  ×    Cell Biology · 20-min drill          ⏱ 14:01   ⏸   🚩 Flag      8 / 20                │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                              ┌───────────────────────────┐ │
│   ┌──────────────────────────────────────────────────────┐    │ PALETTE                    │ │
│   │ ✓ Correct!  +12 XP                                    │    │ 1 ✓ 2 ✓ 3 ✓ 4 ✓ 5 ✓        │ │
│   │                                                        │    │ 6 ✗ 7 ✓ ●8✓ 9   10         │ │
│   │ Ribosomes are the site of protein synthesis…           │    │ ...                        │ │
│   │                                                        │    │                           │ │
│   │  [ Why? ✦ ]  [ Save to bookmarks ]                     │    │                           │ │
│   └──────────────────────────────────────────────────────┘    │                           │ │
│                                                                ├───────────────────────────┤ │
│                                                                │ AI TUTOR ✦                 │ │
│  [ Prev  ← ]                          [  Next  →  ]            │ Ask anything about this   │ │
│                                                                │ question                  │ │
│                                                                │ [ Open chat ]              │ │
│                                                                └───────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Mobile (xs 375) — in question

```
┌───────────────────────────────────┐
│ ×  Cell Bio · drill   ⏱14:23  ⏸   │
│                        8/20  🚩    │
├───────────────────────────────────┤
│                                    │
│  Question 8                        │
│  Which organelle is responsible    │
│  for protein synthesis in          │
│  eukaryotic cells?                 │
│                                    │
│  ◯  Mitochondria                   │
│  ◯  Ribosomes                       │
│  ◯  Golgi apparatus                 │
│  ◯  Nucleus                         │
│                                    │
│                                    │
│                                    │
├───────────────────────────────────┤
│ [ Prev ← ]      [ Submit ▶ ]       │
├───────────────────────────────────┤
│ Palette ▴                          │ ← bottom Sheet handle
└───────────────────────────────────┘
```

Tap palette handle → Sheet opens with grid.

### 4.3 Mobile — after submit

```
┌───────────────────────────────────┐
│ ×  Cell Bio · drill   ⏱14:01  ⏸   │
├───────────────────────────────────┤
│  ┌───────────────────────────────┐ │
│  │ ✓ Correct!  +12 XP             │ │
│  │                                │ │
│  │ Ribosomes are the site of      │ │
│  │ protein synthesis…             │ │
│  │                                │ │
│  │ [ Why? ✦ ]  [ ★ Save ]         │ │
│  └───────────────────────────────┘ │
│                                    │
│  Confidence?                       │
│  😟 1 — 2 — 3 — 4 — 💪 5            │
│                                    │
├───────────────────────────────────┤
│ [ Prev ← ]       [ Next → ]        │
├───────────────────────────────────┤
│ Palette ▴                          │
└───────────────────────────────────┘
```

### 4.4 End-of-session

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                              │
│                            🎉  Session complete                                              │
│                            ~ aurora-celebration ~                                            │
│                                                                                              │
│                  ┌────────────────────────────────────────────────┐                         │
│                  │  17 / 20  correct                                │                         │
│                  │  85% accuracy · 18:42 elapsed                    │                         │
│                  │  Mastery +8% · now at 18%                        │                         │
│                  └────────────────────────────────────────────────┘                         │
│                                                                                              │
│                  Breakdown                                                                   │
│                  ✓ 17 right · ✗ 3 wrong · 🚩 0 flagged                                       │
│                  By Bloom: Remember 5/5, Understand 8/10, Apply 4/5                          │
│                                                                                              │
│                  Wrong-answer patterns                                                       │
│                  • Organelle functions  (2 of 3)                                             │
│                  • Membrane transport  (1 of 1)                                              │
│                                                                                              │
│                  [ Practice weak points ✦ ]   [ Review answers ]   [ Done ]                  │
│                                                                                              │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Copy guidelines

- Question stem typography: `--t-body-lg` (16/24/400) for stem; `--t-body` for options.
- Confidence slider labels: `😟` "not sure" → `🙂` "okay" → `💪` "sure".
- Correct/Incorrect tag uses semantic color, never the only signal — text label paired.
- "Why?" CTA uses `Button(aurora)` because it invokes the AI tutor.
- End-of-session headline matches accuracy: "🎉 Strong run" (≥80%), "Solid work" (60–79%), "Let's review" (<60%) — never "You failed".
- Mastery delta always in green or neutral — never red, even on regression (positive framing).

---

## 6. States

| State | Behavior |
|---|---|
| Loading question | Skeleton stem + 4 option skeletons; preserve palette |
| Submitting answer | Submit button → loading state; lock other actions |
| Reveal | Inline reveal Card animates in (200ms slide-up); confidence slider focused |
| Time about to expire (last 60s) | Timer turns `--warning-600`; subtle pulse |
| Time expired | Auto-submit; toast "Time's up — answer recorded"; advances to next |
| Network error | Inline retry banner; answer cached locally, syncs on reconnect |
| Pause | Modal overlay: "Session paused. Resume any time." + "Resume" / "Save & Exit" |
| Exit confirmation | Sheet/Modal: "Save and exit? You've completed 8/20. Progress saved." |

---

## 7. Engagement micro-moments

- Correct answer → subtle Aurora pulse around the reveal Card + chime (if sound on).
- Streak in-session counter (e.g., "5 correct in a row") appears as a chip top-left after 3rd consecutive correct.
- End-of-session celebration: `--aurora-celebration` background, ProgressRing animates from previous mastery to new mastery, confetti (Junior only).
- New personal best score → "🏆 Personal best" badge added on the end card.

---

## 8. Accessibility notes

- AppShell hidden but skip-link present ("Skip to question").
- Question stem is `<h1>` for the question.
- Options are a `RadioGroup` (Radix), keyboard 1-4 hotkeys for selection.
- Timer announced every minute via `aria-live="polite"` ("13 minutes remaining").
- Palette cells have descriptive `aria-label` ("Question 6, answered incorrectly, jump to") — full picture for screen reader.
- `prefers-reduced-motion` disables Aurora pulses, slide-up animations, confetti.
- Pause button always reachable via single Tab from the timer.

---

## 9. Question-type variations

The PracticeRunnerShell is **type-aware** — it composes the renderer dynamically:

| Type | Renderer composition |
|---|---|
| MCQ single | RadioGroup with 4 options |
| MCQ multi | CheckboxGroup with N options |
| Fill-in-blank | Input field inline with question text |
| Numeric | NumberInput with unit suffix |
| Match | Drag-and-drop pairs (or tap-tap on mobile) |
| Order | Sortable list with handles |
| Subjective short | Textarea (max 200 chars) |
| Subjective long | Textarea (rich text) + auto-save |
| Visual identify | Image canvas with click regions |
| Audio recall | Audio player + answer field |
| Video interactive | Video with interactive hotspots |

Each renderer adheres to the same Shell API (`onSubmit`, `onConfidence`, `onFlag`) — Shell stays the same.

---

## 10. Performance notes

- Question payload prefetched for next 2 questions during current answer (no spinner between).
- Images use `<Image>` with explicit dimensions (no CLS).
- Timer is a single `requestAnimationFrame` loop, not `setInterval` — drift-free.
- Palette uses CSS Grid; cells are pure divs, no virtualization needed at <100 questions.
- End-of-session confetti uses `canvas-confetti`; lazy-loaded only on completion.
