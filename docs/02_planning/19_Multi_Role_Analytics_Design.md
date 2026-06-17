# Multi-Role Statistical Analysis — Design Document

**Status**: Draft — for review
**Owners**: Platform / Analytics WG
**Last updated**: 2026-05-04

---

## 1. Context

The Adaptive Learning Platform serves four distinct audiences — **students**, **teachers**, **institute admins**, and **platform admins** — but the analytics surface area today is heavily biased toward students. An audit (logged in `19A_Multi_Role_Analytics_Audit.md`) shows:

- **Backend**: ~30 analytics endpoints under `services/engagement/src/engagement/analytics/`, mostly student-scoped. Includes mastery, readiness, cohort leaderboard, predictive dropout, error patterns, syllabus coverage, peer percentile, multi-profile (9-dim assessment), transfer-ability score, UX KPIs, topic decay, readiness bands, insights snapshot.
- **Mobile (student)**: surfaces ~40% of available endpoints — readiness, streak, mastery, weekly chart, heatmap. Misses: time analytics, error patterns, concept mastery breakdown, peer percentile, syllabus coverage, multi-profile, revision queue.
- **Web portal (teacher)**: only `CohortLeaderboard.tsx` (S12-B) + `CohortAtRisk.tsx` (S37). No class-progress dashboard, no topic heatmap, no assignment compliance view, no engagement metrics, no trend charts.
- **Web admin (platform)**: 7 operational dashboards (Calibration, Cost, GraderQueue, Translation, Tenants, Rating/Tutor moderation). **No business/outcome analytics, no funnels, no DAU/MAU, no question quality dashboard, no subscription analytics.**
- **Institute admin role**: not formally distinguished; today's PLATFORM_ADMIN sees everything. **Institute-scoped analytics do not exist** because analytics tables (`mastery`, `readiness`, etc.) lack a `tenant_id` column.

This document specifies the target state: a coherent multi-role analytics system that surfaces existing signal, fills the institutional gap, and adds collaboration primitives so insights flow between roles instead of staying siloed per role.

---

## 2. Personas, Needs, and Jobs to be Done

### 2.1 Student

| Job | Question they ask | Today | Target |
|---|---|---|---|
| Self-assess | "How am I doing?" | ✅ Readiness ring, streak, mastery rows | Keep, add interpretation captions |
| Plan ahead | "What should I do next?" | ⚠️ Guided Next Steps surfaced | Add revision queue + decay-driven schedule |
| Compare | "How do I rank?" | ❌ Endpoint exists, mobile doesn't surface | Surface peer-percentile pill on Home + Profile |
| Diagnose | "Where am I weak?" | ⚠️ Mastery rows on Progress | Add error-pattern card, concept breakdown |
| Project | "Will I make it?" | ✅ Rank trajectory (seniors only) | Junior version: "concepts learned" trajectory |
| Schedule | "What do I do today?" | ✅ 7-day Study Plan | Add daily goal vs achieved progression |
| **NEW**: Time | "When am I most productive?" | ❌ Not surfaced | Time-by-topic chart, peak-hours heatmap |
| **NEW**: Goal | "Am I on pace?" | ⚠️ Daily goal exists | Add weekly + monthly progression vs target date |

### 2.2 Teacher (LEAD_TEACHER)

| Job | Question they ask | Today | Target |
|---|---|---|---|
| Triage | "Who's struggling?" | ✅ CohortAtRisk dashboard | Keep, add intervention tracking |
| Recognize | "Who's excelling?" | ✅ CohortLeaderboard | Keep |
| Diagnose class | "Where is my class weak?" | ❌ | **Topic heatmap per cohort** |
| Drill-down | "What's wrong with student X?" | ⚠️ Endpoint exists | Surface in `StudentDeepDive` page |
| **NEW**: Compliance | "Who didn't do the assignment?" | ❌ | Assignment compliance view |
| **NEW**: Engagement | "Who's barely active?" | ❌ | Per-student DAU + login frequency |
| **NEW**: Trend | "Is the class improving?" | ❌ | Cohort readiness over 7/30/90 days |
| **NEW**: Benchmark | "How does my class compare?" | ❌ | Anonymous peer-cohort comparison |
| **NEW**: Effectiveness | "Did my intervention work?" | ❌ | Track flagged students' progress post-flag |
| **NEW**: Notes | "Pass context to next teacher" | ❌ | Per-student private notes (visible to other educators in same cohort) |

