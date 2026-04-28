# AdaptiveLearn — Complete UI Kit
**Version 1.0 · April 2026 · CONFIDENTIAL — Internal Engineering Use Only**

Comprehensive UI design system and screen library for all five portals of the Adaptive Learning Platform. Built from BRD v2.0 · PRD v1.0 · HLD v1.0 · OpenAPI v1.0 · User Stories v2.0.

---

## Portal summary

| # | Portal | Folder | Accent | Screens | Files | Users |
|---|--------|--------|--------|---------|-------|-------|
| 1 | **Student Web** | `01_StudentPortal_Web/` | Blue `#4F87F6` | 16 | 15 | Students |
| 2 | **Mobile App** | `02_MobileApp/` | Blue + AI cyan | 21 | 25 | Students (iOS + Android) |
| 3 | **Admin Portal** | `03_AdminPortal/` | Red `#F43F5E` | 17 | 21 | Platform admins (internal) |
| 4 | **Teacher Portal** | `04_TeacherPortal/` | Green `#10C47A` | 27 | 31 | Teachers · Institution admins |
| 5 | **Content Author** | `05_ContentAuthorPortal/` | Purple `#A78BFA` | 28 | 32 | Experts · Content creators |
| | **Total** | | | **109 screens** | **124 files** | |

---

## Design system architecture

All portals share a single foundation. Each portal extends it with its own accent colour file:

```
00_design-system.css        ← SHARED: tokens, reset, base components (all portals)
00_components.js            ← SHARED: ALP.* component library (all portals)
00_mobile-tokens.css        ← Mobile-specific (02_MobileApp only)
00_admin-tokens.css         ← Admin-specific: red accent, audit log, escalation cards
00_teacher-tokens.css       ← Teacher-specific: green accent, risk cards, heatmap
00_author-tokens.css        ← Author-specific: purple accent, IRT panel, review cards
```

### Design tokens (from 00_design-system.css)
```css
/* Backgrounds */
--bg-base:     #07090F   /* page background */
--bg-surface1: #0C1422   /* sidebar, topbar */
--bg-surface2: #101A30   /* cards */
--bg-surface3: #162038   /* stat tiles, input backgrounds */

/* Text */
--text-primary:   #EEF2FF
--text-secondary: #B8C5E0
--text-muted:     #7A8BAD
--text-faint:     #3E4D6A

/* Brand colours */
--color-ai:     #22D4EE   /* AI features — always uses ◈ symbol */
--color-blue:   #4F87F6   /* student portal primary */
--color-green:  #10C47A   /* teacher portal · success */
--color-amber:  #F5A623   /* warning · pending */
--color-red:    #F43F5E   /* admin portal · error · at-risk */
--color-purple: #A78BFA   /* author portal · premium */

/* Portal accent overrides */
--admin-accent:  #F43F5E  (03_AdminPortal)
--tea:           #10C47A  (04_TeacherPortal)
--au:            #A78BFA  (05_ContentAuthorPortal)
```

---

## AI design language

The `◈` symbol + cyan `#22D4EE` marks every AI-powered feature consistently across all portals:

| Feature | Symbol | Colour |
|---------|--------|--------|
| AI ability estimate (θ) | ◈ | `#22D4EE` |
| Readiness score | ◈ | `#22D4EE` |
| Next-action recommendation | ◈ | `#22D4EE` |
| Mastery decay alert | ◈ | `#22D4EE` |
| AI draft answer (doubts) | ◈ | `#22D4EE` |
| IRT difficulty estimate (b-param) | ◈ | `#22D4EE` |
| Batch insight (teacher) | ◈ | `#22D4EE` |
| Creator content insight | ◈ | `#22D4EE` |

---

## Strength / mastery thresholds (consistent across all portals)

```
STRONG       ≥ 70%   colour: #10C47A (green)
DEVELOPING   40–69%  colour: #4F87F6 (blue)
WEAK          1–39%  colour: #F43F5E (red)
NOT STARTED      0%  colour: #3E4D6A (faint)
```

---

## Portal-by-portal screen index

### 01 — Student Web Portal (16 screens)
```
00_design-system.css · 00_components.js · 00_README.md
01_welcome-register.html        Welcome & Registration
02_screening-test.html          Guest AI Screening Test (3 steps)
03_login-verify-reset.html      Login · Email Verify · Reset · New Password
04_profile-settings.html        Profile & Settings (7 sections)
05_master-dashboard.html        Master Dashboard
06_exam-dashboard.html          NEET Exam Dashboard
07_study-map.html               Study Map with mock test section
08_ai-practice.html             AI Practice — active quiz
09_practice-results.html        AI Practice — results
10_analysis.html                My AI Analysis
11_expert-help.html             Expert Help (doubts)
12_leaderboard.html             Leaderboard
```

