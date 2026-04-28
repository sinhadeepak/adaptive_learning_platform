# Sprint 1 Wireframes — Student Surfaces (`web-student` + mobile)

**Scope**: 12 screens covering the Sprint 1 student journey: authentication → onboarding → home → catalog browse → topic detail → search. Unblocks FE Lead A + Mobile Leads (2) for Sprint 1.
**Form factor**: Mobile-first (primary ASCII layout is `bp-xs`, 360 px). Desktop deviations (`bp-lg`, 1024 px+) called out per screen.
**Companion**: all components reference the [Common Controls Spec §3](07_CommonControls_Specification_AdaptiveLearningPlatform.md#3-common-controls-specification). Design tokens reference [§2](07_CommonControls_Specification_AdaptiveLearningPlatform.md#2-design-system-foundations).
**Status**: v0.1 — wireframes (text + component map). Designer translates to Figma frames; hex / pixel specs live in the Controls Spec.

---

## How to read these wireframes

Each screen lists:
1. **Route + stories** — URL and User Stories v2 refs.
2. **Layout** — ASCII box-drawing for mobile (`bp-xs` 360 px); desktop deviations in prose.
3. **Component map** — one line per component, with the `§3.N` control it uses.
4. **Data** — request(s) the screen fires + the shape consumed.
5. **States** — default / loading / empty / error / edge (the minimum a PR must cover).
6. **Interactions + keyboard** — tab order, shortcuts, navigation.
7. **A11y notes** — what screen-reader users should hear / operate.

Cross-screen flow map is in §14 at the end.

---

## Conventions

- `■` filled button (primary). `□` outlined (secondary / ghost).
- `▸` chevron / expandable. `●` radio selected. `○` radio unselected. `☐/☑` checkbox.
- `...` placeholder / value. `[ICON]` icon slot. `━━━` divider.
- All forms submit on Enter in the last input OR explicit primary button.
- All error-on-submit surfaces use Alert Banner §3.25 at the top of the form; inline errors per Input §3.1.2 error state.

---

## 1. Login

**Route**: `/login`
**Stories**: `ST-02-01-02` (email+password login), `ST-02-02-01` (Google/Apple SSO), `ST-02-03-01` (account lockout)
**Surface**: `web-student`, mobile
**Entry**: unauthenticated deep link, logout redirect, session expiry

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│           [ALP logo]         │
│                              │
│         Log in               │
│   Welcome back, learner.     │
│                              │
│  Email                       │
│  ┌────────────────────────┐  │
│  │ you@example.com        │  │
│  └────────────────────────┘  │
│                              │
│  Password                    │
│  ┌────────────────────────┐  │
│  │ ••••••••         [eye] │  │
│  └────────────────────────┘  │
│                              │
│  ☐ Remember me   Forgot?     │
│                              │
│  ┌────────────────────────┐  │
│  │■        Log in         │  │
│  └────────────────────────┘  │
│                              │
│  ───  or continue with  ───  │
│                              │
│  ┌────────────────────────┐  │
│  │ [G]    Google          │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ []   Apple            │  │
│  └────────────────────────┘  │
│                              │
│  New here?  Sign up →        │
└──────────────────────────────┘
```

### Desktop (`bp-lg`+)

- Centered card, 480 px width, `radius.card` (8 px), `elevation.flat`.
- Viewport background `surface-secondary`; card background `surface-primary`.
- Logo and title scale up (20 → 24 px title).

### Component map

| Element | Control |
|---|---|
| Logo mark | §2.7 custom `AlpLogoMark` |
| Email input | §3.1 Input (type=email, autocomplete=email) |
| Password input | §3.1 Input (password variant, toggle visibility) |
| Remember me | §3.9 Checkbox |
| Forgot link | §3.2 Button (link variant) → `/forgot-password` |
| Log in | §3.2 Button (primary, lg, full-width on mobile) |
| SSO buttons | §3.2 Button (secondary) with §2.7 brand icons |
| Sign up link | §3.2 Button (link) → `/register` |
| Error surface | §3.25 Alert Banner (danger) at card top on auth failure |

### Data

- `POST /api/v1/auth/login { email, password, remember }` → `{ access_token, refresh_token, user }`
- `GET /api/v1/auth/oauth/{google|apple}/url?returnTo=/...` → browser redirect
- Returned `user.onboarding_state` drives post-login route: `NEW|EXAM_SELECTED` → `/onboarding`, `ONBOARDED` → `/home`.

### States

| State | Treatment |
|---|---|
| Default | Empty fields, "Log in" enabled once email + password have length ≥ 1 |
| Validating | `aria-busy=true` on button; spinner replaces icon |
| Invalid email format | Inline §3.1 error on email field |
| 401 invalid credentials | Alert banner "Email or password is incorrect" — do NOT reveal which |
| 423 locked (5 fails / 15 min) | Alert banner "Too many attempts. Try again in {N} minutes." with countdown |
| 429 rate limit | Alert banner "Too many login attempts. Please wait {N} seconds." |
| Network error | Alert banner with "Retry" ghost button |
| SSO in-flight | Full-screen spinner with cancel link after 8 s |

### Interactions + keyboard

- Tab order: email → password → remember-me → Log in → Forgot → Sign up → Google → Apple.
- Enter in password triggers submit.
- `Forgot?` opens `/forgot-password` (screen §4).
- On success, do NOT flash a toast — just navigate.

### A11y

- `<form aria-label="Log in">` wrapping fields.
- Error Alert has `role="alert"` — announces on appearance.
- Button `aria-busy=true` during submit; loading state should not lose focus.
- SSO buttons include provider name in label, not just icon.

---

## 2. Register

**Route**: `/register`
**Stories**: `ST-02-01-01` (email+password register), `ST-02-02-01` (SSO register)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│           [ALP logo]         │
│                              │
│       Create account         │
│                              │
│  First name                  │
│  ┌────────────────────────┐  │
│  │ ...                    │  │
│  └────────────────────────┘  │
│  Last name                   │
│  ┌────────────────────────┐  │
│  │ ...                    │  │
│  └────────────────────────┘  │
│  Email                       │
│  ┌────────────────────────┐  │
│  │ ...                    │  │
│  └────────────────────────┘  │
│  Phone (optional — for SMS)  │
│  ┌────────────────────────┐  │
│  │ +91 ...                │  │
│  └────────────────────────┘  │
│  Password  (min 12 chars)    │
│  ┌────────────────────────┐  │
│  │ ••••••••         [eye] │  │
│  └────────────────────────┘  │
│  ▰▰▰▰▱  Strong              │
│                              │
│  ☐ I agree to Terms + Privacy│
│                              │
│  ┌────────────────────────┐  │
│  │■     Create account    │  │
│  └────────────────────────┘  │
│                              │
│  ───  or continue with  ───  │
│                              │
│  [G] Google    [] Apple    │
│                              │
│  Have an account?  Log in →  │
└──────────────────────────────┘
```

### Desktop

- Two-column layout inside the 480 px card: first-name + last-name side-by-side; all others full-width.

### Component map

| Element | Control |
|---|---|
| First / last / email / phone / password | §3.1 Input |
| Password-strength meter | §3.12 Progress — Horizontal segmented, 5 segments; tone danger → warning → success |
| Terms checkbox | §3.9 Checkbox; label has inline §3.2 link buttons to /terms, /privacy |
| Create account | §3.2 Button primary |
| SSO | §3.2 Button secondary |
| Login link | §3.2 Button link |

### Data

- `POST /api/v1/auth/register { firstName, lastName, email, phone?, password, locale }` → `{ userId, otpChannel: "email" }`
- After success, navigate to `/verify?kind=email`.
- Password strength computed client-side via `zxcvbn` (lib decision — Sprint 0 lock).

### States

| State | Treatment |
|---|---|
| Default | Submit disabled until all required fields valid + ToS checked |
| Email already registered (409) | Inline error on email field "Email in use. Log in instead?" with log-in link |
| Phone already registered (409) | Inline error on phone field |
| Password too weak | Strength meter red + hint "Add numbers / symbols / length" |
| Rate limit (429) | Alert banner |
| Loading | Button `aria-busy=true` |

### Interactions

- Password strength updates on debounced keystroke (300 ms).
- Toggling password visibility (eye icon) does not clear value.
- Tab order: firstName → lastName → email → phone → password → ToS → Create → Log in → Google → Apple.

### A11y

- Password strength announced via polite live region on change (debounced 1 s to avoid chatter).
- Terms link opens modal §3.23 with focus trap; back-button on mobile closes modal rather than navigating away.

---

## 3. OTP Verify

**Route**: `/verify?kind=email&email=...`
**Stories**: `ST-02-01-03` (email OTP verification)
**Surface**: `web-student`, mobile
**Entry**: post-register, post-email-change, forgot-password flow

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│  ← Back                      │
│                              │
│       Verify your email      │
│                              │
│  We sent a 6-digit code to   │
│  you@example.com   Change    │
│                              │
│  ┌──┬──┬──┬──┬──┬──┐         │
│  │  │  │  │  │  │  │         │
│  └──┴──┴──┴──┴──┴──┘         │
│                              │
│  Didn't get it?              │
│  Resend in 00:42             │
│                              │
│  ┌────────────────────────┐  │
│  │■        Verify         │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Back | §3.2 Button (ghost) with `icon.md` chevron-left |
| Change email link | §3.2 Button (link) → `/register` with pre-filled state |
| 6-digit OTP | Custom control — 6 separate inputs with auto-advance + paste-split (Input §3.1 geometry). Wrap in the spec as `§3.1.4 OTP variant` if shared across 2+ flows; otherwise in-app component |
| Resend | §3.2 Button (link); disabled with countdown until cooldown elapses |
| Verify | §3.2 Button primary |

### Data

- `POST /api/v1/auth/otp/verify { userId, channel: "email", code }` → `{ access_token, refresh_token, user }`
- `POST /api/v1/auth/otp/resend { userId, channel }` → 204 (rate-limited: 3 / 5 min).

### States

| State | Treatment |
|---|---|
| Default | First input autofocus; others disabled until previous filled |
| Pasting 6-digit string | Splits across all 6 cells; submits on last if valid |
| Invalid code (400) | All cells red border (§3.1 error state); banner "Incorrect code — try again" |
| Expired code (410) | Banner "Code expired — resend a new one" |
| Rate-limited resend (429) | Countdown disables resend button |
| Loading | Button `aria-busy=true` |
| Success | Brief 200 ms success tick before navigate to `/onboarding` |

### Interactions

- Auto-advance on input; backspace on empty cell moves back.
- Numbers-only keyboard on mobile (`inputmode="numeric"`, `autocomplete="one-time-code"`).
- iOS: autofill from SMS works when kind=phone.

### A11y

- Each cell has `aria-label="Digit N of 6"`.
- Countdown announces via polite live region every 10 s.
- Successful verify announces "Verified, taking you to setup".

---

## 4. Forgot + Reset Password

**Route**: `/forgot-password` → `/reset-password?token=...`
**Stories**: `ST-02-04-01` (password reset)
**Surface**: `web-student`, mobile

### Mobile — step 1 "Forgot" (`bp-xs`)

```
┌──────────────────────────────┐
│  ← Back to login             │
│                              │
│      Reset your password     │
│                              │
│  Enter your email and we'll  │
│  send you a reset link.      │
│                              │
│  Email                       │
│  ┌────────────────────────┐  │
│  │ you@example.com        │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │■      Send reset link  │  │
│  └────────────────────────┘  │
│                              │
│  Return to login             │
└──────────────────────────────┘
```

After submit, show confirmation screen inline:

```
┌──────────────────────────────┐
│      ✓                       │
│  Check your email            │
│                              │
│  If an account exists for    │
│  you@example.com, we've sent │
│  a reset link.               │
│                              │
│  Didn't get it? Resend in 42s│
│                              │
│  Return to login             │
└──────────────────────────────┘
```

### Mobile — step 2 "Reset" (`bp-xs`) — user arrives via link with `?token=`

```
┌──────────────────────────────┐
│      Create a new password   │
│                              │
│  New password (min 12 chars) │
│  ┌────────────────────────┐  │
│  │ ••••••••         [eye] │  │
│  └────────────────────────┘  │
│  ▰▰▰▰▱  Strong              │
│                              │
│  Confirm password            │
│  ┌────────────────────────┐  │
│  │ ••••••••         [eye] │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │■      Set new password │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Back link | §3.2 Button link |
| Email, password, confirm | §3.1 Input |
| Strength meter | §3.12 Progress segmented |
| Send / Set primary | §3.2 Button primary |
| Success icon | §2.7 Custom `AlpCheckCircle` at `icon.3xl` |

### Data

- `POST /api/v1/auth/password/forgot { email }` → 204 always (enumeration-safe).
- `POST /api/v1/auth/password/reset { token, newPassword }` → 200; logs out all sessions.

### States

- Always show the "Check your email" confirmation regardless of whether the email exists (enumeration safety).
- Token expired / invalid (step 2) → full-screen error with "Request a new link" CTA.
- Passwords don't match → inline error on confirm field on blur.

### A11y

- Confirmation step uses `role="status"` announcing "Reset link sent".

---

## 5. Onboarding — Exam Selection

**Route**: `/onboarding/exam`
**Stories**: `ST-03-01-01` (exam selection — mandatory gate)
**Surface**: `web-student`, mobile
**Entry**: first login after register; user cannot reach `/home` until at least one exam selected.

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│   ●━━○━━○━━○   1 of 4        │  ← Stepper §3.7
│                              │
│   Which exam are you         │
│   preparing for?             │
│                              │
│   Pick one to get started.   │
│   You can add more later.    │
│                              │
│   ┌────────────────────────┐ │
│   │ 🎯 JEE Main            │ │  ← Data Card §3.14 clickable
│   │ Engineering entrance   │ │
│   └────────────────────────┘ │
│   ┌────────────────────────┐ │
│   │ 🎯 NEET                │ │
│   │ Medical entrance       │ │
│   └────────────────────────┘ │
│   ┌────────────────────────┐ │
│   │ 🎯 UPSC CSE            │ │
│   │ Civil services         │ │
│   └────────────────────────┘ │
│   ┌────────────────────────┐ │
│   │ 🎯 CAT                 │ │
│   │ MBA entrance           │ │
│   └────────────────────────┘ │
│   ...more exams...           │
│                              │
│   ┌────────────────────────┐ │
│   │■      Continue         │ │ ← disabled until 1 selected
│   └────────────────────────┘ │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Stepper (4 steps) | §3.7 Stepper horizontal |
| Exam card | §3.14 Data Card, clickable, selected state = `brand-tint` bg + `brand-primary` border |
| Continue | §3.2 Button primary, disabled until selection |
| Exam icon | §2.7 Custom per exam (`AlpExamBadgeJEE`, `AlpExamBadgeNEET`, …) |

### Data

- `GET /api/v1/catalog/exams` → `[{ id, code, name, subtitle, iconKey }]`
- `PUT /api/v1/profile/exams { examId }` → 200.
- Empty list from catalog → Empty State §3.15 "No exams available yet — contact support".

### States

| State | Treatment |
|---|---|
| Loading | Skeleton cards §3.31 (4 rows) |
| Empty | §3.15 Empty State |
| Selected | Card border 2 px `brand-primary`, bg `brand-tint`, trailing check `icon.md` |
| Error saving | Alert banner on step; stay on screen |

### Interactions

- Tap / click anywhere on card selects it. Single-select (radio group semantics).
- Keyboard: arrow keys navigate between cards; Enter selects.
- Selecting + Continue advances to §6.

### A11y

- Cards are `<button role="radio" aria-checked>` inside a `role="radiogroup" aria-labelledby="exam-q"`.
- Stepper announces "Step 1 of 4: Exam selection".

---

## 6. Onboarding — Language Preference

**Route**: `/onboarding/language`
**Stories**: `ST-03-02-01` (language preference)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│   ●━━●━━○━━○   2 of 4        │
│                              │
│   What language do you       │
│   want to learn in?          │
│                              │
│   You can switch any time    │
│   from settings.             │
│                              │
│   ┌────────────────────────┐ │
│   │ ● English              │ │
│   │   Default. All content │ │
│   └────────────────────────┘ │
│                              │
│   ┌────────────────────────┐ │
│   │ ○ हिन्दी  (Hindi)        │ │
│   │   Available Sprint 2   │ │
│   └────────────────────────┘ │
│                              │
│   ┌────────────────────────┐ │
│   │ ○ Hinglish             │ │
│   │   Type either; we      │ │
│   │   understand both      │ │
│   └────────────────────────┘ │
│                              │
│   ┌────────────────────────┐ │
│   │■      Continue         │ │
│   └────────────────────────┘ │
│   ┌────────────────────────┐ │
│   │□        Skip           │ │
│   └────────────────────────┘ │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Stepper | §3.7 |
| Radio group | §3.29 Radio Group with extended card visuals (card hit target ≥ 52 px) |
| Continue | §3.2 Button primary |
| Skip | §3.2 Button ghost (defaults to English) |

### Data

- `PUT /api/v1/profile/preferences { language: "en" | "hi" | "hinglish" }` → 200.
- Hindi option shows a subtle "Available Sprint 2" tag — still selectable; backend stores preference, content falls back to English until Sprint 2 lands.

### States

- Default: English pre-selected.
- Loading on Continue: button `aria-busy`.

### A11y

- Hindi label has `lang="hi"` on the native-script portion.

---

## 7. Onboarding — Target Date

**Route**: `/onboarding/target-date`
**Stories**: `ST-03-02-02` (target exam date)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│   ●━━●━━●━━○   3 of 4        │
│                              │
│   When is your exam?         │
│                              │
│   We'll build a study plan   │
│   that ramps up toward this  │
│   date.                      │
│                              │
│   Target date                │
│   ┌────────────────────────┐ │
│   │ Pick a date    [cal]   │ │   ← Date Picker §3.26 trigger
│   └────────────────────────┘ │
│                              │
│   [optional chips]           │
│   ┌───────┐ ┌───────┐        │
│   │ 3 mos │ │ 6 mos │ ...    │   ← quick presets
│   └───────┘ └───────┘        │
│                              │
│   Days remaining: 127        │   ← live calc below picker
│                              │
│   ┌────────────────────────┐ │
│   │■      Continue         │ │
│   └────────────────────────┘ │
│   ┌────────────────────────┐ │
│   │□    Not sure yet       │ │   ← skip
│   └────────────────────────┘ │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Date picker | §3.26 Date Picker single-date, min=today+7, max=today+2y |
| Preset chips | Custom — small §3.2 Button (outlined) |
| Days-remaining | Inline `body` text, updates on date change |
| Continue / Skip | §3.2 Button |

### Data

- `PATCH /api/v1/profile/exams/:examId { target_date: "2026-08-15" }` → 200.

### States

- Empty: Continue disabled.
- Past date: Picker blocks it (§3.26 disabled days).
- Closer than 7 days: inline warning "That's soon — we'll prioritise revision topics."
- Skipped: target_date remains null; Home screen nudges them in 3 days.

### A11y

- Days-remaining is a polite live region — updates are announced without stealing focus.

---

## 8. Onboarding — Daily Goal

**Route**: `/onboarding/daily-goal`
**Stories**: `ST-03-02-04` (daily goal)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│   ●━━●━━●━━●   4 of 4        │
│                              │
│   Set your daily goal        │
│                              │
│   Consistency beats          │
│   intensity. Pick a goal     │
│   you can stick to.          │
│                              │
│   ┌────────────────────────┐ │
│   │ ○  Chill — 15 min /day │ │
│   └────────────────────────┘ │
│   ┌────────────────────────┐ │
│   │ ●  Regular — 30 min    │ │   ← default selected
│   └────────────────────────┘ │
│   ┌────────────────────────┐ │
│   │ ○  Serious — 60 min    │ │
│   └────────────────────────┘ │
│   ┌────────────────────────┐ │
│   │ ○  Intense — 120 min   │ │
│   └────────────────────────┘ │
│                              │
│   You'll get a streak for    │
│   hitting this 4 days/week.  │
│                              │
│   ┌────────────────────────┐ │
│   │■     Start learning    │ │   ← final CTA of onboarding
│   └────────────────────────┘ │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Radio cards | §3.29 Radio Group with card visuals |
| Start learning | §3.2 Button primary (lg); on success, sets `profile.onboarding_state = ONBOARDED` and routes to /home |

### Data

- `PATCH /api/v1/profile { daily_goal_minutes }` → 200.
- `PATCH /api/v1/profile { onboarding_state: "ONBOARDED" }` — backend auto-transitions from EXAM_SELECTED when goal is set.

### States

- Default: Regular pre-selected.
- On primary click: briefly show confetti / checkmark (respecting prefers-reduced-motion — static check if reduced) then navigate.

### A11y

- Final primary button announces "Starting your learning journey" via live region on click.

---

## 9. Home Feed

**Route**: `/home`
**Stories**: `ST-03-01-02` (post-onboard landing), plus cross-epic hooks (notifications badge, streak)
**Surface**: `web-student`, mobile
**Entry**: default authenticated route

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│ [ALP]   🔔 3    [avatar]     │  ← Top Nav §3.4 student variant
├──────────────────────────────┤
│  Good evening, Rahul         │  ← greeting; locale-aware
│  🎯 JEE Main · 127 days left │
│                              │
│  ┌────┐  ━━━━━━━━━━━━━━━━    │
│  │ 78 │  Readiness Score     │  ← §3.37 Readiness Ring + label
│  │ %  │  ▲ 3 this week       │
│  └────┘                      │
│                              │
│  🔥 5-day streak             │  ← Streak Counter §3.38
│                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  Continue where you left off │
│                              │
│  ┌────────────────────────┐  │
│  │ Rotational Motion      │  │
│  │ Physics · 60% complete │  │
│  │ ━━━━━━━━━━━━━━━━━      │  │   ← Progress Horizontal §3.12
│  │              [Resume ▸]│  │
│  └────────────────────────┘  │
│                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  Suggested next              │
│                              │
│  ┌────────────────────────┐  │
│  │ Electrostatics         │  │
│  │ Physics · 12 questions │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ Organic Chemistry      │  │
│  │ Chemistry · 18 qs      │  │
│  └────────────────────────┘  │
│                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  Browse all subjects  →      │
│                              │
├──────────────────────────────┤
│  🏠 Home  📚 Catalog  🔍 Srch│  ← Bottom tab bar (mobile only)
│                ⚙ Profile     │
└──────────────────────────────┘
```

### Desktop (`bp-lg`+)

- Top Nav with Search Input §3.30 in the middle cluster, avatar + bell right.
- 12-col grid: readiness + streak in col 1–4; continue + suggested in col 5–12.
- No bottom tab bar.

### Component map

| Element | Control |
|---|---|
| Top Nav | §3.4 Top Navigation Bar (student variant) |
| Notifications bell | Icon button with §3.3 Badge counter |
| Readiness ring | §3.37 Readiness Score Ring (lg) |
| Streak counter | §3.38 Streak Counter |
| Section heading | `sectionHeading` type |
| Resume card | §3.14 Data Card, clickable → `/catalog/topic/{id}` |
| Progress bar | §3.12 Progress Horizontal determinate |
| Suggested cards | §3.14 Data Card |
| Bottom tab bar | Custom — mobile-only; lives in mobile Flutter + web-student < `bp-lg` |

### Data

- `GET /api/v1/home/dashboard` — aggregated endpoint returning `{ readiness, streak, continueItems, suggestedItems }`. (Backend will fan out to Analytics + Catalog.)
- Empty continue / suggested → Empty State §3.15 "Let's get started" with CTA to catalog.

### States

| State | Treatment |
|---|---|
| Loading | Skeleton §3.31 for ring, progress bars, cards |
| Pre-first-quiz (readiness null) | Ring shows "—" in center; caption "Take your first quiz" |
| Offline | Banner §3.25 info "Showing cached data — back online soon" |
| Error | Inline retry card per section; rest of page still renders |

### Interactions

- Bell → /notifications (Sprint 2).
- Avatar → dropdown §3.8 with Profile / Settings / Sign out.
- Resume → straight into topic detail; continue position from analytics.

### A11y

- Greeting set at `<h1>`. Readiness ring has `role="meter"` + explicit `aria-label` of score.
- Bottom tab bar `<nav aria-label="Primary">`; each tab has `aria-current` on active.

---

## 10. Catalog Browse

**Route**: `/catalog` (exams) → `/catalog/exam/:id` (subjects) → `/catalog/subject/:id` (topics)
**Stories**: `ST-04-02-01`, `ST-04-02-02`, `ST-04-02-04` (browse / filter / course+topic detail)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`) — Subject level example

```
┌──────────────────────────────┐
│ ← JEE Main                   │  ← Top Nav back + title
├──────────────────────────────┤
│  Home › JEE Main             │  ← Breadcrumb §3.22 (desktop only)
│                              │
│  Filter: All  My exam  Free  │  ← chip row
│                              │
│  Physics                     │  ← Section heading
│  ┌────────────────────────┐  │
│  │ Mechanics              │  │
│  │ 12 topics · 60% mastery│  │
│  │ ━━━━━━━━━━━━━━━        │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ Thermodynamics         │  │
│  │ 8 topics · 40% mastery │  │
│  │ ━━━━━━━━━            │  │
│  └────────────────────────┘  │
│                              │
│  Chemistry                   │
│  ┌────────────────────────┐  │
│  │ Physical Chem          │  │
│  │ ...                    │  │
│  └────────────────────────┘  │
│  ...                         │
│                              │
│  Mathematics                 │
│  ...                         │
└──────────────────────────────┘
```

### Desktop (`bp-lg`+)

- Breadcrumb visible (§3.22).
- Subject sections render as 2-col grid of topic cards; wider cards include a subtitle and action button.

### Component map

| Element | Control |
|---|---|
| Back icon | §3.2 ghost button with chevron-left `icon.md` |
| Breadcrumb | §3.22 (desktop only) |
| Filter chips | §3.3 Status Badge (neutral tone, clickable to set filter); active chip bg `brand-tint` border `brand-primary` |
| Section heading | `sectionHeading` type |
| Topic card | §3.14 Data Card + §3.12 Progress Horizontal mastery bar |
| Empty | §3.15 "No topics yet for this subject" |

### Data

- `GET /api/v1/catalog/exams/:id/subjects` → list of subjects with topic counts.
- `GET /api/v1/catalog/subjects/:id/topics` → topics + mastery (from Analytics, optional).
- Filters client-side for Sprint 1 (small lists).

### States

- Loading: skeleton card rows.
- Empty: §3.15 Empty State.
- Offline: banner + cached data.

### A11y

- Breadcrumb `<nav aria-label="Breadcrumb">`.
- Each topic card has `aria-label` combining "Topic name, 60% mastery, N questions".

---

## 11. Topic Detail

**Route**: `/catalog/topic/:id`
**Stories**: `ST-04-02-04` (course + topic detail)
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│ ← Mechanics                  │
├──────────────────────────────┤
│  JEE Main › Physics ›        │
│  Mechanics                   │
│                              │
│  Rotational Motion           │
│  Physics · 24 questions      │
│  [Free] [Premium-later]      │   ← chips
│                              │
│  ━━━━━━━━━━━━━━ 60% mastery  │
│                              │
│  ┌────────────────────────┐  │
│  │■ Start practice quiz   │  │   ← disabled in Sprint 1
│  └────────────────────────┘  │    (Quiz ships Sprint 2)
│  ┌────────────────────────┐  │
│  │□  Read lesson notes    │  │
│  └────────────────────────┘  │
│                              │
│  About                       │
│  Rotational motion covers... │
│  (500-ch description)        │
│                              │
│  Prerequisites               │
│  • Newton's laws             │   ← links to other topics
│  • Basic kinematics          │
│                              │
│  Learning objectives         │
│  1. Define moment of inertia │
│  2. Apply conservation...    │
│  3. ...                      │
│                              │
│  Recent activity             │
│  No attempts yet — start     │
│  your first quiz.            │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Back | §3.2 ghost |
| Breadcrumb | §3.22 |
| Title block | `pageTitle` + secondary subtitle |
| Tier chip | §3.3 Status Badge |
| Mastery bar | §3.12 Progress Horizontal + inline % |
| Start practice quiz | §3.2 Button primary (lg). **Sprint 1: disabled** with tooltip §3.17 "Quiz coming in Sprint 2" |
| Read lesson notes | §3.2 Button secondary — Sprint 1 links to a placeholder PDF/HTML page or disabled |
| Prerequisite links | §3.2 link buttons |
| Recent activity | §3.15 Empty State inline if no attempts |

### Data

- `GET /api/v1/catalog/topics/:id` → `{ id, title, subject, exam, description, objectives[], prereqs[], questionCount, tier }`
- `GET /api/v1/analytics/topics/:id/mastery?userId` (Sprint 2).

### States

- Loading: skeleton blocks.
- Premium-gated topic (Sprint 3): CTA swaps to "Unlock Premium" → checkout flow.
- Error: §3.15 error variant with retry.

### A11y

- `<article>` wraps. Learning objectives as `<ol>`.
- Disabled CTA still focusable; tooltip announces via `aria-describedby`.

---

## 12. Search + Results

**Route**: `/search?q=...`
**Stories**: `ST-04-02-03` (keyword search), typeahead + federated results
**Surface**: `web-student`, mobile

### Mobile (`bp-xs`)

```
┌──────────────────────────────┐
│ ┌──────────────────────────┐ │
│ │🔍 Search topics, ...  [×]│ │   ← Search Input §3.30 (focused)
│ └──────────────────────────┘ │
│                              │
│ ─────  suggestions  ────     │
│ 📚 Newton's laws             │   ← typeahead panel (mounts
│ 📚 Organic chemistry         │      while typing)
│ 📚 Coordinate geometry       │
│                              │
│ ─────  recent searches  ──── │
│  Electrostatics              │
│  Thermodynamics              │
│                              │
│ ──── browse by subject ──    │
│  Physics  Chemistry  Maths   │
└──────────────────────────────┘
```

After submit / selection, results page:

```
┌──────────────────────────────┐
│ ┌──────────────────────────┐ │
│ │🔍 newton's laws       [×]│ │
│ └──────────────────────────┘ │
│                              │
│ 18 results · 0.12 s          │   ← meta line
│                              │
│ [Topics] [Lessons] [Ques]    │   ← Tabs §3.6
│                              │
│ Topics (8)                   │
│ ┌────────────────────────┐   │
│ │ Newton's 1st Law       │   │
│ │ Physics · Mechanics    │   │
│ │ Match: 95%             │   │   ← relevance
│ └────────────────────────┘   │
│ ┌────────────────────────┐   │
│ │ Newton's 2nd Law       │   │
│ │ ...                    │   │
│ └────────────────────────┘   │
│ ...                          │
│                              │
│ Load more                    │
└──────────────────────────────┘
```

### Component map

| Element | Control |
|---|---|
| Search Input (standalone) | §3.30, debounce 300 ms |
| Typeahead panel | §3.8 Dropdown panel geometry, mounts below input |
| Recent searches | `body` text; cleared via a small "Clear" link button |
| Tabs | §3.6 (Topics / Lessons / Questions) |
| Result card | §3.14 Data Card, title + path + match % |
| Load more | §3.2 Button secondary; infinite scroll on mobile preferred (intersection observer) |

### Data

- `GET /api/v1/search/typeahead?q=...` → `[{ type, id, title, path }]` (Sprint 1: English only; Hindi Sprint 2).
- `GET /api/v1/search?q=...&type=topic|lesson|question&page=N` → `{ results[], total, tookMs }`.

### States

| State | Treatment |
|---|---|
| Empty query | Show recent + popular (top 5 per category from catalog) |
| Typing | Typeahead panel with spinner in input trailing slot |
| No results | §3.15 "No matches for 'xyz'. Try a different spelling or browse topics." |
| Error | §3.25 Alert warning + fallback recent searches |

### Interactions

- Keyboard: ↓ from input enters typeahead; Enter in input submits query and routes to results.
- `/` focuses input from anywhere on the app.
- Clear `×` clears input + typeahead.

### A11y

- Input `role="searchbox"`; typeahead `role="listbox"`; items `role="option"`.
- Results page meta line in polite live region so SR announces count on every new query.

---

## 13. Cross-cutting overlays (not a standalone screen)

These surface across multiple screens and need a shared spec:

- **Logout confirmation modal** — §3.23 modal (sm 400 px), title "Log out of ALP?", Cancel + Log out buttons. On confirm: `POST /auth/logout` + navigate to `/login`.
- **Session-expired modal** — interrupts whatever screen the user is on; "Your session has expired — log in again to continue." Single primary "Log in" button. Route preserves as `returnTo`.
- **Offline banner** — §3.25 info banner at top under Top Nav; dismissible per session; re-appears when going offline again.
- **Network error toast** — §3.25 (placed floating bottom-left on desktop, top on mobile) for transient failures; auto-dismiss 5 s.

---

## 14. Navigation flow

```
                ┌──────────┐
                │  /login  │◀─────── logout
                └──────────┘
                  │    │   \
                  │    │    \──→ /register
                  │    │          │
                  │    │          ▼
                  │    │       /verify (OTP)
                  │    │          │
                  │    ▼          │
                  │  /forgot → /reset
                  │                │
                  ▼                │
              AUTHENTICATED        │
                  │                │
                  ▼                ▼
        ┌────────────────────────────┐
        │  onboarding_state? ────────│
        │   NEW / EXAM_SELECTED?     │
        │        │                   │
        │        ▼                   │
        │  /onboarding/exam          │
        │       ▼                    │
        │  /onboarding/language      │
        │       ▼                    │
        │  /onboarding/target-date   │
        │       ▼                    │
        │  /onboarding/daily-goal    │
        │       │                    │
        │       ▼                    │
        │   ONBOARDED?               │
        └────────────────────────────┘
                    │
                    ▼
               ┌─────────┐
         ┌────▶│  /home  │◀────┐
         │     └─────────┘     │
         │       │       │     │
         │       ▼       ▼     │
         │  /catalog  /search  │
         │     │         │     │
         │     ▼         │     │
         │ /catalog/topic/:id ─┘
         │
         └── /profile (Sprint 2+)
