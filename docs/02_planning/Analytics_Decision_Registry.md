# Analytics Decision Registry

> **Discipline:** every analytical surface in the platform must map to
> a *named decision* a specific role makes at a specific cadence. A
> surface that doesn't answer a named decision is decoration and
> enters deprecation review.

This registry is the source of truth for "which surfaces matter."
It feeds:

- **Stream A · Phase A1** — surfaces with no matching row are flagged
  for deprecation. New surfaces must add a row here *before* merging.
- **Stream A · Phase A4** — drives the audit checklist for the
  `<AnalyticsTile>` retrofit.
- **Stream B · Phase B3** — IGS candidate actions map onto these
  decisions; if a decision has no surface, the IGS has nowhere to
  surface its recommendation.

The registry is intentionally a flat table, not a hierarchy — every
decision has one owner, one cadence, and at least one surface. Multi-
decision surfaces (rare) get multiple rows.

---

## Conventions

- **Decision** — phrased as a *question the role asks themselves at
  the relevant cadence*. Specific, not generic. ❌ "How is my
  cohort?" ✅ "Which 5 students in this cohort need a one-on-one
  call this week?"
- **Owner role** — exactly one of: `STUDENT`, `TEACHER`,
  `INSTITUTE_OWNER`, `PARENT`, `PLATFORM_ADMIN`, `MODERATOR`,
  `TUTOR`, `CREATOR`.
- **Cadence** — how often the role makes this decision: `realtime`,
  `daily`, `weekly`, `monthly`, `quarterly`, `term`, `ad-hoc`.
- **Surface** — the route/endpoint that answers it. Multiple
  surfaces per decision is allowed if they serve different drill-
  depths.
- **Evidence level** — from the §11.5 ladder: 1 Observation,
  2 Cohort comparison, 3 Pre/post, 4 Quasi-experiment, 5 RCT.

---

## STUDENT decisions

| # | Decision | Cadence | Surface | Evidence |
|---|---|---|---|---|
| S1 | "What should I study right now?" | realtime | `/igs/{me}/next-action` (Stream B3) — fallback `/missions/today` until IGS ships | 2 |
| S2 | "Am I on track for my target exam percentile?" | daily | `/insights/{me}/snapshot`, `/readiness-band/{me}` | 1 |
| S3 | "Which topics are slipping away from me?" | weekly | `/analytics/topic-decay/{me}` | 2 |
| S4 | "Where am I weakest right now?" | weekly | `/analytics/concept-mastery/{me}`, `/analytics/student/{me}/error-patterns` | 1 |
| S5 | "How do I rank against my cohort?" | weekly | `/analytics/peer-percentile/{me}` (k-anonymity ≥ 30) | 2 |
| S6 | "How much did I improve last week vs the week before?" | weekly | self-vs-past-self spark (A3.1) | 1 |
| S7 | "When am I most accurate during the day?" | weekly | `/analytics/circadian/{me}` (A3.2) | 1 |
| S8 | "What's the next mock I should take?" | weekly | curated-library + AI-suggest crash drill | 1 |
| S9 | "Will I finish my syllabus before exam day?" | weekly | personal-syllabus-forecast (A3.6) | 2 |
| S10 | "What's my admission chance at the colleges I want?" | monthly | per-college admission projection (A3.8) | 2 |
| S11 | "How much did I learn this week vs how much I planned?" | weekly | planned-vs-actual study mix (A3.5) | 1 |
| S12 | "Why did the system recommend this?" | ad-hoc | `/igs/{me}/explainability/{action_id}` (Stream B3) | 1 |

## TEACHER decisions