### 2.3 Institute Admin (admin_level: INSTITUTION)

| Job | Question they ask | Today | Target |
|---|---|---|---|
| Health check | "How is my institute doing?" | ❌ | **Institute overview dashboard** |
| Compare cohorts | "Class 8A vs 8B?" | ❌ | Cohort comparison grid |
| Subject gaps | "What needs investment?" | ❌ | Subject-area weakness rollup |
| Teacher effectiveness | "Whose class improves?" | ❌ | **With caveats** — net change, attribution-aware |
| Trend | "Year-over-year?" | ❌ | Annual comparison, retention, growth |
| Benchmark | "How do we compare to similar institutes?" | ❌ | Anonymized peer-institute comparison |
| **NEW**: Demographics | "Boys vs girls? Class 8 vs 9?" | ❌ | Demographic breakdowns where reported |
| **NEW**: Marketplace ROI | "Are paid courses helping?" | ❌ | Purchase → outcome correlation |
| **NEW**: Reports | "Monthly snapshot for parents" | ❌ | Auto-generated PDF reports |

### 2.4 Platform Admin

| Job | Question they ask | Today | Target |
|---|---|---|---|
| Operational | "Is calibration drifting?" | ✅ CalibrationDashboard | Keep |
| Cost | "What's the AI spend?" | ✅ CostDashboard | Keep |
| Operational | "How long is grader backlog?" | ✅ GraderQueue | Keep |
| Tenants | "Who are our institutes?" | ✅ Tenants CRUD | Add drill-down to per-tenant analytics |
| **NEW**: Growth | "DAU/MAU? Retention?" | ❌ | Engagement health dashboard |
| **NEW**: Funnel | "Signup → first session → premium?" | ❌ | Funnel dashboard |
| **NEW**: Quality | "Which questions discriminate well?" | ❌ | IRT psychometrics dashboard |
| **NEW**: Outcomes | "Mock score vs real exam?" | ❌ | Outcome correlation (when reported) |
| **NEW**: Distribution | "What does a passing JEE student look like?" | ❌ | Mock score → admit-class distributions |
| **NEW**: Subscriptions | "MRR? Churn?" | ❌ | Business analytics dashboard |
| **NEW**: Marketplace | "Tutor sessions this week?" | ❌ | Marketplace analytics |
| **NEW**: Cost-per-student | "$/DAU?" | ❌ | Unit economics dashboard |

---

## 3. Collaboration Model

The current system isolates data per role. The target adds **information flows** so insight discovered by one role automatically benefits another.

```
Student observation                  Teacher observation                Institute observation
   │                                       │                                  │
   ▼                                       ▼                                  ▼
weak topic ──── flagged ───→ at-risk list ──── escalated ───→ subject-gap report ──── flagged ───→ platform
   ▲                                       │                                  │                       │
   │                                       ▼                                  ▼                       │
   │       Teacher's "REVISE" suggestion   Institute-set goals               Platform-published       │
   │       lands in student's Guided       appear on teacher                 benchmarks (anonymous)   │
   │       Next Steps                      dashboards                        feed into institute      │
   │                                                                         comparison view         │
   └─────────────────────────────── peer-percentile (anonymized cohort) ────────────────────────────┘
```

### 3.1 Concrete data flows

1. **Teacher → Student**: when a teacher flags a topic for "REVISE" or "DIAGNOSE" via the at-risk dashboard, the student's mobile Guided Next Steps card auto-includes that recommendation with a small "from {teacher name}" badge. Reuses [services/engagement/src/engagement/analytics/predictive.py](services/engagement/src/engagement/analytics/predictive.py); add a `manual_intervention` table that the predictive recommender prepends from.

2. **Student → Teacher**: a student's struggle on a topic (mastery drop > 15% in 7d) auto-flags them in the teacher's at-risk view with a reason badge. Already partially supported — extend the at-risk classifier to surface the trigger reason.

3. **Teacher ↔ Teacher** (same cohort): a teacher can attach a private note to a student profile. Other educators in the same cohort see the note. Read-only audit trail. New `educator_notes` table in identity service (since notes are about people, not analytics).

