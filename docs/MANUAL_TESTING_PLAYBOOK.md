# Manual Testing Playbook — Phase 1A through 1D

End-to-end manual test script for every feature shipped in Phase 1A
(foundation), 1B (wired existing primitives), 1C (9 new analytics
primitives), and 1D (9 competitive parity features). Designed to be
walked top-to-bottom in ~90 minutes against the local stack with seeded
simulation data.

> **Pre-flight:** start the stack (`docker compose -f infrastructure/docker/docker-compose.yml up -d`),
> wait until `engagement`, `learning`, `quiz`, `identity` are healthy,
> then run the seed scripts in [Step 0](#step-0--prerequisites--seeding).

---

## Test environment

| Service                | URL                              |
| ---------------------- | -------------------------------- |
| Web — Student          | http://localhost:35173           |
| Web — Portal (teacher) | http://localhost:35174           |
| Web — Admin            | http://localhost:35175           |
| Engagement API         | http://localhost:38100           |
| Learning API           | http://localhost:38101           |
| Quiz API               | http://localhost:38011           |
| Identity API           | http://localhost:38001           |

**Login credentials** — every seeded user has password `Password123!`.

| Persona             | Email                                  | Notes                                    |
| ------------------- | -------------------------------------- | ---------------------------------------- |
| Student (default)   | `student@alp.dev`                      | Has rich session/mastery/confidence data |
| Student (Aurora)    | `student0.aurora-coaching@e2e.alp.dev` | Member of Aurora `JEE Main 2027 Batch`   |
| Teacher (Aurora)    | `teacher@alp.dev`                      | Aurora cohort owner                      |
| Moderator           | `moderator@alp.dev`                    | Approves community flashcard decks       |
| Platform admin      | `admin@alp.dev`                        | Full drill access                        |

**Seeded reference IDs** (handy for curl checks)

| Object                | UUID                                     |
| --------------------- | ---------------------------------------- |
| Aurora tenant         | `55555555-0000-0000-0000-000000000001`   |
| Aurora cohort (JEE)   | `66666666-0000-0000-0000-000000000001`   |
| `student@alp.dev`     | `00000000-0000-0000-0000-000000000001`   |
| Sample weak topic     | `33333333-0000-0000-0000-000000000002`   |

---

## Step 0 — Prerequisites & seeding

```bash
# 1. Run alembic migrations (idempotent)
docker exec alp-local-learning-1 sh -c \
  "cd /repo/services/learning && alembic -c alembic_content.ini upgrade head"
docker exec alp-local-identity-1 sh -c \
  "cd /repo/services/identity && alembic -c alembic_auth.ini upgrade head"

# 2. Bulk-tag every question with its primary concept (idempotent)
docker cp scripts/seed_question_concepts.py alp-local-engagement-1:/tmp/qc.py
docker exec alp-local-engagement-1 python /tmp/qc.py

# 3. Seed 60 days of activity for every student (idempotent, ~3 min)
docker cp scripts/seed_analytics_simulation.py alp-local-engagement-1:/tmp/sim.py
docker exec alp-local-engagement-1 python /tmp/sim.py

# 4. Backfill session_item_outcomes (used by confidence-gap)
docker cp scripts/backfill_session_item_outcomes.py alp-local-engagement-1:/tmp/bf.py
docker exec alp-local-engagement-1 python /tmp/bf.py

# 4b. Backfill mastery.tenant_id + refresh mv_drill_topic
#     (only needed if you seeded with an older sim.py that didn't set tenant_id;
#      the latest sim.py does this in-line, so this is a safety net)
docker cp scripts/backfill_mastery_tenant_id.py alp-local-engagement-1:/tmp/bf_t.py
docker exec alp-local-engagement-1 python /tmp/bf_t.py

# 5. Add confidence ratings for student@alp.dev specifically
docker cp scripts/seed_confidence_for_user.py alp-local-engagement-1:/tmp/cf.py
docker exec alp-local-engagement-1 python /tmp/cf.py 00000000-0000-0000-0000-000000000001

# 6. Opt 30 students into the national leaderboard
docker exec alp-local-postgres-1 psql -U postgres -d identity -c "
UPDATE auth_schema.users
   SET opt_in_national_leaderboard = TRUE
 WHERE id IN (
   SELECT id FROM auth_schema.users WHERE role = 'STUDENT' AND NOT is_deleted
   ORDER BY random() LIMIT 30
 )"
```

**Expected after seeding** — verify with:

```bash
docker exec alp-local-postgres-1 psql -U postgres -d engagement -c "
SELECT 'mastery' AS tbl, COUNT(*) AS rows FROM analytics_schema.mastery
UNION ALL SELECT 'readiness', COUNT(*) FROM analytics_schema.readiness
UNION ALL SELECT 'daily_activity', COUNT(*) FROM analytics_schema.daily_activity
UNION ALL SELECT 'real_exam_outcomes', COUNT(*) FROM analytics_schema.real_exam_outcomes
UNION ALL SELECT 'user_xp', COUNT(*) FROM analytics_schema.user_xp"
```

You should see `mastery ≥ 400`, `readiness ≥ 50`, `daily_activity ≥ 1000`, `real_exam_outcomes ≥ 25`, `user_xp ≥ 50`.

---

## Persona 1 — STUDENT walkthrough

> Login: `student@alp.dev` / `Password123!` at http://localhost:35173

### 1.1 Home dashboard
- [ ] **PASS:** Daily Mission card shows today's recommended topic + reason ("biggest weakness × highest exam weight").
- [ ] **PASS:** Streak counter shows `Longest 6 days` (current may be 0 because seed activity ended yesterday).
- [ ] **PASS:** XP header pill (top-right) shows `906 XP · Level 4 · SILVER`.
- Click XP pill → routes to `/league`.

### 1.2 League page (`/league`) — Phase 1D-9
- [ ] **PASS:** Hero card shows level badge with SILVER colour.
- [ ] **PASS:** XP progress bar fills `~75%` toward `Level 5 (1600 XP)`.
- [ ] **PASS:** Standings table shows ~50 SILVER members ranked by weekly XP.
- [ ] **PASS:** Logged-in user's own row is highlighted (different background tint).

### 1.3 Practice tab (`/practice`)
- [ ] **PASS:** Weekly plan card with topics + rationale (Phase 1B).
- [ ] **PASS:** Revision queue card (SM-2 due topics).
- [ ] **PASS:** Topic-decay card lists 1-3 topics with "review-by" dates.
- [ ] Click any topic → routes to `/topics/<id>`.

### 1.4 Topic detail (`/topics/33333333-0000-0000-0000-000000000002`)
This topic is `student@alp.dev`'s **weakest** (EWA ~0.28).
- [ ] **PASS:** Importance pill shows weight % + source ("Past papers" or "Default").
- [ ] **PASS:** Mastery hero shows `28%` in red ("Weak" pill).
- [ ] **PASS:** Two CTAs visible: `◈ Start AI practice` and `▶ Replay my mistakes` (Phase 1C).
- [ ] **PASS:** Stats row: questions count, mastery %, sessions, "Pts to gain" estimate.
- [ ] **PASS:** **TimeToMasteryCard** (Phase 1C) shows hours estimate + days at current pace + confidence label (low/medium/high).
- [ ] **PASS:** **PrerequisiteMap** (Phase 1D-2) renders SVG layered DAG; root node ringed in blue, prerequisites above coloured by mastery (red <40, amber 40-70, green ≥70).
- [ ] **PASS:** **VideoEngagementCard** (Phase 1D-6) hidden if no watched resources, else shows "completed N of M".
- [ ] **PASS:** Notes editor — type `Test note from playbook` → save → reload page → note persists (Phase 1A).
- [ ] **PASS:** AI Tutor chat panel — click `◈ Ask the AI tutor`, send "What is Newton's Second Law?". Streaming reply arrives. Click `History →` → routes to `/tutor-history` (Phase 1D-3).

### 1.5 Mistake replay (Phase 1C)
- From topic detail, click `▶ Replay my mistakes`.
- [ ] **PASS:** New session created, redirects to `/quiz/<id>`. Quiz contains previously-wrong-answered questions only.
- [ ] **PASS:** Submit the quiz → returns to result page with correct/incorrect breakdown.

### 1.6 History page (`/history`)
- [ ] **PASS:** Lists 100+ past sessions (PRACTICE / MOCK / MOCK_BLUEPRINT modes labeled).
- [ ] **PASS:** Each finished session has `Deep-dive →` link.
- Click `Deep-dive →` on a recent session.

### 1.7 Session deep-dive (Phase 1D-1)
- [ ] **PASS:** Headline tiles: Score X/10, Accuracy %, Time, Avg/question, Lost/unattempted.
- [ ] **PASS:** Time-per-question heatmap — 10 cells coloured green (correct) / red (wrong) / dark (unanswered), width proportional to time.
- [ ] **PASS:** Time-vs-correctness scatter — circles on the upper band = correct, lower band = wrong.
- [ ] **PASS:** Auto-coaching note: "your time spend looks calibrated" / "rushing? try slowing down" / "cutting losses".

### 1.8 Analysis page (`/analysis`) — the big one
- [ ] **PASS:** Page loads without crash (toLocaleString fix verified).
- [ ] **PASS:** Tab bar — Overview is active, Sessions/Topics/Predictions/Saved are quick-jump links.
- [ ] **PASS:** Projected rank card shows projected AIR + range + percentile.
- [ ] **PASS:** Readiness band card with action items.

**Phase 1D row (3 cards side-by-side):**
- [ ] **PASS:** **RankTrajectoryChart** — SVG line graph with dots (mock-score history) + 3 dashed reference lines.
- [ ] **PASS:** **CareerOutcomeCard** — shows `n_samples`. Will say "Not enough data yet" if k-anon below 50 (dev has ~13).
- [ ] **PASS:** **NationalRankCard** — for opted-in students shows `#N of 30 · top P%`. For non-opted-in shows opt-in prompt linking to /profile.

**Phase 1C row:**
- [ ] **PASS:** **ConfidenceGapCard** — shows Brier score (e.g. `0.185`), counts of overconfident / underconfident concepts.

### 1.9 Flashcards page (`/flashcards`) — Phase 1D-8
- [ ] **PASS:** Three tabs: Due today / My decks / Community decks.
- [ ] **PASS (My decks):**
  - Click `+ New deck` → enter title `Test Deck` + visibility `Private` → Create.
  - Click `+ Import from questions` → enter topicId `33333333-0000-0000-0000-000000000019` → Import.
  - Try changing visibility to PUBLIC → click `Submit for review` button → status flips to IN_REVIEW.
- [ ] **PASS (Community decks):** Empty until a moderator approves a deck.

### 1.10 Tutor chat history (`/tutor-history`) — Phase 1D-3
- [ ] **PASS:** Lists past chat sessions with auto-titled first message + msg count + timestamp.
- [ ] **PASS:** Search box filters by keyword.
- [ ] **PASS:** Click a session → transcript view shows alternating user/assistant bubbles.

### 1.11 Profile page (`/profile`)
- [ ] **PASS:** Standard preferences (avatar, display name, language).
- [ ] **PASS:** **LeaderboardOptIn** card (Phase 1D-7) — toggle, type display name, click `Save`. State persists on reload.
- [ ] **PASS:** **RealExamReport** card (Phase 1D-4 polish) — already shows seeded NEET row. Click `+ Report an outcome` → exam=JEE, score=180, rank=8000 → Save.

### 1.12 Backend verification (curl)
```bash
U=00000000-0000-0000-0000-000000000001
TID=33333333-0000-0000-0000-000000000002
curl -s http://localhost:38100/analytics/mastery/$U | jq '.topics | length'                    # ≥ 5
curl -s http://localhost:38100/analytics/readiness/$U | jq '.score'                            # 0.5-0.7
curl -s http://localhost:38100/analytics/daily-activity/$U?days=30 | jq '.activity | length'
curl -s http://localhost:38100/analytics/streak/$U | jq '.longestStreak'                       # ≥ 3
curl -s http://localhost:38100/analytics/time-to-mastery/$U/$TID | jq '.hours_to_target'
curl -s http://localhost:38100/analytics/confidence-gap/$U | jq '.overall_n,.overall_brier'    # 60, 0.18
curl -s http://localhost:38100/analytics/mock/NEET/trajectory/$U | jq '.points | length'
curl -s http://localhost:38100/gamification/users/$U/xp | jq '.total_xp,.current_league'
```

---

## Persona 2 — TEACHER walkthrough

> Login: `teacher@alp.dev` / `Password123!` at http://localhost:35174

### 2.1 Teacher dashboard (`/teacher/dashboard`)
- [ ] **PASS:** Cohort cards listed (Aurora's cohorts). Click `JEE Main 2027 Batch`.

### 2.2 Cohort deep-dive (`/teacher/cohorts/66666666-0000-0000-0000-000000000001`)
Seven tabs: **Topic heatmap**, **Trend**, **Engagement**, **Assignments**, **Common mistakes**, **Lesson plan**, **Compare students**.

#### 2.2.1 Topic heatmap (Phase 1B + carry-over fix)
- [ ] **PASS:** Sorted weakest first, ~25 rows with topic title, avg EWA bar, n_students.

#### 2.2.2 Trend (Phase 1B + carry-over rewrite)
- [ ] **PASS:** Daily activity bars over last 30 days (avg questions per student, engagement %).

#### 2.2.3 Engagement
- [ ] **PASS:** Per-student last_active + sessions_30d.

#### 2.2.4 Common mistakes (Phase 1C)
- [ ] **PASS:** Mistake-type tiles (`formula_error`, `conceptual_gap`, etc.) + top problem topics.

#### 2.2.5 Lesson plan (Phase 1C — AI/heuristic)
- [ ] **PASS:** Headline + AI/heuristic pill + 3 recommendation cards (rank, format, est minutes).

#### 2.2.6 Compare students (Phase 1C)
- [ ] **PASS:** Pick two students from the dropdowns → side-by-side panels + per-topic diffs table.

### 2.3 Backend verification
```bash
CID=66666666-0000-0000-0000-000000000001
curl -s http://localhost:38100/analytics/cohorts/$CID/topic-heatmap | jq '.topics | length'
curl -s http://localhost:38100/analytics/cohorts/$CID/trend?days=30 | jq '.points | length'
curl -s http://localhost:38100/analytics/cohorts/$CID/common-mistakes | jq '.n_errors_total'
curl -s "http://localhost:38101/adaptive/lesson-recommender?cohortId=$CID" | jq '.recommendations | length'
```

---

## Persona 3 — PLATFORM ADMIN walkthrough

> Login: `admin@alp.dev` / `Password123!` at http://localhost:35175

### 3.1 Admin sidebar (left rail) — confirm these items render
| Sidebar entry        | Route                          | Status                              |
| -------------------- | ------------------------------ | ----------------------------------- |
| Console              | `/dashboard`                   | Live — ops console                  |
| Feature flags        | `/flags`                       | Live                                |
| Tenants              | `/tenants`                     | **Entry point for institute analytics** (see 3.3) |
| Exams                | `/exams`                       | Live (P7 exam builder)              |
| Users                | `/users`                       | Live                                |
| Educator scope       | `/educator-scope`              | Live                                |
| Audit log            | `/audit`                       | Live                                |
| Ops dashboard        | `/ops`                         | Live                                |
| Analytics drill      | `/analytics/drill`             | **Phase 1A 6-level drill** (3.2)   |
| Platform analytics   | `/platform-analytics`          | **9-tab business surface** (3.4)    |
| AI providers / cost  | `/ai-providers`, `/ai-cost`    | Live                                |
| Calibration / Translations / T-review / Cultural review / Grader queue | various | Live |

### 3.2 Console (`/dashboard`)
- [ ] **PASS:** "AdaptiveLearn ops console" hero + audit-log preview + SLO health (staging-only — local shows "—").
- [ ] **PASS:** Active flags / danger / recent audit / active users tiles.

### 3.3 Tenants list (`/tenants`)
- [ ] **PASS:** 5 tenants visible with cohort/teacher/student counts.
- [ ] **PASS:** Each row has both `Cohorts →` AND `Analytics →` links.
- Click `Analytics →` for **Aurora Coaching Centre** → routes to `/institutes/55555555-0000-0000-0000-000000000001/analytics`.

### 3.4 Institute Analytics (`/institutes/:tenantId/analytics`)
This is the page my earlier playbook called "Institute Admin" — it's reachable via the platform-admin sidebar through the Tenants list.

Nine tabs: **Overview**, **Cohorts**, **Teachers**, **Subjects**, **Trend**, **Marketplace**, **Benchmark**, **Interventions**, **Outcomes report**.

- [ ] **PASS (Overview):** Headline tiles (n students, active 7d, avg readiness, % weak).
- [ ] **PASS (Cohorts):** Per-cohort summary rows.
- [ ] **PASS (Teachers):** Teacher effectiveness ranking with delta_30d.
- [ ] **PASS (Subjects):** Importance-weighted subject gap heatmap.
- [ ] **PASS (Trend):** Tenant-level readiness trend chart.
- [ ] **PASS (Marketplace):** ROI summary (placeholder until marketplace event-consumer lands).
- [ ] **PASS (Benchmark):** k-anonymous peer benchmark.
- [ ] **PASS (Interventions, Phase 1C):** Tiles + by-action table. Empty if no manual interventions logged.
- [ ] **PASS (Outcomes report, Phase 1C):** `⬇ Download PDF` opens PDF (or HTML fallback if weasyprint native libs unavailable). `🖼 Preview HTML` opens in browser.

Also reachable from `/institutions/:tenantId/cohorts` (the cohort-management page) via the **📊 Open analytics →** button in the header.

### 3.5 Analytics drill (`/analytics/drill`) — Phase 1A
- [ ] **PASS:** Tenants list with avg readiness bars (~56-60% per tenant after seed).
- Click any tenant.
- [ ] **PASS:** Tenant → Exam page shows real exam list (NEET, JEE_MAIN, CBSE_8, etc.) with student counts and avg readiness, **not** the cold-start "Projected baseline" card.
- [ ] **PASS:** Click an exam → subjects page (Physics / Chemistry / Biology for NEET).
- [ ] **PASS:** Click a subject → topics → concepts → students drill works.

> **If you see the cold-start "Projected baseline" page when there's seeded data**, the matview is stale. Run:
> ```bash
> docker cp scripts/backfill_mastery_tenant_id.py alp-local-engagement-1:/tmp/bf.py
> docker exec alp-local-engagement-1 python /tmp/bf.py
> ```
> This backfills `mastery.tenant_id` from `user_tenant_memberships` and refreshes `mv_drill_topic`.

### 3.6 Platform analytics (`/platform-analytics`)
Nine tabs:

- [ ] **PASS (Funnels):** Five-step funnel — Signup / Exam Picked / First Session / First Mock / Premium Purchased. All zeros if no `platform_funnels` events seeded.
- [ ] **PASS (DAU / MAU):** Returns DAU / WAU / MAU / stickiness numbers (sourced from `daily_activity`). After seed: dau≈42, wau≈63, mau≈83, stickiness≈0.5.
- [ ] **PASS (Retention):** Cohort table grouped by first-active week with week-1 retention %. After seed: 5+ cohort rows.
- [ ] **PASS (Question quality):** Top 50 most-served questions, exposure + accuracy + verdict (HEALTHY / TOO_HARD / TOO_EASY).
- [ ] **PASS (Mock distributions):** NEET tab shows histogram buckets after seed (~9 buckets across 10-90% range).
- [ ] **PASS (Subscriptions):** Counts (zeros until payment join lands).
- [ ] **PASS (Marketplace):** Sessions / avg rating / revenue (zeros — placeholder).
- [ ] **PASS (Cost / student):** DAU divisor renders; LLM/infra cost zeros until ai_call_logs feed wires in.
- [ ] **PASS (Outcomes):** Per-exam tabs (NEET / JEE_MAIN / UPSC_CSE / CBSE / CAT). Sample size, R², slope, intercept + scatter chart with regression line. After seed: NEET shows ~16 samples.

### 3.7 Cross-tenant compare (Phase 1C — uniquely differentiating)
There is no UI surface yet for compare-cohorts — call directly:
```bash
curl -s "http://localhost:38100/analytics/compare/cohorts?a=66666666-0000-0000-0000-000000000001&b=66666666-0000-0000-0000-000000000002" \
  | jq '.side_a, .side_b, (.diffs | length)'
```
- [ ] **PASS:** Two side panels (n_topics, avg_ewa, weak_pct) + diffs array.

### 3.8 National leaderboard (Phase 1D-7)
```bash
curl -s http://localhost:38100/analytics/mock/NEET/national-leaderboard | jq '.hidden,.total_opt_in'
```
- **DEV BEHAVIOR:** `hidden=true total_opt_in=30` because k-anon floor is 100 and dev has 30 opted-in. **By design.**

### 3.9 Career outcomes (Phase 1D-4)
```bash
curl -s "http://localhost:38100/analytics/career-outcomes?examCode=NEET&readiness=0.6" | jq '.n_samples,.hidden'
```
Expected: `n_samples ≈ 13`, `hidden=true` (below k-anon floor of 50). To unblock: seed more `real_exam_outcomes`.

### 3.10 Gamification weekly cron
```bash
curl -sw "\n%{http_code}\n" -X POST http://localhost:38100/gamification/cron/promote-demote
```
Expected: `{"promoted": N, "demoted": M}` HTTP 200.

---

## Persona 4 — MODERATOR walkthrough

> Login: `moderator@alp.dev` / `Password123!` at http://localhost:35174

### 4.1 Flashcard moderation queue (`/moderation/flashcards`) — Phase 1D-8
- [ ] **PASS:** Queue lists all decks with `status=IN_REVIEW`.
- For each deck: click `Preview` → expands cards. Type a reason. Click `Approve` → flips to PUBLISHED. Or `Reject` → flips to REJECTED.

### 4.2 Backend verification
```bash
TOKEN=$(curl -s -X POST http://localhost:38001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"moderator@alp.dev","password":"Password123!"}' \
  | jq -r '.tokens.accessToken')

curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:38101/content/decks/review-queue | jq '.items | length'
```

---

## Persona 5 — Cross-cutting

### 5.1 Topic prerequisite gate (Phase 1A.5)
On any topic detail page where prereqs aren't mastered:
- [ ] **PASS:** Amber pill `⚠ Master <prereq topic> first →` links to that prereq.

### 5.2 Cold-start projection (Phase 1A risk-mitigation)
Visit `/analytics/drill` for any tenant. With < 5 enrolled students:
- [ ] **PASS:** "Projected baseline — real curves will appear once 5+ students enroll" yellow card visible.

### 5.3 Importance pill cascade (Phase 1A)
On Topic Detail page, hover the importance pill.
- [ ] **PASS:** Tooltip shows `Past papers · 3.5% weight · confidence high` or similar.
- [ ] **PASS:** Source label varies: PYQ / Section share / Default / Admin set.

---

## Backend smoke matrix

Run [`scripts/smoke_test_analytics.sh`](../scripts/smoke_test_analytics.sh) — covers 25 endpoints. Exit code 0 = all green.

```bash
bash scripts/smoke_test_analytics.sh
```

For the platform-admin Platform Analytics surface specifically:
```bash
for path in "platform/funnels" "platform/dau-mau" "platform/retention" "platform/question-quality" \
            "platform/mock-distributions/NEET" "platform/subscription-health" \
            "platform/tutor-marketplace" "platform/cost-per-student" \
            "platform/outcome-correlation/NEET"; do
  printf "%-40s " "$path"
  curl -sw "%{http_code}\n" -o /dev/null "http://localhost:38100/analytics/$path"
done
```
All 9 should return HTTP 200.

---

## Failure modes & known dev limitations

| Symptom                                                   | Why                                                         | Fix                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| National leaderboard shows `hidden=true` even with seed   | k-anon floor is 100; dev has 30 opted-in                    | Lower `K_ANON_FLOOR` in `national_rank.py` for dev, or seed more          |
| Career-outcomes shows `hidden=true`                       | k-anon floor 50; dev has ~13 outcomes per readiness band    | Lower for dev or seed more                                                |
| Outcomes-report PDF returns HTML                          | weasyprint native libs (cairo/pango) not installed in image | Install in Dockerfile, or accept HTML fallback                            |
| Confidence-gap empty for student@alp.dev                  | seed RNG didn't pick that user (30% skip rate)              | Run `seed_confidence_for_user.py 00000000-0000-0000-0000-000000000001`    |
| `/analysis` 5xx                                           | could be stale build; should be 200 after toLocaleString fix | `docker compose build web-student && up -d web-student`                  |
| BRONZE / GOLD league standings empty                      | All seeded users start in SILVER                            | Test SILVER league standings (the populated one)                          |
| Trend / topic-heatmap empty for new cohort                | No mastery data yet                                         | Re-run `seed_analytics_simulation.py`                                     |
| Funnels tab all zeros                                     | No `platform_funnels` event rows seeded                     | The seed script doesn't populate this table; UI surface still renders     |
| Subscriptions / Marketplace / Cost-per-student show zeros | Payment + marketplace event consumers not yet wired         | Phase 2 follow-up                                                         |

---

## Test pass criteria

A successful test run = **every checkbox above is PASS** with these exceptions which are **expected dev behavior**:

- National leaderboard `hidden=true` (k-anon).
- Career-outcomes `hidden=true` for some readiness bands (k-anon).
- BRONZE / GOLD / PLATINUM / DIAMOND league standings empty (all seeded users start in SILVER).
- Funnels / Subscriptions / Marketplace / Cost-per-student show zeros (event consumers pending).

---

## Rollback / clean reseed

```bash
# Wipe everything and redo from migrations forward
docker compose -f infrastructure/docker/docker-compose.yml down -v
docker compose -f infrastructure/docker/docker-compose.yml up -d
# wait ~30s for services to migrate + start, then run Step 0 again
```