| # | Decision | Cadence | Surface | Evidence |
|---|---|---|---|---|
| T1 | "Which students need my time this week?" | weekly | `/analytics/predictive/cohorts/{cid}/at-risk` | 3 |
| T2 | "What should I re-teach tomorrow?" | daily | `/analytics/cohorts/{cid}/topic-heatmap` | 2 |
| T3 | "Who hasn't logged in in the last 7 days?" | daily | `/analytics/cohorts/{cid}/engagement` | 1 |
| T4 | "How is my cohort doing this week vs last week?" | weekly | `/analytics/cohorts/{cid}/trend` | 1 |
| T5 | "Did Monday's assignment land?" | daily | `/analytics/cohorts/{cid}/assignment-compliance` | 1 |
| T6 | "Which student needs a parent-teacher conversation?" | weekly | `/analytics/cohorts/{cid}/students/{uid}` deep-dive | 2 |
| T7 | "How effective is my teaching this term?" | term | `/analytics/teacher/{me}/self` (A2.9) | 4 |
| T8 | "How does Batch A compare to Batch B?" | term | `/analytics/cohorts/compare?ids=A,B` (A2.10) | 2 |
| T9 | "What common mistakes is my cohort making?" | weekly | `/analytics/cohorts/{cid}/common-mistakes` | 1 |
| T10 | "What's my doubt-resolution speed?" | weekly | `/analytics/teacher/{me}/self` (A2.11) | 1 |

## INSTITUTE_OWNER decisions

| # | Decision | Cadence | Surface | Evidence |
|---|---|---|---|---|
| I1 | "Are my students on track for the target exam?" | weekly | `/analytics/institution/{id}/overview` | 2 |
| I2 | "Which cohorts are healthy and which are coasting?" | weekly | `/analytics/institution/{id}/cohorts` | 2 |
| I3 | "Which teachers produce the most readiness lift?" | term | `/analytics/institution/{id}/teacher-effectiveness` | 4 |
| I4 | "Which subjects are weakest across the institute?" | term | `/analytics/institution/{id}/subject-gaps` | 2 |
| I5 | "How does my institute compare to peers?" | term | `/analytics/institution/{id}/benchmark` (k ≥ 5) | 2 |
| I6 | "Will Batch C finish syllabus by exam date?" | weekly | cohort-completion-forecast (A2.6) | 3 |
| I7 | "What's my placement record from last year's batch?" | term | alumni tracker (A5.5 / B5.5) | 1 |
| I8 | "How are teachers utilised by day-of-week?" | weekly | `/analytics/institution/{id}/teacher-load` (A2.8) | 1 |
| I9 | "Is the platform working equally well for all student strata?" | quarterly | disaggregation panel on outcome surfaces (A1.3, A4) | 4 |

## PARENT decisions (new role, ships A2.7)

| # | Decision | Cadence | Surface | Evidence |
|---|---|---|---|---|
| P1 | "How is my child doing this week?" | weekly | weekly-digest email (A2.7) | 1 |
| P2 | "Is my child practising every day?" | daily | `/analytics/daily-activity/{child_id}` (read-only) | 1 |
| P3 | "What is my child weakest at?" | weekly | `/analytics/concept-mastery/{child_id}` (read-only) | 1 |

## PLATFORM_ADMIN decisions

| # | Decision | Cadence | Surface | Evidence |
|---|---|---|---|---|
| A1 | "Where do prospective users drop off in the funnel?" | weekly | `/analytics/platform/funnels` | 1 |
| A2 | "Is the product becoming stickier?" | weekly | `/analytics/platform/dau-mau` | 1 |
| A3 | "Did this week's release affect retention?" | weekly | `/analytics/platform/retention` | 3 |
| A4 | "Are any items in the question bank broken?" | daily | `/analytics/platform/question-quality` | 1 |
| A5 | "Are exam mocks predictive of real-exam outcomes?" | quarterly | `/analytics/platform/outcome-correlation/{exam_code}` | 4 |
| A6 | "What's our unit economics per student?" | weekly | `/analytics/platform/cost-per-student` | 1 |
| A7 | "Are AI costs runaway?" | daily | `/admin/ai-cost` | 1 |
| A8 | "Did experiment X work?" | per-experiment | `/admin/experiments` (A2.1) | 5 |
| A9 | "Which AI templates are cheap but low-quality?" | weekly | `/admin/ai-cost` × AI quality scorecard (A2.2) | 2 |
| A10 | "Are our SLOs being met?" | realtime | `/admin/slo` (A2.3) | 1 |
| A11 | "What are users searching for that we can't answer?" | weekly | `/admin/search/failed-queries` (A2.4) | 1 |
| A12 | "Which notifications convert and which don't?" | weekly | notification-funnel (A2.5) | 1 |
| A13 | "Is there a data-quality regression in the pipeline?" | daily | `/admin/data-quality` (A3.9) | 1 |
| A14 | "Is the IGS-driven plan beating the legacy mission selector?" | per-experiment | experiments dashboard, primary metric: mission completion rate | 5 |