### 02 — Mobile App (21 screens)
```
00_design-system.css · 00_mobile-tokens.css · 00_components.js · 00_README.md
01_splash.html                  Splash screen
02_welcome.html                 Welcome
03_onboarding-1-ai-adapts.html  Onboarding — 3PL IRT
04_onboarding-2-readiness.html  Onboarding — Readiness score
05_onboarding-3-guided.html     Onboarding — Guided learning
06_exam-select.html             Exam selection
07_guest-screening.html         Guest test landing
08_live-quiz.html               Interactive AI quiz
09_quiz-results.html            Quiz results + premium tease
10_register.html                Registration
11_email-verify.html            Email OTP verification
12_login.html                   Login
13_otp-login.html               OTP login
14_reset-password.html          Reset password
15_new-password.html            New password
16_home.html                    Home dashboard
17_study-map.html               Study Map
18_ai-practice.html             AI Practice (3 views in 1)
19_analysis.html                My Analysis
20_more-leaderboard-experts.html More · Leaderboard · Expert Help
21_profile-settings.html        Profile & Settings (7 sections)
```

### 03 — Admin Portal (17 screens)
```
00_design-system.css · 00_admin-tokens.css · 00_components.js · 00_README.md
01_dashboard.html               Platform Dashboard (KPIs · revenue · SLOs · escalations)
02_users.html                   User Management (search · suspend · impersonate)
03_escalations.html             Escalations
04_moderation-queue.html        Moderation Queue
05_creator-applications.html    Creator Applications
06_exam-syllabus.html           Exam & Syllabus Config
07_screening-test.html          Screening Test Management
08_institutions.html            All Institutions
09_create-institution.html      Create Institution
10_revenue.html                 Revenue Dashboard
11_subscriptions.html           Subscriptions
12_refunds.html                 Refunds
13_announcements.html           Announcements
14_moderators.html              Moderator Management
15_configuration.html           Platform Configuration
16_audit-log.html               Audit Log (immutable)
17_impersonate.html             Impersonate User (read-only)
```

### 04 — Teacher / Institution Portal (27 screens)
```
00_design-system.css · 00_teacher-tokens.css · 00_components.js · 00_README.md
Auth screens (00_ prefix — all minor screens included):
  00_login · 00_register · 00_otp-verify · 00_reset-password
  00_new-password · 00_profile-settings · 00_role-permissions
Main app (01_–20_ prefix):
  01_dashboard · 02_students-all · 03_student-detail · 04_students-at-risk
  05_leaderboard · 06_assignments · 07_assignment-results · 08_mock-tests
  09_mock-results-detail · 10_doubts · 11_my-questions · 12_question-editor
  13_upload-questions · 14_peer-review · 15_batch-analytics
  16_session-reports · 17_announcements · 18_institution-settings
  19_notifications-inbox · 20_help-support
```

### 05 — Content Author Portal (28 screens)
```
00_design-system.css · 00_author-tokens.css · 00_components.js · 00_README.md
Auth & account (00_ prefix — all minor screens included):
  00_login · 00_register-apply · 00_otp-verify · 00_reset-password
  00_new-password · 00_profile · 00_settings · 00_roles-permissions
  00_notifications
Main app (01_–19_ prefix):
  01_dashboard · 02_my-content · 03_question-editor · 04_question-preview
  05_upload-bulk · 06_upload-jobs · 07_course-builder · 08_course-preview
  09_peer-review-queue · 10_peer-review-item · 11_doubts-queue
  12_doubt-thread · 13_content-analytics · 14_question-analytics
  15_earnings-dashboard · 16_payout-settings · 17_help-support
  18_application-status · 19_appeal-rejection
```

---

## ALP.* Component library (00_components.js)

```javascript
ALP.renderSidebar(activeId)              // Sidebar with active item
ALP.renderTopbar({ title, chips })       // Top navigation bar
ALP.recoCard({ title, meta, impact })    // ◈ AI recommendation card
ALP.kpiTile({ value, label, delta })     // KPI stat tile
ALP.subjectRow({ name, pct, strength }) // Mastery bar row
ALP.insightList([ { color, text } ])     // ◈ AI insight bullets
ALP.readinessRing({ score, size })       // SVG readiness ring
ALP.trajectoryChart({ today, predicted })// SVG score trajectory
ALP.topicCell({ name, pct, strength })  // Topic matrix cell

// Utilities
ALP.strength(pct)   → 'STRONG' | 'DEVELOPING' | 'WEAK' | 'NOT STARTED'
ALP.fmt.score(v)    → formatted readiness score
ALP.fmt.theta(v)    → formatted θ value (e.g. "+0.79")
ALP.fmt.pts(v)      → formatted points delta (e.g. "▲ +3.2")
```

---

## Using this kit

1. **Open any `.html` file** directly in a browser — all screens are self-contained prototypes
2. **Import into Figma** — use browser screenshots or copy CSS tokens into Figma variables
3. **Reference for development** — CSS custom properties map directly to design tokens in code
4. **Swagger UI** — import `openapi.yaml` (separate document) to explore the 86 API endpoints
5. **Extend** — add new screens by copying an existing screen file and modifying content

---

## Related documents (separate files)
- `BRD_v2_Adaptive_Learning_Platform.docx` — Business Requirements
- `HLD_Adaptive_Learning_Platform.docx` — High Level Design & Architecture
- `OpenAPI_Reference_AdaptiveLearningPlatform.docx` — API Reference (86 endpoints)
- `DatabaseSchema_ERD_AdaptiveLearningPlatform.docx` — Data Model
- `GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx` — 31 open gaps

---
*AdaptiveLearn Complete UI Kit · v1.0 · April 2026 · CONFIDENTIAL*
*Based on BRD v2.0 · PRD v1.0 · HLD v1.0 · OpenAPI v1.0 · User Stories v2.0*
