# Multi-Role Statistical Analysis — Implementation Plan

**Companion to**: [`19_Multi_Role_Analytics_Design.md`](./19_Multi_Role_Analytics_Design.md)
**Status**: Draft — for review
**Estimated total effort**: ~16 weeks across backend + mobile + 3 web apps; can parallelize teacher + admin tracks for ~12 weeks calendar-time

---

## 0. Sequencing principle

The single foundational dependency is **`tenant_id` on analytics tables** — without it, no institute scoping is possible. So Sprint A1 lays the groundwork; everything else builds on it.

Within that constraint, sequencing is **persona-by-persona, smallest-blast-radius-first**:

```
A1  Foundation: tenant_id backfill + aggregate tables
    │
    ▼
A2  Student: surface unused backend signal on mobile (highest leverage / 0 backend work)
    │
    ▼
A3  Teacher: extend cohort dashboards (largest gap relative to backend availability)
    │
    ▼
A4  Cross-role flows (Teacher → Student manual interventions)
    │
    ▼
A5  Institute admin: net-new screens (web-admin)
    │
    ▼
A6  Platform admin: business analytics
    │
    ▼
A7  Outcome correlation + benchmarking
    │
    ▼
A8  Hardening: caching, audit log, freshness widgets, accessibility
```

Sprints A2 and A3 can run in parallel after A1 lands (different surfaces, different teams).

---

## Sprint A1 — Foundation (2 weeks)

### Backend changes

1. **Add `tenant_id` to analytics tables.**
   - File: `services/engagement/alembic/analytics/versions/0NN_add_tenant_id.py`
   - Tables: `mastery`, `readiness`, `processed_sessions`, `session_section_stats`, `concept_mastery`, `bloom_mastery`, `error_classifications`, `revision_queue`, `peer_percentile`, `cohort_percentile_distribution`.
   - Backfill: one-shot script reads `identity.users.tenant_id` and updates analytics rows in batches of 10k.
   - Going forward: `quiz.session.processed` event already carries `tenant_id`; the analytics consumer (`services/engagement/src/engagement/analytics/processors/`) writes it on every new row.

2. **Add aggregate tables.** New migration creates the four tables defined in §4.2 of the design doc:
   - `institution_aggregates`
   - `teacher_aggregates`
   - `platform_funnels`
   - `real_exam_outcomes`
   - `manual_interventions`

3. **Add `educator_notes` table** in identity service (new migration in `services/identity/alembic/auth/`).

4. **Nightly rollup worker.** New file `services/engagement/src/engagement/jobs/aggregate_rollups.py`. Reads from raw analytics tables, writes to `institution_aggregates` + `teacher_aggregates`. Triggered by NATS scheduler at 02:00 UTC. Idempotent (truncates and rewrites the snapshot date).

5. **Funnel event emitter.** New module `services/engagement/src/engagement/analytics/funnel_events.py`. Subscribes to: identity user-created (signup), profile exams updated (exam_picked), quiz session submitted first time (first_session), payment subscription created (premium_purchased). Writes to `platform_funnels`.

### Verification

- Run migration on a copy of staging DB; backfill completes in < 30 minutes for the seeded cohort.
- Drop the rollup worker into local docker-compose; trigger manually; verify `institution_aggregates` populates correctly for 5 seeded institutes.
- Submit a fake quiz session via the seed user; verify `platform_funnels` gets a `first_session` event.
- New unit tests in `services/engagement/tests/analytics/` for the rollup job and funnel emitter.

### Risks

- Backfill might take longer in real prod data. Mitigation: run online in 10k-row batches, gated by a feature flag that flips reads from raw → aggregated tables only after backfill completes.

---

## Sprint A2 — Student: Surface unused backend signal (1.5 weeks, mobile-only)

The audit showed mobile uses ~40% of available student endpoints. This sprint surfaces the rest. **Zero new backend work** — pure mobile UI.

### Mobile changes