4. **Teacher → Institute**: every teacher's cohort summary auto-feeds into the institute overview. Daily rollup at the institute level via new `institution_aggregates` table.

5. **Institute → Teacher**: institute admin can set a "target readiness" per cohort. Teacher dashboards show "8% behind target" or "On track" pills.

6. **Institute → Student**: institute branding (name, motto, contact) appears on the student's mobile Profile + Home. Tenant-scoped from JWT `tenant_id`.

7. **Platform → Institute**: anonymized national/regional benchmarks (e.g. "median CBSE 8 readiness across all institutes") feed into the institute comparison view. Platform admin publishes via a "publish report" action; institute admin sees opt-in feed.

8. **Cross-cohort**: anonymized peer-cohort comparison ("Class 8A vs Class 8B in the same institute") visible to institute admin only — never to teachers (avoids gaming).

### 3.2 Privacy model

| Role | Sees | Doesn't see |
|---|---|---|
| Student | Own data; anonymized cohort/peer aggregates | Other students' identifiable data; teacher notes |
| Teacher | Students in their assigned cohorts (via `educator_assignments`); cohort aggregates; private notes shared with other educators in same cohort | Students outside assigned cohorts; teacher-effectiveness rankings |
| Institute admin | All cohorts in own tenant; aggregated teacher metrics with attribution caveats; identifiable students | Other institutes' identifiable data |
| Platform admin | Everything; identifiable data gated behind audit log | (no restriction; all access audited) |

### 3.3 Role-effective query cap

To prevent runaway queries, every analytics endpoint enforces:

- **Student**: `user_id` must match JWT `sub`.
- **Teacher**: `user_id` or `cohort_id` must be in the teacher's `educator_assignments` reachable cohorts.
- **Institute admin**: `tenant_id` must match JWT `tenant_id`.
- **Platform admin**: no cap; access is audited via `services/identity/audit_log` already in place.

---

## 4. Data Model Extensions

### 4.1 Required schema changes

The single biggest gap: **analytics tables have no `tenant_id`**. Without it, institute-scoped queries are impossible.

```sql
-- Migration: services/engagement/alembic/analytics/versions/0NN_add_tenant_id.py
ALTER TABLE analytics_schema.mastery ADD COLUMN tenant_id UUID;
ALTER TABLE analytics_schema.readiness ADD COLUMN tenant_id UUID;
ALTER TABLE analytics_schema.processed_sessions ADD COLUMN tenant_id UUID;
ALTER TABLE analytics_schema.session_section_stats ADD COLUMN tenant_id UUID;
-- + all 10 downstream tables

CREATE INDEX idx_mastery_tenant_user ON analytics_schema.mastery (tenant_id, user_id);
CREATE INDEX idx_readiness_tenant_user ON analytics_schema.readiness (tenant_id, user_id);
```

Backfill from `identity.users.tenant_id` via a one-shot migration. Going forward, every consumer of `quiz.session.processed` events writes `tenant_id` from the event payload (NATS event already carries it).

### 4.2 New aggregate tables

