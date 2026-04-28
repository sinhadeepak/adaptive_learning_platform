# Sprint 2 Wireframes — Student Quiz/Readiness/Notifications + `web-portal` Content Authoring

**Scope**: 12 screens — 6 student (`web-student` + Flutter mobile) and 6 operator (`web-portal`). Unblocks FE Lead A + Mobile Leads (quiz), FE Lead B (first operator drop).
**Form factor**: student screens mobile-first (`bp-xs`); operator screens desktop-first (`bp-xl`).
**Companion**: see [Pass 1 wireframes](08_Wireframes_Sprint1_Student_AdaptiveLearningPlatform.md) for shared conventions + [Common Controls Spec §3](07_CommonControls_Specification_AdaptiveLearningPlatform.md#3-common-controls-specification).
**Status**: v0.1 — text wireframes. Designer translates to Figma.

---

## Conventions

Same as [Pass 1 §"How to read these wireframes"](08_Wireframes_Sprint1_Student_AdaptiveLearningPlatform.md#how-to-read-these-wireframes). Additions:

- `●━━○` = progress step indicator (filled = complete / active, outline = pending).
- `▓▓▓░░░` = mastery or progress fill bar.
- `[A] ... [D]` = lettered answer options.
- Operator screens include chrome: Top Nav §3.4 + Side Nav §3.5 + Breadcrumb §3.22.

---

## 1. Quiz Configuration (Start)

**Route**: `/quiz/start?topicId=...` or `/quiz/start?mode=mock&examId=...`
**Stories**: `ST-05-01-01` (start quiz), `ST-05-01-02` (mock mode config)
**Surface**: `web-student`, mobile
**Entry**: Topic detail CTA, Home "Take a quiz", dedicated Mock section

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│ ← Rotational Motion          │
├──────────────────────────────┤
│  Practice quiz               │
│  Physics · Mechanics         │
│                              │
│  How it works                │
│  • Adaptive — questions      │
│    scale to your level       │
│  • You can pause any time    │
│  • Review after each Q       │
│                              │
│  Mode                        │
│  ┌────────────────────────┐  │
│  │ ● Practice (adaptive)  │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ ○ Mock (timed, fixed)  │  │
│  └────────────────────────┘  │
│                              │
│  Length                      │
│  ┌──────┬──────┬──────┐      │
│  │ 10 Q │ 20 Q │ 30 Q │      │   ← chip-select
│  └──────┴──────┴──────┘      │
│                              │
│  Estimated time: ~15 min     │
│                              │
│  ┌────────────────────────┐  │
│  │■     Start quiz        │  │
│  └────────────────────────┘  │
│                              │
│  Your last attempt: 8/10     │
│  2 days ago                  │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Back | §3.2 Button ghost + chevron-left |
| Mode radios | §3.29 Radio Group (cards) |
| Length chips | §3.3 Status Badge (neutral, clickable) — active = `brand-tint` bg + `brand-primary` border |
| Estimated time | `body` text, recalculates on length change |
| Start quiz | §3.2 Button primary (lg) |
| Last attempt summary | `body` + `text-muted`; tap → result screen §5 |

### Data

- `GET /api/v1/quiz/topics/:topicId/config` → `{ availableLengths, estimatedDurationPerQ, lastAttempt? }`
- `POST /api/v1/quiz/sessions { topicId, mode, length }` → `{ sessionId, firstQuestion }`; returned `sessionId` routes to `/quiz/:sessionId`.

### States

| State | Treatment |
|---|---|
| Default | Practice pre-selected; length 10 |
| Mock-mode selected | Length options lock to exam preset (e.g. "60 Q / 90 min"); info banner §3.25 "Mock test is timed. Once started, you can't pause." |
| In-flight session detected | §3.25 Alert info "You have an in-progress quiz. Resume?" with Resume + Start fresh buttons |
| No questions available (rare) | §3.15 Empty State "No questions yet for this topic" |
| Error on Start | Inline Alert banner; Start button re-enabled |

### Interactions

- Changing mode auto-adjusts length options.
- Keyboard: Tab reaches mode radios → length chips → Start.
- `Cmd+Enter` / `Ctrl+Enter` starts.

### A11y

- Mode radios in `role="radiogroup"`.
- Length chips in `role="radiogroup"` (mutually exclusive).
- Estimated time in polite live region — announces on length change.

---

## 2. Quiz Question

**Route**: `/quiz/:sessionId` (question index in URL query or state)
**Stories**: `ST-05-02-01` (render question), `ST-05-02-02` (submit answer), `ST-05-02-03` (next question)
**Surface**: `web-student`, mobile. **Focus mode** — hides top nav and bottom tab bar; minimal chrome.

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│ [X Exit]   ━━━━━━░░░  Q 3/10 │  ← exit + linear progress §3.12
│            ⏱ 00:42          │  ← timer (mock only); hidden in practice
├──────────────────────────────┤
│                              │
│  Physics · Mechanics         │  ← subject/topic chips §3.3 info
│                              │
│  A solid sphere of mass M    │
│  and radius R rolls without  │
│  slipping on a horizontal    │
│  surface. What is its total  │
│  kinetic energy at velocity  │
│  v?                          │
│                              │
│  ┌────────────────────────┐  │
│  │ A  ½Mv²                │  │  ← Answer Option §3.36
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ B  7/10 Mv²            │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ C  Mv²                 │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ D  2/5 Mv²             │  │
│  └────────────────────────┘  │
│                              │
│  [□ Skip]  [□ Report]        │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │■      Submit answer    │  │  ← disabled until selection
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### Post-submit (practice mode) — feedback state

```
┌──────────────────────────────┐
│ [X Exit]   ━━━━━━░░░  Q 3/10 │
├──────────────────────────────┤
│  Physics · Mechanics         │
│                              │
│  A solid sphere...           │
│                              │
│  ┌────────────────────────┐  │
│  │ A  ½Mv²         [dim]  │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ B  7/10 Mv²    ✓ corr. │  │ ← Correct (green — §3.36.2)
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ C  Mv²          ✗ your │  │ ← Your wrong pick (red)
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ D  2/5 Mv²      [dim]  │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │ 💡 Why this is correct │  │ ← §3.34 Accordion, open by default
│  │ A rolling sphere has   │  │
│  │ translational KE ½Mv²  │  │
│  │ plus rotational ½Iω²...│  │
│  └────────────────────────┘  │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │■     Next question     │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Exit button | §3.2 Button ghost (confirmation modal on click — see §3 next) |
| Progress bar | §3.12 Progress Horizontal determinate |
| Timer (mock only) | Monospace, top-right; `warning-fg` at < 30 s, `danger-fg` + pulse at < 10 s (per §3.35) |
| Question card | §3.35 Question Card |
| Answer options | §3.36 Answer Option Button |
| Skip / Report | §3.2 Button ghost |
| Submit answer | §3.2 Button primary (lg, full-width) |
| Explanation | §3.34 Accordion (practice mode; mock mode hides until the full result screen) |

### Data

- `GET /api/v1/quiz/sessions/:id/current` → `{ question, answerLetters[], index, total, modeFlags }`
- `POST /api/v1/quiz/sessions/:id/answer { questionId, answer, timeTakenMs }` → `{ correct, correctAnswer, explanation, nextQuestionId? }`

### States

| State | Treatment |
|---|---|
| Loading question | Skeleton §3.31 for question + options |
| Selecting | Option selected §3.36 selected-state; Submit enabled |
| Submitting | Submit `aria-busy`; options disabled |
| Post-submit practice | Feedback state (per ASCII #2) |
| Post-submit mock | No per-question feedback — advance immediately to next question |
| Time expired (mock only) | Auto-submit current selection (or blank) and move on; toast §3.25 "Time up — next question" |
| Offline | Show cached current Q; queue answer submission; §3.25 banner "You're offline — your progress is saved" |
| Error submit | Inline retry button on the question; keep selection |

### Interactions

- Keyboard: 1–4 / A–D select option; Enter submits; N next after feedback; Esc opens exit confirmation.
- Options are a Radio Group — single tab stop per §3.29.
- Report opens a §3.23 small modal with reason picker (typo / out-of-syllabus / offensive / other).

### A11y

- Timer (mock) in polite live region, debounced to 10 s intervals so SR doesn't chatter.
- Feedback announced: "Incorrect. The correct answer is B. Explanation follows."
- Accordion explanation expanded by default on practice; collapsed on mock.

---

## 3. Quiz Submit / Pause Confirmation

**Route**: modal overlay on `/quiz/:sessionId`
**Stories**: `ST-05-02-04` (resume later), `ST-05-02-05` (exit quiz)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`) — triggered by "Exit"

```
┌──────────────────────────────┐
│  ┌────────────────────────┐  │
│  │  Exit this quiz?       │  │  ← Modal §3.23 sm
│  │                        │  │
│  │  You've answered 3/10  │  │
│  │  questions. Your       │  │
│  │  progress will be      │  │
│  │  saved — you can       │  │
│  │  resume any time.      │  │
│  │                        │  │
│  │  [ Keep going ]        │  │
│  │  [ Save & exit     ]   │  │
│  │  [ Discard attempt ]   │  │  ← danger
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### Mock-mode variant

- Title "End this mock test?"
- Copy: "You can't resume a mock test once exited. Your score so far will be submitted as your final score."
- No "Keep going" hedge — options: "Submit & exit" (primary) or "Cancel" (ghost).

### Component map

| Element | Control |
|---|---|
| Modal container | §3.23 Modal, sm (400 px) |
| Keep going | §3.2 Button secondary |
| Save & exit | §3.2 Button primary |
| Discard | §3.2 Button danger — opens second-level confirmation |

### Data

- `POST /api/v1/quiz/sessions/:id/save` → 200; redirect to `/home`.
- `DELETE /api/v1/quiz/sessions/:id` → 204 (discard).

### States

- Default as above.
- Saving: both exit buttons `aria-busy`; keep-going disabled.
- Discard confirmation: nested modal replaces content; "Are you absolutely sure? Your answers will be deleted."

### A11y

- Focus trapped inside modal; Esc triggers "Keep going" as default dismiss.
- `aria-labelledby` → title; `aria-describedby` → body.

---

## 4. Quiz Result

**Route**: `/quiz/:sessionId/result`
**Stories**: `ST-05-03-01` (result summary), `ST-05-03-02` (per-question review), `ST-05-03-03` (readiness delta)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│  ✓ Quiz complete             │
├──────────────────────────────┤
│                              │
│   Score                      │
│   ┌──────┐                   │
│   │  8   │   out of 10       │  ← Circular progress §3.11 lg
│   │ ⬤⬤⬤ │   80%             │
│   └──────┘                   │
│                              │
│   ┌───────────┐ ┌───────────┐│
│   │ ▲ +3      │ │ 00:12:34  ││  ← Delta pill + time taken
│   │ readiness │ │ time      ││
│   └───────────┘ └───────────┘│
│                              │
│  Streak 🔥 6 days — keep it! │  ← Streak §3.38
│                              │
│  Summary                     │
│  ✓ 8 correct                 │
│  ✗ 2 incorrect               │
│  ○ 0 skipped                 │
│                              │
│  Concepts to revisit         │
│  ┌────────────────────────┐  │
│  │ Rolling motion         │  │ ← §3.14 Card → topic detail
│  │ 50% mastery            │  │
│  │ ━━━━━━━░░░░░           │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │■     Review answers    │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │□    Take another quiz  │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │□        Home           │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### Per-question review (accessed via "Review answers")

- Route: `/quiz/:sessionId/review`
- Scrollable list of questions with collapsed/expanded state per question.
- Correct/incorrect/skipped chips.
- Reuses §3.35 Question Card + §3.36 Answer Options in post-submit feedback state.
- Top of page: "← Back to result" link + "Next unreviewed" keyboard hint.

### Component map

| Element | Control |
|---|---|
| Score ring | §3.11 Progress Circular lg with center value |
| Delta pill | §3.3 Status Badge (success if positive, neutral otherwise) |
| Time taken | Monospace, tabular-nums |
| Streak | §3.38 Streak Counter |
| Summary rows | Inline body text + §2.7 icons |
| Revisit cards | §3.14 Data Card clickable |
| Primary / secondary / ghost buttons | §3.2 |

### Data

- `GET /api/v1/quiz/sessions/:id/result` → `{ score, total, durationMs, correct, incorrect, skipped, readinessDelta, weakTopics[] }`.
- `GET /api/v1/quiz/sessions/:id/review` → per-question history for review screen (lazy-loaded).

### States

- Mock mode: Score ring shows both raw + percentile (vs cohort when Analytics has enough data).
- Pass threshold variant: celebratory confetti animation (prefers-reduced-motion: static check).
- Readiness delta 0 or negative: neutral badge; copy "Keep practising to improve".

### A11y

- Ring `role="meter"` with `aria-label`.
- Delta announced in a polite live region on mount.
- Confetti animation has `aria-hidden="true"`.

---

## 5. Readiness Detail

**Route**: `/readiness` (overall) and `/readiness/:subjectId` (drill-down)
**Stories**: `ST-06-01-01` (readiness dashboard), `ST-06-01-02` (per-subject breakdown), `ST-06-01-03` (trend over time)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`) — overall readiness

