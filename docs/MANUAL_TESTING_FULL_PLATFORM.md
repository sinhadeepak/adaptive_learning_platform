# Manual Testing Playbook — Full Platform (through Phase B3)

End-to-end manual test script covering everything shipped to date:
Phase 1A–6 (web/mobile UX foundation, content, quizzes, AI tutor,
analytics, social, marketplace, screening, mission) plus Phase B1–B3
of the Statistics-Driven Guidance System (EIS / PCE / ADP / IGS).

> Walk top-to-bottom in ~2.5 hours against the local Docker stack with
> seed data. Each section is independent — you can jump in at any
> Step N if its prereqs are met.

---

## 0. Pre-flight

### 0.1 Start the stack

```bash
cd infrastructure/docker
docker compose up -d
docker compose ps          # wait until every service is "healthy"
```

Services should resolve as below — open each `/health` URL in a
browser and confirm `200 OK`:

| Service              | URL                                                       |
| -------------------- | --------------------------------------------------------- |
| Web — Student        | http://localhost:35173                                    |
| Web — Portal         | http://localhost:35174                                    |
| Web — Admin          | http://localhost:35175                                    |
| Identity API         | http://localhost:38001/health                             |
| Engagement API       | http://localhost:38100/health                             |
| Learning API         | http://localhost:38101/health                             |
| Quiz API             | http://localhost:38011/healthz                            |
| Battle API           | http://localhost:38012/health                             |
| MinIO console        | http://localhost:39001 (`alp` / `alp-local-secret`)       |
| NATS monitor         | http://localhost:38222/jsz                                |
| **Mailpit (SMTP catcher)** | **http://localhost:38025**                          |

> **Email locally:** there's no real outbound SMTP. Every OTP / reset /
> system email is captured by **Mailpit** at http://localhost:38025 —
> use the inbox there to read codes during signup tests. Scripted
> tests can grep the body via Mailpit's REST API: see Appendix C.

### 0.2 Seeded users (password `Password123!`)

| Persona            | Email               | Role             |
| ------------------ | ------------------- | ---------------- |
| Student            | `student@alp.dev`   | STUDENT          |
| Teacher            | `teacher@alp.dev`   | TEACHER          |
| Moderator          | `moderator@alp.dev` | MODERATOR        |
| Platform admin     | `admin@alp.dev`     | PLATFORM_ADMIN   |

### 0.3 Open a notebook

Keep a scratch notebook for: session IDs, JWTs, screenshot timestamps,
any defects. Each step ends with an explicit ✅ pass criterion.

---

## 1. Identity & onboarding (Student)