```sql
-- Daily rollup per institute, computed nightly
CREATE TABLE analytics_schema.institution_aggregates (
    tenant_id        UUID NOT NULL,
    snapshot_date    DATE NOT NULL,
    exam_id          UUID,                   -- nullable: null row = whole-institute
    cohort_id        UUID,                   -- nullable
    n_students       INTEGER NOT NULL,
    n_active_7d      INTEGER NOT NULL,       -- DAU rollup
    avg_readiness    REAL NOT NULL,
    median_readiness REAL NOT NULL,
    p25_readiness    REAL NOT NULL,
    p75_readiness    REAL NOT NULL,
    n_sessions       INTEGER NOT NULL,
    n_completed      INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, snapshot_date, exam_id, cohort_id)
);

-- Per-teacher rollup
CREATE TABLE analytics_schema.teacher_aggregates (
    educator_id      UUID NOT NULL,
    snapshot_date    DATE NOT NULL,
    cohort_id        UUID NOT NULL,
    n_students       INTEGER NOT NULL,
    avg_readiness    REAL NOT NULL,
    delta_readiness_7d  REAL NOT NULL,        -- net change in last 7 days
    delta_readiness_30d REAL NOT NULL,
    n_at_risk        INTEGER NOT NULL,
    n_top_quartile   INTEGER NOT NULL,
    PRIMARY KEY (educator_id, snapshot_date, cohort_id)
);

-- Funnel events for platform-admin dashboards
CREATE TABLE analytics_schema.platform_funnels (
    user_id          UUID NOT NULL,
    event            TEXT NOT NULL,           -- signup | exam_picked | first_session
                                              -- first_mock | premium_purchased | churned
    occurred_at      TIMESTAMPTZ NOT NULL,
    tenant_id        UUID,
    exam_code        TEXT,
    metadata         JSONB,
    PRIMARY KEY (user_id, event, occurred_at)
);

-- Self-reported real-exam outcomes for outcome correlation
CREATE TABLE analytics_schema.real_exam_outcomes (
    user_id          UUID NOT NULL,
    exam_code        TEXT NOT NULL,
    real_score       REAL,                    -- self-reported
    real_rank        INTEGER,
    admitted_to      TEXT,                    -- self-reported college / cutoff tier
    reported_at      TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, exam_code)
);

-- Cross-role manual interventions (Teacher → Student data flow)
CREATE TABLE analytics_schema.manual_interventions (
    id               UUID PRIMARY KEY,
    student_id       UUID NOT NULL,
    educator_id      UUID NOT NULL,
    cohort_id        UUID NOT NULL,
    topic_id         UUID NOT NULL,
    action           TEXT NOT NULL,           -- REVISE | DIAGNOSE | PRACTICE
    reason           TEXT,
    created_at       TIMESTAMPTZ NOT NULL,
    fulfilled_at     TIMESTAMPTZ              -- when student completed the suggested action
);

-- Educator-to-educator notes (in identity service, not analytics)
CREATE TABLE auth_schema.educator_notes (
    id               UUID PRIMARY KEY,
    student_id       UUID NOT NULL,
    cohort_id        UUID NOT NULL,
    author_id        UUID NOT NULL,
    body             TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL,
    updated_at       TIMESTAMPTZ NOT NULL
);
```

### 4.3 New computed columns / views

- View `mastery_with_subject` — joins `mastery` with `catalog.topics → subjects`. Needed for institute subject-gap rollups without N+1 queries.
- View `cohort_membership_active` — current students in each cohort, minus dropped/inactive members.

---

## 5. API Surface (additions)

All new endpoints live in `services/engagement/src/engagement/analytics/routes.py`, gated by the gateway's role check (existing pattern).

### 5.1 Student (mostly surface existing)

Already exist, just need mobile UI:
- `GET /analytics/insights/{user_id}/snapshot` — composite "My state / What this means / What to do"
- `GET /analytics/concept-mastery/{user_id}` — per-concept EWA list
- `GET /analytics/student/{user_id}/error-patterns` — classification rollup
- `GET /analytics/transfer/{user_id}` — transfer-ability score
- `GET /analytics/topic-decay/{user_id}` — decay severity per concept
- `GET /analytics/syllabus-coverage/{user_id}?examId=...` — per-chapter coverage
- `GET /analytics/peer-percentile/{user_id}?examId=...&topicId=...` — percentile vs peers
- `GET /analytics/revision/{user_id}` — due-today topics

New:
- `GET /analytics/student/{user_id}/time-by-topic` — minutes per topic (needs Sprint-4 backend minute tracking from earlier plan)
- `GET /analytics/student/{user_id}/peak-hours` — heatmap of session start times
- `GET /analytics/student/{user_id}/goal-progression?window=weekly|monthly` — trajectory vs target date

### 5.2 Teacher

```
GET /analytics/teacher/{teacher_id}/dashboard
  — composite: assigned cohorts + at-risk count + topic heatmap top-3

GET /analytics/teacher/{teacher_id}/cohort/{cohort_id}/topic-heatmap
  — per-topic class avg + n_students; sorted weakest first

GET /analytics/teacher/{teacher_id}/cohort/{cohort_id}/assignment-compliance
  — per assignment: completed / partial / not-started counts per student

GET /analytics/teacher/{teacher_id}/cohort/{cohort_id}/engagement
  — per-student DAU + last_active + sessions_30d

GET /analytics/teacher/{teacher_id}/cohort/{cohort_id}/trend?window=7|30|90
  — cohort readiness time series

GET /analytics/teacher/{teacher_id}/cohort/{cohort_id}/peer-benchmark
  — anonymized: "your cohort's avg vs similar cohorts (same exam, same grade)"

GET /analytics/teacher/{teacher_id}/intervention-effectiveness
  — for past flags: did the student improve after the flag?

POST /analytics/manual-interventions
  — flag a student-topic for REVISE/DIAGNOSE; surfaces in their Guided Next Steps

GET /educator/notes/{student_id}
POST /educator/notes
  — private notes shared with co-educators (in identity service)
```