```
┌──────────────────────────────┐
│ ← Home                       │
├──────────────────────────────┤
│                              │
│   Readiness                  │
│                              │
│   ┌──────┐                   │
│   │  78  │                   │  ← §3.37 Readiness Ring (xl)
│   │  %   │                   │
│   └──────┘                   │
│   ▲ +5 in the last 7 days    │
│                              │
│   [ 7d ] [ 30d ] [ 90d ]     │  ← time-range tabs
│                              │
│   Trend                      │
│   ┌────────────────────────┐ │
│   │    ○────●────●────●    │ │  ← line chart (sparkline scale)
│   │   / \  /            ●  │ │
│   │  ●   ○○                 │
│   └────────────────────────┘ │
│   65 ━━ 78     Low / Current │
│                              │
│   By subject                 │
│   ┌────────────────────────┐ │
│   │ Physics                │ │
│   │ 82% mastery   ━━━━━━━  │ │
│   │ 12 topics  •  3 weak   │ │
│   └────────────────────────┘ │
│   ┌────────────────────────┐ │
│   │ Chemistry              │ │
│   │ 74% mastery   ━━━━━━   │ │
│   │ 10 topics  •  2 weak   │ │
│   └────────────────────────┘ │
│   ┌────────────────────────┐ │
│   │ Mathematics            │ │
│   │ 76% mastery   ━━━━━━   │ │
│   │ 11 topics  •  4 weak   │ │
│   └────────────────────────┘ │
│                              │
│   What's next                │
│   ┌────────────────────────┐ │
│   │ Revisit: Rolling motion│ │
│   │ Practice: Thermochem   │ │
│   │ Review: Calculus basics│ │
│   └────────────────────────┘ │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Readiness ring | §3.37 (xl = 128 px variant; spec §3.37 lg used for now — if a larger size is needed, add it) |
| Delta caption | `body` + icon |
| Time-range tabs | §3.6 Tabs |
| Trend line chart | Custom — SVG sparkline, min-height 120 px; uses semantic colours (readiness-band gradient) |
| Subject cards | §3.14 Data Card + §3.12 Progress + "N weak" §3.3 Badge (warning if > 0) |
| What's next | §3.14 Data Card with action chips |

### Data

- `GET /api/v1/analytics/readiness` → `{ overall, delta7d, trend: [{date, value}], subjects: [{id, name, mastery, weakCount, topicCount}], recommendations[] }`
- `GET /api/v1/analytics/readiness/:subjectId` for drill-down.

### States

- First-run (no quiz data): Ring shows "—"; swap in an Empty State §3.15 "Take your first quiz to unlock readiness".
- Loading: Skeleton §3.31 for ring + chart + cards.
- Error: inline retry per-section.
- Offline: Banner + show cached snapshot.

### A11y

- Trend chart has an accessible data table fallback (visually hidden) with rows [date, readiness %].
- Tabs keyboard: ←/→ as per §3.6.

---

## 6. Notification Preferences

**Route**: `/settings/notifications`
**Stories**: `ST-07-01-01..04` (notification preferences)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│ ← Settings                   │
├──────────────────────────────┤
│  Notifications               │
│                              │
│  How we reach you            │
│                              │
│  Channels                    │
│  ┌────────────────────────┐  │
│  │ Push              [ON] │  │  ← §3.27 Toggle
│  │ Phone: enabled for ALP │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ Email             [ON] │  │
│  │ you@example.com        │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ SMS              [OFF] │  │
│  │ +91 9••••••••  Enable  │  │
│  └────────────────────────┘  │
│                              │
│  Quiet hours                 │
│  ┌────────────────────────┐  │
│  │ Enabled           [ON] │  │
│  │ 22:00 — 07:00          │  │
│  └────────────────────────┘  │
│                              │
│  What we send                │
│                              │
│  Learning                    │
│   Streak reminder       [ON] │
│   Daily plan nudge      [ON] │
│   Quiz result           [ON] │
│                              │
│  Account                     │
│   Login from new device [ON] │  ← can't disable — grayed toggle
│   Security alerts       [ON] │  ← can't disable — grayed toggle
│                              │
│  Marketing                   │
│   Product updates      [OFF] │
│   Offers               [OFF] │
│                              │
│  ┌────────────────────────┐  │
│  │□   Unsubscribe all     │  │
│  └────────────────────────┘  │
│  Except account + security   │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Channel rows | §3.27 Toggle Switch + label + sublabel |
| Quiet hours | Toggle + inline Date/Time range (Sprint 2 uses two time pickers, not full Date Range §3.26) |
| Per-category toggles | §3.27 Toggle |
| Locked toggles (security) | §3.27 disabled state; inline helper text "Required" |
| Unsubscribe all | §3.2 Button secondary; opens confirmation modal §3.23 |

### Data

- `GET /api/v1/notification/preferences` → `{ channels, quietHours, categories: {learning, account, marketing} }`
- `PATCH /api/v1/notification/preferences { ... partial }` → 200, optimistic UI.

### States

| State | Treatment |
|---|---|
| Default | Sensible defaults (learning ON, marketing OFF, security forced-ON) |
| Toggle in-flight | Per-row spinner replaces knob per §3.27 |
| Channel verification required | Toggle OFF; inline "Verify email first →" link |
| Permission-denied (push) | Toggle OFF with helper "Enable push in system settings"; click opens device settings (mobile only) |
| Save error | Row-level §3.25 error; revert toggle state |

### Interactions

- Optimistic toggle: flip immediately, roll back on error with a toast.
- Quiet hours time pickers use native time input on mobile, custom picker on web.

### A11y

- Each toggle has an `aria-label` combining row-title + on/off state.
- "Required" toggles have `aria-disabled="true"` + visible helper text (not just visual grey).

---

# Operator surfaces — `web-portal`

> Operator screens are desktop-first. Layout = Top Nav §3.4 (portal variant) + Side Nav §3.5 + content. Below `bp-lg` the app shows a read-only compact view with a banner "Switch to desktop to edit". Density default = `regular`; user can switch to `compact` per §2.5.5.

---

## 7. Content Author — Dashboard

**Route**: `/author`
**Stories**: `ST-08-01-01` (content-author landing), `ST-08-01-02` (drafts list)
**Surface**: `web-portal`
**Role**: Expert / Teacher with `content.author` scope

### Desktop (`bp-xl`)

```
┌──────────────────────────────────────────────────────────────────┐
│ [ALP]  JEE Coaching Co.                        [STG] [ avatar ▾] │  ← Top Nav portal variant
├────────────┬─────────────────────────────────────────────────────┤
│ ─ Author   │ Home › Author                                       │
│  Dashboard │                                                     │
│  Questions │ My content                         [+ New question] │
│  Reviews   │                                                     │
│ ─ Courses  │ [All (34)] [Draft (12)] [In review (6)] [Pub (16)]  │  ← Tabs §3.6
│  Batches   │                                                     │
│ ─ Insights │ ┌───────────────────────────────────────────────┐   │
│  Students  │ │ Search...                    [Filter ▾] [Sort▾]│   │
│            │ └───────────────────────────────────────────────┘   │
│            │                                                     │
│            │ ┌───────────────────────────────────────────────┐   │
│            │ │ ID    Question snippet    Subject   Status    │   │ ← Data Table §3.18
│            │ │ Q-1042 A uniform disk...  Physics  [Draft]    │   │
│            │ │ Q-1041 Calculate the...    Maths   [Review]   │   │
│            │ │ Q-1040 Which compound...   Chem    [Pub]      │   │
│            │ │ Q-1039 A rolling sphere... Physics [Pub]      │   │
│            │ │ ...                                           │   │
│            │ └───────────────────────────────────────────────┘   │
│            │              Rows 1–20 of 34    ◀ 1 2 ▶            │
└────────────┴─────────────────────────────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Top Nav | §3.4 portal variant (tenant name, env badge `STG`) |
| Side Nav | §3.5 with Author / Courses / Insights groups |
| Breadcrumb | §3.22 |
| + New question | §3.2 Button primary |
| Tabs | §3.6 Tabs with count badges (§3.3) |
| Search + Filter + Sort | §3.30 Search Input + §3.2 Secondary buttons (Filter opens panel) |
| Table | §3.18 Data Table with row hover, row actions on hover |
| Status column | §3.3 Status Badge |
| Pagination | §3.20 |