6. **Concept mastery breakdown** — new card on Exam Dashboard. Calls `/analytics/concept-mastery/{user_id}`. Bar chart per concept (top 8). New widget `lib/widgets/analytics/concept_mastery_card.dart`.

7. **Error patterns card** — new card on Exam Dashboard. Calls `/analytics/student/{user_id}/error-patterns`. Top 3 error tags + per-tag count + sample question stem. New widget `lib/widgets/analytics/error_patterns_card.dart`.

8. **Peer percentile pill** — new card on Home (above the My Exams row). Calls `/analytics/peer-percentile/{user_id}?examId=...`. Shows "You're in the top 28% of CBSE 8 students this week" with tap-tooltip explaining the cohort definition.

9. **Revision queue card** — new card on Exam Dashboard. Calls `/analytics/revision/{user_id}`. Shows N due topics with one-tap "Start revision" button.

10. **Multi-profile radar** — new section on Progress tab. Calls `/analytics/student/{user_id}/multi-profile`. 9-dim radar chart (concept, bloom, fluency, confidence, etc.). New widget `lib/widgets/charts/radar_chart.dart`.

11. **Insights snapshot** — new card on Home, top of "Today" section, only when fresh data exists. Calls `/analytics/insights/{user_id}/snapshot`. Auto-generated narrative with 3 sub-bullets.

12. **Time-by-topic chart** — new section on Progress tab. Calls `/analytics/student/{user_id}/time-stats`. Stacked horizontal bar — minutes per topic. (Backend already exists per audit — `time-stats` endpoint.)

### Verification

- Sign in as a seeded user with mastery rows; navigate Home / Exam Dashboard / Progress; confirm every new card renders without errors.
- Empty-state cases: brand-new user, no data — every card shows a "no data yet" empty state, never a crash.
- Widget tests for each new card with mocked HTTP responses (mirroring the `MockClient` pattern in `apps/mobile/test/widget_test.dart`).
- Visual: every chart hits WCAG AA contrast.

### Cuts (deferred)

- "Goal progression" chart (needs Sprint A1 minute tracking). Push to Sprint A8.
- "Peak hours" heatmap. Push to Sprint A8 — needs minute-of-day tracking on session start.

---

## Sprint A3 — Teacher: Cohort deep-dive (2.5 weeks)

### Backend changes

13. New endpoints in `services/engagement/src/engagement/analytics/routes.py`:
    - `GET /analytics/teacher/{teacher_id}/dashboard`
    - `GET /analytics/teacher/{teacher_id}/cohort/{cohort_id}/topic-heatmap`
    - `GET /analytics/teacher/{teacher_id}/cohort/{cohort_id}/assignment-compliance`
    - `GET /analytics/teacher/{teacher_id}/cohort/{cohort_id}/engagement`
    - `GET /analytics/teacher/{teacher_id}/cohort/{cohort_id}/trend`

14. Each endpoint enforces role-effective query cap (§3.3 of design): `cohort_id ∈ educator_assignments.where(educator_id=teacher_id)`. Add a shared dependency `require_teacher_scope_for_cohort` in `services/engagement/src/engagement/security.py`.

15. New module `services/engagement/src/engagement/analytics/teacher_dashboard.py` — composes existing functions (`cohort_summary`, `cohort_leaderboard`, `predictive`) plus new aggregations.

### Web portal changes

16. New routes under [apps/web-portal/src/routes.tsx](apps/web-portal/src/routes.tsx):
    - `/teacher/dashboard` — overview of all assigned cohorts. New page `apps/web-portal/src/pages/TeacherDashboard.tsx`.
    - `/teacher/cohorts/:id/topic-heatmap` — sortable per-topic table with color-graded mastery cells. New page `apps/web-portal/src/pages/CohortTopicHeatmap.tsx`.
    - `/teacher/cohorts/:id/trend` — line chart of cohort readiness over 7/30/90 days. New page `apps/web-portal/src/pages/CohortTrend.tsx`.
    - `/teacher/cohorts/:id/engagement` — student × day grid with last-active timestamps. New page `apps/web-portal/src/pages/CohortEngagement.tsx`.
    - `/teacher/cohorts/:id/assignments` — assignment compliance matrix. New page `apps/web-portal/src/pages/CohortAssignmentCompliance.tsx`.
    - `/teacher/cohorts/:id/students/:userId` — student deep-dive. New page `apps/web-portal/src/pages/StudentDeepDive.tsx`.