```

---

## 15. Definition of Done — per screen

A wireframe is "implemented" in Sprint 1 when:

- ☐ Route registered in `web-student` React Router AND mobile Flutter navigator.
- ☐ Components only from `@alp/design-system` (or the explicit exceptions in the screen's component map).
- ☐ All states from §N.States rendered (default / loading / empty / error at minimum).
- ☐ Keyboard + tab order matches the §N.Interactions section.
- ☐ A11y notes implemented; tested with axe-core in Vitest; manual SR pass for login + register + onboarding (highest-leverage screens).
- ☐ Analytics events fired per §16 event catalogue (below).
- ☐ Unit tests for key user paths (happy + one error).
- ☐ Screen caught by Storybook at least one primary state (for web; mobile uses widgetbook).

---

## 16. Event catalogue (Sprint 1 additions)

Screen-owned analytics events to fire via the shared `@alp/api-client` telemetry helper:

| Event | Fired from | Payload |
|---|---|---|
| `auth.login.submitted` | Login (§1) | `{ method: "password" \| "google" \| "apple" }` |
| `auth.login.succeeded` | Login | `{ method, onboardingState }` |
| `auth.login.failed` | Login | `{ method, reason }` |
| `auth.register.submitted` | Register (§2) | `{ method }` |
| `auth.otp.verified` | OTP (§3) | `{ channel }` |
| `onboarding.step.viewed` | §5–§8 | `{ step, stepIndex, examCode? }` |
| `onboarding.completed` | §8 | `{ examCode, language, targetDate?, goalMinutes }` |
| `home.viewed` | Home (§9) | `{ hasReadiness, streakDays }` |
| `catalog.subject.opened` | Catalog (§10) | `{ examId, subjectId }` |
| `catalog.topic.opened` | Topic (§11) | `{ topicId }` |
| `search.query.submitted` | Search (§12) | `{ q, resultCount, tookMs }` |

---

## Open items

| Item | Owner | When |
|---|---|---|
| Designer to translate each §N.Layout to Figma frame | Designer | Sprint 0 Day 6–10 |
| Copy for greeting, empty states, error banners — Hindi translations | PM + Designer | Sprint 1 Day 3 |
| Exam-badge icon set (JEE, NEET, UPSC, CAT at `icon.xl`) | Designer | Sprint 0 Day 8 |
| Mobile bottom-nav sprite icons (home / catalog / search / profile) | Designer | Sprint 0 Day 8 |
| OTP input primitive — decide whether to promote into `@alp/design-system` (if any other flow adopts it) | FE Lead A | Sprint 1 Day 2 |

---

## Next-pass coverage

- **Pass 2** (Sprint 2): quiz start / question / submit / result, readiness detail, notification prefs, `web-portal` content-authoring screens.
- **Pass 3** (Sprint 3): checkout + subscription, streak leaderboard, teacher dashboard, moderator queue, `web-admin` overview + flag-mgmt panel.