### Data

- `GET /api/v1/content/questions?authorId=me&status=...&page=N&perPage=20&q=...` → paginated list.
- Table columns (Sprint 2): ID, Question (truncated to 80 chars), Subject, Topic, Status, Last updated, Actions.
- Row actions (hover): Edit, Preview, Duplicate, Delete.

### States

- Loading: Skeleton table rows (§3.31 rows in table body).
- Empty (no drafts): §3.15 Empty State first-run with CTA "Create your first question".
- Filter-empty: §3.15 Empty State no-results variant with "Clear filters" action.
- Error: §3.25 Alert above toolbar; stale data still rendered if any.

### Interactions + keyboard

- Tab order: nav → tabs → search → filter → sort → `+ New` → first row → row actions.
- `/` focuses search.
- Bulk-select: header checkbox + row checkboxes (§3.9). Bulk actions surface in §3.19 Table Toolbar bulk-mode.

### A11y

- Side Nav has `aria-current="page"` on Dashboard.
- Table columns sortable — per §3.21 + §3.18.

---

## 8. Content Author — Question Editor

**Route**: `/author/questions/:id/edit` (or `/new` for create)
**Stories**: `ST-08-02-01..04` (create / edit question with metadata)
**Surface**: `web-portal`

### Desktop (`bp-xl`)

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Back to dashboard                     [Preview] [Save draft] [Submit for review] │
├──────────────────────────────────────────────────────────────────┤
│  Edit question Q-1042                              [ Draft ]     │
│  Last saved 2 min ago                                            │
│                                                                  │
│ ┌───────────────────────────────┬────────────────────────────┐   │
│ │ Question                      │ Metadata                   │   │
│ │                               │                            │   │
│ │ Subject / Topic               │ Difficulty  [● Medium  ▾] │   │
│ │ [Physics ▾] [Mechanics ▾]     │                            │   │
│ │                               │ Bloom's level              │   │
│ │ Stem                          │ [● Apply         ▾]        │   │
│ │ ┌──────────────────────────┐  │                            │   │
│ │ │ A solid sphere of mass   │  │ Topic tags (multi-select) │   │
│ │ │ M and radius R ...       │  │ [rolling-motion] [kinet] + │   │
│ │ │                          │  │                            │   │
│ │ │                          │  │ Time to answer (sec)       │   │
│ │ └──────────────────────────┘  │ [ 90 ]                     │   │
│ │ [+ Add image]                 │                            │   │
│ │                               │ Calculator allowed? [□]    │   │
│ │ Options                       │                            │   │
│ │ ┌──────────────────────────┐  │ Review pool                │   │
│ │ │ A  ○  ½Mv²              │  │ [Senior physics ▾]         │   │
│ │ └──────────────────────────┘  │                            │   │
│ │ ┌──────────────────────────┐  │ Visibility                 │   │
│ │ │ B  ●  7/10 Mv²  correct │  │ [All students ▾]            │   │
│ │ └──────────────────────────┘  │                            │   │
│ │ ┌──────────────────────────┐  │ Author                     │   │
│ │ │ C  ○  Mv²               │  │ You (Rahul S.) · Can edit  │   │
│ │ └──────────────────────────┘  │                            │   │
│ │ ┌──────────────────────────┐  │                            │   │
│ │ │ D  ○  2/5 Mv²           │  │                            │   │
│ │ └──────────────────────────┘  │                            │   │
│ │ [+ Add option]                │                            │   │
│ │                               │                            │   │
│ │ Explanation                   │                            │   │
│ │ ┌──────────────────────────┐  │                            │   │
│ │ │ The total kinetic...     │  │                            │   │
│ │ └──────────────────────────┘  │                            │   │
│ └───────────────────────────────┴────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Top action bar | Sticky; §3.2 Buttons (Preview ghost, Save draft secondary, Submit primary) |
| Status badge | §3.3 (tones: Draft neutral / In review info / Published success / Rejected danger) |
| Subject / Topic dropdowns | §3.8 Dropdown (searchable) |
| Stem + Explanation | §3.1 Input textarea variant with minimal rich-text (bold / italic / inline LaTeX) |
| Add image | §3.13 File Upload |
| Options list | Custom — composed of §3.29 radio (correct-picker) + §3.1 input text + §3.2 ghost "remove" button. Min 2, max 6 options. |
| Metadata fields | §3.8 dropdowns + §3.9 checkbox + §3.28 Multi-Select Tag |
| Review pool | §3.8 dropdown (Sprint 2: single pool; Sprint 3 allows manual picker) |
| Visibility | §3.8 dropdown (All / Premium only / Beta cohort) |