17. Extend [apps/web-portal/src/pages/CohortLeaderboard.tsx](apps/web-portal/src/pages/CohortLeaderboard.tsx) with a sub-nav linking to the new pages.

18. New API client methods in [apps/web-portal/src/lib/phase5-api.ts](apps/web-portal/src/lib/phase5-api.ts) for the new endpoints.

### Verification

- Sign in as a seeded LEAD_TEACHER; visit `/teacher/dashboard`; confirm assigned cohorts render with summary stats.
- Click into a cohort; navigate the 5 sub-tabs; confirm each renders correctly.
- Sign in as another LEAD_TEACHER not assigned to that cohort; confirm 403 from the API.
- New Cypress e2e tests in `apps/web-portal/e2e/` for the teacher dashboard flow.

---

## Sprint A4 — Cross-role flows: Teacher → Student (1 week)

### Backend changes

19. **`POST /analytics/manual-interventions`** — teacher flags a student-topic-action. Writes to `manual_interventions` table.

20. **Predictive-recommender prepend logic.** In `services/engagement/src/engagement/analytics/predictive.py`, when computing recommendations for a student, check `manual_interventions` first. If any unfulfilled flag exists for this student, prepend it to the recommendations list with a `source: "teacher"` tag.

21. **Educator notes endpoints** in identity service:
    - `GET /educator/notes/{student_id}`
    - `POST /educator/notes`
    - `PATCH /educator/notes/{id}`
    - `DELETE /educator/notes/{id}`
   Auth: must be educator in same cohort as student.

22. **NATS event** `educator.intervention.created` — fired on flag creation. The (yet-to-be-implemented) push notification service consumes this and notifies the student's mobile.

### Web portal changes

23. Add "Flag for revision" button on `StudentDeepDive` page (Sprint A3). Modal with topic + action picker. Posts to `/analytics/manual-interventions`.

24. Add "Notes" panel on `StudentDeepDive`. Reads `/educator/notes/{student_id}`. Inline create/edit/delete.

### Mobile changes

25. **Update GuidedNextSteps card** ([apps/mobile/lib/widgets/home_cards.dart](apps/mobile/lib/widgets/home_cards.dart)). When a step has `source: "teacher"`, prepend a small badge "from {educator name}" with the educator's initials avatar. Reuse existing card structure.

### Verification

- Teacher flags a student-topic-action via web portal; verify `manual_interventions` row inserted.
- Student opens mobile app; verify the flagged topic appears at top of Guided Next Steps with the teacher-source badge.
- Student completes practice on the flagged topic; verify `manual_interventions.fulfilled_at` updates.
- Teacher revisits dashboard; verify intervention-effectiveness card shows the fulfilled flag.

---

## Sprint A5 — Institute admin: Web-admin role-scoped views (2 weeks)

### Backend changes

26. New endpoints (all gated to `admin_level: INSTITUTION` matching `tenant_id`, or `PLATFORM_ADMIN`):
    - `GET /analytics/institution/{tenant_id}/overview`
    - `GET /analytics/institution/{tenant_id}/cohorts`
    - `GET /analytics/institution/{tenant_id}/teacher-effectiveness`
    - `GET /analytics/institution/{tenant_id}/subject-gaps`
    - `GET /analytics/institution/{tenant_id}/trend`
    - `GET /analytics/institution/{tenant_id}/marketplace-roi`
    - `POST /analytics/institution/{tenant_id}/cohorts/{cohort_id}/target`