### 5.3 Institute admin

```
GET /analytics/institution/{tenant_id}/overview
  — total students, total teachers, avg readiness, top weak subjects, DAU

GET /analytics/institution/{tenant_id}/cohorts
  — list with summary stats per cohort: avg readiness, delta_7d, n_at_risk

GET /analytics/institution/{tenant_id}/teacher-effectiveness
  — per teacher: avg cohort readiness change, with caveats; sortable

GET /analytics/institution/{tenant_id}/subject-gaps
  — subjects ranked by inverse mastery; with student counts

GET /analytics/institution/{tenant_id}/trend?window=30|90|365
  — institute readiness over time

GET /analytics/institution/{tenant_id}/benchmark
  — anonymized comparison vs similar institutes (same primary exam, similar size band)

GET /analytics/institution/{tenant_id}/marketplace-roi
  — purchases (course + tutor) vs mastery delta of buyers vs non-buyers

GET /analytics/institution/{tenant_id}/demographics
  — breakdown by reported demographics (grade band, sex when reported, age band)

POST /analytics/institution/{tenant_id}/cohorts/{cohort_id}/target
  — set readiness target; teacher dashboards reflect

POST /analytics/institution/{tenant_id}/reports/monthly
  — generate downloadable PDF (async; webhook on done)
```

### 5.4 Platform admin

```
GET /analytics/platform/funnels?event_chain=signup,exam_picked,first_session,premium
  — cohort funnel

GET /analytics/platform/dau-mau?days=30
  — daily / weekly / monthly active users

GET /analytics/platform/retention?cohort_window=signup_week
  — retention curves

GET /analytics/platform/question-quality
  — per question: discrimination, difficulty, IRT fit, exposure, n_responses

GET /analytics/platform/mock-distributions/{exam_code}
  — score distribution for each mock blueprint

GET /analytics/platform/subscription-health
  — MRR, ARR, churn, upgrade-rate, downgrade-rate

GET /analytics/platform/tutor-marketplace
  — sessions completed, avg rating, avg duration, revenue split

GET /analytics/platform/cost-per-student?period=monthly
  — total LLM + infra cost / DAU

GET /analytics/platform/outcome-correlation/{exam_code}
  — students who self-reported real exam scores: mastery vs score regression

POST /analytics/platform/reports/publish
  — publish anonymized aggregate as benchmark feed (consumed by institutes)
```

---

## 6. UI Surfaces

### 6.1 Mobile (student) — extension to existing tabs

Existing 4 sections on Home stay clean (Sprint 3 collapse). Analytics depth lives on the **Exam Dashboard** + the **Progress** tab.

**Exam Dashboard — new "AI insights" cards** (already partially shipped):
- ✅ Photo Doubt CTA, Guided Next Steps, Study Plan, Weakness Diagnosis (Sprint 3)
- ➕ **Concept mastery breakdown** — bar chart per concept (top 8)
- ➕ **Error patterns card** — top 3 error tags from `error-patterns` endpoint
- ➕ **Peer percentile pill** — "You're in the top 28% of UPSC aspirants this week"
- ➕ **Revision queue card** — "3 topics due today"

**Progress tab — new sections**:
- ➕ **Time analytics** — time-by-topic stacked bar + peak-hour heatmap
- ➕ **Goal progression** — weekly trajectory vs target date
- ➕ **Multi-profile radar** — 9-dim assessment radar chart (already in backend)
- ➕ **Insights snapshot** — auto-generated narrative ("My state / What this means / What to do")

### 6.2 Web portal (teacher) — new screens