| Step | Action                                                                    | Expected (✅ pass)                                                            |
| ---- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1.1  | Navigate to http://localhost:35173 in a fresh incognito window.           | Login screen renders with branded gradient + email/password fields.           |
| 1.2  | Click "Forgot password" → enter `student@alp.dev`.                        | Toast "If the account exists, an OTP was sent." Email lands in Mailpit (http://localhost:38025). |
| 1.2a | Open Mailpit → click the latest message.                                  | Body shows "Your 6-digit verification code is: ######" (10-min TTL).          |
| 1.2b | New signup: register `tester+1@example.com` / `Password123!`.             | Server returns `{userId, otpChannel:"email"}`. OTP appears in Mailpit.        |
| 1.2c | Submit OTP at `/auth/otp/verify` (UI or curl). See Appendix C for script. | 200 OK + tokens issued; user can now sign in.                                 |
| 1.3  | Back to Login. Submit `student@alp.dev` / `Password123!`.                 | Redirect to `/` (Home). Top-right shows the student name + avatar initial.    |
| 1.4  | DevTools → Network → reload `/profile/me`.                                | 200 OK with `user.id`, `user.email`, `exams[]`, `onboardingState`.            |
| 1.5  | Open DevTools → Application → Local Storage.                              | Key `alp:tokens` carries `{accessToken, refreshToken, ...}`.                  |
| 1.6  | Click avatar → Sign out → re-sign-in.                                     | Tokens are replaced; protected routes still work.                             |

---

## 2. Catalog & content discovery

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 2.1  | Go to `/catalog`. Choose an exam (e.g. **JEE Main**).                     | Subject grid renders; each subject tile shows mastery sparkline.               |
| 2.2  | Click a subject (e.g. Physics) → pick a topic (Kinematics).               | Topic detail with: overview, concept list, Watch & Learn shelf, attempt CTAs. |
| 2.3  | Click "Read notes" if available.                                          | Markdown notes render with MathJax + diagrams.                                 |
| 2.4  | Click "Practice this topic" → confirm difficulty modal → start.           | Practice screen renders a question within 2 s.                                 |
| 2.5  | Browser back. From Catalog, use search bar — type "newton".               | OpenSearch typeahead suggests at least one topic; clicking navigates.          |

---

## 3. Quiz play loop — Practice

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 3.1  | Start a Practice session on Kinematics (10 questions).                    | Session opens; question 1/10 visible; stem + options + confidence slider.      |
| 3.2  | Answer 3 questions in a row deliberately wrong.                           | Difficulty drops on the 4th question (Δb ≤ −0.3). ADP frustration trigger.     |
| 3.3  | Answer 5 in a row correctly under time.                                   | Difficulty climbs (Δb ≥ +0.2). Boredom trigger.                                |
| 3.4  | Hit "Pause / Review later" if available; re-enter via /history.           | Session resumes at the next unanswered item.                                   |
| 3.5  | Finish + Submit.                                                          | Result screen shows: score, time, per-concept Δ-mastery, mistakes drill CTA.   |
| 3.6  | Click "Explain" on a wrong question.                                      | AI Tutor explanation streams; references → curated YouTube + topic notes.     |
| 3.7  | Open `/history` → click this session.                                     | Question-by-question replay with your answer + correct answer + diff.          |

---

## 4. Polymorphic question types (Phase 5)

Run a Practice or Custom Test that pulls each of the 22 supported
types — Mock Exams compose a representative set. Sanity-check each:

| Step | Type                | Expected renderer behaviour                                              |
| ---- | ------------------- | ------------------------------------------------------------------------ |
| 4.1  | `MCQ_SINGLE`        | 4 radio choices.                                                         |
| 4.2  | `MCQ_MULTI`         | Checkboxes; "Submit" disabled until ≥1 selected.                        |
| 4.3  | `NUMERIC`           | Number input; tolerance hint visible (e.g. `±0.01`).                     |
| 4.4  | `TRUE_FALSE`        | Two radio choices.                                                       |
| 4.5  | `MATCH_PAIRS`       | Drag-drop pairs render; cannot submit if any pair unpaired.              |
| 4.6  | `SEQUENCING`        | Draggable list; numbered correctly even on touch.                        |
| 4.7  | `CLASSIFICATION`    | Items → categories drag-drop; categories pre-labelled.                   |
| 4.8  | `FILL_BLANK`        | Inline `<input>` inside stem.                                            |
| 4.9  | `CLOZE`             | Multiple blanks; tab-key navigation between them.                        |
| 4.10 | `DIAGRAM_LABEL`     | Image renders; clickable hotspots highlighted on hover.                  |
| 4.11 | `CASE_STUDY`        | Long passage + sub-question pane; rubric visible to grader.              |
| 4.12 | `ESSAY`             | Word counter; auto-save indicator.                                       |
| 4.13 | `AUDIO_DICTATION`   | Plays once + transcript input; replay button disabled per policy.        |
| 4.14 | `CODE_SUBMIT`       | Monaco editor; "Run" returns stdout + verdict.                           |
| 4.15 | other 8 types       | At minimum: renderer mounts without errors; submit returns 200.          |

**Spot fix log:** if any renderer shows raw JSON or "Renderer for type X
not implemented", note the question_id from DevTools and continue.

---

## 5. Mock tests + blueprint mocks (Phase 4)

| Step | Action                                                                    | Expected                                                                                |
| ---- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 5.1  | Go to `/mocks`. Pick a series (e.g. JEE Main).                            | List shows: title, duration, sections, last-attempt status.                             |
| 5.2  | Click "Start". Confirm time-limit modal.                                  | Server pre-serves all items (~30–90 q); first item < 2 s.                               |
| 5.3  | Navigate between sections.                                                | Section switcher works; per-section timer + answered/skipped counts.                    |
| 5.4  | Submit (or wait for auto-submit on timer).                                | Result page: per-section breakdown, percentile band, ability estimate δ.                |
| 5.5  | Open `/analysis/<sessionId>` (deep-dive).                                 | Difficulty calibration plot + per-Bloom mastery radar.                                  |

---

## 6. Custom Test Builder + Mistakes Practice (F2)

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 6.1  | Go to `/practice/build`. Pick 2 topics + difficulty band Easy/Medium.    | Question-count preview updates live.                                           |
| 6.2  | Save → Start.                                                             | Session opens with chosen items only.                                          |
| 6.3  | Make 3 mistakes; submit.                                                  | Result page surfaces "Drill mistakes" link.                                    |
| 6.4  | Click → `/practice/mistakes`.                                             | Mistake replay session opens; only your past wrong questions.                  |
| 6.5  | Get 2 right + 1 wrong; submit.                                            | Mistake list shrinks by 2 on next visit.                                       |

---

## 7. AI Tutor + Photo Doubt (Phase 5 + Phase 6)

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 7.1  | From Home → Tutor button → ask "Explain Newton's 3rd law with example".  | SSE stream renders tokens incrementally; final message has source list.        |
| 7.2  | Click a source link.                                                      | Opens the cited topic or PYQ in a new tab.                                     |
| 7.3  | Try a high-effort prompt 6 times within a minute.                         | After the 5th, rate-limit toast: "Tutor cooldown, try in 30 s".                |
| 7.4  | Home → "Snap a Doubt" → upload a textbook photo.                          | Photo accepted, doubt created, status "Pending OCR".                           |
| 7.5  | After ~10–20 s refresh → doubt detail.                                    | Extracted text + tutor answer visible; bookmark for later.                     |

---

## 8. Doubts forum

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 8.1  | Go to `/doubts`.                                                          | Tabs: My doubts / All / Resolved. Recent items render.                         |
| 8.2  | Post a new doubt with a math snippet (`$$...$$`).                         | MathJax renders in the preview + in the saved doubt.                           |
| 8.3  | As **Teacher** in another browser, answer the doubt.                      | Student sees the answer with a "Mark resolved" CTA.                            |
| 8.4  | Mark resolved + rate ⭐ 5.                                                 | TTR appears on teacher dashboard within ~30 s.                                 |

---

## 9. Battle Mode (F7) + Friends + Clans (F4/F5/F6)

Open **two browser windows** (regular + incognito) — sign in to
`student@alp.dev` in one and a second seeded student in the other.

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 9.1  | Both: go to `/battle`. Click "Quick Match".                               | Both land in the same battle within ~5 s; WebSocket connects.                  |
| 9.2  | Play through 10 questions.                                                | Live scoreboard updates per answer; tie-breakers visible.                      |
| 9.3  | Winner sees XP popup + ranking delta.                                     | XP added to profile; appears in `/leaderboards`.                               |
| 9.4  | Go to `/friends` → search by name or email (NOT UUID).                    | Dropdown shows names with email in brackets.                                   |
| 9.5  | Send a friend request → accept it from the other window.                  | Mutual friendship appears in both lists.                                       |
| 9.6  | Create a Clan from `/clans` → invite friend.                              | Member joins; clan-leaderboard updates with both members.                      |

---

## 10. Leaderboards + Streaks + Bookmarks (F-misc)

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 10.1 | `/leaderboards` global tab.                                               | Top 100 by XP last 7d; self-rank pinned at bottom.                             |
| 10.2 | "Friends" tab.                                                            | Only friends listed.                                                           |
| 10.3 | Home tab — streak chip shows current streak.                              | Number matches `/streak/{user_id}` API call.                                   |
| 10.4 | During practice, click 🔖 to bookmark a question.                          | `/bookmarks` lists it; remove + re-add works idempotently.                     |

---

## 11. Today's Mission (Phase 6 S50) + Today's Plan (Phase B3 IGS)

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 11.1 | Open Home. Two top cards visible: **TODAY'S PLAN** (IGS) and **TODAY'S MISSION** (shadow). | Both render. IGS lists 3–5 ordered actions with time budget.       |
| 11.2 | On IGS card, click "Why this?" on the top action.                         | Rationale + skip button reveal; rationale shows 1–3 explainability strings.    |
| 11.3 | Click "Start →" on a practice action.                                     | Navigates to `/practice?conceptId=…` (or `/revision`, `/mocks`, …).            |
| 11.4 | Open DevTools → Network → WS frames at `/api/v1/igs/stream`.              | First frame after connect is `igs.next-action.updated`; heartbeat every 30 s.  |
| 11.5 | In a second tab, submit a Practice session.                               | The original tab's IGS card patches the top action within ~3 s (NATS-driven).  |
| 11.6 | Click "Not today — pick yourself" on the legacy Mission card.             | Mission marked skipped; tomorrow a new one appears.                            |

### 11.7 Backend smoke (optional but powerful)

```bash
# Log in
TOK=$(curl -s -X POST http://localhost:38001/auth/login -H 'content-type: application/json' \
        -d '{"email":"student@alp.dev","password":"Password123!"}' | jq -r '.tokens.accessToken')

UID=00000000-0000-0000-0000-000000000001
EXAM=00000000-0000-0000-0000-000000000010

# Five IGS endpoints
curl -s "http://localhost:38101/igs/$UID/next-action?exam_id=$EXAM" -H "authorization: Bearer $TOK"
curl -s "http://localhost:38101/igs/$UID/today-plan?exam_id=$EXAM"  -H "authorization: Bearer $TOK"
curl -s "http://localhost:38101/igs/$UID/week-plan?exam_id=$EXAM"   -H "authorization: Bearer $TOK"
curl -s "http://localhost:38101/igs/$UID/explainability/take_mock?exam_id=$EXAM" -H "authorization: Bearer $TOK"
curl -s -X POST "http://localhost:38101/igs/$UID/override" -H "authorization: Bearer $TOK" \
     -H 'content-type: application/json' \
     -d '{"chosen_action_kind":"take_break","rejected_top_action_id":"0","reason":"manual-smoke"}'
```

Each call returns 2xx; all responses carry a generation timestamp.

---

## 12. Study Portfolio (Phase B2 PCE)

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 12.1 | Open http://localhost:35173/portfolio                                     | Header "Where is your effort going?"; exam picker visible if ≥2 exams.         |
| 12.2 | If page says "No portfolio data yet", click "Compute now".                | Bars populate within ~5 s (PCE recompute fires).                               |
| 12.3 | Verify three buckets — High / Medium / Low.                               | Each shows current vs optimal % and a Δ chip.                                  |
| 12.4 | Click "Rebalance my plan →".                                              | Button shows "Rebalancing…"; on success bars + hint refresh.                   |
| 12.5 | Return to Home — IGS Today's Plan reflects rebalanced weighting.          | Top action may change to favour under-invested bucket.                         |

---

## 13. Exam Intelligence (Phase B1 EIS) — admin surface

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 13.1 | Sign in as `admin@alp.dev` at http://localhost:35175.                     | Admin shell loads; left-nav has "Exam Intel".                                  |
| 13.2 | Pick JEE Main.                                                            | Topic-yield table sorted desc; each row has CI band.                           |
| 13.3 | Click any topic.                                                          | Trend chart (last 10y) + concept-level breakdown.                              |
| 13.4 | "Never asked" tab.                                                        | Lists in-syllabus topics with zero 10-y appearances.                           |
| 13.5 | "Co-occurrence" tab.                                                      | Pairs sorted by joint frequency.                                               |
| 13.6 | Backend quick-check: `curl http://localhost:38101/exam-intel/$EXAM/topic-yield` | 200 + array of topics with `p_appears` + `expected_marks` + `ci_low`/`ci_high`. |

---

## 14. Adaptive Difficulty Progression (Phase B2 ADP)

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 14.1 | Restart the Quiz service with `QUIZ_ADP_AB_FRACTION=1.0` (so every user is in ADP arm). | `docker compose ... up -d quiz` succeeds.        |
| 14.2 | Start a Practice session.                                                 | First item difficulty `b` ≈ user's current θ on that concept.                  |
| 14.3 | Answer 5 in a row correctly under time.                                   | 6th item's `b` rises ≥ +0.2 (boredom kick).                                    |
| 14.4 | Answer 3 in a row wrong.                                                  | 4th item's `b` drops ≥ −0.3 (frustration kick).                                |
| 14.5 | Submit → DB check: `select strategy from sessions where id=…`             | Row reads `adp`, not `irt`.                                                    |
| 14.6 | A/B fairness sanity: set `QUIZ_ADP_AB_FRACTION=0.5`, launch 100 simulated sessions; ~50% land in `adp`. | Use the seed script. |

---

## 15. Web Portal (Teacher / Institute)

Sign in as `teacher@alp.dev` at http://localhost:35174.

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 15.1 | Home → "My cohorts".                                                      | List of cohorts; click any.                                                    |
| 15.2 | Cohort dashboard → Readiness + per-student strength matrix.               | Heat-map renders; clicking a student opens their profile.                      |
| 15.3 | Authoring → "Create question".                                            | Polymorphic builder; choose `MCQ_MULTI`; save → status `draft`.                |
| 15.4 | Submit for moderation → log out → log in as `moderator@alp.dev`.          | Question appears in moderation queue.                                          |
| 15.5 | Moderator: review + approve.                                              | Status → `published`. Quiz Go's content subscriber picks it up (NATS).         |
| 15.6 | Back to teacher → cultural review / translation review queues if seeded.  | Counts non-zero; click any → flag/approve.                                     |

---

## 16. Web Admin

Sign in as `admin@alp.dev` at http://localhost:35175.

| Step | Surface                              | Expected                                                                  |
| ---- | ------------------------------------ | ------------------------------------------------------------------------- |
| 16.1 | `/admin/ai-cost`                     | Cost-by-template table; non-zero rows after running a few AI features.    |
| 16.2 | `/admin/cost`                        | Provider cost dashboard.                                                  |
| 16.3 | `/admin/calibration`                 | Subjective-grader kappa per template; paused criteria flagged red.        |
| 16.4 | `/admin/grader-queue`                | Human-grader inbox; pick an item and grade.                               |
| 16.5 | `/admin/cultural-review`             | Translation cultural-review queue.                                        |
| 16.6 | `/admin/exam-intel`                  | EIS ingest UI; upload a past-paper JSON if you have one.                  |
| 16.7 | `/admin/ai-providers`                | Provider chain config (Anthropic → OpenAI → Stub). Edit + save.           |

---

## 17. Marketplace (tutors, courses, bookings, billing)

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 17.1 | Student → `/marketplace/tutors`.                                          | At least one seeded tutor; profile + rate visible.                             |
| 17.2 | Pick a slot → book → pay (Stripe test card `4242 4242 4242 4242`).        | Booking confirmed; appears in `/marketplace/my-bookings`.                      |
| 17.3 | Tutor side: confirm or decline; messaging works.                          | Status syncs to student within ~2 s.                                           |
| 17.4 | `/marketplace/courses` → buy a course (test card).                        | Lessons unlock; `/marketplace/my-purchases` lists the course.                  |
| 17.5 | Cancel a booking ≥ 24 h before slot.                                      | Refund initiated; Stripe dashboard shows the credit-note.                      |

---

## 18. Notifications + Inbox

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 18.1 | Set quiet hours in `/preferences/notifications`.                          | Saved; banner reflects change.                                                 |
| 18.2 | Trigger an event during quiet hours (e.g. doubt reply).                   | No push lands; in-app inbox bell still increments.                             |
| 18.3 | Click the bell.                                                           | Inbox lists unread + read items; marking-all-read decrements count.            |

---

## 19. Screening & Plans (Phase 6 S49 / S55)

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 19.1 | Visit `/screening` (logged-out).                                          | 5-question guest-screening renders.                                            |
| 19.2 | Submit → results page → "Create account".                                 | Signup form pre-fills the screening result; first plan is created post-login.  |
| 19.3 | Sign in → `/plans`.                                                       | Constrained plan editor: per-day minutes + max-sessions.                       |
| 19.4 | Edit + save.                                                              | Plan persists; IGS Today's Plan honours the new constraint on next compute.    |

---

## 20. Mobile parity (Flutter)

Run on Android emulator or physical device:

```bash
cd apps/mobile
flutter run --dart-define=API_BASE_URL=http://10.0.2.2/api/v1
```

| Step | Action                                                                    | Expected                                                                       |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 20.1 | Sign in with `student@alp.dev`.                                           | Home tab loads; readiness + streak chips visible.                              |
| 20.2 | "TODAY'S PLAN" card renders above the legacy Today card.                  | 3–5 actions visible; tapping "Why this?" expands rationale.                    |
| 20.3 | Background the app for 60 s → resume.                                     | WS reconnects (lifecycle observer); plan refreshes silently.                   |
| 20.4 | Open Study Portfolio screen (entry point: profile → "Study Portfolio").   | Current vs optimal bars + rebalance CTA.                                       |
| 20.5 | Tap "Rebalance my plan →".                                                | Spinner; on success bars + hint update.                                        |
| 20.6 | Start a practice session from the daily-plan card → answer 5 questions.   | ADP serves items in flow corridor (qualitative — no impossible / trivial).     |
| 20.7 | Submit → result screen shows per-concept Δ-mastery.                       | Numbers match the web result.                                                  |
| 20.8 | Battle mode tab → quick match.                                            | Pairs with second logged-in user (web window); WS scoreboard updates.          |
| 20.9 | Settings → sign out → re-sign in.                                         | Tokens cleared from secure storage; re-login restores all tabs.                |

---

## 21. Regression spot-checks (before sign-off)

A 10-minute pass through the top-10 regression risks. Tick each:

- [ ] **Token refresh:** leave Home open 70 minutes; a JWT-refresh fires before expiry; no logout.
- [ ] **CORS:** every API endpoint reachable from each web app's origin (DevTools → no `CORS` errors).
- [ ] **MathJax / KaTeX:** equations render on Question, Notes, Doubt, AI Tutor surfaces.
- [ ] **Theming:** toggle Dark/Light in Settings; AnalyticsTile cards re-render correctly.
- [ ] **A11y:** keyboard-only tab order through Home → can reach every CTA; visible focus rings.
- [ ] **No 5xx in container logs:** `docker compose logs --since 1h | grep -i "error\|500"` shows zero unexpected errors.
- [ ] **NATS healthy:** http://localhost:38222/jsz lists `QUIZ_EVENTS` stream with messages > 0.
- [ ] **OpenSearch reindex:** `curl http://localhost:39200/_cat/indices?v` shows `topics_v2` with doc count > 0.
- [ ] **Audit log retention:** `select count(*) from content_schema.ai_generation_jobs where created_at < now() - interval '90 days';` → 0 rows.
- [ ] **WS push delivery:** with two tabs open on Home, submit a session in tab A; tab B's Today's Plan patches within 3 s.

---

## 22. Teardown

```bash
docker compose down                # keep volumes (data survives)
docker compose down -v             # nuke local DB / MinIO / OpenSearch
```

Re-seed by running:

```bash
docker compose up -d
make seed                          # if Makefile target exists; otherwise:
docker compose exec learning python -m learning.catalog.seed
docker compose exec quiz   /usr/local/bin/seed-questions
```

---

## Appendix A — Where each feature lives

| Feature                       | Service / module                                                            | URL prefix (via nginx)         |
| ----------------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| Auth + profile                | identity                                                                    | `/api/v1/auth`, `/profile`     |
| Catalog + content + notes     | learning · `catalog/`, `content/`                                           | `/catalog`, `/content`         |
| Quizzes + sessions            | quiz (Go)                                                                   | `/api/v1/quiz`                 |
| Analytics + missions + plans  | engagement                                                                  | `/api/v1/analytics`, `/missions`, `/plans` |
| AI tutor / authoring          | learning · `ai_gateway/`, `ai_authoring/`                                   | `/api/v1/adaptive`, `/content/ai` |
| Doubts                        | learning · `doubts/`                                                        | `/api/v1/doubts`               |
| Exam Intel (EIS) — Phase B1   | learning · `exam_intel/`                                                    | `/api/v1/exam-intel`           |
| PCE — Phase B2                | learning · `pce/`                                                           | `/api/v1/pce`                  |
| ADP — Phase B2 (Go)           | quiz · `internal/adp/`                                                      | (in-process; via `/api/v1/quiz`) |
| IGS — Phase B3 (HTTP + WS)    | learning · `igs/{routes,stream,nats_subscriber}.py`                         | `/api/v1/igs`, `/api/v1/igs/stream` |
| Battle (F7)                   | alp-battle (Go)                                                             | `/battle`                      |
| Search                        | learning · `search/` (OpenSearch)                                           | `/api/v1/search`               |

## Appendix C — Reading OTPs locally (no real email)

Local SMTP is wired to **Mailpit** (`mailpit` service, ports `1025`
internal, host-mapped to `38025` web UI / `31025` SMTP). Identity
service points at `mailpit:1025` via env, so every OTP / password-reset
email is captured.

**UI:** http://localhost:38025

**Latest OTP via API (one-liner):**

```bash
curl -s http://localhost:38025/api/v1/messages?limit=1 \
  | python3 -c "import json,sys,re,urllib.request; \
m=json.load(sys.stdin)['messages'][0]; \
b=urllib.request.urlopen(f'http://localhost:38025/api/v1/message/{m[\"ID\"]}').read(); \
print(re.search(r'\\d{6}', json.loads(b)['Text']).group())"
```

**OTP for a specific address:**

```bash
EMAIL=tester+1@example.com
MID=$(curl -s "http://localhost:38025/api/v1/search?query=to:$EMAIL&limit=1" | python3 -c "import json,sys;print(json.load(sys.stdin)['messages'][0]['ID'])")
curl -s "http://localhost:38025/api/v1/message/$MID" | python3 -c "import json,sys,re;print(re.search(r'\\d{6}', json.load(sys.stdin)['Text']).group())"
```

**End-to-end new-user signup (curl):**

```bash
EMAIL=tester+$RANDOM@example.com
PW=Password123!

# 1) Register → returns userId + queues an OTP email
curl -s -X POST http://localhost:38001/auth/register \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\",\"firstName\":\"Test\",\"lastName\":\"User\"}"

# 2) Pull the 6-digit code straight from Mailpit
sleep 1
MID=$(curl -s "http://localhost:38025/api/v1/search?query=to:$EMAIL&limit=1" \
       | python3 -c "import json,sys;print(json.load(sys.stdin)['messages'][0]['ID'])")
OTP=$(curl -s "http://localhost:38025/api/v1/message/$MID" \
       | python3 -c "import json,sys,re;print(re.search(r'\\d{6}', json.load(sys.stdin)['Text']).group())")
echo "OTP=$OTP"

# 3) Verify → tokens
curl -s -X POST http://localhost:38001/auth/otp/verify \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"otp\":\"$OTP\"}"
```

**If Mailpit isn't catching mail:**

1. `docker compose ps mailpit` — service must be `healthy`.
2. `docker compose exec identity env | grep SMTP` — should show
   `AUTH_SMTP_HOST=mailpit` and `AUTH_SMTP_PORT=1025`.
3. The send is wrapped in `try/except` — failure is logged, **not raised**,
   so the API still returns 200. Tail the identity container for
   `email send failed for …`.
4. If you genuinely want to bypass email for an automated test, the
   admin route `POST /admin/users` (PLATFORM_ADMIN only) provisions a
   verified user without an OTP step.

---

## Appendix B — Common defects to log

When filing a bug from this run, include:

1. Step number (e.g. "Step 11.5").
2. URL at time of failure.
3. Screenshot or HAR snippet.
4. The relevant `docker compose logs` slice (use `--since 5m`).
5. Affected user id + session id (if applicable).