27. Most read endpoints query `institution_aggregates` (rolled up by Sprint A1's worker).

28. Marketplace ROI endpoint joins purchases (services/marketplace) with mastery (services/engagement). Accepts a window param.

### Web admin changes

29. New top-level route in [apps/web-admin/src/routes.tsx](apps/web-admin/src/routes.tsx):
    - `/admin/institutes/:tenantId` — wraps a tabbed layout with: Overview / Cohorts / Teachers / Subjects / Trend / Marketplace / Reports

30. Reuse the existing `Tenants.tsx` list page; add an "Analytics" action per row that links to the new route.

31. Six new pages under `apps/web-admin/src/pages/institute/`:
    - `Overview.tsx` — 4 stat tiles + trend sparkline
    - `Cohorts.tsx` — sortable list with per-cohort summary
    - `TeacherEffectiveness.tsx` — list with caveats banner at top
    - `SubjectGaps.tsx` — color-graded heatmap
    - `Trend.tsx` — line chart 30/90/365
    - `Marketplace.tsx` — purchases vs outcomes scatter

32. New API client in [apps/web-admin/src/lib/api.ts](apps/web-admin/src/lib/api.ts).

### Verification

- Seed 5 institutes with realistic cohort + mastery data.
- Sign in as PLATFORM_ADMIN; navigate to a tenant's analytics; confirm every tab renders.
- Sign in as INSTITUTION admin (need to seed one); confirm only own tenant accessible.
- Cypress e2e for the institute admin flow.

---

## Sprint A6 — Platform admin: Business analytics (2 weeks)

### Backend changes

33. New endpoints under `/analytics/platform/*`:
    - `GET /analytics/platform/funnels`
    - `GET /analytics/platform/dau-mau`
    - `GET /analytics/platform/retention`
    - `GET /analytics/platform/question-quality`
    - `GET /analytics/platform/mock-distributions/{exam_code}`
    - `GET /analytics/platform/subscription-health`
    - `GET /analytics/platform/tutor-marketplace`
    - `GET /analytics/platform/cost-per-student`

34. Funnels read from `platform_funnels` (Sprint A1).

35. DAU/MAU + retention queries are aggregations over `processed_sessions`. Add materialized views for each window.

36. Question-quality endpoint computes IRT discrimination-difficulty pairs from response history. New module `services/engagement/src/engagement/analytics/question_quality.py`.

37. Subscription health joins payment service data via cross-DB query (already established pattern; see `services/quiz/migrations/012_backfill_questions_from_content.up.sql`).

### Web admin changes

38. New routes under `/admin/platform/*`:
    - `/admin/platform/funnels`
    - `/admin/platform/retention`
    - `/admin/platform/question-quality`
    - `/admin/platform/mock-distributions`
    - `/admin/platform/subscriptions`
    - `/admin/platform/marketplace`
    - `/admin/platform/cost-per-student`

39. Eight new pages under `apps/web-admin/src/pages/platform/`. Reuse charts standardized in design doc §6.5.

### Verification

- Seed 1k synthetic users with funnel-event mix; verify funnel renders with realistic drop-off.
- Cost-per-student must reconcile against the existing `CostDashboard.tsx` totals.
- Question-quality endpoint must surface known low-discrimination items from the seed.

---

## Sprint A7 — Outcome correlation + benchmarking (1.5 weeks)

### Backend changes

40. **Real-exam outcome opt-in.** Modify `services/identity/profile/routes.py PUT /profile/me`. New nullable fields: `realExamOutcomes: [{examCode, score, rank, admittedTo, reportedAt}]`.

41. New mobile + web "Report your exam result" modal; fires once after a mock test.

42. **`GET /analytics/platform/outcome-correlation/{exam_code}`** — joins `real_exam_outcomes` with last-30d-pre-exam mastery. Returns a regression line + r² + sample size disclaimer.

43. **`GET /analytics/institution/{tenant_id}/benchmark`** — anonymized. Median readiness + n_students for similar institutes (same primary exam, ±20% size). k-anonymity threshold: minimum 5 institutes in the comparison set.

44. **Platform-published benchmarks.** New endpoint `POST /analytics/platform/reports/publish` — admin packages an anonymized aggregate as a benchmark feed; institutes consume via `GET /analytics/institution/{tenant_id}/published-benchmarks`.

### Web admin + portal changes

45. New page `apps/web-admin/src/pages/platform/Outcomes.tsx` — outcome correlation per exam.

46. New page `apps/web-admin/src/pages/institute/Benchmark.tsx` (Sprint A5 link enabled).

47. **Mobile + web report-result modal.** New widget `apps/mobile/lib/widgets/report_outcome_dialog.dart` and corresponding web component. Fires after final mock attempt.

### Verification

- Seed 100 fake outcomes across exams; verify correlation chart renders with realistic r².
- Verify benchmark view hides when fewer than 5 similar institutes exist.

---

## Sprint A8 — Hardening + last-mile features (2 weeks)

### Performance + reliability

48. **Redis caching layer.** New gateway middleware `services/gateway/src/gateway/middleware/analytics_cache.py`. Role-aware key prefix; TTL 60s for dashboards, 5min for rollups.

49. **Freshness widget.** Every dashboard page renders a small "Data as of: 2 hours ago" footer. Implementation: every endpoint adds `dataAsOf: ISO timestamp` to its response; UI surfaces it.

50. **Page on stale rollups.** New monitor that pages on-call if `institution_aggregates.snapshot_date` is > 36h old.

### Auditing + privacy

51. **Audit log entries** on PLATFORM_ADMIN identifiable-data access. Extends existing `services/identity/auth/audit_log` table.

52. **Watermark generator** for PDF/CSV exports. New module `services/engagement/src/engagement/exports/watermark.py`. Adds recipient + date header.

53. **Real-exam outcome opt-in audit** — every read of `real_exam_outcomes` writes an audit row.

### Accessibility + i18n

54. **Screen-reader fallbacks** for all charts. Each chart component accepts an `ariaSummary` prop with a one-sentence description.

55. **Keyboard navigation** for drill-downs. Tab order verified on every new page.

56. **i18n strings** for analytics terminology (en + hi). New keys added to `apps/mobile/lib/l10n/strings.dart` and the corresponding web catalog.

### Last-mile student features

57. **Goal progression chart** on Progress tab. Calls `/analytics/student/{user_id}/goal-progression`. Weekly trajectory vs target date.

58. **Peak hours heatmap** on Progress tab. New endpoint `/analytics/student/{user_id}/peak-hours`. Time-of-day × day-of-week grid.

### Reports

59. **Monthly PDF report generator** for institutes. Triggered by `POST /analytics/institution/{tenant_id}/reports/monthly`. Async (returns 202 + webhook). Composes overview + cohort summaries + subject gaps + teacher list.

60. **Auto-generated narrative insights**. New module `services/engagement/src/engagement/analytics/narrative.py`. Uses templated LLM prompt (cost-conscious — only refresh when underlying data moves > 5%). Output cached for 24h.

### Verification

- Cache layer reduces P95 by ≥ 40% on dashboard endpoints under load.
- Stale rollup detection triggers a synthetic page.
- All new charts pass screen-reader smoke test.
- Monthly report PDF renders correctly for the seeded institute; arrives at the requesting admin's email.

---

## Cumulative effort estimate

| Sprint | Weeks | Backend | Mobile | Web portal | Web admin | Notes |
|---|---|---|---|---|---|---|
| A1 | 2 | ✅ heavy | — | — | — | Foundation; blocks everything |
| A2 | 1.5 | — | ✅ heavy | — | — | Pure UI surfacing |
| A3 | 2.5 | ✅ medium | — | ✅ heavy | — | New teacher routes |
| A4 | 1 | ✅ small | ✅ small | ✅ small | — | Cross-role flow |
| A5 | 2 | ✅ medium | — | — | ✅ heavy | Institute pages |
| A6 | 2 | ✅ medium | — | — | ✅ heavy | Platform business analytics |
| A7 | 1.5 | ✅ medium | ✅ small | ✅ small | ✅ small | Outcome correlation |
| A8 | 2 | ✅ medium | ✅ medium | ✅ medium | ✅ medium | Hardening + final features |
| **Total** | **14.5** | | | | | |

Calendar-time can compress to ~12 weeks if A2 + A3 run in parallel after A1, and A5 + A6 run in parallel.

---

## Sprint sequencing dependencies

```
A1 ──┬─ A2 ─────────────────┐
     │                      │
     ├─ A3 ── A4 ───────────┤
     │                      ├─ A8
     ├─ A5 ── A7 ───────────┤
     │                      │
     └─ A6 ─────────────────┘
```

A2 and A3 may run in parallel (different surfaces).
A5 and A6 may run in parallel after A1 (different web pages, no overlap).
A4 depends on A3 (needs the teacher dashboard to flag from).
A7 depends on A5 + A6 (benchmarking touches both).
A8 closes everything.

---

## Risks & open questions

| Risk | Mitigation | Owner |
|---|---|---|
| `tenant_id` backfill takes longer than 30 minutes on prod data | Run online in batches; feature-flag the switch from raw → aggregate reads | Backend lead |
| Teacher-effectiveness dashboard misused for performance reviews | Prominent caveats banner; document confounders; consider gating behind admin opt-in per institute | Product |
| Real-exam outcomes are sparsely reported (most users skip) | Begin collection via opt-in modal post-mock; correlation surfaces only after n ≥ 50 | Product |
| Anonymized benchmark with k < 5 leaks identity by inference | Hard-floor k = 5; if fewer institutes match, hide the comparison entirely | Privacy |
| Aggregate worker fails silently → stale dashboards | Sprint A8's freshness widget + paging monitor mitigates | SRE |
| Cache invalidation drift between read and write paths | Standardize on Redis pub-sub for invalidation; add cache-hit-rate dashboard | Backend lead |

| Open question | Required by sprint |
|---|---|
| Should teacher-effectiveness be visible to other teachers? | A3 |
| Minimum cohort size for k-anonymity (likely 5)? | A7 |
| Verify real-exam scores against external source? | A7 |
| Mobile institute-admin app — required, or web-only? | A5 |
| LLM model choice for narrative insights (cost-quality tradeoff) | A8 |

---

## Success metrics (per sprint)

- **A1**: tenant_id present on every analytics row; aggregate worker runs nightly without error for 7 consecutive days.
- **A2**: at least 6 new analytics surfaces visible on mobile (concept mastery, error patterns, peer percentile, revision queue, multi-profile, insights snapshot).
- **A3**: teachers can navigate `/teacher/dashboard` and 5 sub-pages without seeing any 404 or 500.
- **A4**: at least 1 manual intervention round-trip (teacher flags → student sees → student completes → teacher sees fulfilled) tested end-to-end.
- **A5**: institute admin can view all 6 dashboards for their own tenant only.
- **A6**: platform admin can view DAU/MAU, funnel, retention, question-quality, mock distributions, subscription health, tutor marketplace, cost-per-student.
- **A7**: outcome correlation chart renders with at least 50 self-reported data points; institute benchmark hides when k < 5.
- **A8**: every dashboard endpoint P95 < 500ms; cache hit rate > 60%; every chart has an `ariaSummary`.

---

## Out of scope (deferred)

Per design doc §8: A/B testing infra, real-time streamed dashboards (beyond leaderboard SSE), custom-layout dashboards, parent-facing analytics, per-question coaching feedback authoring. Each is a separate epic.