```
/teacher
├── /dashboard                   ← NEW: overview of all assigned cohorts
├── /cohorts/:id                 ← extend existing CohortLeaderboard
│   ├── /leaderboard             ← (exists)
│   ├── /at-risk                 ← (exists)
│   ├── /topic-heatmap           ← NEW
│   ├── /trend                   ← NEW
│   ├── /engagement              ← NEW
│   ├── /assignments             ← NEW: assignment compliance
│   └── /students/:userId        ← NEW: deep-dive (mirrors existing endpoint)
└── /interventions               ← NEW: log + history of manual flags
```

Routing under existing [apps/web-portal/src/routes.tsx](apps/web-portal/src/routes.tsx) and reuses [apps/web-portal/src/lib/phase5-api.ts](apps/web-portal/src/lib/phase5-api.ts) patterns.

### 6.3 Web admin (institute admin) — new role-scoped views

The web-admin app already has institute-related screens (`Tenants.tsx`, `TenantCohorts.tsx`, `EducatorScope.tsx`). Extend with institute-analytics under a new top-level nav:

```
/admin/institutes/:tenantId
├── /overview                    ← NEW: headline numbers + 4 stat tiles
├── /cohorts                     ← drill-down per cohort
├── /teachers                    ← teacher-effectiveness list (with caveats banner)
├── /subjects                    ← subject-gap heatmap
├── /trend                       ← time series of institute readiness
├── /benchmark                   ← anonymized peer-institute comparison
├── /marketplace                 ← purchases + tutor sessions ROI
└── /reports                     ← printable monthly report generator
```

### 6.4 Web admin (platform admin) — new dashboards

Existing operational dashboards stay. Add a new "Business" section:

```
/admin/platform
├── /funnels                     ← NEW: signup → diagnostic → mock → premium
├── /retention                   ← NEW: cohort retention curves
├── /question-quality            ← NEW: IRT psychometrics + exposure
├── /mock-distributions          ← NEW: per-exam mock score histograms
├── /subscriptions               ← NEW: MRR, churn, LTV
├── /marketplace                 ← NEW: tutor sessions + course purchases
├── /cost-per-student            ← NEW: unit economics
└── /outcomes                    ← NEW: mock vs reported real-exam scores
```

### 6.5 Standardized chart vocabulary

All four roles share a visual language so a teacher's cohort heatmap and an admin's institute heatmap render identically:

| Pattern | Chart type | Used by |
|---|---|---|
| "Where am I weak?" | horizontal bar (mastery sorted) | student, teacher, institute |
| "How am I trending?" | sparkline + delta pill | all four |
| "How do I compare?" | percentile bar with you-marker | student, teacher (cohort vs cohort), institute (vs benchmark) |
| "Class distribution" | histogram with mean/median markers | teacher, institute, admin |
| "Activity heatmap" | calendar-grid heatmap | student (own), teacher (cohort agg), institute (cohort grid) |
| "Funnel" | stepped-bar funnel | admin only |
| "Retention curve" | cohort retention chart | admin |

Reuse existing components where possible:
- [apps/web-portal/src/components/charts/](apps/web-portal/src/components) — extend
- [apps/mobile/lib/screens/progress_tab.dart `_WeeklyBars`](apps/mobile/lib/screens/progress_tab.dart) — generalize to a `_BarChart` widget
- [apps/web-admin/src/components/charts/](apps/web-admin/src/components) — bring in shared chart lib (recommend `recharts` if not already)

---

## 7. Cross-Cutting Concerns

### 7.1 Performance budget

- Every dashboard endpoint must P95 < 500 ms with realistic seed data (10K students, 100 cohorts, 1M sessions).
- Pre-aggregated tables (`institution_aggregates`, `teacher_aggregates`) are computed nightly via a cron worker added to `services/engagement/src/engagement/jobs/`. Worker uses NATS scheduler trigger.
- Real-time queries hit raw `mastery` only when the time-window is "today"; longer windows always read from rolled-up tables.

### 7.2 Caching

- Add Redis cache layer (already deployed for sessions) at the gateway with role-aware key prefix: `analytics:{role}:{user_id}:{endpoint}:{params}`. TTL 60s for dashboards, 5min for nightly rollups.

### 7.3 Auditing