## MODERATOR decisions

| # | Decision | Cadence | Surface | Evidence |
|---|---|---|---|---|
| M1 | "Which questions are flagged for review?" | daily | `/admin/grader-queue`, `/admin/calibration-dashboard` | 1 |
| M2 | "Which curated tests are pending approval?" | daily | `/curated/review` (existing) | 1 |
| M3 | "Which clan-chat lines should be hidden?" | realtime | `/moderation/reports/chat` (deferred) | 1 |
| M4 | "Is platform fairness slipping by language / city tier?" | quarterly | disaggregation panel (A1.3) + fairness-review meeting (A5.3) | 4 |

## TUTOR decisions

| # | Decision | Cadence | Surface | Evidence |
|---|---|---|---|---|
| TU1 | "How does my session rate / rating compare to peers?" | weekly | `/tutor/dashboard` | 2 |
| TU2 | "Which students have requested follow-ups?" | daily | `/tutor/bookings` queue | 1 |

## CREATOR decisions

| # | Decision | Cadence | Surface | Evidence |
|---|---|---|---|---|
| C1 | "How much did I earn this month?" | monthly | `/creator/earnings` | 1 |
| C2 | "Which of my courses sold the most?" | monthly | `/creator/courses` analytics | 1 |
| C3 | "Which of my authored questions are widely used?" | term | question-authoring metric (A2 follow-up) | 1 |

---

## Deprecation candidates

Surfaces in the platform that do NOT map to any row above are
candidates for deprecation. Phase A1 will identify these via a
sweep across the codebase; the list ends up in
`docs/02_planning/Tile_Retrofit_Audit.md` (A4 deliverable).

A surface enters the candidate list when:

1. No row in this registry references it, AND
2. Its WAU among the target role is < 5% (per A1.5 adoption tracking).

It leaves the candidate list when:

- A new row is added here justifying its existence, OR
- It is removed from the code (verified in `git log` after a sprint).

---

## Adding a new row

When a new analytical surface is proposed:

1. **Open a PR that adds the row to this file** — *before* any
   implementation work begins.
2. **Cite the role and cadence specifically.** "Sometimes useful for
   teachers" is not a cadence; "weekly during exam-prep cycle" is.
3. **Set the evidence level honestly.** Most surfaces are level 1
   (Observation) at launch. Higher levels require the experiment
   framework (A2.1) to be in place.
4. **Link the surface to a `<AnalyticsTileSpec>`** (A4) — the
   TypeScript type contract that enforces the §7–§9 grammar.

A PR that adds a tile without adding (or updating) a row in this
registry is blocked by code review.

---

## Cross-references

- Catalogue: [Platform_Analytics_Catalogue.md](Platform_Analytics_Catalogue.md)
- Presentation grammar: same doc §7
- Drill-down rules: same doc §9
- Strategic review: same doc §11
- Build plan: [/home/deepak/.claude/plans/can-you-spec-all-functional-barto.md](../../../.claude/plans/can-you-spec-all-functional-barto.md)