### Data

- `GET /api/v1/content/questions/:id` → full question doc.
- `PATCH /api/v1/content/questions/:id { partial }` → 200; autosave every 15 s of idle.
- `POST /api/v1/content/questions/:id/submit-for-review` → status transitions to `IN_REVIEW`.
- AI moderation runs on Submit — if flagged, an inline Alert §3.25 warning blocks submission until the author acknowledges each flag.

### States

| State | Treatment |
|---|---|
| Autosaving | "Saving…" in-header text; changes to "Saved 2 s ago" on success |
| Dirty + unsaved | "Unsaved changes" + warning before route-change (confirm dialog) |
| Validation error | Inline §3.1 errors on missing required fields; banner at top summarises |
| AI flag (moderation) | §3.25 Alert warning + per-flag accordion with "Acknowledge" button |
| Submission success | Toast "Submitted for review"; status badge flips to `In review`; Save/Submit buttons swap to "Withdraw" |

### Interactions + keyboard

- Tab order: top buttons → Subject → Topic → Stem → Options (each: correct radio → text input → remove) → Add option → Explanation → metadata column.
- `Cmd+S` / `Ctrl+S` saves draft.
- Drag-reorder options (hamburger icon appears on hover).
- At least one option must be marked correct before Submit; Stem + 2 options + 1 correct + explanation required.