- Every PLATFORM_ADMIN access to identifiable data writes to existing `services/identity/auth_schema/audit_log`. Add an `analytics_access` event type.
- Institute admin access to identifiable cross-cohort data is audited similarly.
- Teacher access stays unaudited (it's their assigned scope).

### 7.4 Privacy & PII

- Student names + emails never appear in cross-institute benchmarks.
- Reported-real-exam scores require explicit student opt-in (added to `/profile/me PUT` schema).
- "Demographic breakdown" only includes grade band; sex / age / income tier are opt-in fields, never pre-checked.
- All exports (PDF reports, CSV downloads) get a watermark header listing the recipient and date.

### 7.5 Internationalization

Reuse the existing `lib/l10n/strings.dart` (en + hi) on mobile. Web apps use the admin-portal i18n harness already in place. New analytics-specific strings added to the catalog before each sprint ships.

### 7.6 Accessibility

Charts must satisfy WCAG AA: colorblind-safe palette (already standardized on amber/blue/red mid-band), screen-reader fallback ("Class average is 64%, distribution skewed toward weak end"), keyboard navigation for all drill-downs.

---

## 8. Out of scope (explicitly)

- **A/B testing infrastructure** — needs separate feature-flag service.
- **Real-time live dashboards** (websocket-streamed) for non-cohort views — leaderboard SSE stays, but other views are pull-based.
- **Custom dashboards** (admin builds their own) — fixed panels in v1; user-customizable layouts are v2.
- **Embedded analytics for parents** — a separate persona, deferred. Parents see their child's mobile profile (read-only) for now.
- **Per-question coaching feedback** authored by teachers — separate authoring epic.

---

## 9. Acceptance criteria (per role)

### Student

- ✅ Can see peer-percentile pill on Home (today: backend yes, mobile no)
- ✅ Can see error-patterns card on Exam Dashboard
- ✅ Can see goal progression (weekly view) on Progress tab
- ✅ Can see "concepts learned" trajectory if junior persona

### Teacher

- ✅ Can land on `/teacher/dashboard` and see all assigned cohorts at a glance
- ✅ Can drill into a cohort and see topic heatmap, trend, engagement, assignment compliance
- ✅ Can flag a student-topic for REVISE; the student sees it in their Guided Next Steps within 5 minutes
- ✅ Can leave a private note on a student profile, visible to co-educators in same cohort

### Institute admin

- ✅ Can land on `/admin/institutes/{tenantId}/overview` and see institute-wide health
- ✅ Can compare cohorts side-by-side
- ✅ Can see teacher-effectiveness ranking with attribution caveats banner
- ✅ Can generate a monthly PDF report for parents/board

### Platform admin

- ✅ Can see DAU/MAU and retention curves
- ✅ Can see signup → premium funnel with drop-off points
- ✅ Can see question-quality (IRT) dashboard, sortable by exposure
- ✅ Can see mock-score distributions per exam and (when reported) outcome correlation

---

## 10. Risks & open questions

| Risk | Mitigation |
|---|---|
| Tenant-id backfill on existing analytics tables takes a long migration window | Run the migration in batches with a feature flag; new writes go to tenant-aware tables in parallel; flip the read switch when backfill completes |
| Teacher-effectiveness dashboard could be misused for performance reviews | Ship with a prominent "Attribution caveats" banner; document that teacher rotation, intake quality, and cohort size confound raw deltas |
| Real-exam outcome data is sparse (most students don't self-report) | Begin collecting via an opt-in modal post-mock; outcome correlation is "best effort", not gospel |
| Aggregated tables go stale if nightly worker fails | Add a freshness widget to every dashboard ("Data as of: 2 hours ago"); page on >24h staleness |
| Cross-role flows (teacher flag → student notification) require NATS messaging discipline | Reuse existing `quiz.session.processed` event pattern; add `educator.intervention.created` topic with the same idempotent processed-events table |

| Open question | Owner | Deadline |
|---|---|---|
| Should teacher-effectiveness be visible to other teachers (peer benchmark) or only to institute admin? | Product | Sprint A4 kickoff |
| What's the minimum cohort size for anonymized peer benchmarks (k-anonymity threshold)? | Privacy | Sprint A5 kickoff |
| Self-reported real-exam scores — do we verify against any external source? | Product | Sprint A8 kickoff |
| Mobile institute-admin app — required, or web-only? | Product | Sprint A6 kickoff |

---

## 11. Implementation plan

See companion document: [`20_Multi_Role_Analytics_Implementation_Plan.md`](./20_Multi_Role_Analytics_Implementation_Plan.md).
