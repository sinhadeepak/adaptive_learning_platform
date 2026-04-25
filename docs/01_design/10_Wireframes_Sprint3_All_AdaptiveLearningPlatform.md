# Sprint 3 Wireframes — Checkout / Teacher / Institution-Admin / Platform-Admin

**Scope**: 13 screens closing the Phase 1 surface area — student checkout + subscription + profile + leaderboard; `web-portal` teacher cohorts + assignments + institution-admin; `web-admin` first release (overview + user mgmt + **flag-management panel** per [ADR-0001](../adr/0001-feature-flag-platform.md) + audit log).
**Form factor**: student screens mobile-first; operator + admin screens desktop-first.
**Companion**: [Pass 1](08_Wireframes_Sprint1_Student_AdaptiveLearningPlatform.md) and [Pass 2](09_Wireframes_Sprint2_Student_Portal_AdaptiveLearningPlatform.md); components reference [Common Controls Spec §3](07_CommonControls_Specification_AdaptiveLearningPlatform.md#3-common-controls-specification).
**Status**: v0.1 — text wireframes. Designer translates to Figma.

---

# Student surfaces — `web-student` + mobile

---

## 1. Plan Picker (Upgrade)

**Route**: `/upgrade` (dedicated) and via CTA from premium-gated topic (§11 Pass 1)
**Stories**: `ST-11-01-01` (plan comparison), `ST-11-01-02` (select plan)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│ ← Back                       │
├──────────────────────────────┤
│   Upgrade to Premium         │
│   Unlock everything.         │
│                              │
│  ┌────────────────────────┐  │
│  │ Free           ○       │  │  ← current chip if applicable
│  │ ₹0/mo                  │  │
│  │  ✓ All free topics     │  │
│  │  ✓ 10 quizzes/day      │  │
│  │  ✗ Mock tests          │  │
│  │  ✗ AI tutor            │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │ Premium        ●  [ Best │
│  │                    value]│  │ ← recommended badge §3.3 info
│  │ ₹399/mo  or  ₹3,499/yr │  │   (saves 27%)
│  │  ✓ Everything in Free  │  │
│  │  ✓ Unlimited quizzes   │  │
│  │  ✓ Unlimited mocks     │  │
│  │  ✓ AI tutor            │  │
│  │  ✓ Performance export  │  │
│  └────────────────────────┘  │
│                              │
│  Billing                     │
│  [○ Monthly]  [● Yearly]     │  ← period toggle
│                              │
│  You'll be charged ₹3,499    │
│  Next renewal 28 Apr 2027    │
│                              │
│  ┌────────────────────────┐  │
│  │■    Continue to pay    │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │□      Restore purchase │  │ ← mobile only
│  └────────────────────────┘  │
│                              │
│  Terms · Privacy · Refund    │
│  All prices inclusive of GST │
└──────────────────────────────┘
```

### Desktop (`bp-lg`+)

- Two plan cards side-by-side; period toggle sits above both.
- Title scales to 24 px.
- Below cards: FAQ accordion §3.34 with 5 items (billing, cancellation, refund, GST, support).

### Component map

| Element | Control |
|---|---|
| Plan cards | §3.14 Data Card, selected state = §3.29 radio semantics |
| Recommended badge | §3.3 Badge info |
| Period toggle | §3.29 Radio Group (2 options) |
| Feature list rows | Inline `body` text with §2.7 `Check` / `X` icons |
| Continue | §3.2 Button primary (lg) |
| Restore purchase | §3.2 secondary — **mobile only** (App Store + Play Store require it) |

### Data

- `GET /api/v1/payment/plans` → `[{ id, name, priceMonthly, priceYearly, features[], isCurrent, isRecommended }]`
- `POST /api/v1/payment/checkout-intent { planId, billingPeriod }` → `{ intentId, url }` → redirect to Stripe Checkout hosted page (or Stripe Payment Element on desktop, decision in Sprint 3 Day 1).

### States

| State | Treatment |
|---|---|
| Current plan is Free | Free card dimmed with "Current plan" chip; Premium card primary |
| Already Premium | Both cards shown but primary CTA becomes "Manage subscription" → §3 |
| Plans API failed | §3.25 Alert danger + inline retry |
| Checkout intent failed (400/500) | Button re-enabled with §3.25 Alert |
| India price compliance (GST) | GST note visible always; split `₹X + ₹Y GST` breakdown in confirmation modal before Stripe redirect |

### Interactions

- Toggling period updates displayed price in both cards.
- Tap card selects it; Continue uses selected plan + period.
- Mobile: "Continue to pay" on iOS follows Apple In-App Purchase if enabled; per ADR (Sprint 3 Day 1 decision). Web + Android uses Stripe.

### A11y

- Plan cards in `role="radiogroup"`; each card `role="radio" aria-checked`.
- Period toggle `role="radiogroup"`.
- Price + renewal date block has `role="status"` so SR users hear the change on toggle.

---

## 2. Payment Confirmation (pre-redirect)

**Route**: `/checkout?intentId=...`
**Stories**: `ST-11-02-01` (review before pay), `ST-11-02-02` (apply coupon)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│ ← Back                       │
├──────────────────────────────┤
│  Review and pay              │
│                              │
│  Premium · Yearly            │
│  Starting 28 Apr 2026        │
│  Next renewal 28 Apr 2027    │
│                              │
│  Plan price     ₹2,966.10    │
│  GST (18%)      ₹533.90      │
│  ───────────────────────     │
│  Total          ₹3,500.00    │
│                              │
│  Have a coupon?              │
│  ┌────────────────────────┐  │
│  │ Enter code       Apply │  │
│  └────────────────────────┘  │
│                              │
│  Payment method              │
│  Credit/Debit · UPI · Wallet │
│                              │
│  ┌────────────────────────┐  │
│  │■    Pay ₹3,500.00      │  │
│  └────────────────────────┘  │
│                              │
│  Secure payment via Stripe.  │
│  You'll be redirected.       │
│                              │
│  ☑ I agree to Terms & Refund │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Price breakdown | Definition-list style with `tabular-nums` |
| Coupon row | §3.1 Input + §3.2 Button secondary (Apply) |
| Payment method row | Informational only — Stripe-hosted page handles method selection |
| Pay button | §3.2 primary (lg) |
| Terms checkbox | §3.9 required before pay |

### Data

- `POST /api/v1/payment/checkout/:intentId/coupons { code }` → `{ discount, newTotal }` or `{ error }`.
- `POST /api/v1/payment/checkout/:intentId/confirm` → `{ url }` → `window.location.href = url` (Stripe).

### States

- Valid coupon → green success chip below input + updated total (`space-4` nudge animation respecting reduced-motion).
- Invalid coupon → red inline error "Code not valid or expired".
- Pay in-flight: button `aria-busy` with "Creating secure session…" caption.
- Post-redirect success: Stripe webhook flips `subscription.status = ACTIVE`, user lands on `/checkout/success`.
- Post-redirect cancel: user returns to `/checkout/canceled` with retry CTA.

### A11y

- Total updates (live coupon) announced in polite live region.
- Success/cancel landing pages use §3.15 Empty State success/danger variants respectively.

---

## 3. Subscription Management

**Route**: `/settings/subscription`
**Stories**: `ST-11-03-01` (view subscription), `ST-11-03-02` (cancel), `ST-11-03-03` (change plan), `ST-11-03-04` (invoices)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│ ← Settings                   │
├──────────────────────────────┤
│  Subscription                │
│                              │
│  ┌────────────────────────┐  │
│  │ Premium · Yearly       │  │
│  │ Renews 28 Apr 2027     │  │
│  │ ₹3,499/yr              │  │
│  │ [Active]               │  │
│  └────────────────────────┘  │
│                              │
│  Payment method              │
│  HDFC •••• 4242   Edit       │
│                              │
│  ┌────────────────────────┐  │
│  │□    Change plan        │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │□   Cancel subscription │  │  ← danger-secondary style
│  └────────────────────────┘  │
│                              │
│  Invoices                    │
│  28 Apr 2026 · ₹3,499  ▾    │
│  (expands to show download) │
│                              │
│  GST invoice — download PDF  │
│  Need help? Contact support  │
└──────────────────────────────┘
```

### Cancellation flow — modal

```
┌──────────────────────────────┐
│  ┌────────────────────────┐  │
│  │ Cancel Premium?        │  │
│  │                        │  │
│  │ You'll keep Premium    │  │
│  │ until 28 Apr 2027,     │  │
│  │ then switch to Free.   │  │
│  │                        │  │
│  │ Why are you cancelling?│  │
│  │ [○ Too expensive]      │  │
│  │ [○ Not using enough]   │  │
│  │ [○ Found alternative]  │  │
│  │ [○ Other]              │  │
│  │                        │  │
│  │ [Keep Premium]  [Cancel]│ │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Plan summary card | §3.14 Data Card + §3.3 Status Badge |
| Change plan | §3.2 Secondary → §1 Plan Picker in "change" mode |
| Cancel | §3.2 Secondary danger styling; opens confirmation modal §3.23 |
| Cancel reason radio | §3.29 Radio Group |
| Invoice row | §3.34 Accordion with download link per invoice |

### Data

- `GET /api/v1/payment/subscription` → current plan + renewal + invoices.
- `POST /api/v1/payment/subscription/cancel { reason }` → sets `cancel_at_period_end = true`.
- `GET /api/v1/payment/invoices/:id.pdf` → binary download.

### States

| State | Treatment |
|---|---|
| Canceled (cancel_at_period_end) | Status badge warning "Ends 28 Apr 2027"; primary CTA becomes "Resume subscription" |
| Past-due | Status badge danger; red banner §3.25 "Update payment method"; all other CTAs disabled until resolved |
| Free tier | Primary CTA "Upgrade to Premium" → §1 |
| Stripe portal redirect (EU / regional flows) | Button opens Stripe Billing Portal in new tab |

### A11y

- Cancellation modal is focus-trapped; dismiss via Esc or "Keep Premium".
- Invoice download link has an explicit `aria-label="Download invoice 28 April 2026"`.

---

## 4. Profile + Streak Detail + Avatar

**Route**: `/settings/profile`
**Stories**: `ST-12-01-01` (edit profile), `ST-12-01-02` (avatar upload), `ST-12-02-01` (streak detail)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│ ← Settings                   │
├──────────────────────────────┤
│  Profile                     │
│                              │
│      ┌──────┐                │
│      │  RS  │  ← Avatar §3.32 xl
│      └──────┘                │
│      Change · Remove         │
│                              │
│  First name                  │
│  ┌────────────────────────┐  │
│  │ Rahul                  │  │
│  └────────────────────────┘  │
│  Last name                   │
│  ┌────────────────────────┐  │
│  │ Sharma                 │  │
│  └────────────────────────┘  │
│  Email    [locked]           │
│  rahul@... · Change → modal  │
│  Phone                       │
│  ┌────────────────────────┐  │
│  │ +91 •••• 5678   [edit] │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │■       Save            │  │
│  └────────────────────────┘  │
│                              │
│  ─── Streak ───              │
│  🔥 6-day streak             │   ← §3.38 Streak Counter (large)
│  Best: 42 days               │
│                              │
│  Freezes                     │
│  2 available — 1 used this   │
│  month.                      │
│                              │
│  Last 30 days                │
│  ▓▓▓▓▓░▓▓▓▓▓▓░▓▓▓▓▓▓▓▓▓▓▓▓▓  │   ← streak heatmap (28 cells)
│                              │
│  ─── Danger zone ───         │
│  ┌────────────────────────┐  │
│  │□     Delete account    │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Avatar | §3.32 xl (64 px) with "Change" / "Remove" inline buttons |
| Avatar upload | §3.13 File Upload (image only, ≤ 2 MB) — mobile uses native camera/gallery picker |
| Profile fields | §3.1 Input |
| Email change | Opens §3.23 Modal with OTP verification on new email |
| Phone edit | Inline edit §3.33 + SMS OTP flow |
| Save | §3.2 primary; disabled until dirty |
| Streak heatmap | Custom — 28-cell grid; filled = practised that day; semantic colour by mastery or fill-only |
| Danger zone Delete | §3.2 button secondary danger; 2-step confirmation modal |

### Data

- `GET /api/v1/profile/me` → profile doc.
- `PATCH /api/v1/profile/me { firstName, lastName, ... }` → 200.
- `POST /api/v1/profile/me/avatar` multipart → uploaded URL; client updates Avatar.
- `GET /api/v1/analytics/streak` → `{ current, best, freezeBalance, days30: [{ date, practised }] }`.
- `DELETE /api/v1/profile/me` → 202 (queued — 30 day grace).

### States

- Avatar upload in-flight: spinner overlay on avatar circle.
- Upload fails: toast §3.25 + revert.
- Delete account: 2-step modal (type "DELETE" to confirm) + irreversible warning.

### A11y

- Avatar upload button has explicit label; after upload, announce "Avatar updated" via live region.
- Streak heatmap has a visually-hidden data table equivalent ("Date, practised" rows).

---

## 5. Leaderboard

**Route**: `/leaderboard`
**Stories**: `ST-13-01-01` (weekly leaderboard), `ST-13-01-02` (friends filter)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│ ← Home                       │
├──────────────────────────────┤
│  Leaderboard                 │
│                              │
│  [Global]  [My cohort]  [Fr] │  ← Tabs §3.6
│                              │
│  [This week ▾]               │  ← period dropdown
│                              │
│  ┌────────────────────────┐  │
│  │ 🥇 1  Aisha M.  2,340  │  │  ← §3.39 Leaderboard Row
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 🥈 2  Priya K.  2,180  │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 🥉 3  Rohan T.  2,040  │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │  4   Vikram S.  1,920  │  │
│  └────────────────────────┘  │
│  ...                         │
│  ┌────────────────────────┐  │
│  │  47  You  1,140   [◀]  │  │  ← current-user highlight
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │  48  Neha P.  1,110    │  │
│  └────────────────────────┘  │
│                              │
│  Jump to your rank ▲         │   ← sticky if scrolled past
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Tabs | §3.6 |
| Period dropdown | §3.8 (This week / Last week / All time) |
| Rows | §3.39 Leaderboard Row |
| Current-user row | §3.39 "Current user" variant |
| Jump-to-rank FAB | §3.2 Button secondary sticky; shows when user scrolls past their own row |

### Data

- `GET /api/v1/analytics/leaderboard?scope=global|cohort|friends&period=week|last-week|all` → `{ rows: [...], me: {rank, score} }`
- Privacy: global scope uses anonymised first-name + last-initial; full names only for friends.

### States

- Top 3 get medal styling (§3.39).
- Empty friends list → §3.15 "Add friends to see their ranks" with "Invite" CTA.
- User outside top 50 → a pinned "You" row at bottom always visible on scroll.

### A11y

- Table `<ol>`; current-user row has `aria-current="true"` + `role="listitem"` with explicit label "Your rank 47".
- Row scroll-pin uses `position: sticky` accessible to SR.

---

# Operator surfaces — `web-portal`

> Chrome: Top Nav §3.4 (portal variant) + Side Nav §3.5 + Breadcrumb §3.22. Desktop-first; `bp-lg` minimum for write ops.

---

## 6. Teacher Dashboard

**Route**: `/teacher`
**Stories**: `ST-14-01-01` (teacher landing), `ST-14-01-02` (cohort overview), `ST-14-01-03` (assignment quick stats)
**Surface**: `web-portal`
**Role**: Teacher or Expert (with `teaching.read` scope)

### Desktop (`bp-xl`)

```
┌──────────────────────────────────────────────────────────────────┐
│ [ALP] JEE Coaching Co.                         [STG] [avatar ▾]  │
├────────────┬─────────────────────────────────────────────────────┤
│ ─ Author   │ Home › Teacher                                      │
│ ─ Teacher  │                                                     │
│   Dashboard│ Overview                        [ + Assignment ]    │
│   Cohorts  │                                                     │
│   Assign.  │ ┌────────────┐ ┌────────────┐ ┌────────────┐        │
│ ─ Insights │ │ 4 cohorts  │ │ 142 active │ │ 6 due in   │        │  ← KPI cards
│            │ │            │ │  this week │ │  7 days    │        │
│            │ └────────────┘ └────────────┘ └────────────┘        │
│            │                                                     │
│            │ ─── Cohorts ───                                     │
│            │ ┌───────────────────────────────────────────────┐   │
│            │ │ Name         Students  Avg read. Trend   Act │   │
│            │ │ JEE 2027 A     36        72%    ▲+3    [...]│   │
│            │ │ JEE 2027 B     42        68%    ▲+2    [...]│   │
│            │ │ Crash course   28        84%    ▲+5    [...]│   │
│            │ │ NEET 2026      36        59%    ▼-2    [...]│   │
│            │ └───────────────────────────────────────────────┘   │
│            │                                                     │
│            │ ─── Assignments due soon ───                        │
│            │ ┌───────────────────────────────────────────────┐   │
│            │ │ Topic           Cohort        Due  Submitted │   │
│            │ │ Rolling motion  JEE 2027 A    2d     12/36  │   │
│            │ │ Thermochem      JEE 2027 B    5d     3/42   │   │
│            │ └───────────────────────────────────────────────┘   │
└────────────┴─────────────────────────────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Side nav | §3.5 (Teacher group with Dashboard/Cohorts/Assignments) |
| KPI cards | §3.14 Data Card (clickable — navigate to detail) |
| Cohorts table | §3.18 Data Table with sortable columns |
| Trend cell | Inline `▲/▼ N` + colour semantic (success/danger) |
| + Assignment | §3.2 Button primary — opens §8 modal |
| Row actions `[...]` | §3.24 Context Menu (Open / Message cohort / Archive) |

### Data

- `GET /api/v1/teaching/dashboard` → aggregated.
- Each KPI card has a secondary fetch on click.

### States

- Empty teacher (no cohorts): §3.15 Empty State with "Create your first cohort" CTA (Sprint 3 feature-flagged).
- Loading: skeleton KPI cards + table rows.
- Partial failure (e.g. assignments service down): KPIs render; assignments table shows inline retry.

### A11y

- KPI cards announce "N cohorts, click for details".
- Tables sortable per §3.18 a11y.

---

## 7. Cohort Detail

**Route**: `/teacher/cohorts/:id`
**Stories**: `ST-14-02-01` (cohort roster), `ST-14-02-02` (performance distribution), `ST-14-02-03` (message cohort — Sprint 3)
**Surface**: `web-portal`

### Desktop (`bp-xl`)

```
┌──────────────────────────────────────────────────────────────────┐
│ ─ Teacher   │ Home › Teacher › JEE 2027 A                        │
│   Cohorts ● │                                                     │
│             │ JEE 2027 A      36 students      [Message] [⚙]    │
│             │                                                     │
│             │ [Roster] [Performance] [Assignments] [Timeline]    │  ← Tabs §3.6
│             │                                                     │
│             │ Roster                                              │
│             │ ┌───────────────────────────────────────────────┐   │
│             │ │ Search...    [Filter ▾]      [ + Invite ]    │   │
│             │ └───────────────────────────────────────────────┘   │
│             │                                                     │
│             │ ┌───────────────────────────────────────────────┐   │
│             │ │ ☐  Student   Readiness   Streak   Joined  Act │  │
│             │ │ ☐  Rahul S.  [78%]▓▓▓   🔥 6d    2mo   [...] │  │
│             │ │ ☐  Priya K.  [84%]▓▓▓   🔥 12d   3mo   [...] │  │
│             │ │ ☐  Aisha M.  [64%]▓▓▓   🔥 0d    1mo   [...] │  │ ← at-risk (no streak)
│             │ │ ☐  Rohan T.  [42%]▓▓░   🔥 2d    4mo   [...] │  │ ← at-risk (low readiness)
│             │ │ ...                                            │  │
│             │ └───────────────────────────────────────────────┘   │
│             │ [3 selected]  [Message] [Remove] [Set assignment]  │  ← Bulk toolbar §3.19
│             │                                                     │
│             │        Rows 1–20 of 36         ◀ 1  2  ▶           │
└─────────────┴─────────────────────────────────────────────────────┘
```

### Performance tab (preview)

- Distribution histogram (readiness ranges by count).
- Top-performers + at-risk lists.
- Subject-wise mastery heatmap (cohort average per topic).

### Component map

| Element | Control |
|---|---|
| Header actions | §3.2 Button secondary (Message opens drafting modal §3.23) |
| Tabs | §3.6 |
| Table | §3.18 Data Table selectable + sortable |
| Readiness cell | §3.12 Progress Horizontal + label |
| Streak cell | Inline §3.38 Streak Counter sm |
| At-risk badge | §3.3 Badge warning inline with name |
| Bulk toolbar | §3.19 bulk-mode |

### Data

- `GET /api/v1/teaching/cohorts/:id` → metadata + counts.
- `GET /api/v1/teaching/cohorts/:id/students?page=N&q=&filter=` → paginated roster.
- `GET /api/v1/teaching/cohorts/:id/performance` → distribution data.

### States

- No students: §3.15 with Invite CTA.
- At-risk criteria (configurable server-side): flagged with warning badge + subtle row tinting.
- Loading: skeleton rows.

### A11y

- Row selection announces "3 of 36 selected" in live region.
- At-risk badge has explanatory tooltip §3.17.

---

## 8. Assignment — Create / Edit

**Route**: modal overlay on any Teacher screen (`?assignment=new|:id`)
**Stories**: `ST-14-03-01` (create assignment), `ST-14-03-02` (edit)
**Surface**: `web-portal`

### Desktop — modal drawer variant (§3.23 drawer from right, 560 px)

```
┌──────────────────────────────────────────────────────────────────┐
│                 ┌──── New assignment ────────────────────┐       │
│                 │                                   [X]  │       │
│                 │ Title                                  │       │
│                 │ ┌───────────────────────────────────┐  │       │
│                 │ │ ...                               │  │       │
│                 │ └───────────────────────────────────┘  │       │
│                 │                                        │       │
│                 │ Cohort(s)                              │       │
│                 │ [JEE 2027 A ×] [+ Add cohort ▾]       │       │
│                 │                                        │       │
│                 │ Topic                                  │       │
│                 │ [Mechanics > Rotational motion  ▾]    │       │
│                 │                                        │       │
│                 │ Type                                   │       │
│                 │ [○ Practice (10 Q)]                    │       │
│                 │ [● Mock test    ]                      │       │
│                 │ [○ Reading list ]                      │       │
│                 │                                        │       │
│                 │ Due date and time                      │       │
│                 │ [15 May 2026  ▾]   [18:00 ▾]          │       │
│                 │                                        │       │
│                 │ Notes to students (optional)           │       │
│                 │ ┌───────────────────────────────────┐  │       │
│                 │ │ ...                               │  │       │
│                 │ └───────────────────────────────────┘  │       │
│                 │                                        │       │
│                 │ Visibility                             │       │
│                 │ [☑ Notify students on publish]         │       │
│                 │ [☐ Count toward readiness score]       │       │
│                 │                                        │       │
│                 │ [Cancel]            [Save draft] [■Publish] │   │
│                 └────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Drawer | §3.23 Modal drawer 560 px |
| Cohort multi-select | §3.28 Multi-Select Tag Input |
| Topic picker | §3.8 Dropdown with tree (searchable, shows breadcrumbs) |
| Type radio | §3.29 Radio Group |
| Date picker | §3.26 Date Picker single-date (min today) |
| Time picker | Native time input on mobile; custom dropdown on web (hour + minute) |
| Notes | §3.1 textarea |
| Visibility checkboxes | §3.9 |
| Publish | §3.2 primary |
| Save draft | §3.2 secondary |

### Data

- `POST /api/v1/teaching/assignments { title, cohortIds, topicId, type, dueAt, notes, notify, countsToReadiness }` → 200.
- `PATCH /api/v1/teaching/assignments/:id` for edits.
- Notify triggers notification service (`assignment.created` event).

### States

- Validation: title + ≥1 cohort + topic + due-date required.
- Due in < 24 h: warning banner "Students will get a short window to complete".
- Saving: both save buttons `aria-busy`.
- Edit mode: title bar changes to "Edit assignment"; extra "Delete" button (destructive).

### A11y

- Focus trap inside drawer.
- Form has `aria-labelledby` to drawer title.
- Time picker announces selected time on change.

---

## 9. Institution Admin — Users + Invites

**Route**: `/institution/users`
**Stories**: `ST-15-01-01` (user search), `ST-15-01-02` (invite links), `ST-15-01-03` (remove user)
**Surface**: `web-portal`
**Role**: Institution Admin (`institution.admin` scope)

### Desktop (`bp-xl`)

```
┌──────────────────────────────────────────────────────────────────┐
│ ─ Institution   │ Home › Institution › Users                     │
│   Users ●      │                                                 │
│   Cohorts      │ Users                         [ + Invite ]      │
│   Invites      │                                                 │
│                │ [All] [Students] [Teachers] [Experts] [Admins]  │  ← Tabs §3.6
│                │                                                 │
│                │ ┌───────────────────────────────────────────┐   │
│                │ │ Search name or email...  [Filter ▾]      │   │
│                │ └───────────────────────────────────────────┘   │
│                │                                                 │
│                │ ┌───────────────────────────────────────────┐   │
│                │ │ ☐ Name      Email       Role     Joined Act│  │
│                │ │ ☐ Rahul S.  rahul@...   Student  2mo   ⋮  │  │
│                │ │ ☐ Priya K.  priya@...   Teacher  6mo   ⋮  │  │
│                │ │ ☐ Amit B.   amit@...    Expert   1y    ⋮  │  │
│                │ │ ...                                         │  │
│                │ └───────────────────────────────────────────┘   │
│                │ [4 selected]  [Change role▾] [Remove]           │
│                │                                                 │
│                │ ─── Active invite links ───                     │
│                │ ┌───────────────────────────────────────────┐   │
│                │ │ Link        Role     Used  Expires   Act  │  │
│                │ │ alp.in/j/K8 Student  23/50 2d left   [X]  │  │
│                │ │ alp.in/j/T3 Teacher  1/10  28d left  [X]  │  │
│                │ └───────────────────────────────────────────┘   │
└─────────────────┴─────────────────────────────────────────────────┘
```

### Invite modal

```
┌──────────────────────────────┐
│ Create invite link           │
│                              │
│ Role                         │
│ [Student ▾]                  │
│                              │
│ Max uses                     │
│ [ 50 ]                       │
│                              │
│ Expires                      │
│ [ 7 days ▾ ]                 │
│                              │
│ Notes (internal)             │
│ ┌──────────────────────────┐ │
│ │ ...                      │ │
│ └──────────────────────────┘ │
│                              │
│ [Cancel]  [■  Create]        │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Tabs | §3.6 |
| Users table | §3.18 |
| Invites table | §3.18 with copy-link + revoke per row |
| Invite modal | §3.23 (sm 400 px) |
| Role dropdown | §3.8 |
| Copy link | §3.2 ghost with copy icon + toast on copy |
| Revoke | §3.2 danger |

### Data

- `GET /api/v1/institution/users?role=...&q=...&page=N` → paginated.
- `POST /api/v1/institution/invites { role, maxUses, expiresAt, notes? }` → `{ token, url, expiresAt }`.
- `PATCH /api/v1/institution/users/:id { role, status }` for bulk role change / suspend.

### States

- Empty users: §3.15 with Invite CTA.
- Invite creation success: toast "Link copied" + row appears at top of Active invites.
- Link about to expire (< 24 h): row in warning tone.
- Revoke: 2-step modal (typed confirmation).

### A11y

- Copy-to-clipboard action announces "Invite link copied" via live region.
- Expiring chip has a distinct ARIA label independent of colour.

---

# Platform admin surfaces — `web-admin`

> Chrome: Top Nav §3.4 **admin variant** (Super Admin badge, env indicator ALWAYS visible) + Side Nav §3.5 + Breadcrumb §3.22. **MFA required** on entry. Desktop-only — viewports below `bp-lg` show a hard block. Density default = `compact`.

---

## 10. Platform Overview (Admin Home)

**Route**: `/admin` (`web-admin`)
**Stories**: `ADM-REQ-01`, `ADM-REQ-02` (overview + drill-down dashboards)
**Surface**: `web-admin`
**Role**: `admin_access_level = PLATFORM`

### Desktop (`bp-xl`)

```
┌──────────────────────────────────────────────────────────────────┐
│ [ALP] [Super Admin]            [PROD ●] [MFA ✓] [avatar ▾]       │  ← admin top nav
├────────────┬─────────────────────────────────────────────────────┤
│ ─ Platform │ Platform overview                 [Last 7 days ▾]   │
│   Overview●│                                                     │
│   Users    │ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───┐  │
│   Inst.    │ │ 142,380    │ │ 18,420 DAU │ │ 3,240 prem │ │ 4 │  │
│   Revenue  │ │ total      │ │ ▲ 12%      │ │ ▲ 8%       │ │inc│  │
│ ─ Config   │ │            │ │            │ │            │ │ ⚠ │  │
│   Exams    │ └────────────┘ └────────────┘ └────────────┘ └───┘  │
│   Plans    │                                                     │
│   Flags    │ ─── Traffic ───                                     │
│ ─ Audit    │ ┌───────────────────────────────────────────────┐   │
│            │ │    Chart: DAU by day, last 30 days           │   │
│            │ │                                               │   │
│            │ └───────────────────────────────────────────────┘   │
│            │                                                     │
│            │ ─── Revenue ───                                     │
│            │ This week: ₹2,80,000   ▲ +14% vs last week         │
│            │ MRR: ₹18,20,000                                    │
│            │                                                     │
│            │ ─── Recent incidents ───                            │
│            │ ┌───────────────────────────────────────────────┐   │
│            │ │ [danger] 28 Apr 14:20   Auth p99 breach       │  │ ← §3.16 Log rows
│            │ │ [warn  ] 27 Apr 08:45   Search OS 429         │  │
│            │ │ [info  ] 26 Apr 21:00   Deploy v0.5.2         │  │
│            │ └───────────────────────────────────────────────┘   │
└────────────┴─────────────────────────────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Top nav admin variant | §3.4 with "Super Admin" neutral badge, Env badge (PROD always visible, `danger` tone in prod) |
| MFA status | small tick icon in nav; click opens session info tooltip |
| Side nav | §3.5 Platform / Config / Audit groups |
| KPI cards | §3.14 with delta chips §3.3 |
| Traffic chart | Custom line chart; exportable as CSV via a ghost button |
| Revenue summary | `body` text + `tabular-nums` |
| Incidents | §3.16 Log Rows |

### Data

- `GET /api/v1/admin/overview?range=7d` → aggregated dashboard.
- Incidents sourced from alerting system (Grafana + PagerDuty feed).

### States

- Loading: skeleton KPI cards.
- Partial failure: each section has its own retry; page never blanks.
- Prod environment: banner `danger-bg` at top of every admin route, dismissible per session but re-appears on nav.

### A11y

- Env indicator has `role="status"` + explicit label ("Environment: production").
- Charts have data-table fallback.

---

## 11. User Management

**Route**: `/admin/users`
**Stories**: `ADM-REQ-03..08` (search, suspend, impersonate, merge, grant admin, delete)
**Surface**: `web-admin`

### Desktop (`bp-xl`)

```
┌──────────────────────────────────────────────────────────────────┐
│ [ALP] [Super Admin]                   [PROD ●] [avatar ▾]        │
├────────────┬─────────────────────────────────────────────────────┤
│ ─ Platform │ Platform › Users                                    │
│   Overview │                                                     │
│   Users ●  │ Users                          [ Filters ] [Export] │
│            │                                                     │
│            │ ┌───────────────────────────────────────────────┐   │
│            │ │ Search email, id, phone, name...             │   │
│            │ └───────────────────────────────────────────────┘   │
│            │                                                     │
│            │ ┌───────────────────────────────────────────────┐   │
│            │ │ Name      Email       Inst.  Role  Status Act│  │
│            │ │ Rahul S.  rahul@...   JEE…   Stu   [Act]  ⋮ │  │
│            │ │ Priya K.  priya@...   NEET…  Teach [Act]  ⋮ │  │
│            │ │ Amit B.   amit@...    —      Stu   [Susp] ⋮ │  │  ← suspended tone §3.3 danger
│            │ │ ...                                           │  │
│            │ └───────────────────────────────────────────────┘   │
│            │                Rows 1–50 of 142,380  ◀ 1 2 … ▶     │
└────────────┴─────────────────────────────────────────────────────┘
```

### Row action menu (§3.24 Context Menu)

```
┌─────────────────────┐
│ View profile        │
│ Impersonate       ⚠ │   ← danger + MFA re-auth
│ Send password reset │
│ Suspend           ⚠ │
│ Delete account    ⚠ │
│ ─────────────────── │
│ Copy user ID        │
└─────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Search | §3.30 Search Input (standalone) |
| Filters button | §3.2 secondary → opens §3.23 filter drawer |
| Export | §3.2 ghost — CSV of current filter (async job; toast on ready) |
| Table | §3.18 Data Table |
| Status badge | §3.3 |
| Row actions | §3.24 Context Menu |
| Impersonate flow | Opens §3.23 modal, requires MFA re-prompt, logs admin action to audit |

### Data

- `GET /api/v1/admin/users?q=&status=&role=&institutionId=&page=N&perPage=50` → paginated.
- Cross-tenant search — admin sees all tenants.
- `POST /api/v1/admin/users/:id/impersonate` → `{ impersonationToken, returnUrl }`. Banner at top of target surface during impersonation: "You are impersonating Rahul S. [End impersonation]".
- `POST /api/v1/admin/users/:id/suspend { reason }` → 200.

### States

- Impersonation requires MFA step — modal blocks until TOTP entered.
- Suspended users show in danger tone; searchable by suspension status.
- Deletion: 3-step confirmation (type user email, type "DELETE", type admin password).

### A11y

- Destructive menu items have `aria-describedby` pointing at their warning text.
- Impersonation session banner uses `role="alert"` and announces continuously until ended.

---

## 12. Feature Flag Management Panel (ADR-0001)

**Route**: `/admin/config/flags`
**Stories**: `ADM-REQ-20` + [ADR-0001](../adr/0001-feature-flag-platform.md) Super Admin panel UI
**Surface**: `web-admin`
**Role**: `admin_access_level = PLATFORM`

### Desktop (`bp-xl`) — list view

```
┌──────────────────────────────────────────────────────────────────┐
│ [ALP] [Super Admin]                   [PROD ●] [avatar ▾]        │
├────────────┬─────────────────────────────────────────────────────┤
│ ─ Config   │ Platform › Config › Flags                           │
│   Exams    │                                                     │
│   Plans    │ Feature flags                      [ + New flag ]   │
│   Flags ●  │                                                     │
│            │ ┌─────────────────────────────────────────────┐     │
│            │ │ Search flag name...  [Scope ▾] [Status ▾]  │     │
│            │ └─────────────────────────────────────────────┘     │
│            │                                                     │
│            │ ┌────────────────────────────────────────────────┐  │
│            │ │ Name              Default  Overrides  Updated  │  │
│            │ │ irt_model_enabled [ON ]   5 tenants  2h  ▸   │  │  ← §3.27 Toggle inline
│            │ │ checkout_enabled  [OFF]   —         1mo  ▸   │  │
│            │ │ push_channel_ena. [ON ]   2 tenants  3d  ▸   │  │
│            │ │ sms_channel_enab. [OFF]   1 tenant   1w  ▸   │  │
│            │ │ email_channel_en. [ON ]   —          4mo  ▸   │  │
│            │ │ premium_tier_enf. [OFF]   1 tenant   1mo  ▸   │  │
│            │ │ assignments_enab. [OFF]   3 tenants  2w  ▸   │  │
│            │ └────────────────────────────────────────────────┘  │
│            │                                                     │
│            │ Critical flags (danger-critical)                    │
│            │ marked with ⚠ require 2-admin confirmation.         │
└────────────┴─────────────────────────────────────────────────────┘
```

### Flag detail / edit (route: `/admin/config/flags/:name`)

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Back          irt_model_enabled                                │
│ ─ Config   │                                                     │
│   Flags ●  │ Global default                                      │
│            │ ┌───────────────────────────────────────┐           │
│            │ │ [ON]  Active for all tenants          │ [Change] │
│            │ └───────────────────────────────────────┘           │
│            │                                                     │
│            │ Description                                         │
│            │ Controls whether the 3PL IRT model drives adaptive  │
│            │ question selection. When OFF, binary-search         │
│            │ cold-start is used. ADR-0002.                       │
│            │                                                     │
│            │ Blast radius: student quiz experience               │
│            │ Owner: ML Engineer                                  │
│            │ Rollout tier: canary → 10% → 50% → 100%             │
│            │                                                     │
│            │ ─── Tenant overrides ───   [ + Add override ]       │
│            │ ┌──────────────────────────────────────────────┐    │
│            │ │ Tenant          Value  Set by     When       │    │
│            │ │ JEE Coaching Co. [OFF] rahul@     2h  [⋮]   │    │
│            │ │ NEET Academy    [ON]  priya@     1d  [⋮]   │    │
│            │ │ Delhi Public    [ON]  amit@      3d  [⋮]   │    │
│            │ └──────────────────────────────────────────────┘    │
│            │                                                     │
│            │ ─── Audit log ───                                   │
│            │ ┌──────────────────────────────────────────────┐    │
│            │ │ [INFO] 2h    rahul@ set JEE override to OFF  │    │  ← §3.16 Log Rows
│            │ │ [INFO] 1d    priya@ set NEET override to ON  │    │
│            │ │ [INFO] 5d    system set default to ON        │    │
│            │ │ [INFO] 6d    rahul@ created flag             │    │
│            │ └──────────────────────────────────────────────┘    │
│            │                                                     │
│            │ ⚠ Danger zone                                       │
│            │   [ Delete flag ]                                   │
└────────────┴─────────────────────────────────────────────────────┘
```

### Toggle confirmation modal

```
┌──────────────────────────────┐
│ Change irt_model_enabled?   │
│                              │
│  Global default will go      │
│  from  ON  →  OFF            │
│                              │
│  Estimated impact:           │
│  All students on 3PL IRT     │
│  will revert to binary       │
│  search cold-start.          │
│                              │
│  Type the flag name to       │
│  confirm:                    │
│  ┌────────────────────────┐  │
│  │ ...                    │  │
│  └────────────────────────┘  │
│                              │
│  Optional rationale          │
│  ┌────────────────────────┐  │
│  │ ...                    │  │
│  └────────────────────────┘  │
│                              │
│  [Cancel]   [■ Change flag]  │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| List table | §3.18 Data Table with inline §3.27 Toggle per row |
| Row expand `▸` | Navigates to detail page |
| Description + metadata | §3.14 Data Card |
| Tenant overrides | §3.18 Data Table; add via §3.23 modal with Tenant §3.8 Dropdown (searchable, typeahead) + target value toggle |
| Audit log | §3.16 Log Row list |
| Toggle confirmation | §3.23 Modal — typed name match required for global defaults + flags marked `dangerCritical` |
| Delete flag | §3.2 danger button inside Danger Zone |

### Data

- `GET /api/v1/flags` → list with defaults + override counts + last-update.
- `GET /api/v1/flags/:name` → detail including overrides + audit.
- `PUT /api/v1/flags/:name { value, rationale? }` → 200. Server logs audit with `admin_user_id`.
- `PUT /api/v1/flags/:name/tenants/:tenantId { value, rationale? }` → 200.
- `DELETE /api/v1/flags/:name` → 200 (only if no overrides; else list must be emptied first).
- NATS `flag.changed` published by Institution service on each write (per [ADR-0001](../adr/0001-feature-flag-platform.md) + [FS-03](../02_planning/12_SprintOne_Backlog_AdaptiveLearningPlatform.md#fs-03-nats-flagchanged-publisher)).

### States

| State | Treatment |
|---|---|
| Non-critical flag toggle | Single confirmation, optional rationale |
| Critical flag toggle | Typed-name confirmation + required rationale + optional 2nd-admin co-sign (Sprint 4 hardening) |
| Toggle in-flight | Row inline spinner per §3.27 loading; rollback on error |
| Propagation status | Small chip under the toggle "Propagated to 7 services" — updates as NATS consumers ack; stale / partial propagation warned after 60 s |
| Flag-flap detection | If a flag is toggled > 3 times / hour, it is frozen and shows a §3.25 danger banner "Flag flapping detected — freeze active. Contact DevOps Lead." (Runbook ref: `runbook/feature_flag_kill_switch.md`) |

### Interactions

- Every write requires re-entering MFA code if > 15 min since MFA or if flag is `dangerCritical`.
- Copy flag name to clipboard (useful for grepping logs) via an inline ghost button.

### A11y

- Row-level toggle announces "Flag {name} set to {new} for all tenants".
- Typed-name confirmation field has `aria-required="true"`.
- Audit rows live region: `role="log" aria-live="polite"` announcing on any new audit entry.

---

## 13. Audit Log Viewer

**Route**: `/admin/audit`
**Stories**: `ADM-REQ-20` (platform audit), compliance + incident support
**Surface**: `web-admin`

### Desktop (`bp-xl`)

```
┌──────────────────────────────────────────────────────────────────┐
│ ─ Audit    │ Platform › Audit                                    │
│   Log ●    │                                                     │
│            │ Filters                                             │
│            │ [Actor ▾] [Action ▾] [Resource ▾] [Level ▾]         │
│            │ [Last 30 days ▾]              [Clear]  [Export CSV] │
│            │                                                     │
│            │ 1,284 events                                        │
│            │                                                     │
│            │ ┌─────────────────────────────────────────────────┐ │
│            │ │ [INFO]  28 Apr 14:22  rahul@...  flag.updated   │ │  ← §3.16 Log Row
│            │ │        irt_model_enabled JEE Coaching → OFF   ▾│ │
│            │ │ ─── expanded JSON payload ─────                │ │
│            │ │ { "flag":"irt_model_enabled",                   │ │
│            │ │   "scope":"tenant",                             │ │
│            │ │   "tenant_id":"jc-001",                         │ │
│            │ │   "old":"true","new":"false",                   │ │
│            │ │   "actor":"rahul@alp.in",                       │ │
│            │ │   "rationale":"rollback per INC-421",           │ │
│            │ │   "ip":"10.2.3.4","ua":"Chrome/..."}            │ │
│            │ │                                          [Copy] │ │
│            │ └─────────────────────────────────────────────────┘ │
│            │ ┌─────────────────────────────────────────────────┐ │
│            │ │ [WARN]  28 Apr 12:10  system  auth.lockout ▾   │ │
│            │ │         amit@... locked after 5 failures       │ │
│            │ └─────────────────────────────────────────────────┘ │
│            │ ...                                                 │
│            │         Rows 1–50  of 1,284        ◀ 1 2 3 … ▶     │
└────────────┴─────────────────────────────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Filter bar | §3.2 secondary buttons opening §3.23 filter panels |
| Event rows | §3.16 Log / Event Row expandable |
| Export CSV | §3.2 ghost; async job with toast on ready |
| Pagination | §3.20 |

### Data

- `GET /api/v1/audit?actor=&action=&resource=&level=&from=&to=&page=N&perPage=50` → paginated.
- Underlying index: Aurora with supporting OpenSearch index for text query on payload.
- Retention: 2 years per compliance (Sprint 3 is read-only; retention policies enforced server-side).

### States

- Filter-empty: §3.15 no-results.
- Export in-flight: toast with spinner; on ready, toast with download link.
- Cross-tenant by default (admin scope); filter by `tenant_id` available.
- Sensitive payloads (PII) redacted server-side; UI shows redaction markers.

### A11y

- Expand chevron `aria-expanded`; expanded JSON block is a `<pre>` with `role="region" aria-label="Event payload"`.
- Export link announces via live region when ready ("Export is ready for download").

---

## 14. Cross-cutting additions (Sprint 3)

- **Impersonation banner** — persists across any `web-*` surface while an admin is impersonating; red danger tint, sticky top, "End impersonation" button always visible.
- **Admin session timeout** — 20 min idle; 2-min warning modal "You will be signed out for security".
- **Prod environment reminder** — banner present on every `web-admin` route in prod; dismissible per session but re-appears on route change.
- **Propagation status badge** — under any flag/config toggle, shows "propagated to N services" — turns warning after 60 s if any service hasn't ack'd.
- **Bulk action confirmation pattern** — any bulk write (suspend, role-change, remove) uses §3.23 modal with count + first-5 names preview.

---

## 15. Navigation flow (Sprint 3 — admin)

```
/admin
  │
  ├─ /admin (overview) ◀───┐
  │                         │
  ├─ /admin/users           │
  │     │                   │
  │     └─ /admin/users/:id │
  │          │              │
  │          └─ impersonate ─┘  (MFA challenge + audit)
  │
  ├─ /admin/config/flags
  │     │
  │     └─ /admin/config/flags/:name
  │            │
  │            └─ toggle modal  (MFA re-auth if > 15 min or critical)
  │
  └─ /admin/audit
```

## 16. Navigation flow (Sprint 3 — student)

```
/home
  │
  ├─ /upgrade ─→ /checkout ─→ Stripe (external)
  │                              │
  │                              ▼
  │                         /checkout/success  or  /canceled
  │                              │
  │                              ▼
  │                         /settings/subscription
  │
  ├─ /settings/profile
  ├─ /settings/subscription
  └─ /leaderboard
```

---

## 17. Definition of Done (Sprint 3 additions)

Same as Pass 1 §15 + Pass 2 §16 plus:

- ☐ Admin surfaces gated behind MFA; session timeout + impersonation banner implemented.
- ☐ Destructive operations (flag delete, user delete, suspend) have typed-confirmation patterns.
- ☐ Flag toggle writes trip NATS `flag.changed` and Redis TTL refresh — per SDK contract §FS-04.
- ☐ Audit log row fired for every admin write (flag, user, config).
- ☐ Stripe webhook integration verified in staging before launch.
- ☐ Density mode set appropriately (`compact` default in `web-admin`; `regular` in `web-portal`).

---

## 18. Event catalogue (Sprint 3 additions)

| Event | Fired from | Payload |
|---|---|---|
| `upgrade.plan.viewed` | §1 | `{ currentPlan, recommendedPlan }` |
| `checkout.intent.created` | §2 | `{ planId, period, total, coupon? }` |
| `checkout.confirmed` | §2 | `{ intentId }` (client-side just before redirect) |
| `subscription.canceled` | §3 | `{ reason, effectiveDate }` |
| `profile.avatar.updated` | §4 | `{ sizeBytes }` |
| `leaderboard.viewed` | §5 | `{ scope, period }` |
| `teacher.dashboard.viewed` | §6 | `{ cohortCount }` |
| `assignment.created` | §8 | `{ assignmentId, cohortCount, type }` |
| `institution.invite.created` | §9 | `{ role, maxUses, expiresInDays }` |
| `admin.user.impersonated` | §11 | `{ targetUserId }` (server also writes audit row) |
| `admin.flag.toggled` | §12 | `{ flag, scope, old, new, rationale? }` |
| `admin.audit.viewed` | §13 | `{ filters, resultCount }` |

---

## Open items for Designer / PM / Tech Lead

| Item | Owner | When |
|---|---|---|
| Stripe embedded vs. hosted checkout decision | Tech Lead + PM | Sprint 3 Day 1 |
| Apple In-App Purchase vs Stripe on iOS for mobile | Tech Lead + PM | Sprint 3 Day 1 — legal + 30% revenue model |
| Streak heatmap visual spec (28 cells) | Designer | Sprint 3 Day 2 |
| Impersonation banner copy + colours | Designer | Sprint 3 Day 2 |
| Prod-env banner — dismissibility policy | Tech Lead + Security | Sprint 3 Day 3 |
| `dangerCritical` flag list — which flags require 2-admin co-sign | Tech Lead + DevOps | Sprint 3 Day 3 |
| Propagation-status UX — polling vs server-sent events | Tech Lead | Sprint 3 Day 4 |
| Cancellation reason survey taxonomy | PM | Sprint 3 Day 2 |
| Audit log retention UI (does the admin set it, or is it fixed?) | Security Lead | Sprint 3 Day 5 |

---

## Pass 3 coverage summary

| Surface | Screens |
|---|---|
| `web-student` + mobile | §1 Plan Picker · §2 Payment Confirmation · §3 Subscription Management · §4 Profile + Streak + Avatar · §5 Leaderboard |
| `web-portal` | §6 Teacher Dashboard · §7 Cohort Detail · §8 Assignment Modal · §9 Institution Admin Users + Invites |
| `web-admin` | §10 Platform Overview · §11 User Management · §12 Feature Flag Panel (ADR-0001) · §13 Audit Log Viewer |

With Passes 1–3 together, the Phase 1 surface area is wireframed: auth + onboarding + catalog + search + quiz + readiness + notification + checkout + subscription + profile + leaderboard for students; content authoring + review + teacher + cohort + assignment + institution admin for operators; overview + user management + flag management + audit for platform admins. Remaining gaps are polish-level (Sprint 4) and will be handled as PR-time figmas rather than standalone spec docs.