### A11y

- Option list is `role="radiogroup"` for the correct-answer picker.
- Autosave status uses polite live region.
- Modal confirmations for destructive actions (delete question).

---

## 9. Content Author — Question Preview

**Route**: modal overlay on editor (`?preview=1`) OR full-page route `/author/questions/:id/preview`
**Stories**: `ST-08-02-05` (preview before submit)
**Surface**: `web-portal`

### Desktop (`bp-lg`+) — rendered as modal drawer (§3.23 drawer variant)

```
┌──────────────────────────────────────────────────────────────────┐
│ (editor dimmed behind)                                           │
│  ┌─────────────────── Drawer from right ─────────────────────┐   │
│  │ Preview as student       [Desktop ▾] [en/hi]     [X]     │   │
│  │                                                            │   │
│  │ ┌──────────────────────────────────────────┐              │   │
│  │ │ Physics · Mechanics                      │              │   │
│  │ │                                          │              │   │
│  │ │ A solid sphere of mass M and radius R... │              │   │
│  │ │                                          │              │   │
│  │ │ ┌──────────────────────────────────┐     │              │   │
│  │ │ │ A  ½Mv²                          │     │              │   │
│  │ │ └──────────────────────────────────┘     │              │   │
│  │ │ ┌──────────────────────────────────┐     │              │   │
│  │ │ │ B  7/10 Mv²                       │     │              │   │
│  │ │ └──────────────────────────────────┘     │              │   │
│  │ │ ...                                      │              │   │
│  │ └──────────────────────────────────────────┘              │   │
│  │                                                            │   │
│  │ ─────  After submit  ─────                                 │   │
│  │ Correct answer: B · Explanation rendered below ▼           │   │
│  │                                                            │   │
│  │ [Close]  [Back to editor]                                  │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Drawer | §3.23 Modal (drawer variant, 480 px from right) |
| Viewport toggle | §3.8 Dropdown (Mobile 360 / Tablet 768 / Desktop 1280) |
| Locale toggle | Tabs §3.6 (en / hi) — shows Hindi rendering once Sprint 2 Hindi content is in |
| Question render | §3.35 Question Card (read-only, uses the same component students will see) |
| Answer options | §3.36 Answer Option Button (non-interactive — pointer-events: none; tabIndex=-1) |
| After-submit fold | §3.34 Accordion expanded showing explanation |

### Data

- Uses the in-memory draft from the editor — no extra fetch.
- For Hindi preview, fetches `GET /api/v1/content/questions/:id/translations/hi` (if none, shows fallback + warning).

### States

- Default: desktop viewport, English.
- No Hindi translation: banner "No Hindi translation yet — preview shows English fallback".
- LaTeX render error: inline red badge on the malformed expression; doesn't break the whole preview.

### A11y

- Drawer focus trap.
- Viewport toggle announces change via live region.

---

## 10. Review Queue

**Route**: `/author/reviews` (also surfaced to moderators at `/moderation/reviews`)
**Stories**: `ST-09-01-01` (review queue list), `ST-09-01-02` (filter & assign)
**Surface**: `web-portal`
**Role**: Moderator or Expert reviewer

### Desktop (`bp-xl`)

```
┌──────────────────────────────────────────────────────────────────┐
│ [ALP]  JEE Coaching Co.                        [STG] [ avatar ▾] │
├────────────┬─────────────────────────────────────────────────────┤
│ ─ Author   │ Home › Reviews                                      │
│  Dashboard │                                                     │
│  Questions │ Review queue                                        │
│  Reviews ● │                                                     │
│            │ [All (18)] [Assigned to me (6)] [Unassigned (12)]   │  ← Tabs §3.6
│            │                                                     │
│            │ ┌───────────────────────────────────────────────┐   │
│            │ │ Search...             [Subject ▾] [Flag ▾]   │   │
│            │ └───────────────────────────────────────────────┘   │
│            │                                                     │
│            │ ┌───────────────────────────────────────────────┐   │
│            │ │ ID    Question       Sub    Author  Age  Fl  │   │
│            │ │                                              ─ │   │
│            │ │ Q-1042 A solid sphere Phy   Rahul   2h   —    │   │
│            │ │ Q-1041 Calculate the  Mat   Priya   4h  [AI]  │   │  ← §3.3 Badge for flags
│            │ │ Q-1040 Which compound Chm   Amit    6h   —    │   │
│            │ │ ...                                           │   │
│            │ └───────────────────────────────────────────────┘   │
│            │  ── with 3 selected ──                              │
│            │  [Assign to...] [Set priority] [Return to authors]  │  ← Bulk toolbar §3.19
│            │                                                     │
│            │              Rows 1–20 of 18    ◀ 1 ▶               │
└────────────┴─────────────────────────────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Tabs | §3.6 with count badges |
| Filter chips | §3.3 Status Badge clickable |
| Table | §3.18 Data Table with selectable rows |
| Flag chip | §3.3 Status Badge — AI-flagged = warning tone |
| Age | Relative time (`timestamp`), tooltip shows absolute |
| Bulk toolbar | §3.19 Table Toolbar bulk-actions variant |
| Row actions | §3.24 Context Menu (Review / Assign / Return) |

