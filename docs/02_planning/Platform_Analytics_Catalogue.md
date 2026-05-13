# Platform Analytics Catalogue

A complete inventory of statistical / analytical surfaces shipped today,
organised by who consumes them, and what each surface enables that
role to do that they could not do otherwise.

All API paths are relative to the engagement service unless prefixed
otherwise. Endpoint citations link to `services/engagement/src/engagement/analytics/routes.py`
unless another file is named.

> **Convention used in this doc.** Each surface block lists:
> _Endpoint / page_ → _what it shows_ → **Why it matters** (the
> decision or action the consumer can now take).

---

## Table of contents

1. [Platform Admin](#1-platform-admin)
2. [Institute / Tenant Owner](#2-institute--tenant-owner)
3. [Teacher / Educator](#3-teacher--educator)
4. [Student](#4-student)
5. [Cross-cutting infrastructure](#5-cross-cutting-infrastructure)

---

## 1. Platform Admin

The admin surface is the operator's instrument panel: revenue, growth,
content-quality, and unit-economics rolled up across every tenant.

### Growth + engagement

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/platform/funnels` | Rolling-window counts at each stage: signup → exam-picked → first session → first mock → premium purchase. | Pinpoints *where* prospects drop out; tells product + marketing whether the leak is at activation, habituation, or monetisation. |
| `GET /analytics/platform/dau-mau` | Daily / weekly / monthly active users + DAU/MAU stickiness ratio. | One number that tracks whether the product is sticky enough to be habit-forming; healthy stickiness ≥ 0.20. |
| `GET /analytics/platform/retention` | Week-over-week cohort retention curves keyed on signup week. | Reveals whether onboarding changes (diagnostic, missions, AI tutor) actually keep students engaged past week 4. |

### Content & question-quality

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/platform/question-quality` | Per-question exposure count + accuracy + IRT psychometric flags. | Identifies broken / mis-keyed items at scale so the content ops team can retire or fix them before they pollute mastery. |
| `GET /analytics/platform/mock-distributions/{exam_code}` | Score histogram across opted-in students for a given mock. | Validates that the difficulty distribution is exam-realistic and that mocks predict actual rank movement. |

### Outcomes & monetisation

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/platform/outcome-correlation/{exam_code}` | Linear regression of self-reported real-exam score vs pre-exam mastery / readiness, with r². | Hard evidence that mastery-on-platform translates to real-exam outcomes — usable in admissions partnerships, sales decks, regulator filings. |
| `GET /analytics/platform/subscription-health` | MRR / ARR / churn rate. | The single dashboard for whether the platform is financially viable. |
| `GET /analytics/platform/tutor-marketplace` | Tutor session counts, average rating, gross revenue per tutor. | Lets the marketplace team identify supply-side anomalies (top tutor churn risk, low-rated tutors). |

### Unit economics & cost discipline

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/platform/cost-per-student` | (LLM + infra) ÷ DAU. | Single number for "is the platform a positive-margin business?" — track weekly to catch AI-cost regressions before they eat the budget. |
| `GET /admin/ai-cost` (`learning/ai_gateway/routes.py`) | Per-touchpoint × provider × creator AI spend over day / week / month, plus 80 % / 95 % budget alerts. | Stops a runaway prompt template from draining the AI budget; gives finance per-tenant cost attribution. |
| `POST /admin/ai-audit-log/purge` | Retention sweep on `ai_generation_jobs` rows older than N days. | Compliance + storage cost control on the 90-day audit retention window. |

### Operator tooling

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/ux-kpis` | Pre-aggregated daily UX KPIs (page visits, button clicks, conversions). | Closes the loop on product experiments without spinning up GA/Amplitude. |
| Admin UI: `apps/web-admin/src/pages/CostDashboard.tsx`, `CulturalReview.tsx`, `GraderQueueAdmin.tsx`, `CalibrationDashboard.tsx` | Visual dashboards for cost, AI cultural-localisation review, subjective-grader QA, IRT calibration drift. | Day-to-day operator workflow without writing SQL. |

**Net benefit for admin:** every decision an operator typically makes
blind — pricing, content investment, AI-provider switching,
intervention staffing — has a quantitative answer on the dashboard.

---

## 2. Institute / Tenant Owner

Institutes are the B2B revenue layer: coaching centres, schools, online
academies. They pay because the platform shows them **whether their
students are learning, which teachers are effective, and how their
institute compares to peers**.

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/institution/{tenant_id}/overview` | Headline KPIs: total students, 7-day actives, average + median readiness. | Single screen for the institute owner's daily standup: are we growing and are our students on track? |
| `GET /analytics/institution/{tenant_id}/cohorts` | Per-cohort summary (avg readiness, active students, 7-day delta). | Spot which batches are healthy and which are coasting; reallocate teaching attention by batch. |
| `GET /analytics/institution/{tenant_id}/teacher-effectiveness` | Teachers ranked by average `Δ readiness` they produce in their cohorts over 7 / 30 days. | Objective performance review input; finds star teachers and underperformers without subjective bias. |
| `GET /analytics/institution/{tenant_id}/subject-gaps` | Subject-area weakness ordered by average mastery — institute-wide. | Tells the academic head where to commission extra content, schedule remedial sessions, or rotate stronger instructors. |
| `GET /analytics/institution/{tenant_id}/trend` | Daily institute-wide readiness time series (90-day default window). | Proves to internal stakeholders that the institute is improving year-on-year; surfaces seasonality (post-Diwali slumps, etc). |
| `GET /analytics/institution/{tenant_id}/benchmark` | Anonymised peer comparison vs other institutes on the same exam (k-anonymity floor = 5). | Competitive positioning: "are we above or below median for JEE Main coaching centres of our size?" |
| `GET /analytics/institution/{tenant_id}/marketplace-roi` | Courses / tutors purchased by institute students vs the mastery uplift they delivered. | Whether external paid content is worth budgeting next term. |
| `GET /analytics/institution/{tenant_id}/outcomes-report` | Printable institute outcomes PDF/HTML report. | Marketing collateral, board-deck slide, parent newsletter. |

**Net benefit for institutes:** institutional retention. Owners renew
because they can answer parents' and board members' questions with hard
data, not anecdotes.

**Backing store:** `analytics_schema.institution_aggregates`,
`analytics_schema.teacher_aggregates` (populated by the nightly
`jobs/aggregate_rollups.py` job).

---

## 3. Teacher / Educator

Teachers are the daily decision-makers: who to call on, who to
intervene with, which topic to re-teach tomorrow.

### Cohort health at a glance

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/teacher/{teacher_id}/dashboard` | One screen: students, average readiness, 7-day / 30-day delta, at-risk count, top-quartile count. | Replaces the "gut feel" Monday-morning planning meeting with numbers. |
| `GET /analytics/cohorts/{cohort_id}/leaderboard` | Class leaderboard ranked by readiness. | Healthy competition; the page is the most-loved single screen for many teachers. |
| `GET /analytics/cohorts/{cohort_id}/leaderboard/stream` (SSE) | Real-time leaderboard during a mock — pushes updates as students submit. | Lets a teacher project the leaderboard during a mock test for live drama. |
| `GET /analytics/cohorts/{cohort_id}/summary` | Headline counts (active, at-risk). | Skim view before class. |
| `GET /analytics/cohorts/{cohort_id}/trend` | Daily activity time series for the cohort. | Catches a class disengaging during exam-stress weeks. |
| `GET /analytics/cohorts/{cohort_id}/engagement` | Per-student last-active + 30-day session count. | Identifies the quiet student who's been missing for 9 days before they fall off the cliff. |

### Diagnostic drill-down

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/cohorts/{cohort_id}/topic-heatmap` | Per-topic class-average mastery, weakest first. | Decides tomorrow's lesson plan in 30 seconds — re-teach the red cells. |
| `GET /analytics/cohorts/{cohort_id}/common-mistakes` | Error-pattern rollup across the cohort with topic titles. | Reveals shared misconceptions (e.g., everyone confuses Faraday's law direction) — high-leverage teaching moments. |
| `GET /analytics/cohorts/{cohort_id}/students/{user_id}` | Per-student deep dive: readiness, per-topic mastery, streak, recent sessions. | The "parent-teacher meeting" answer in one page. |
| `GET /analytics/cohorts/{cohort_id}/assignment-compliance` | Per-assignment completion summary. | Find students who never opened the homework. |

### Predictive + intervention

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/predictive/cohorts/{cohort_id}/at-risk` | High-risk students + risk band (HIGH / MEDIUM / LOW) + suggested intervention kind. | Stops dropout *before* it happens — call the at-risk students this week, not next term. |
| `POST /analytics/manual-interventions` | Teacher flags a (student, topic, action). | The flag is prepended to the student's "Guided Next Steps" so the teacher's nudge appears inside the student's daily plan. |
| `GET /analytics/manual-interventions/{student_id}/open` | Unfulfilled teacher flags per student. | Audit trail — did the student actually do what I asked? |

**Net benefit for teachers:** every decision a teacher would otherwise
make by intuition (who to call on, who to call, what to re-teach) is
data-backed. The work moves from grading-paper administrative tasks to
high-leverage personalised intervention.

---

## 4. Student

Students get the richest analytics surface — because their primary job
is **self-directed learning**, and they need feedback signals that
adults in a classroom would normally provide.

### Knowing where I stand

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/mastery/{user_id}` | Per-topic EWA mastery + attempt count. | The student's "skill tree" — what they know and what they don't, expressed as a 0–1 number that updates after every attempt. |
| `GET /analytics/concept-mastery/{user_id}` | Per-concept (finer than topic) EWA mastery, weakest first. | Reveals the actual sub-skill being failed (e.g., "dimensional analysis" rather than just "Mechanics"). |
| `GET /analytics/student/{user_id}/multi-profile` | 9-dimensional profile: concept-mastery × Bloom level × fluency × calibration (Brier score). | Acknowledges that "knowing" is multi-dimensional — fast & accurate, slow & accurate, and overconfident are all distinct states with different remedial paths. |
| `GET /analytics/readiness/{user_id}` and `/readiness-band/{user_id}` | Overall readiness band (READY / NEARLY / WORKING / EARLY) + score + suggested actions. | Single number the student watches climb — the platform's North Star metric, designed for emotional resonance. |
| `GET /analytics/syllabus-coverage/{user_id}` | Per-chapter coverage vs the exam syllabus. | "Have I touched every chapter yet?" — psychological closure for completionists. |

### Knowing where I'm slipping

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/topic-decay/{user_id}` | Per-concept decay severity + days since last attempt. | Forgetting curve made visible — surfaces the topic the student aced in March but will fail in October. |
| `GET /analytics/revision/{user_id}` | SM-2 revision queue: top-N topics due today, most-overdue first. | Spaced repetition done right: tells the student exactly *which* topics to drill *today*, not in vague generalities. |
| `GET /analytics/student/{user_id}/error-patterns` | Per-classification error rollup with topic titles ("careless arithmetic in Calculus", "sign-convention in Optics"). | Names the pattern the student keeps repeating, so they can fix the *behaviour* not just the *topic*. |
| `GET /analytics/confidence-gap/{user_id}` | Brier-score-based confidence calibration report. | Treats over-/under-confidence as a fixable skill — students learn to predict their own correctness, which is a strong meta-cognitive signal. |
| `GET /analytics/topic-decay/{user_id}` paired with the **decay refresh** AI-suggested test | Predicted forgetting trigger → one-tap drill. | Closes the loop between "you're forgetting X" and "here's a 20-question test to fix it." |

### Knowing where I rank

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/peer-percentile/{user_id}` | Per-topic percentile vs cohort peers (hidden when cohort < 30 to avoid identifying individuals). | Healthy competitive context — am I ahead or behind for my batch? |
| `GET /analytics/mock/{exam_code}/national-rank/{user_id}` | Rank + percentile across all platform users on this exam. | The number that matters for actual exam outcomes — predicts admission probability. |
| `GET /analytics/mock/{exam_code}/trajectory/{user_id}` | Rank trajectory across the student's mock attempts. | Shows the slope of improvement — emotional rocket-fuel when it's positive, an early warning when flat. |
| `GET /analytics/time-to-mastery/{user_id}/{topic_id}` | Estimated days to reach a target EWA at current pace. | Concrete forecast: "if you keep going at this pace, you'll master Mechanics in 11 days." |
| `GET /analytics/career-outcomes` | Admission likelihood given readiness band + exam. | The most motivating projection of all: "your current readiness puts you at the 78th percentile for IIT-B admissions." |

### Knowing how today went

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/daily-activity/{user_id}` | Per-day study activity (sessions, questions, minutes) trailing 30 days. | Build the habit; the activity heatmap is one of the most-checked surfaces in the app. |
| `GET /analytics/streak/{user_id}` | Current + longest streak in consecutive UTC days. | Habit-loop reward. |
| `GET /analytics/student/{user_id}/time-stats` | Per-section time + accuracy aggregates. | "I'm fast and wrong in section A, slow and right in section B" — actionable test-strategy insight. |
| `GET /analytics/insights/{user_id}/snapshot` | Batched insights hub: state + meaning + recommended action, in one call. | The Home Page's `MissionCard` — answers "what should I do *right now*?" in three lines. |
| `GET /analytics/student/{user_id}/time-stats` (per-question time) | Where the student is bleeding time on practice + mocks. | Pace coaching — exam scores are won and lost on time management. |

### Self-reported outcomes & continuous improvement

| Surface | What it shows | Why it matters |
|---|---|---|
| `PUT/GET/DELETE /analytics/real-exam-outcomes/{user_id}` | Self-reported real-exam score, rank, admission outcome. | Closes the outer loop: when the student updates their actual JEE Main rank, the platform learns whether its readiness predictions were accurate (drives platform-level recalibration). |

### Gamification + social (motivation layer)

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /gamification/users/{user_id}/xp` | Current XP + current league + recent gains. | Habit reinforcement — every meaningful action earns XP. |
| `GET /gamification/leagues/{league_id}` | League standings (10–30 peers competing weekly). | Bronze → Silver → Gold ladder — a 7-day mini-season keeps engagement up. |
| `GET /social/friends`, `/social/friends/pending` | Friend list + pending requests. | Social pressure as a positive force — easier to study daily when friends are doing it too. |
| `GET /social/clans`, `/social/clans/{id}` | Study groups of up to 30 members. | Belonging — clans compete in clan-vs-clan battles, which is one of the strongest weekly engagement levers. |
| `GET /social/leaderboards/{leaderboard_id}` | Global XP, weekly wins, per-exam ELO, clan leaderboard. | Aspiration — the visible top of the ladder pulls everyone else up. |
| Battle service: `GET /v1/elo`, `/v1/users/{id}/history` | Glicko-2 rating per exam + last 25 matches. | Performance-under-pressure feedback that mock tests alone can't provide. |

### 6-level hierarchical drill

| Surface | What it shows | Why it matters |
|---|---|---|
| `GET /analytics/drill/tenants → /exams → /subjects → /topics → /concepts → /students` | Drill from platform level all the way down to a single student's concept performance, in any direction. | Powers the explorable, interconnected analytics surfaces that admins, institutes, and curious students alike use. |

**Net benefit for students:** the platform becomes a *coach*, not a
quiz app. Every analytics surface answers a question a good private
tutor would answer if they had unlimited time per student: where am I
weak, where am I slipping, how close am I to ready, who's ahead of me,
and what should I do next.

---

## 5. Cross-cutting infrastructure

### Data sources

The analytics surfaces are powered by:

- **Raw fact tables** — `analytics_schema.mastery`, `concept_mastery`,
  `bloom_mastery`, `daily_activity`, `streaks`, `session_section_stats`,
  `session_item_outcomes`, `error_classifications`, `ux_events`,
  `real_exam_outcomes`.
- **Predictive caches** — `predictive_dropout_cache` (recomputed via
  `POST /analytics/predictive/recompute/{user_id}`).
- **Rolled-up aggregates** — `institution_aggregates`,
  `teacher_aggregates`, `platform_funnels`. Populated nightly by
  `services/engagement/.../jobs/aggregate_rollups.py`.
- **Leaderboards** — `social_schema.leaderboards`, repopulated every
  15 minutes by `services/engagement/.../jobs/leaderboards.py`.
- **AI cost telemetry** — `content_schema.ai_call_logs`, surfaced via
  the in-process `CostTracker` singleton in
  `services/learning/.../ai_gateway/cost_dashboard.py`.

### Event pipeline

Quiz completions, mock submissions, AI calls, and battles emit NATS
JetStream events on `QUIZ_EVENTS`, `CONTENT_EVENTS`, `MISSION_EVENTS`.
Engagement's analytics module subscribes via the durable consumer
`analytics-quiz-completed`. This means every analytics row is a
**deterministic function** of the event stream — recomputable from
scratch by replaying the JetStream cursor.

### Privacy & k-anonymity

- Peer-comparison endpoints (`/peer-percentile`, `/institution/.../benchmark`)
  enforce a minimum cohort size (default k = 30 for students, k = 5
  for institutes). Below that floor the response is suppressed rather
  than returning identifying data.
- AI-cost / cost-per-student surfaces are tenant-scoped — a tenant
  admin cannot see another tenant's costs.
- Self-reported real-exam outcomes are explicitly opt-in and the
  endpoint supports `DELETE` for the right-to-be-forgotten path.

### Performance

- Hot reads (mastery, streak, readiness) hit Redis-backed materialised
  state — sub-50ms p95.
- Cohort-leaderboard streams use SSE with backpressure (one push per
  quiz-completed event, debounced to ≤ 1 update / sec per leaderboard).
- Heavy rollups (institution_aggregates) are pre-computed nightly so
  the institution dashboard renders in < 200 ms regardless of student
  count.

---

## Closing summary

Every role on the platform has a coherent, complete analytical
surface designed around the decisions that role actually needs to
make:

| Role | Headline decision the analytics enables |
|---|---|
| Admin | "Is the business healthy, and where do we invest next quarter?" |
| Institute | "Are my students learning, and which teachers + courses produced the lift?" |
| Teacher | "Who needs help this week, and what should we re-teach tomorrow?" |
| Student | "Where am I weak, where am I slipping, and what should I do *right now*?" |

The data flows from the same event stream, the same fact tables, and
the same predictive models — what differs is the slicing, the
aggregation, and the framing for each consumer. That coherence is the
reason answers given to the institute owner match the answers given to
the student looking at their own dashboard.

---

## 6. Gap analysis — what's still missing

The current catalogue answers the *what / where / when* questions but
has documented blind spots in five areas. Each gap is paired with a
proposed surface and the cost of leaving it unbuilt.

### 6.1 Admin gaps

| Missing surface | Why it matters | Proposed shape |
|---|---|---|
| **Experiment / A-B test results** | Today there's no system-of-record for "did the Phase-6 mission-card lift D1 retention by X%?". Every product decision is being made off anecdote. | `GET /admin/experiments` — exposure × variant × primary metric uplift with 95% CI; experiment registry in `analytics_schema.experiments`. |
| **AI quality scorecard** | Cost is tracked; quality isn't. A prompt template can be cheap *and* bad. | Per-template rolling rubric score (provider-graded + student-rated thumbs), surfaced alongside cost in `/admin/ai-cost`. |
| **Latency / error SLO** | Operators have no in-app view of p50/p95/p99 latency or 5xx rate per endpoint. They learn from Slack alerts instead. | `/admin/slo` — service-by-service SLI compliance vs published SLOs. |
| **Search analytics** | We don't know what students search for and *fail to find* (a strong signal for missing content). | `/admin/search/failed-queries` — top-200 zero-result queries over 7 days. |
| **Notification effectiveness** | Push and email are sent; nobody knows the funnel. | Open-rate × click-rate × conversion-to-session, per template, per channel. |
| **Geographic + device breakdown** | "Where do we have product-market fit?" is currently unanswerable. | `/admin/geo` — state-level student count × readiness × revenue; device mix (Android / iOS / web). |
| **Refund / chargeback analytics** | Finance reports off Stripe directly — there's no correlation to product behaviour. | Refund rate by SKU × week, with the *reason taxonomy* feeding the product backlog. |
| **Content velocity** | We track AI cost but not how many publishable items per dollar / per author. | Per-author authored / approved / published counts, with median time-to-publish. |

### 6.2 Institute gaps

| Missing surface | Why it matters | Proposed shape |
|---|---|---|
| **Attendance ↔ platform-usage correlation** | The biggest predictor of dropout is attendance. We can't show that the absent student is also the disengaged student. | Pull tenant SIS attendance via webhook, overlay on `daily_activity` per student. |
| **Cohort completion forecast** | Owners ask "will Batch A finish syllabus by exam date?" — no answer today. | Linear extrapolation of coverage trajectory + remaining-days, surfaced as a gauge. |
| **Parent dashboard / communication log** | Parents are the actual decision-makers for B2B retention; there's no surface for them. | Read-only parent role with weekly digest email — "your child practised 4 / 7 days, mastery up 6%, weakest topic = …". |
| **Fee + financial KPI tie-in** | Institute owners track money on Excel; mastery on platform. Bridging the two is missing. | Optional adapter for cohort × fee-collected × dropout-risk. |
| **Teacher utilisation** | We rank teacher effectiveness; we don't show teacher load (sessions / week, hours / cohort). | `/analytics/institution/{id}/teacher-load` — heatmap of teacher × day-of-week. |
| **Cross-institute talent discovery** | Marketplace-level: institutes could surface their top quartile to recruiters / partner colleges. Opt-in. | Anonymised top-N per institute on national leaderboard. |

### 6.3 Teacher gaps

| Missing surface | Why it matters | Proposed shape |
|---|---|---|
| **Teacher self-analytics** | Teachers see student data but never their own performance over time. No personal feedback loop. | `/analytics/teacher/{id}/self` — sessions taught, mean Δ-readiness per session, student NPS, doubt-resolution TTR. |
| **Cohort-vs-cohort comparison** | Teachers can't ask "is Batch B underperforming Batch A by the same Saturday last year?" | Side-by-side comparator with a date-range picker. |
| **Doubt resolution metrics** | Teachers answer doubts but never see their median TTR vs the team. | Per-teacher doubt queue + median time-to-resolve + student satisfaction. |
| **Question-authoring contribution** | Teachers who author questions get no recognition signal. | Authored / approved / published / used-in-mock counts on their own dashboard. |
| **Class participation by topic** | Who raised their hand in the live discussion of Calculus on Tuesday? Not tracked. | Optional in-class reaction-buttons → engagement heatmap. |
| **Personalised curriculum recommendation** | Cohort weakness is shown, but the *next lesson plan* isn't auto-suggested. | "Tomorrow you should re-teach X" panel — derived from `cohort/topic-heatmap` × time-since-last-taught. |

### 6.4 Student gaps

| Missing surface | Why it matters | Proposed shape |
|---|---|---|
| **Self-vs-past-self** | Peer comparison exists; reflective comparison doesn't. Students need to see *their own* progress. | Sparkline of "mastery vs you 4 weeks ago" on every concept tile. |
| **Best-time-to-study analysis** | Habit science says students perform better at certain hours. We have the data; we don't surface it. | "You're 18% more accurate between 6–8 AM" recommendation, derived from per-question time + correctness aggregated by hour. |
| **Goal + milestone tracking** | Students set a target rank / college; the platform doesn't track progress against it. | Editable goal (e.g., "top 5000 in JEE Main") + projection band updated weekly. |
| **Study-session quality** | Active minutes ≠ focused minutes. Today we count both the same. | Heuristic focus score (response-time variance, idle gaps, multi-tab) → "your most focused session this week was 47 min on Tuesday." |
| **Notes / flashcards effectiveness** | We have a notes module; we don't show whether reviewing notes correlates with score lift. | Per-note review-frequency × subsequent attempts × accuracy. |
| **Recommended-vs-actual study mix** | The mission system recommends; the student does what they want. We never close the loop. | Stacked bar: planned-minutes vs actual-minutes, per concept. |
| **Pace vs syllabus deadline** | "Will I finish my syllabus by exam date?" — student version of the cohort forecast. | Personal completion gauge with red/amber/green band. |
| **Question-speed curve** | The mock surface gives you speed; the practice surface doesn't. Improvement over time on speed is invisible. | 30-day moving median of seconds-per-question per type, plotted as a line. |
| **Subjective-attempt quality trend** | Essays and case studies are graded but the rubric scores don't roll up. | Bloom-level radar chart of rubric scores. |
| **Career outcome projection per college** | We show admission likelihood for an exam; not per college choice. | Picker with target college list → projected admission probabilities × current readiness. |

### 6.5 Cross-role / platform-foundation gaps

| Missing surface | Why it matters | Proposed shape |
|---|---|---|
| **Data-quality dashboard** | Analytics is only as good as the events. There's no surface that flags broken event streams (e.g., quiz.session.completed lag > 5 min). | `/admin/data-quality` — per-stream lag, drop rate, schema violations. |
| **Privacy / consent surfaces** | k-anonymity is enforced at read time, but there's no UI for a student to see *what's being tracked*. | `/profile/privacy` — read-only ledger of "we collect X, infer Y, share Z". |
| **Comparative time-series joins** | Most surfaces show one metric at a time. Correlation views (mastery vs streak, missions-completed vs readiness) are absent. | Generic "compare two metrics" view with synced cursors. |
| **Cohort discovery** | Admins can find institutes, but not "show me cohorts whose readiness regressed > 5% last week". | Saved-filter cohort browser. |
| **Public outcome wall** | Real-exam outcomes are collected privately. With opt-in, a public wall would be the single most-effective sales asset. | Public + signed-consent leaderboard of top admissions. |

---

## 7. Presentation grammar

Numbers without a presentation rubric become spreadsheet noise. Every
analytic surface should commit to **one** primary visual, paired with
the secondary affordances called out below. This section is the
contract.

### 7.1 The five legitimate chart families

| Family | When to use | Examples in our catalogue |
|---|---|---|
| **Line / sparkline** | Anything with a time dimension where direction matters more than absolute level. | Daily-activity, readiness trend, cohort-vs-cohort, rank trajectory. |
| **Bar / stacked bar** | Comparing discrete buckets at one moment. | Mock-distribution histogram, error-pattern breakdown, planned-vs-actual minutes. |
| **Heatmap** | Two categorical axes × one quantitative value where pattern-finding is the goal. | Topic-mastery × cohort, time-of-day × accuracy, syllabus-coverage matrix. |
| **Gauge / progress bar** | A single bounded metric against a target. | Readiness band, syllabus coverage %, monthly-budget burn. |
| **Funnel / waterfall** | Sequential drop-off. | Signup funnel, mock attempt funnel, doubt-resolution lifecycle. |

Outside this list (radar, sankey, donut, treemap) is reserved for
**at most one** surface per page — they're attention-grabs, not
defaults. Pie / donut charts are banned outside the 2-slice case
("answered / unanswered").

### 7.2 The anatomy of one analytics tile

Every analytics surface — whether it's the institute overview gauge or
the student's daily-activity heatmap — follows the same composition:

```
┌─────────────────────────────────────────────────────────┐
│ Label · context chip               ⓘ tooltip   ⤓ export │  ← header strip
├─────────────────────────────────────────────────────────┤
│                                                         │
│              [ Primary visual goes here ]               │  ← chart canvas
│                                                         │
├─────────────────────────────────────────────────────────┤
│ ▲ +12% vs last 7d     · benchmark: cohort median 0.62   │  ← delta + baseline
├─────────────────────────────────────────────────────────┤
│ Action verb →                                           │  ← single CTA
└─────────────────────────────────────────────────────────┘
```

- **Header strip.** Short label, one *context chip* (the time window or
  scope — `last 30 d`, `your cohort`, `this institute`). The tooltip
  must answer "what's the definition?" in ≤ 200 chars.
- **Chart canvas.** One chart, one family. No double-axis.
- **Delta + baseline.** Every tile shows *change vs last comparable
  period* + *one external baseline*. A 0.72 mastery means nothing
  unless paired with "+12% vs last week" and "cohort median = 0.62".
  Without both, the number is decoration.
- **CTA.** Exactly one action verb the consumer can take from this
  tile — `Drill in`, `Revise now`, `Flag for intervention`, `Export`.
  No bare data tiles.

### 7.3 Colour & semantics

The platform's design-system tokens already define the palette; the
analytics layer must use them by **semantic role**, not by hex.

| Token | Reserved meaning |
|---|---|
| `--color-success` (green) | Mastery ≥ 0.75, on-pace, attendance ≥ 90%, "good". |
| `--color-amber` | Mastery 0.5–0.75, marginal, "watch". |
| `--color-danger` (red) | Mastery < 0.5, regression, at-risk, "intervene". |
| `--color-blue` | Neutral data, "you", current selection. |
| `--color-text-muted` | Comparison / baseline series. Never the primary line. |

Heatmaps use a **single-hue gradient** of one of the above (typically
red → amber → green for mastery; blue scale for engagement). Diverging
palettes (red↔blue) are reserved for *change* views, not absolute
levels.

### 7.4 Empty / loading / error states

Every tile must specify all four states explicitly. A tile that hides
itself when empty is a bug.

| State | What the tile shows |
|---|---|
| **Loading** | Skeleton of the chart with the header strip already populated. Never a blank. |
| **Empty (cold-start)** | Friendly copy + the one action that would generate data. *"You haven't taken a mock yet — start one to see your trajectory."* |
| **Empty (privacy / k-anonymity floor)** | Explicit "Comparison hidden — your cohort has fewer than 30 students" with the policy link, not a silent blank. |
| **Error** | Inline retry button, error code visible to support agents. Never a red toast that disappears. |

### 7.5 Time-window picker contract

Anything with a time dimension exposes a single picker with these
exact options: `7d · 30d · 90d · custom`. Days are UTC unless the
caller is logged in and we know their timezone — then local. Default:

- Student surfaces → `30d`
- Teacher surfaces → `7d`
- Institute surfaces → `30d`
- Admin surfaces → `90d`

The picker is sticky per user across sessions (one `localStorage` key
per surface family).

### 7.6 Density rules

| Consumer | Tiles per screen above fold | Max metrics per tile |
|---|---|---|
| Student (mobile-first) | 2 | 1 primary + 1 delta |
| Teacher (desktop) | 4 | 2 (primary + 1 secondary) |
| Institute (desktop) | 6 | 3 |
| Admin (desktop) | 8 | 3 |

A student's home screen should never become a stockbroker terminal.
A platform admin's screen should never become a flashcard.

### 7.7 Interaction grammar

| Action | Universal binding |
|---|---|
| Hover / focus a chart point | Crosshair + tooltip with exact value + delta. |
| Click a chart point | Drill to the next-level surface (concept → questions, cohort → student). |
| Click a tile header | Open full-page version of the same chart. |
| Two-finger swipe / arrow keys on time series | Pan the window without changing range. |
| `Cmd / Ctrl + click` on legend item | Solo that series. |
| Long-press on mobile | Surface tooltip; secondary tap → drill. |

These are page-agnostic — they work the same on the student insights
hub, the teacher cohort drill, and the admin growth funnel.

### 7.8 Per-role presentation map

For each role, the presentation rules collapse to a single visual
metaphor that dominates the experience:

| Role | Dominant metaphor | Why |
|---|---|---|
| **Student** | **The dashboard of a private coach** — one big number (readiness), a row of sparklines (mastery), and a single recommended action at the bottom. Mobile-first, single-column. | Students need *encouragement* + *next step*. Density kills motivation. |
| **Teacher** | **The mission-control console** — a 2×N grid of cohort tiles + a persistent right-side "at-risk" panel. Desktop-first. | Teachers triage 30–80 students simultaneously; the layout is built around scanning. |
| **Institute owner** | **The boardroom slide** — large KPI tiles, peer benchmark callouts, printable. Desktop / tablet. | The institute owner shows this to the board, parents, prospective clients; the surfaces must double as collateral. |
| **Admin** | **The flight-deck** — high-density grid, every metric paired with its SLO, alerts inline, no decoration. Desktop only. | Operators need to find anomalies in seconds, not enjoy a layout. |

### 7.9 Mobile vs desktop

- Student surfaces: **mobile is the design target**. Desktop is a
  scaled-up mobile, not a redesign. Charts stack vertically; the
  primary visual takes the full viewport width.
- Teacher / institute / admin: **desktop is the design target**. A
  mobile version exists for the "I'm on the train, did anyone drop
  below 0.4 readiness today?" use case, surfacing only the top-3
  most-urgent tiles.

### 7.10 Performance contract

| Surface class | First meaningful paint |
|---|---|
| Student headline tiles (readiness, mastery, streak) | < 200 ms p95 |
| Cohort leaderboard | < 400 ms p95 |
| Institute aggregates page | < 600 ms p95 |
| Admin global dashboard | < 1.2 s p95 |

If a tile can't meet its budget, it must render the skeleton + a "this
takes a moment" hint within 100 ms so the user isn't staring at a
blank rectangle.

---

## 8. What "shipped" looks like for an analytics surface

Before any new analytic ships, the following five-item checklist must
be green. Anything else is a half-built feature:

1. **Endpoint** — typed, paginated, k-anonymity-aware where peers are
   involved.
2. **Visual** — one of the five chart families, in the approved palette.
3. **Delta + baseline** — every reported number has a comparison vs
   prior period and an external benchmark.
4. **CTA** — one action verb the consumer can take from this tile.
5. **All four states** — loading, empty cold-start, empty privacy,
   error — explicitly drawn in Figma and built in code.

Missing any one of these makes the surface noise rather than signal.

---

## 9. Drill-down architecture

A summary tile that can't be opened is a dead end. Every analytic in
this catalogue is part of a **drill graph** — a deterministic chain
that lets the consumer move from an aggregate number all the way to
the underlying event without ever feeling lost.

This section makes the drill graph explicit so designers, engineers,
and consumers all share one mental model.

### 9.1 The canonical hierarchy

The platform's analytical data has six natural levels. Every drill in
the product is a hop along this chain:

```
Platform                                   (admin only)
   ↓
Tenant / Institute                         (admin → institute)
   ↓
Exam                                       (institute → cohort head)
   ↓
Subject                                    (Physics / Chemistry / …)
   ↓
Topic                                      (Mechanics, Thermodynamics)
   ↓
Concept                                    (Conservation of momentum)
   ↓
Student                                    (one user)
   ↓
Session                                    (one quiz / mock / battle)
   ↓
Item                                       (one question + the student's answer)
```

The HTTP-level scaffold for this chain already exists under
`/analytics/drill/tenants → /exams → /subjects → /topics → /concepts → /students`
(see [section 4](#4-student) of this doc). The presentation layer must
honour the same chain so a user "drilling" the UI is just walking
these endpoints.

### 9.2 The four drill verbs

Every clickable element in an analytic resolves to **exactly one** of
these four interactions. Anything else is invented friction.

| Verb | What it does | Example |
|---|---|---|
| **Open** | Replace the current view with the next level *down* the hierarchy. URL changes. Browser back works. | Click "Mechanics" cell in the topic heatmap → land on the Mechanics drill page. |
| **Peek** | Show a hovering panel (right side / popover) with the next-level breakdown without leaving the page. URL unchanged. | Hover a student in the cohort leaderboard → side panel shows their 5-topic mastery snapshot. |
| **Filter** | Constrain the current view to a subset. Other tiles on the same page reflow. URL adds a query param. | Click "Last 7 days" on the time-window picker → every chart on the page recalculates. |
| **Pivot** | Swap the current view's *axis* (e.g., by-topic ↔ by-student). URL changes. | On the cohort heatmap, click the "pivot" affordance → axes flip from `topic × student` to `student × topic`. |

A tile should declare which verbs it supports in its spec. Mixed-verb
tiles are allowed but each affordance gets its own visual treatment
(see [§9.6](#96-visual-affordances)).

### 9.3 Per-role drill maps

#### Admin

```
/admin/dashboard
├── (Open) Funnel stage → tenant breakdown of that stage
│       └── (Open) tenant → /analytics/institution/{id}/overview
├── (Open) Question-quality cell → /analytics/platform/question-quality?question_id=…
│       └── (Open) → item-level distribution of student answers
├── (Open) AI-cost provider chip → /admin/ai-cost?provider=openai
│       └── (Open) template → /admin/ai-cost?provider=openai&template_id=…
│             └── (Open) call → ai_call_logs row (audit detail)
└── (Peek) DAU-vs-MAU spark → 7-day moving average trend in side panel
```

#### Institute owner

```
/analytics/institution/{id}/overview
├── (Open) Headline readiness gauge → /trend (90-day series)
├── (Open) Cohort tile → /analytics/cohorts/{cohort_id}/summary
│       ├── (Open) topic-heatmap cell → cohort × topic students sorted by mastery
│       │       └── (Open) student → /analytics/cohorts/{id}/students/{user_id}
│       └── (Open) at-risk count → predictive at-risk list
├── (Open) Teacher effectiveness row → /analytics/teacher/{teacher_id}/dashboard
└── (Open) Subject-gap bar → /analytics/drill/tenant/{id}/exam/{exam_id}/subject/{subject_id}/topics
```

#### Teacher

```
/analytics/teacher/{id}/dashboard
├── (Open) Cohort tile → /analytics/cohorts/{id}/leaderboard
│       ├── (Peek) student row → 5-topic mastery snapshot popover
│       ├── (Open) student row → /analytics/cohorts/{id}/students/{user_id}
│       │       ├── (Open) topic chip → topic × student session list
│       │       │       └── (Open) session → mock/quiz item-level review
│       │       └── (Open) "Flag for intervention" → POST manual-intervention
│       └── (Pivot) "By topic" ↔ "By student" toggle
├── (Open) At-risk panel item → student deep-dive
└── (Filter) Time window 7d/30d/90d → all tiles recompute
```

#### Student

```
/insights (Home)
├── (Open) Readiness gauge → /readiness-band (band + actions + 30d trend)
├── (Open) Mastery sparkline → /concept-mastery sorted weakest → strongest
│       └── (Open) concept row → concept page
│             ├── (Open) "Practise" → start adaptive session on this concept
│             ├── (Open) "Past mistakes" → wrong-answers list for this concept
│             │       └── (Open) item → quiz-review of that single item
│             └── (Peek) sample question variations
├── (Open) Decay tile → /topic-decay full list
│       └── (Open) decay row → SM-2 revision session start
├── (Open) "Mock trajectory" sparkline → /mock/{exam}/trajectory full
│       └── (Open) attempt → mock review page
└── (Filter) Window 7d/30d/all-time → every tile reflows
```

### 9.4 Context preservation rules

Drilling must never make the consumer re-establish "where they were."
The contract:

1. **Breadcrumb on top of every drill page.** Click any breadcrumb
   segment to jump back up. Last segment is always the current view's
   label, not a link.
2. **Filter context inherits down.** Time window, cohort filter,
   exam filter — anything chosen on the parent view auto-applies to
   the drill target. Drill pages must show the inherited filters as
   chips you can click to clear.
3. **Pivot context inherits sideways.** If the parent was filtered to
   "Mechanics", and the user pivots from cohort → student, the new
   axes are still scoped to "Mechanics". They must explicitly clear
   the chip to widen.
4. **Back / forward / deep-link.** Every drill state is a unique URL
   (query params encode filters + pivots). `Cmd/Ctrl + click` opens
   the drill target in a new tab without losing the source view.
5. **Selection sticks.** Selecting a student row in the cohort
   leaderboard highlights that student on every other tile that lists
   the same cohort. The highlight follows you through pivots.

### 9.5 The "level-of-detail" contract

A drill is meaningless if the next level isn't *strictly more
detailed*. Each hop must reveal information the previous level
deliberately suppressed. This rules out two anti-patterns:

| Anti-pattern | Why it's banned |
|---|---|
| Drill that just changes chart style | Wastes a click — already covered by the "switch view" pivot affordance. |
| Drill that *re-summarises* at a comparable granularity | E.g., topic gauge → another gauge of the same topic. The next level must show distribution, not summary. |

Concretely, the *minimum* level-of-detail bump per hop:

| From | To | Minimum gain |
|---|---|---|
| Aggregate number | Distribution | Histogram / list of constituents. |
| Distribution | Constituents | Sortable, filterable, paginated table. |
| Constituent | Single-entity view | Time series + sub-aggregates. |
| Single-entity view | Event | Raw event with timestamp + payload. |

### 9.6 Visual affordances

| Drill verb | Visual cue | Cursor | Keyboard |
|---|---|---|---|
| **Open** | Hovered cells get a faint elevation + ↗ arrow icon in the corner. | `pointer` | `Enter` on focused element. |
| **Peek** | Hovered cells get a focus ring. A delayed (300 ms) panel slides in from the right. | `pointer` | `Space` on focused element to toggle. |
| **Filter** | Filter chips appear above the tile grid. Click a chip's × to clear. | `pointer` | `f` opens the filter palette. |
| **Pivot** | A small ⇄ pivot icon at the top-right of the chart canvas. | `pointer` | `p` toggles pivot. |

If a tile *cannot* be drilled, it must show **no** hover affordance —
no elevation, no cursor change. Pretending a tile is interactive when
it isn't is the single biggest source of "I clicked but nothing
happened" complaints.

### 9.7 Drill performance budget

A drill click must feel **instant** even when the new view fetches
fresh data:

| Step | Budget |
|---|---|
| Click → URL change | < 16 ms (synchronous in render) |
| URL change → skeleton paint | < 100 ms |
| Skeleton paint → first row of real data | < 400 ms p95 |
| All tiles fully resolved | < 1.2 s p95 |

To meet this, every drill target must support:

- **Prefetch on hover.** When the user hovers a drillable cell for
  more than 80 ms, the drill endpoint is fetched speculatively.
- **Optimistic skeleton.** Render the drill target's layout
  immediately using cached headers; replace with real data as it
  arrives.
- **Incremental fill.** Heavy tiles paginate or chunk — don't block
  the page on a single slow query.

### 9.8 What "ready" looks like for drill-down

Pair this checklist with [§8](#8-what-shipped-looks-like-for-an-analytics-surface):

1. **Source tile lists every drill verb it supports** in the design
   spec (Open, Peek, Filter, Pivot).
2. **Each drill target has its own catalogue entry** in this doc —
   no orphan pages.
3. **Breadcrumb is built into the AppShell**, not re-implemented per
   page.
4. **Inherited filters render as removable chips** on every drill
   target.
5. **Empty state of the drill target** says exactly *what* the parent
   filter would need to be relaxed to find data ("No students in
   Mechanics scored below 0.4 last week — widen to 30 d or clear the
   topic filter").
6. **Deep-link test passes** — paste any drill URL into a fresh
   browser, the page renders with the inherited filters honoured.

### 9.9 Worked example — "Why is Mechanics weak in Batch C?"

The institute owner asks the question on a Monday morning. Here's the
expected drill flow:

```
Step  Surface                            Verb     What appears
─────────────────────────────────────────────────────────────────────────
 1    Institute overview                  start    Avg readiness 0.61 (-3% vs 7d ago)
 2    ↓ Subject-gap bar chart            Open     Physics has the largest gap; Mechanics is the dragging topic
 3    ↓ Mechanics tile                    Open     Cohort × Mechanics mastery distribution (Batch C is the lowest histogram bin)
 4    ↓ Batch C bar                      Open     Cohort leaderboard, sorted by readiness asc
 5    ↳ Student row                      Peek     5-topic snapshot popover: this student is at 0.32 on "Conservation of momentum"
 6    ↓ Student row                      Open     Per-student deep-dive
 7    ↓ "Conservation of momentum" chip  Open     Wrong-answer list for this concept, last 30d
 8    ↓ Mistake row                      Open     Item-level review: stem + the student's pick + the correct answer + explanation
 9    ↑ Back x3 → Batch C view           ← ← ←     Returns to step 4 with breadcrumbs + filters intact
10    "Flag teacher for intervention"     CTA      Posts manual-intervention; teacher receives notification + the link to step 6
```

The owner reached an actionable verdict in 9 clicks, never lost
context, and finished at a workflow CTA that closes the loop. Every
drill in the product should pass that "9 clicks to action" test.

---

## 10. Putting it together

The analytics layer is now defined along four orthogonal axes:

1. **Catalogue ([§1–4](#1-platform-admin))** — what data exists per role.
2. **Gaps ([§6](#6-gap-analysis--whats-still-missing))** — what's still missing per role.
3. **Presentation ([§7](#7-presentation-grammar))** — how each datum should look.
4. **Drill-down ([§9](#9-drill-down-architecture))** — how the consumer moves between data.

A tile is ready to ship only when all four axes have an answer. A tile
that exists in the catalogue but breaks the presentation grammar is
visual noise. A tile that follows the presentation grammar but has no
drill is a dead end. A tile that drills but ignores its consumer's
gaps is solving the wrong problem.

This document is the contract. Treat it as the source of truth and the
analytics layer becomes the single most defensible feature of the
product.

---

## 11. Strategic review — a business analyst's perspective

The preceding sections describe a competent analytics layer. The
honest assessment from a senior BA seat is that it sits at the
**mid-stage of analytics maturity**: rich in surfaces, coherent in
data model, but optimised for *displaying numbers* rather than
*driving decisions*. This section identifies the strategic gaps and
recommends a path to top-quartile maturity.

### 11.1 Maturity assessment (Gartner's four-stage model)

| Stage | What it answers | Our coverage | Verdict |
|---|---|---|---|
| **Descriptive** — what happened? | Past mastery, attempts, scores | 60+ surfaces (§1–4) | ✅ Saturated |
| **Diagnostic** — why did it happen? | Error patterns, weakness diagnosis, common mistakes | 8 surfaces | ⚠️ Adequate but shallow — most root-cause analyses stop at "topic X is weak", never at "*because* sub-skill Y is the broken atom" |
| **Predictive** — what will happen? | Dropout risk, time-to-mastery, mock trajectory | 5 surfaces | ⚠️ Underdeveloped — heuristic models, no proper feature stores, no validation against ground truth |
| **Prescriptive** — what should we do? | Mission selector, AI-suggested tests, manual interventions | 3 surfaces | ❌ Nascent — recommendations exist but aren't explainable, comparable, or A/B-validated |

**Headline:** the platform has more analytics surfaces than the average
ed-tech competitor but is **investing in the wrong end of the
maturity curve.** Adding a 61st descriptive tile delivers diminishing
returns; adding the first robust prescriptive engine would be a
defensible moat.

### 11.2 The DIKW pyramid — where each surface sits today

Information theorists distinguish Data → Information → Knowledge →
Wisdom. Most analytics products plateau at "Information." Ours is no
exception.

| Layer | Example in our product | Coverage |
|---|---|---|
| **Data** | `quiz_session_items` raw rows | 100% — well-modelled |
| **Information** | `Mastery 0.62, +12% vs last week` | 100% — every tile lives here |
| **Knowledge** | "Students who do ≥ 4 missions/week and revise within 48 h reach mastery 30% faster" | < 10% — only a handful of insights surfaced (e.g., insights snapshot) |
| **Wisdom** | "For *this* student in *this* week, the single highest-ROI hour to spend is 45 min on Newton's 3rd law followed by a 15 min reflection" | < 1% — exists only inside the mission selector black box |

The strategic gap: **we sell Information at Wisdom-level prices.**
Competitive ed-tech is moving up the pyramid. Standing still means
becoming a dashboard vendor in a market that wants a coach.

### 11.3 The North Star problem

Every role's screen has multiple "headline numbers" with no
hierarchy. A consumer who isn't sure which one to optimise will pick
the one easiest to move — usually XP or streak — and the actual
outcome (real-exam rank) drifts unobserved. This is textbook
**Goodhart's Law**.

**Recommendation:** declare **one** North Star Metric per role and
make every other tile derivative of it.

| Role | Proposed North Star | Why |
|---|---|---|
| **Student** | *Projected exam percentile on T-30 days from exam date* | This is the single number that matters to the consumer of the product. Engagement, mastery, streaks are inputs — surface them, but as supporting drivers, not as ends. |
| **Teacher** | *Δ Projected percentile per active student per week* | The teacher's job is to move the dial. Measure the dial-moving, not the activity. |
| **Institute** | *Cohort-average projected percentile vs target percentile* | Aligns the institute with the parent's actual question: "will my child get into IIT/AIIMS?" |
| **Admin** | *Real-exam-outcome lift attributable to the platform (controlled estimate)* | The only number that matters to a board, an investor, or a regulator. |

Each role's home screen then **leads with this one number**,
trend-lined, with the top-3 most-correlated levers underneath.
Everything else moves to drill-targets.

### 11.4 Five blind spots not captured in §6

The earlier gap analysis (§6) lists *missing surfaces*. A BA review
finds something more dangerous — **biases and structural gaps that
make existing surfaces misleading**.

#### 11.4.1 Survivorship bias in real-exam outcomes

The `real_exam_outcomes` table is opt-in. **Students who under-perform
disproportionately don't report.** Every "platform → real-exam
correlation" stat in §1 is therefore biased upward.

**Recommendation:** add an explicit reporting-rate stat alongside
every outcome correlation. Build a non-response model that estimates
the missing-tail distribution. Publish a confidence interval, not a
point estimate.

#### 11.4.2 No counterfactuals

Every "the platform helped X students" claim assumes the
counter-factual ("what would have happened without the platform") is
zero or constant. This is unfalsifiable and rightly criticised by
sceptical institute owners and regulators.

**Recommendation:** instrument controlled rollouts of every major
pedagogical feature (mission system, AI suggestions, decay refresh).
For at least 10% of users, hold the feature back and compare 90-day
mastery slopes. Build a `feature_experiments` table that records
exposure × variant × primary-metric uplift with 95% CI.

#### 11.4.3 Engagement-as-outcome confusion

XP, streaks, leagues, clan rank, time-on-platform are *engagement
inputs*. The product currently treats them as **outcomes the student
should optimise**. This is the classic Goodhart trap — a student can
maintain a 90-day streak by answering trivial questions while their
exam-readiness flatlines.

**Recommendation:** every gamification surface (XP tile, league
ranking) must show, side-by-side, the **outcome metric** for the same
window. If XP went up but projected percentile didn't, the surface
must say so honestly.

#### 11.4.4 Equity & fairness blind spot

The platform serves students across socioeconomic strata, languages,
and regions. **No surface today measures whether outcomes differ by
those strata.** A subtle bias in the mock-difficulty distribution
(e.g., calibrated against urban-English students) would invisibly
disadvantage rural-vernacular learners.

**Recommendation:** every outcome metric needs a **disaggregation
panel** — by language, by tier-of-city, by gender, by socio-economic
band (if collected). Establish a fairness review cadence (quarterly)
where the analytics team must justify any > 10% gap in observed
mastery slopes across strata.

#### 11.4.5 No "voice of customer" join

Quantitative analytics exists in a vacuum. Qualitative signals — NPS
comments, support tickets, doubt-thread sentiment, app-store reviews
— are nowhere joined to quantitative cohort behaviour.

**Recommendation:** every quantitative surface where a drop is
visible (engagement dip, conversion dip, mastery dip) should
auto-fetch the qualitative payload for the same window. A
mastery-flatlining cohort whose support tickets all say "I'm
confused by the new mission card" is a different problem than one
whose tickets say "I've been busy with school exams."

### 11.5 Critical structural recommendations

These are not new tiles — they are **changes to how the analytics
layer is built and governed**.

#### A. Establish an Analytics Decision Registry

Every analytical surface should answer a *named decision* a role
makes. A surface that doesn't answer a named decision is decoration
and should be removed.

Maintain a table:

| Decision | Owner role | Frequency | Surface that answers it |
|---|---|---|---|
| "Which cohort needs my time this week?" | Teacher | Weekly | `/teacher/dashboard` |
| "Which student is at risk of dropping out?" | Teacher | Weekly | `/predictive/at-risk` |
| "Which content should I commission next term?" | Institute | Quarterly | `/institution/subject-gaps` |
| "Which exam should I focus on next 30 days?" | Student | Weekly | `/insights/snapshot` |

If a row has no surface, build it. If a surface has no row, deprecate
it. This single discipline cuts dashboard-bloat by 30–40% in mature
products.

#### B. Adopt an "evidence ladder" for every claim

Every analytics tile that asserts causality (e.g., "missions
correlate with mastery") should declare its evidence level:

| Level | Description | Where it's acceptable |
|---|---|---|
| 1. **Observation** | Two variables move together | Diagnostic surfaces only |
| 2. **Cohort comparison** | Behaviour differs between groups | Teacher / institute surfaces |
| 3. **Pre/post intervention** | Same group, before/after | Predictive surfaces |
| 4. **Quasi-experiment** | Matched control group | Outcome correlation claims |
| 5. **RCT** | Randomised exposure | Public marketing claims |

Today every public claim is at level 1 or 2. Marketing collateral
that says "platform improves outcomes by 40%" must be level 4+ or
withdrawn.

#### C. Build a Recommendation Explainability surface

Students get AI-suggested tests with a one-line rationale, but the
underlying weights, alternatives, and counterfactuals are hidden. A
black-box recommendation engine eventually loses trust and is dropped
by power users.

**Build:** a `/why-this-suggestion` page that shows, for any
recommendation:

1. The top-3 signals that drove it (`your mastery on X is 0.42`,
   `you haven't revised X in 22 days`, `students like you who took
   this gained 0.08 in mastery`)
2. The top-3 alternatives the engine considered and why they were
   rejected
3. A "this suggestion was unhelpful" button that feeds back into
   the model

This single feature converts skeptical institute owners and discerning
students into champions.

#### D. Define and track an Analytics Adoption Metric

We have no idea which dashboards consumers actually use. Without
this, we can't kill dead surfaces or invest in successful ones.

**Track:** per-surface DAU/WAU, time-on-surface, drill-depth,
return-rate. Surface this internally as
`/admin/analytics-on-analytics`. Any surface with < 5% WAU among its
target role is a candidate for deprecation.

#### E. Build the "After-life" tracker

The single most defensible institute-marketing asset is *what
happened to last year's cohort?* — placements, admissions, real
careers. Today, the platform's relationship with a student ends at
their last login.

**Build:** an opt-in alumni feature that lets students update where
they ended up (college, branch, then job 2 years later). Surface
this back to the institute owner as a "placement record" report.
Even with a 20% reporting rate, this is the highest-leverage sales
asset the platform can offer.

#### F. Establish an "Insight of the Week" pipeline

The platform sits on terabytes of educational behavioural data and
generates **zero novel insights** that aren't role-specific dashboard
content. A research-grade ed-tech platform should publish a weekly
or monthly insight ("students who use the decay-refresh card recover
from forgetting 2.4× faster than peers" — actual analysis required).

This serves three goals:

1. PR / SEO content that compounds.
2. Internal discipline — forces the team to find genuine knowledge,
   not just dashboards.
3. Investor / regulator credibility.

### 11.6 Prioritised roadmap

The 30 recommendations across §6 (missing surfaces), §11.4 (blind
spots), and §11.5 (structural changes) are not all equal-weight.
Prioritised by **expected business impact × implementation effort**:

#### Wave 1 — next sprint (low effort, high impact)

1. Pick a North Star per role and surface it as the lead tile (§11.3).
2. Add disaggregation panels to the three top outcome surfaces (§11.4.4).
3. Pair every gamification tile with its outcome counterpart (§11.4.3).
4. Start tracking surface-level adoption metrics (§11.5.D).
5. Add reporting-rate caveats to every `real_exam_outcomes`-based
   tile (§11.4.1).

#### Wave 2 — next quarter (medium effort, high impact)

1. Build the experiment framework + first controlled rollout (§11.4.2).
2. Ship the "Why this suggestion?" explainability surface (§11.5.C).
3. Add Voice-of-Customer joins on the top 5 outcome surfaces (§11.4.5).
4. Add per-college admission projection (§6.4).
5. Build the cohort completion forecast (§6.2).

#### Wave 3 — next year (high effort, transformational)

1. Mature predictive models into proper feature stores + retraining
   cadence (§11.1).
2. Build the after-life / alumni tracker (§11.5.E).
3. Run the first RCT-grade outcome study (§11.5.B).
4. Establish the fairness review board (§11.4.4).
5. Launch the public "Insight of the Week" research stream (§11.5.F).

### 11.7 Risks of inaction

If the analytics layer stays where it is today, three concrete risks
materialise within 12 months:

1. **Competitive obsolescence.** Major Indian ed-tech players are
   investing in adaptive + prescriptive AI. A descriptive dashboard
   becomes table-stakes, not differentiator.

2. **Goodhart drift.** Without an explicit North Star tie-back,
   students will optimise for streaks while their exam scores
   stagnate. The product will retain users without producing
   outcomes — fatal when the contract comes up for renewal.

3. **Equity exposure.** Without disaggregated outcome tracking, a
   subtle pedagogical bias against vernacular / rural learners
   becomes an existential PR and regulatory risk in India's evolving
   ed-tech policy environment.

### 11.8 What "great" looks like in 12 months

The vision the analytics layer should be measured against in mid-2027:

> "A new student logs in. Within 60 seconds, the platform shows them
> their *projected exam percentile* (a calibrated number, not a vanity
> metric), the top-3 behaviours that move that number for students like
> them (backed by causal inference, not correlation), and the single
> next action with an *explainable rationale*. Their teacher sees the
> same student framed as 'projected to drop 8 points this month unless
> intervention X happens'. Their institute owner sees the cohort
> framed as 'on track / off track to placement targets'. The platform
> admin sees the lift the platform created vs. a held-out control —
> defensible in front of a regulator. All four views derive from the
> same event stream, the same models, and the same definitions.
> Disagreements between them aren't possible because there's one
> source of truth."

That is **prescriptive, explainable, fairness-aware, outcome-tied
analytics**. The current platform is one Wave-1 sprint away from
starting the journey, and one Wave-3 year away from completing it.

---

## 12. Closing position

The platform has built a *competent* analytics layer in record time.
The next 12 months determine whether that competence becomes a
**moat** or a **commodity**.

The catalogue (§1–4) is the *what*. The gaps (§6) and presentation
grammar (§7) and drill architecture (§9) are the *how*. The
strategic review (§11) is the *why*. Together, these four lenses
give the team everything required to make sound investment decisions
across the analytics surface area for the foreseeable future.

The single recommendation above all others: **stop building
descriptive tiles. Start building prescriptive, causal,
explainable insights — and prove they work with controlled
experiments.** Everything else flows from that one disciplined
choice.

---

# Part II — From Analytics to a Statistics-Driven Guidance System

The first half of this document treats analytics as a *layer that
shows numbers*. The strategic case in §11 argued for moving from
descriptive to prescriptive. This second half details **how to
actually build that prescriptive engine**, organised around the four
pillars the platform needs to be world-class:

| Pillar | What it does | What it produces |
|---|---|---|
| **A. Exam Intelligence System (EIS)** | Ingests every past paper for every exam, mines patterns, predicts what's likely to appear next | "JEE Main 2026 — Mechanics has 78% probability of 4-question slot; Rotational Motion shows a 3-year rising trend" |
| **B. Probabilistic Curriculum Engine (PCE)** | Weights every concept by *expected marks contribution* = P(appears) × marks | "For your remaining 60 days, study 22% Mechanics, 18% Organic Chemistry — that's where 58% of your projected score sits" |
| **C. Adaptive Difficulty Progression (ADP)** | Adjusts question difficulty in real time using IRT + multi-armed bandits to keep the student in the flow zone (optimal challenge) | The student is never bored (too easy) or frustrated (too hard); difficulty rises with mastery |
| **D. Internal Guidance System (IGS)** | The decision brain — combines A, B, C with the student's state, time budget, decay model, and peer signals to produce the *next* action | "Spend 25 min now on Rotational Motion (high yield, high decay risk, 2nd weakest)" — with confidence and explanation |

The rest of this document defines each pillar's data model,
algorithms, endpoints, and 18-month build plan.

---

## 13. Pillar A — Exam Intelligence System (EIS)

> **Strategic posture:** Every Indian competitive exam (JEE, NEET, UPSC,
> CAT, GATE, CBSE boards) publishes past papers going back decades.
> These are public, free, and statistically rich. Most ed-tech
> platforms treat past papers as content; we treat them as **training
> data for a forecasting model.**

### 13.1 What it answers

| Question | Consumer |
|---|---|
| "Of all topics in the syllabus, which appear most often?" | Curriculum design, student |
| "Has the examiner's emphasis shifted in the last 5 years?" | Curriculum design |
| "What kind of question (MCQ, numerical, assertion-reason) is most likely for this concept?" | Question authors, student |
| "What's the average difficulty of questions on this topic in real exams?" | Difficulty calibration |
| "Which concepts have *never* appeared but are in syllabus?" | Risk identification |
| "Which topics appear together?" (co-occurrence) | Cross-topic drill design |

### 13.2 Data model

A new database schema `exam_intelligence_schema`:

```
exam_past_papers(
    id uuid pk,
    exam_id uuid not null,
    year smallint not null,
    session text,                          -- "Jan", "April", "Mains-1"
    paper_url text,                        -- PDF / source
    ingested_at timestamptz,
    n_questions int,
    total_marks int,
    duration_minutes int,
    unique (exam_id, year, session)
);

exam_past_questions(
    id uuid pk,
    paper_id uuid references exam_past_papers,
    item_idx smallint,                     -- 1-N within paper
    stem text,
    choices jsonb,
    correct_answer text,
    question_type text,                    -- MCQ_SINGLE, NUMERIC, ...
    marks_correct smallint,
    marks_negative smallint,
    -- Tagged via NLP + manual review (curated_tags overrides nlp_tags)
    nlp_tags jsonb,                        -- {topic_ids: [...], concept_ids: [...], bloom_level: int}
    curated_tags jsonb,                    -- override from content team
    -- Auto-estimated difficulty before any student attempts it
    irt_b_estimate real,                   -- difficulty estimate from heuristic + LLM-rated
    irt_b_observed real                    -- updated once enough student attempts come in
);

topic_appearance_stats(
    exam_id uuid,
    topic_id uuid,
    year smallint,
    n_questions int,
    total_marks int,
    avg_difficulty real,
    primary key (exam_id, topic_id, year)
);

concept_appearance_stats(
    exam_id uuid,
    concept_id uuid,
    year smallint,
    n_questions int,
    total_marks int,
    primary key (exam_id, concept_id, year)
);

-- The forecast layer
topic_forecast(
    exam_id uuid,
    topic_id uuid,
    forecast_year smallint,
    p_appears real,                        -- 0..1 probability of any question
    expected_questions real,               -- predicted count
    expected_marks real,                   -- predicted marks
    confidence real,                       -- model confidence
    trend text,                            -- "rising", "stable", "falling"
    last_computed_at timestamptz,
    primary key (exam_id, topic_id, forecast_year)
);

question_pattern_stats(
    exam_id uuid,
    topic_id uuid,
    question_type text,                    -- MCQ_SINGLE, NUMERIC, ...
    n_observed int,
    avg_difficulty real,
    primary key (exam_id, topic_id, question_type)
);
```

### 13.3 Onboarding workflow for a new exam

When the content team adds a new exam (say, AIIMS PG), the platform
fires a deterministic pipeline:

```
Step 1 — Ingest past papers
   Source: official site or curated bundle
   Output: rows in exam_past_papers + exam_past_questions

Step 2 — Auto-tag every question
   Pipeline: LLM (via existing AI Gateway, touchpoint=tagging) →
             topic_id, concept_id, bloom_level, question_type
   Output: nlp_tags column populated; flagged for content-team review

Step 3 — Compute appearance stats
   Aggregate: rollup to topic_appearance_stats, concept_appearance_stats
   Output: per-year counts and total-marks per topic/concept

Step 4 — Fit forecast model
   Inputs: historical years' appearance counts
   Algorithm: see §13.4
   Output: topic_forecast rows for next exam year

Step 5 — Estimate difficulty for every past question
   Algorithm: LLM-rated + heuristic + (once students attempt) IRT
   Output: irt_b_estimate, refined by irt_b_observed over time

Step 6 — Generate question-pattern stats
   Rollup of {topic, question_type} → frequency
   Output: question_pattern_stats

Step 7 — Surface to curriculum + student
   Push exam onboarding to /admin/exams/{id}/intelligence dashboard
   for content-team validation; flip exam to PUBLISHED when reviewed.
```

This is a one-time onboarding plus a nightly refresh of forecasts as
new papers (mocks, official) arrive.

### 13.4 The forecast model

A topic's expected presence in next year's paper combines four
signals. The intentionally simple formula keeps it auditable:

```
p_appears(topic, year+1) =
        w_freq    × frequency_rate_last_10y
      + w_recency × recency_weighted_rate_last_3y
      + w_trend   × trend_slope_last_5y
      + w_syllabus× in_current_syllabus_indicator

expected_marks(topic, year+1) =
        p_appears × average_marks_per_appearance(topic)
```

Where:

- `frequency_rate_last_10y` = fraction of past 10 years where ≥1 question appeared
- `recency_weighted_rate_last_3y` = exponential decay weighted rate (last year × 1.0, year-1 × 0.7, year-2 × 0.5)
- `trend_slope_last_5y` = regression slope of n_questions on year
- `in_current_syllabus_indicator` = 1 if topic is in the published syllabus for next year, else 0 (and `p_appears` is forced to 0 if 0)

Weights `w_freq`, `w_recency`, `w_trend`, `w_syllabus` are learned per
exam from a held-out validation set (e.g., predict 2024 from 2014–
2023 papers, optimise weights, then forecast 2026).

**Confidence** for each forecast is the standard error of the
prediction — high when 10 years of stable data exist, low when an
exam pattern recently changed (e.g., NEET-PG 2024 syllabus revision).

### 13.5 Endpoints

| Endpoint | Consumer | What it returns |
|---|---|---|
| `GET /exam-intel/{exam_id}/topic-yield` | Student, teacher, institute | Per-topic `{p_appears, expected_marks, trend, confidence}` sorted by expected_marks desc |
| `GET /exam-intel/{exam_id}/concept-yield` | Student | Per-concept yield (finer granularity) |
| `GET /exam-intel/{exam_id}/question-pattern` | Student | Per-topic distribution across question types |
| `GET /exam-intel/{exam_id}/never-asked` | Curriculum, student | Topics in syllabus that have never appeared (risk list) |
| `GET /exam-intel/{exam_id}/co-occurrence` | Curriculum | Pairs of topics that historically appear together (e.g., Mechanics + Calculus) |
| `GET /exam-intel/{exam_id}/trends` | Content team | 10-year time series for each topic showing rising/falling emphasis |
| `POST /admin/exams/{id}/recompute-intel` | Admin | Force-refresh the forecast (after new past-paper added) |

### 13.6 Risks and mitigations

| Risk | Mitigation |
|---|---|
| LLM mis-tags a question | Every NLP tag is reviewed by content team before publishing. `nlp_tags` and `curated_tags` are kept separate so review history is preserved. |
| Forecast errors damage student trust | Every yield number is shown with its confidence band. "Mechanics: 78% probability, ±12%" not "Mechanics: 78%". |
| Past-paper bias (examiner shift) | Recency weighting; explicit "trend" indicator surfaced on every tile. |
| Syllabus changes invalidate history | The `in_current_syllabus_indicator` zeroes out predictions for removed topics, regardless of past frequency. |

---

## 14. Pillar B — Probabilistic Curriculum Engine (PCE)

> **Strategic posture:** Once we know *what's likely to appear* (Pillar
> A), curriculum + student study time should be allocated **in
> proportion to expected score contribution** — not in proportion to
> syllabus page count. This is the single largest source of student
> ROI that nobody else is exploiting at scale.

### 14.1 The core idea — "yield"

Borrowed from finance and standardized-test prep:

```
yield(topic) = P(topic appears in exam)  ×  average_marks_when_it_does
```

Yield orders the entire syllabus by **expected marks per unit of
study time**. A 4-mark topic with 80% appearance probability
(yield = 3.2) deserves more attention than a 6-mark topic with 20%
probability (yield = 1.2), even though the latter is "worth more
points in isolation."

### 14.2 Personalised yield

Yield isn't enough on its own. A student already at 0.95 mastery on
Mechanics gains nothing from more Mechanics practice. The personalised
version:

```
personal_yield(topic, student) =
       yield(topic)                                   (base)
     × (1 - current_mastery(student, topic))          (room to grow)
     × decay_severity(student, topic)                 (forgetting risk)
     × time_pressure(days_to_exam)                    (urgency boost)
```

This produces a **ranking** of every topic in the syllabus
specifically for *this student* at *this moment*. The top of the list
is where they should spend their next hour.

### 14.3 Data model additions

```
topic_yield_personal(
    user_id uuid,
    exam_id uuid,
    topic_id uuid,
    base_yield real,                       -- from topic_forecast
    personal_yield real,                   -- the formula above
    rank smallint,                         -- 1 = highest priority
    computed_at timestamptz,
    primary key (user_id, exam_id, topic_id)
);
```

Refreshed once per day or after any major mastery event (large
positive or negative delta).

### 14.4 Surfaces

| Surface | What it shows |
|---|---|
| `GET /pce/{user_id}/yield-ranking` | Ranked top-20 topics for this student to study now, with one-line rationale per row |
| `GET /pce/{user_id}/score-projection` | Project the student's expected exam score given current mastery × yield distribution |
| `GET /pce/{user_id}/score-projection?if_topic_mastered={topic_id}` | Counterfactual — "if you mastered this topic, your projected score would rise by X marks" |
| `GET /pce/{user_id}/portfolio` | Pie chart showing how their current mastery + study time is allocated across yield-bins (High / Medium / Low) — and what the optimal allocation would be |

### 14.5 The portfolio metaphor

The most powerful UI for PCE is **a portfolio rebalancing screen** —
borrowed from wealth-management apps. Each topic is an "asset"
holding the student's mastery score; yield is the "expected return."
The student sees:

```
Your mastery portfolio                          Optimal allocation
──────────────────────────                      ──────────────────
Mechanics       ████████░ 0.82                  ████░░░░░ 0.45  ← over-invested
Organic Chem    ██░░░░░░░ 0.21                  ████████░ 0.78  ← under-invested
Calculus        ███████░░ 0.71                  ███░░░░░░ 0.35
...                                              
                                                
"Reallocate 2 hours/day from Mechanics to Organic Chem
 → projected score lift: +14 marks"
```

This is how Robinhood / Zerodha taught a generation to think about
risk. The same metaphor unlocks "your study time is an asset
allocation problem" — a mental model students don't currently have.

### 14.6 Endpoints

| Endpoint | Returns |
|---|---|
| `GET /pce/{user_id}/yield-ranking` | Ranked topic list with personal yield + rationale |
| `GET /pce/{user_id}/score-projection` | `{expected_score, ci_low, ci_high, vs_target}` |
| `GET /pce/{user_id}/portfolio` | Current vs optimal allocation per yield-bin |
| `GET /pce/{user_id}/what-if?topic={id}&new_mastery={m}` | Counterfactual score projection |
| `POST /pce/recompute/{user_id}` | Force-recompute personal yields |

### 14.7 Why this is a moat

Yield-based prioritisation is well known in offline coaching (the
best teachers do it intuitively). **No mainstream ed-tech platform
surfaces it numerically to the student** because they don't have the
EIS to compute it. By coupling EIS + PCE, the platform offers
something no competitor can match: *evidence-backed yield rankings
personalised in real time*.

---

## 15. Pillar C — Adaptive Difficulty Progression (ADP)

> **Strategic posture:** Csikszentmihalyi's flow theory says learning
> happens optimally when challenge slightly exceeds skill. The
> platform's IRT engine has the math; what's missing is the
> **explicit difficulty-progression service** that uses it on every
> question delivery decision.

### 15.1 The flow corridor

For a student with ability estimate θ (theta on the logit scale), the
optimal question difficulty `b` sits in a narrow corridor:

```
b ∈ [θ - 0.3, θ + 0.5]    ← the "flow corridor"

   too easy  ←  flow  →  too hard
   b<<θ                  b>>θ
   boredom               frustration, learned helplessness
```

The 0.5-σ upward bias is the "desirable difficulty" effect
(Bjork, 1994) — slightly stretched challenge produces the durable
learning gains.

### 15.2 The selection algorithm

For every "what question next?" decision, the engine runs:

```
1. Compute current θ for (student, concept)
2. Determine flow corridor [θ - 0.3, θ + 0.5]
3. Filter candidate questions where b ∈ corridor AND not seen recently
4. Apply Thompson sampling over the eligible set
   - Each question has a Beta posterior of "will this student get it right?"
   - Sample once from each, pick the question with the highest sample
   - This balances exploit (high P(success)) with explore (low n)
5. Serve the chosen question
6. Update θ with the observed answer using EAP estimator (already shipped)
7. Repeat
```

Thompson sampling is critical — without it, the engine deterministically
picks the same questions for similar students and never learns new
item parameters. With it, the engine self-improves over time.

### 15.3 Frustration & boredom detection

The flow corridor breaks when:

- **Frustration:** ≥ 3 consecutive wrong answers OR average solve-time
  > 2× the per-question median. Action: drop b by 0.5, surface a hint,
  show a similar-but-easier problem.
- **Boredom:** ≥ 5 consecutive correct AND average solve-time < 0.5×
  median. Action: raise b by 0.4, introduce a novel question type
  (e.g., switch MCQ → numerical).

These transitions are **invisible to the student** — there's no
"you're frustrated, here's an easier one" dialog. The system just
adjusts.

### 15.4 Data model

```
concept_ability(
    user_id uuid,
    concept_id uuid,
    theta real,                            -- current ability estimate
    se real,                                -- standard error
    n_attempts int,
    last_updated_at timestamptz,
    primary key (user_id, concept_id)
);

flow_corridor_events(
    user_id uuid,
    concept_id uuid,
    event_type text,                       -- 'frustration', 'boredom', 'normal'
    triggered_at timestamptz,
    correction_applied text,
    primary key (user_id, concept_id, triggered_at)
);

question_calibration(
    question_id uuid,
    b_estimate real,
    a_estimate real,                       -- discrimination (3PL)
    c_estimate real,                       -- guessing
    n_attempts int,
    p_correct real,
    last_calibrated_at timestamptz,
    primary key (question_id)
);
```

### 15.5 Cold-start

A newly-published question has no observed attempts. Bootstrap with:

1. LLM-estimated difficulty (existing AI Gateway, touchpoint=tagging,
   prompt asks the model to rate difficulty 1–5 with rationale)
2. Difficulty-of-similar-questions (cosine similarity on stem
   embeddings, weighted average of nearest-5 calibrated questions)
3. Authorial intent (the author specifies "easy / medium / hard" at
   publish time)

A weighted prior of the three; tightens as real attempts come in.

### 15.6 Surfaces

| Surface | Consumer | What it shows |
|---|---|---|
| `GET /adp/{user_id}/state?concept={id}` | Student (mostly internal) | Current θ, flow-corridor bounds, last 5 corrections |
| `GET /adp/{user_id}/ability-trajectory` | Student | 30-day θ trajectory per concept (line chart) |
| `GET /adp/calibration/{question_id}` | Content team | Question's calibration with n_attempts and stability |
| `POST /adp/recalibrate-batch` | Admin | Trigger nightly batch recalibration |

The most important "surface" is **invisible** — the next-question
endpoint quietly serves the right item without any explicit
"difficulty has been adjusted" message.

### 15.7 Why difficulty matters more than people think

Two students with identical mastery 0.62 can have wildly different
*confidence* and *durability* depending on whether they reached 0.62
via easy questions (fragile) or stretched questions (robust). ADP
ensures every gain in measured mastery is also a gain in **real
mastery** — the kind that survives the exam pressure.

---

## 16. Pillar D — Internal Guidance System (IGS)

> **Strategic posture:** EIS tells us *what to teach*; PCE tells us
> *what to teach this student first*; ADP tells us *at what
> difficulty*. The IGS is the **conductor** — it combines all three
> with the student's time budget, decay state, peer cohort, and
> recent emotional signals to produce *the next recommended action*.

### 16.1 The decision function

For every "what should this student do next?" call:

```
score(action, context) =
   α × expected_marks_gained(action, context)         (PCE)
 + β × p_durable_mastery(action, context)             (ADP — flow effect)
 + γ × time_efficiency(action, context)               (how much per minute)
 + δ × emotional_fit(action, context)                 (frustration-aware)
 - ε × cost(action, context)                          (time + cognitive load)

next_action = argmax_action score(action, context)
```

Where `action` ranges over: *practice topic X at difficulty Y*,
*revise topic Z via SM-2*, *take mock test*, *watch concept video*,
*do crash drill*, *take a break*. The IGS evaluates the candidate
actions and returns the highest-scoring one, with an explanation.

### 16.2 The components

| Component | Source | Role in IGS |
|---|---|---|
| `expected_marks_gained` | PCE personal_yield × Δmastery | "Will this move the score?" |
| `p_durable_mastery` | ADP flow-corridor membership | "Will this stick?" |
| `time_efficiency` | Historical (this student × this topic) mastery per minute | "Is this the best use of 45 min?" |
| `emotional_fit` | Recent frustration / boredom events, time-of-day, streak status | "Is the student in the right state for this?" |
| `cost` | Estimated time, cognitive load, novelty | "Penalize over-long actions when fatigue likely" |
| `peer_signal` | What worked for similar-state students (collaborative filtering) | Bonus signal: tie-breaker when score is close |

### 16.3 Inputs the IGS consumes

```
GET /igs/{user_id}/next-action

Internally fetches:
- /pce/{user_id}/yield-ranking         (priority topics)
- /adp/{user_id}/state                 (current ability per concept)
- /analytics/topic-decay/{user_id}     (forgetting risk)
- /analytics/streak/{user_id}          (motivation signal)
- /analytics/daily-activity/{user_id}  (time-of-day patterns)
- profile.target_date                  (urgency)
- profile.preferred_session_length     (energy / time budget)

Outputs:
{
  "action": "practice_concept",
  "concept_id": "...",
  "question_count": 10,
  "expected_minutes": 18,
  "rationale": [
    "Highest personal yield (4.2 marks expected)",
    "Decay severity = high (12 days since last attempt)",
    "Flow corridor: b∈[-0.1, 0.6], 14 calibrated questions in range",
    "Time-of-day pattern: 18% higher accuracy 6-8 AM, current is 7:15 AM"
  ],
  "confidence": 0.81,
  "alternatives": [
    { "action": "revise_concept", "concept_id": "...", "score_delta": 0.06 },
    { "action": "take_break", "score_delta": 0.04, "reason": "Last 3 sessions average accuracy declining" }
  ]
}
```

### 16.4 The explainability contract

The IGS is the most opaque component if built carelessly. Three
non-negotiables:

1. **Rationale is always shown.** Every recommendation has a
   three-bullet "why" panel.
2. **Top-2 alternatives are visible.** "We chose this; we considered
   Y (slightly less yield) and Z (you might be tired)." This builds
   trust faster than any single recommendation can.
3. **The student can override.** Clicking "Do something else" feeds
   back into the model — the override is a training signal.

### 16.5 Endpoints

| Endpoint | Returns |
|---|---|
| `GET /igs/{user_id}/next-action` | The top recommendation + alternatives + rationale |
| `GET /igs/{user_id}/today-plan` | A full study plan for today (3–5 actions in order) with total time |
| `GET /igs/{user_id}/week-plan` | A 7-day plan with milestone projections |
| `POST /igs/{user_id}/override` | Student picks a different action; the model learns |
| `GET /igs/{user_id}/explainability/{action_id}` | Deep-dive into why a specific recommendation was made |

### 16.6 The Daily Plan UI

The student's home becomes a calendar-like canvas:

```
Wednesday — 21 Oct                                  ⏱ 2 h 15 m budgeted

▶ 25 min · Organic Chem · Carbocations         [High yield · Decay risk]
▶ 15 min · Mock review of Tuesday's quiz       [Quick win · Calibration]
▶ 30 min · Mechanics — rotational dynamics     [Flow stretch +0.4σ]
▶ 10 min · Revision SM-2 queue (4 topics)      [Spacing protocol]
▶ 5 min  · Reflection: "What clicked today?"   [Metacognition]

You're on track to finish today's plan by 7 PM.
Skip an item · Reorder · See alternatives
```

The student never has to ask "what should I do next?" — the IGS has
already decided, justified, and made it editable.

---

## 17. Statistical foundations the platform must own

The four pillars above sit on a handful of statistical primitives.
These need to be **first-class platform infrastructure**, not
scattered across services.

### 17.1 The five primitives

| Primitive | Used in | Purpose |
|---|---|---|
| **Beta-Binomial conjugate** | Mastery, question P(correct) | Track a *distribution* over mastery, not just a point. Lets us say "0.62 ± 0.08" everywhere. |
| **Item Response Theory (3PL)** | ADP, EIS difficulty calibration | The gold standard for ability/difficulty estimation. Already partially shipped. |
| **Thompson sampling** | Question selection (ADP), AI suggestion variant choice | Balanced explore/exploit without manual tuning. |
| **Survival analysis** | Topic decay, dropout prediction | Models *when* something happens, not just *whether*. |
| **Hierarchical Bayesian models** | Yield forecasting, cohort-level decay | Borrow strength across topics/students with sparse data. |

### 17.2 Where they live in the codebase

A new shared library: `libs/python/alp-stats` (and Go equivalent) with
peer-reviewed implementations of:

- `BetaBinomialPosterior(prior_a, prior_b, successes, failures)` →
  posterior mean, credible interval, sample
- `IRTModel(items_calibration)` → θ estimation (EAP), p(correct |
  item, θ), fisher information
- `ThompsonSampler(arms)` → sample once, update, draw
- `KaplanMeier(events)` → survival curves with confidence bands
- `HierarchicalBayes(prior, observations)` → posterior mean per group

Every team that needs "mastery", "difficulty", "decay", or "ranking
under uncertainty" imports from this one place. No more bespoke
implementations.

### 17.3 The validation harness

Every statistical model must ship with a **regression test against
known data**:

- Beta-Binomial: must match `scipy.stats.beta` to 4 decimal places
- IRT: must match `mirt` (R's IRT gold-standard library) on a fixed
  test set
- Thompson sampling: regret bound test against UCB baseline
- Decay/survival: must reproduce a known clinical-trial dataset

This is non-negotiable. A buggy stats library produces silently wrong
recommendations for years.

---

## 18. The 18-month build plan

### 18.1 Phase 1 (months 1–3) — Foundation

Goals: prove the core math works end-to-end on one exam (JEE Main).

- Build `libs/python/alp-stats` with the five primitives + validation
  harness.
- Migrate the existing IRT engine into `alp-stats`.
- Build the EIS ingestion pipeline for JEE Main (last 10 years).
- Run the forecast model and ship `/exam-intel/{jee-main}/topic-yield`
  for internal review.
- Build the Analytics Decision Registry (§11.5.A).

**Exit criterion:** The content team agrees that the 2026 JEE Main
topic-yield ranking matches their intuition (top-10 overlap ≥ 8).

### 18.2 Phase 2 (months 4–6) — PCE + ADP

Goals: personalise the yield ranking and serve adaptive difficulty.

- Build `topic_yield_personal` computation, refresh job.
- Ship `/pce/{user_id}/yield-ranking` and the portfolio surface.
- Implement Thompson-sampling question selection in Quiz Go.
- Implement frustration/boredom detection.
- Ship `/adp/{user_id}/ability-trajectory` on the student insights
  hub.
- Run first controlled experiment: 50% of new users get personalised
  yield ranking; measure 30-day mastery slope.

**Exit criterion:** Controlled experiment shows ≥ 8% lift in 30-day
mastery slope for the personalised arm (p < 0.05).

### 18.3 Phase 3 (months 7–9) — IGS v1

Goals: replace the existing mission selector with the full IGS.

- Build the IGS decision function with all five score components.
- Ship `/igs/{user_id}/next-action` and the daily-plan UI.
- Wire the "why this?" explainability surface (top-3 alternatives).
- Add the override-feedback signal to the model.
- A/B test IGS vs the existing mission selector.

**Exit criterion:** IGS shows ≥ 15% lift in daily active mission
completion rate vs the legacy selector.

### 18.4 Phase 4 (months 10–12) — Expansion + Trust

Goals: roll EIS to every exam; build the trust layer.

- Onboard NEET, UPSC, CAT, CBSE (Class 10 & 12) — automated EIS
  pipeline per exam.
- Build the disaggregation panel (§11.4.4) — every outcome metric
  by language / city tier / SES.
- Build the explainability surface for AI suggestions (§11.5.C).
- Add reporting-rate caveats and confidence intervals everywhere.

**Exit criterion:** Every published exam has a `topic-yield` page
with confidence intervals; every recommendation has a rationale.

### 18.5 Phase 5 (months 13–18) — Differentiation

Goals: ship the moat features.

- Co-occurrence and "never-asked" risk lists per exam.
- The score-projection counterfactual (`if I master X, my score
  becomes Y`).
- The peer-signal collaborative-filtering layer in IGS.
- The after-life alumni tracker (§11.5.E).
- First RCT-grade study on platform-attributable score lift.
- Public "Insight of the Week" research stream (§11.5.F).

**Exit criterion:** A board-deck slide saying "students using the
IGS-guided plan score X% higher on JEE Main 2027 than the
matched-control group" — with peer-reviewed methodology.

---

## 19. What success looks like — the unified vision

Every prior section has framed pieces. Here is the integrated vision
the team is building toward:

> **The student opens the app.** The home screen shows three numbers:
> their projected JEE Main 2027 percentile (78th, ±4), their target
> (90th), and the gap (12 points). Underneath sits today's plan — 4
> actions, 2h 15m total, each with a one-line "why this?" rationale.
> The first action is "25 min on Carbocations." Why? Because
> Carbocations has the highest *personal yield* on the table right
> now: 78% probability of appearing in JEE, 12% of last year's marks
> sat on that concept, the student's current mastery is 0.31 (room
> to grow), and they last touched it 14 days ago (decay risk
> activated). They click in.
>
> The first question that appears is calibrated at b = -0.12 — just
> below their current θ of 0.05 on this concept, a confidence-builder
> opener. They get it right in 38 seconds. The system samples the
> next question from the corridor [b ∈ −0.05, 0.55]; they get a
> medium-hard one wrong. The system serves an even-stretched
> question; they get it right after 90 seconds. After 10 questions
> their θ has moved from 0.05 to 0.31 — that's measurable, durable
> progress.
>
> **The teacher logs in.** They see this student moved from at-risk
> to on-track this week. They see Carbocations as a class-wide
> weakness and schedule a 30-min live session for tomorrow. The IGS
> auto-adds "Wednesday's Carbocations class with Ms. Mehta" to every
> at-risk student's daily plan.
>
> **The institute owner logs in.** Cohort projected-percentile
> average is up 3 points week-over-week. The board-deck slide says
> "97% of our Class XII batch is on track to clear the cutoff" —
> with the disaggregation panel showing the figure holds across
> rural and urban students alike.
>
> **The platform admin logs in.** The controlled-experiment
> dashboard shows IGS-guided students score 14% higher than the
> held-out control after 90 days, with 95% CI [+9%, +19%]. Cost per
> mastery point is down 23% quarter-over-quarter.

That is the platform a year from now if these four pillars ship on
schedule. Every architectural decision in this document should be
judged against whether it moves the team closer to that paragraph.

---

## 20. Final synthesis

The catalogue (§1–4) is the *data*. The gaps (§6), presentation
(§7), drill-down (§9), and strategic review (§11) are the *display
discipline*. **The four pillars (§13–16) are where the actual
intelligence lives — they're what makes the platform a coach instead
of a quiz app.** The statistical foundations (§17) are the math that
makes the coach trustworthy. The 18-month roadmap (§18) is how it
gets built.

If only one section of this document survives, let it be §13–18: the
shift from displaying numbers to **producing causally-defensible,
explainable, statistically-rigorous recommendations** is the only
defensible position in the ed-tech market through the late 2020s.
Every other feature in the product depends on this layer being world-
class.