### Data

- `GET /api/v1/content/reviews?status=pending&assignee=me|any&subject=...&page=N` → paginated.
- `POST /api/v1/content/reviews/:id/assign { reviewerId }` → 200.

### States

- Empty "Assigned to me" with pending items in "Unassigned" → CTA "Grab one from unassigned".
- SLA badges: questions waiting > 24 h show `danger` tone age chip.

### Interactions

- Row click opens §11 review detail.
- Selecting rows exposes bulk toolbar (§3.19).

### A11y

- Table column sort via `aria-sort`.
- Filter panel is a §3.23 modal variant.

---

## 11. Review Detail

**Route**: `/author/reviews/:questionId`
**Stories**: `ST-09-02-01` (approve), `ST-09-02-02` (reject with reason), `ST-09-02-03` (return for edits)
**Surface**: `web-portal`

### Desktop (`bp-xl`)

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Back to queue       [Prev] [Next]        [Assign ▾]  [Return]  │
├──────────────────────────────────────────────────────────────────┤
│ Review Q-1042 · Physics · Mechanics       [AI flag ▲]   [Approve ▾] │
│                                                                  │
│ ┌──────────── Question ────────────┬───── Activity ──────┐       │
│ │                                   │ ┌─ Timeline ─────┐ │       │
│ │ A solid sphere of mass M...       │ │ 2h  Submitted  │ │       │
│ │                                   │ │     by Rahul   │ │       │
│ │ ┌──────────────────────────┐      │ │ 1h  AI flag    │ │       │
│ │ │ A  ½Mv²                  │      │ │     (3 issues) │ │       │
│ │ │ B  7/10 Mv²    ✓ correct│      │ │ 30m Assigned   │ │       │
│ │ │ C  Mv²                   │      │ │     to you     │ │       │
│ │ │ D  2/5 Mv²               │      │ └────────────────┘ │       │
│ │ └──────────────────────────┘      │                    │       │
│ │                                   │ ─ AI flags ─       │       │
│ │ Explanation                       │ ▶ Possible factual │       │
│ │ The total kinetic energy of a...  │   inconsistency    │       │
│ │                                   │ ▶ Language: jargon │       │
│ │ Metadata                          │ ▶ Image resolution │       │
│ │ Difficulty: Medium                │                    │       │
│ │ Tags: rolling-motion              │ ─ Comments (2) ─   │       │
│ │ Tier: Free                        │ Rahul 3h           │       │
│ │                                   │ "added figure"     │       │
│ │                                   │                    │       │
│ │                                   │ [Leave a comment]  │       │
│ └───────────────────────────────────┴────────────────────┘       │
│                                                                  │
│ Decision                                                         │
│ ┌──────────────┐ ┌────────────────┐ ┌────────────┐               │
│ │ ■ Approve    │ │ □ Return       │ │ □ Reject   │               │
│ └──────────────┘ └────────────────┘ └────────────┘               │
│  Rationale (required for Return/Reject)                          │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ ...                                                     │     │
│  └────────────────────────────────────────────────────────┘     │
│  ┌────────────────┐                                              │
│  │■    Confirm    │                                              │
│  └────────────────┘                                              │
└──────────────────────────────────────────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Back, Prev, Next | §3.2 ghost with chevrons |
| Status badge | §3.3 — AI flag warning |
| Question render | §3.35 Question Card (read-only) |
| Answer options | §3.36 non-interactive |
| Activity timeline | Custom — vertical list of §3.16 Log Rows compressed |
| AI flags accordion | §3.34 one accordion per flag with severity badge |
| Comments | Custom thread — each comment a §3.14 Card sm |
| Decision radios | §3.29 Radio Group with §3.14 card visuals |
| Rationale | §3.1 textarea, required based on selection |
| Confirm | §3.2 Button — primary for Approve; Return = secondary; Reject = danger |

### Data

- `GET /api/v1/content/reviews/:id` → question + flags + activity + comments.
- `POST /api/v1/content/reviews/:id/decision { decision, rationale?, assignedTo? }` → 200.
- `POST /api/v1/content/reviews/:id/comments { text }` → 200.

### States

- Approve: Primary confirm button; no rationale required.
- Return: Author receives the question back as `DRAFT`; comment is emailed + in-app notification.
- Reject: Hard stop; question status `REJECTED`. Rationale required; secondary confirmation modal: "Reject permanently? Author will be notified."
- Submitting: buttons disabled; `aria-busy`.
- Reviewer cannot be same user as author — server enforces; UI disables actions with inline message.

### Interactions + keyboard

- `J` / `K` or `←` / `→` navigate Prev / Next (matches common mail client patterns).
- `A` approve, `R` return, `X` reject (with focus on rationale first if required).
- Comment box supports `@mention` (Sprint 3 — placeholder for now).

### A11y

- Timeline announced as "Activity, latest first" with `role="log" aria-live="polite"` for any new live events while viewing.
- Decision radios announce the current selection; rationale field becomes required mid-flow — `aria-required` toggles.

---

## 12. Activity / Audit (lightweight for Sprint 2)

**Route**: `/author/activity`
**Stories**: `ST-08-03-01` (my activity), `ST-10-AUDIT-01` (audit log — scoped to content actions)
**Surface**: `web-portal`

### Desktop (`bp-xl`)

```
┌──────────────────────────────────────────────────────────────────┐
│ ─ Author   │ Home › Activity                                     │
│  Dashboard │                                                     │
│  Questions │ Activity                                            │
│  Reviews   │                                                     │
│  Activity ●│ Filters: [ Mine / All ] [ Last 7 days ▾ ] [ Type ▾] │
│            │                                                     │
│            │  Level  Time                  Actor         Action  │
│            │  ───── ─────────────────────  ──────────── ──────── │
│            │  [INFO] 2026-04-28 14:22      You          Submit Q-1042 │ ← §3.16 Log Row
│            │  [INFO] 2026-04-28 13:17      You          Edit Q-1042 ▸ │
│            │  [WARN] 2026-04-28 10:03      Moderator M  Return Q-1040 ▸ │
│            │  [INFO] 2026-04-27 18:48      You          Create Q-1042 │
│            │  ...                                                │
└────────────┴─────────────────────────────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Filter bar | §3.2 secondary buttons + dropdowns |
| Log rows | §3.16 Log / Event Row, expandable to show payload |
| Empty state | §3.15 |

### Data

- `GET /api/v1/audit/activity?scope=me&kind=content&from=...` → paginated log events.

### States

- Loading: skeleton log rows.
- Empty filter: §3.15 no-results.
- "All" view restricted to users with `audit.read` scope — else tab hidden; if user forces URL, show §3.15 access-denied.

### A11y

- Log list has `role="log" aria-live="off"` (user is browsing history, not live events).
- Each row expandable; JSON payload in monospace Preformatted block.

---

## 13. Cross-cutting additions (Sprint 2)

- **Quiz exit safeguard** — navigating away from `/quiz/:sessionId` (browser back, route change) triggers the §3 exit confirmation modal unconditionally.
- **Offline quiz queue indicator** — when offline during quiz, a persistent top banner §3.25 shows "N answers queued — syncing when back online"; swaps to "Synced" on recovery.
- **Autosave indicator on question editor** — footer pill "Saved 12 s ago" with icon `check`; turns to `warning` after 30 s idle with unsaved changes.
- **Role-denied stub** — when an operator without `content.author` scope lands on `/author/*`, show §3.15 access-denied with "Back to home".

---

## 14. Sprint 2 navigation flow (student)

```
             /home
               │
    ┌──────────┼───────────────────┐
    ▼          ▼                   ▼
/catalog  /readiness         /settings/notifications
    │          │
    ▼          ▼
/catalog/topic/:id      /readiness/:subjectId
    │
    ▼
/quiz/start?topicId=...
    │
    ▼
/quiz/:sessionId  ──────┐
    │                   │
    ▼                   ▼
 exit modal        /quiz/:id/result
    │                   │
    │                   ▼
    │            /quiz/:id/review
    │
    ▼
/home (saved)
```

## 15. Sprint 2 navigation flow (operator — `web-portal`)

```
/author  ────→  /author/questions/new
                       │
                       ▼
                /author/questions/:id/edit  ←─┐
                       │                      │
                       ├── autosave ──────────┘
                       │
                       ▼
                submit-for-review
                       │
                       ▼
                /author/reviews  (reviewer)
                       │
                       ▼
                /author/reviews/:id
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
          Approve   Return    Reject
             │         │         │
             └─────────┼─────────┘
                       ▼
              Email / in-app notif
```

---

## 16. Definition of Done (per screen — Sprint 2)

Same baseline as Pass 1 §15 plus:

- ☐ Offline behaviour implemented where applicable (quiz answer queue, autosave draft queue).
- ☐ `density` mode respected (`regular` default in portal; `compact` opt-in for dense tables).
- ☐ Feature flags wired where a screen is gated (e.g. `irt_model_enabled` on adaptive vs static quiz).
- ☐ Event catalogue §17 fired.

---

## 17. Event catalogue (Sprint 2 additions)

| Event | Fired from | Payload |
|---|---|---|
| `quiz.session.started` | §1 | `{ sessionId, mode, topicId, length }` |
| `quiz.question.viewed` | §2 | `{ sessionId, questionId, index }` |
| `quiz.answer.submitted` | §2 | `{ sessionId, questionId, correct, timeTakenMs }` |
| `quiz.session.paused` | §3 | `{ sessionId, answered, total }` |
| `quiz.session.completed` | §4 | `{ sessionId, score, total, durationMs }` |
| `readiness.viewed` | §5 | `{ overall, delta7d }` |
| `notification.prefs.updated` | §6 | `{ channels, categoriesChanged }` |
| `author.question.submitted` | §8 | `{ questionId, subject, aiFlagCount }` |
| `author.question.preview` | §9 | `{ questionId, locale }` |
| `review.decision.recorded` | §11 | `{ questionId, decision, reviewerId }` |
| `audit.activity.viewed` | §12 | `{ scope, filters }` |

---

## Open items for Designer / PM

| Item | Owner | When |
|---|---|---|
| Trend sparkline visual — size + colour gradient | Designer | Sprint 2 Day 2 |
| Readiness ring xl (128 px) addition to §3.37 | Designer → Controls Spec update | Sprint 2 Day 2 |
| Confetti / celebration motion spec for quiz pass | Designer | Sprint 2 Day 3 |
| LaTeX renderer decision (KaTeX vs MathJax) | FE Lead A + PM | Sprint 2 Day 1 |
| AI moderation flag taxonomy + severity levels | Content Lead | Sprint 2 Day 2 |
| Rich-text editor decision for Stem + Explanation (Lexical vs TipTap vs plain) | FE Lead B | Sprint 2 Day 1 |
| Quiz focus-mode keyboard shortcut cheat sheet | PM + Designer | Sprint 2 Day 5 |

---

## Next pass

Pass 3 (Sprint 3): `web-student` checkout + subscription + streaks + leaderboard; `web-portal` teacher dashboard + assignments + moderator queue full; `web-admin` overview + user management + **flag-management panel** (ADR-0001) + audit log.
