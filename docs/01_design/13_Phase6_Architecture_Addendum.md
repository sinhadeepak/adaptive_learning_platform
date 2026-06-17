# Phase 6 — UX Co-Pilot · Architecture Addendum

**Status:** Proposed (2026-05-02). Tracks ADR-0020 through ADR-0024.
**Scope:** Architectural changes for sprints S49–S58. Read this alongside [`12_Phase5_Architecture_Addendum.md`](12_Phase5_Architecture_Addendum.md), the [original HLD](01_HLD_Adaptive_Learning_Platform.docx), and the Phase 6 sprint plan.

> **Headline:** **No new services.** Every Phase 6 module lands inside `alp-learning` or `alp-engagement`. The service ceiling (ADR-0005) holds. Cost: 11 new modules, 3 new AI Gateway prompt templates, 11 new tables, 4 new NATS subjects, no new repository.

---

## 1. Service ownership map (post-Phase-6)

| Service | Phase 6 additions |
|---|---|
| **alp-learning** | New modules: `mission`, `plans`, `recovery`, `screening`. Extensions: `adaptive.weekly_narrative`, `adaptive.friction_prompt`, `adaptive.intent_anchor`. New AI Gateway prompts: `weekly_narrative@1.0.0`, `mission_why@1.0.0`, `plan_impact@1.0.0`, `recovery_plan@1.0.0`. |
| **alp-engagement** | New modules: `analytics.ux_events`, `analytics.topic_decay`, `analytics.readiness_bands`, `reflection`. Extensions to `process_session` for mission-completion + plan-edit fan-out. |
| **alp-quiz (Go)** | Additive only: `intent_anchor` + `calibration_feedback` columns on `quiz_sessions`; `POST /sessions/{id}/calibration` endpoint; mid-quiz `intent_update` route. No breaking changes. |
| **alp-identity** | One read endpoint added: `GET /profile/preferences/onboarding-state` so the screening flow and the onboarding-collapse logic share a source of truth. |
| **alp-payment, alp-marketplace** | No changes. |
| **apps/web-student** | Major restructure: 4-section IA (Home / Practice / Insights / Me); Today's Mission card; weekly narrative; plan editor; mobile quiz redesign; screening flow; low-bandwidth toggle; reflection prompts; recovery banner. |
| **apps/web-portal, apps/web-admin** | Web-portal: cohort dashboard gains mission-completion + plan-adherence tiles. Web-admin: new `/admin/ux-health` page (UX-34 instrumentation dashboard) and `/admin/narrative-review` (S53 editorial sample). |

```
┌─────────────────────────────────────────────────────────────────────┐
│ alp-learning (Python · FastAPI)                                      │
│                                                                      │
│  ┌── adaptive (existing, extended) ────────────────────────────────┐│
│  │   • intent_anchor.py — pre-quiz θ̂ offset (S54)                  ││
│  │   • friction_prompt.py — mid-quiz heuristic engine (S54)         ││
│  │   • weekly_narrative.py — 5-section structured-output (S53)      ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌── mission (NEW MODULE, S50) ───────────────────────────────────┐│
│  │   • selector.py — pure-function mission picker                   ││
│  │   • daily_missions schema + repo                                 ││
│  │   • why_picked AI Gateway integration (mission_why@1.0.0)        ││
│  │   • routes: POST /missions/today · /start · /complete · /skip    ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌── plans (NEW MODULE, S55) ─────────────────────────────────────┐│
│  │   • generator.py — initial + regenerate (pure-function)          ││
│  │   • editor.py — Move/Swap/Rest/Shorten/Add operations            ││
│  │   • impact_preview AI Gateway integration (plan_impact@1.0.0)    ││
│  │   • is_required guard rail                                       ││
│  │   • soft_actions.py — Replace/Postpone/Split                     ││
│  │   • routes: POST /plans/generate · GET /plans/{user}/active ·    ││
│  │     POST /plans/{id}/edit · POST /plans/{id}/regenerate          ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌── recovery (NEW MODULE, S57) ──────────────────────────────────┐│
│  │   • recovery_engine.py — 4-day catch-up plan generator           ││
│  │   • detector.py — listens for 2+ missed sessions in 7-day window ││
│  │   • routes: POST /plans/{id}/recovery (opt-in)                   ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌── screening (NEW MODULE, S49) ─────────────────────────────────┐│
│  │   • blueprint.py — 10-15 question diagnostic blueprint           ││
│  │   • Redis-backed anonymous-token cache                           ││
│  │   • routes: POST /screening/start · /next · /answer · /persist   ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ alp-engagement (Python · FastAPI)                                    │
│                                                                      │
│  ┌── analytics (existing, extended) ─────────────────────────────┐│
│  │   • ux_events table + POST /analytics/ux-events (S49)           ││
│  │   • ux_kpis_daily aggregation (S49)                              ││
│  │   • topic_decay.py — pure function (S56)                         ││
│  │   • readiness_bands.py — band classifier (S56)                   ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌── reflection (NEW MODULE, S57) ────────────────────────────────┐│
│  │   • reflections_commitments table                                ││
│  │   • routes: POST /reflections · POST /commitments/{id}/check-in  ││
│  │   • cron: nightly scan of due commitments → notification         ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data flow — the four critical paths

### 2.1 Daily mission flow (S50)

```
Student opens Home (web-student)
  → GET /missions/today
    ↓
  alp-learning.mission.routes
    1. Read today's daily_missions row for (user_id, date) — if exists, return it
    2. Check active study_plans → today's plan_sessions[0] → mission from that
    3. Else: read concept_mastery + bloom_mastery + decay + revision_queue + mock_history
    4. Run mission.selector.select_mission(...) → Mission
    5. Persist to daily_missions
    6. Return Mission with why_picked
       (heuristic by default; AI Gateway mission_why@1.0.0 if budget allows;
        cached on (user_id, mission_kind, concept_id, day))
    ↓
Student taps "Start mission"
  → POST /missions/{id}/start
    ↓
  Returns the appropriate downstream URL (start_quiz / open_revision / start_mock)
    ↓
Student finishes the underlying session
  → existing quiz.session.completed NATS event fires
    ↓
  alp-engagement.analytics consumer:
    1. Existing process_session work (mastery, readiness, error classifier)
    2. NEW: lookup daily_missions for (user_id, date) and link session_id;
       set status='completed' if quality gates pass (≥ 60% completion, avg ≥ 30s/q)
       (mission completion is a derived signal, not student-controlled)
```

### 2.2 Weekly narrative flow (S53)

```
Cron (NATS scheduled stream subject `weekly_narrative.due`)
  → fires Sunday 23:00 IST per active user
    ↓
  alp-learning.adaptive.weekly_narrative.cron_handler
    1. Read current weekly signals: per-concept EWA delta over week,
       decay arrows, time-of-day accuracy, mock results, readiness slope
    2. Compose user message + last week's narrative for variation context
    3. Call AI Gateway touchpoint=evaluation, prompt weekly_narrative@1.0.0
       with structured-output schema (5 sections + evidence_links)
    4. Persist to weekly_narratives keyed by (user_id, week_start)
    5. Best-effort idempotent: skip if a row exists for (user_id, week_start)
       AND last 24h
    ↓
Student opens Home Monday morning
  → GET /adaptive/weekly-narrative/current
    ↓
  Returns the most-recent weekly_narratives row for (user_id, current_week)

Mid-week event triggers (5+ meaningful sessions / mock complete / readiness Δ ≥ 5pp):
  - alp-engagement.process_session detects trigger, publishes
    NATS subject `weekly_narrative.delta`
  - alp-learning consumer regenerates a "what changed" mini-narrative
    (different prompt: weekly_narrative_delta@1.0.0)
```

### 2.3 Plan-edit flow (S55)

```
Student drags Tuesday Mechanics → Saturday in plan editor
  → POST /plans/{plan_id}/edit
    body: {kind: "move", session_id: "...", to_day_offset: 5}
    ↓
  alp-learning.plans.editor
    1. Read plan_sessions row, check is_required + locked_reason
    2. Compose edit context for AI Gateway
    3. Call AI Gateway touchpoint=plan_impact, prompt plan_impact@1.0.0
       (cached on (plan_id, edit_kind, payload_hash))
    4. Return ImpactPreview to client (synchronous; <2s p95)
    ↓
Client renders pop-over: "Moving this to Saturday is fine. No readiness impact."
Student confirms
  → POST /plans/{plan_id}/edit/{preview_id}/confirm
    ↓
  alp-learning.plans.editor
    1. Apply mutation to plan_sessions
    2. Append plan_edits row (audit log)
    3. Publish NATS plan.edited
    ↓
  alp-engagement listens; updates ux_kpis_daily plan-edit-to-adherence ratio
```

### 2.4 Recovery flow (S57)

```
NATS quiz.session.completed processed by analytics
  → alp-engagement.analytics.process_session detects:
    "user has 2+ planned sessions in last 7 days marked status='missed'"
  → publishes NATS recovery.needed
    ↓
  alp-learning.recovery.detector consumer
    1. Reads study_plans + plan_sessions
    2. Calls recovery.recovery_engine.generate_catch_up(...)
       (pure function — no AI for v1; 4-day plan template)
    3. Persists to recovery_proposals table
    ↓
  Student opens Home
    GET /recovery/active → returns recovery_proposals if any
    Frontend shows banner: "You missed 3 sessions. Here's a 4-day plan."
    Student accepts → POST /recovery/{id}/accept
    → atomic mutation: replace plan_sessions for next 4 days with recovery sessions
```

---

## 3. AI Gateway extensions

Phase 6 adds **4 new prompt templates** under three touchpoints. All conform to ADR-0019 §1.3 (structured-output) and §1.5 (explicit prompt versioning).

| Template ID | Touchpoint | Sprint | Cost target | Cache |
|---|---|---|---|---|
| `weekly_narrative@1.0.0` | evaluation | S53 | ≤ ₹0.30 / narrative | per (user_id, week_start) — see Schema §2 |
| `weekly_narrative_delta@1.0.0` | evaluation | S53 | ≤ ₹0.10 / mini | event-keyed |
| `mission_why@1.0.0` | evaluation | S50 | ≤ ₹0.005 / mission | per (user_id, kind, concept, day) |
| `plan_impact@1.0.0` | evaluation | S55 | ≤ ₹0.02 / edit | per (plan_id, edit_kind, payload_hash) |
| `recovery_plan@1.0.0` | evaluation | S57 | (heuristic v1; LLM v2) | n/a v1 |

Routing config (`/config/ai_routing.yaml`) gains the 5 entries under `routing.evaluation` (touchpoint already exists). Per-creator quotas extended to include weekly-narrative and plan-impact rate limits to prevent runaway cost on adversarial use.

---

## 4. NATS subject additions

| New subject | Publisher | Consumer | Purpose |
|---|---|---|---|
| `weekly_narrative.due` | scheduled stream (cron, 23:00 IST Sunday) | learning.adaptive.weekly_narrative | Fire weekly narrative generation |
| `weekly_narrative.delta` | engagement.process_session | learning.adaptive.weekly_narrative | Trigger mini-narrative on 5+ meaningful sessions / mock / readiness Δ |
| `mission.completed` | engagement.process_session (when daily_mission link is satisfied) | engagement.analytics aggregator + notification | Streak count + push notification |
| `plan.edited` | learning.plans.editor | engagement.analytics aggregator | KPI: plan-edit-to-adherence ratio |
| `recovery.needed` | engagement.analytics.process_session | learning.recovery.detector | Trigger recovery proposal |

Existing subjects unchanged.

---

## 5. Quiz Go service — minimal additions

Quiz Go gets the smallest surface area of any service in Phase 6:

```go
// services/quiz/internal/server/sessions.go — new fields
type QuizSession struct {
    ...existing fields...
    IntentAnchor       string  `json:"intent_anchor"`        // "match" | "push" | "build_confidence"
    CalibrationFeedback *string `json:"calibration_feedback"` // nullable
}

// New endpoint
func (s *Server) PostCalibration(w http.ResponseWriter, r *http.Request) { ... }

// Mid-quiz: tiny new endpoint that updates intent without resetting the session
func (s *Server) PostIntentUpdate(w http.ResponseWriter, r *http.Request) { ... }
```

The IRT MFI selector already accepts an offset parameter — Quiz Go calls
`POST /adaptive/select-next?intent_offset=X` from the existing flow. No
breaking changes; pre-Phase-6 callers continue to work.

The `quiz.session.completed` NATS payload extends with `intent_anchor` and
`calibration_feedback` (both `omitempty` — pre-Phase-6 publishers continue
working).

---

## 6. Frontend (web-student) restructure

### 6.1 Top-level routes after S52

```
/                → /home (or /screening if guest)
/home            → 4-section nav: Home tab
/practice        → 4-section nav: Practice tab (browse/search/quiz/revision/mock)
/insights        → 4-section nav: Insights tab (My State / What This Means / What To Do)
/me              → 4-section nav: Me tab (profile/bookmarks/history/settings)
/screening       → guest-friendly diagnostic (S49)

# Phase-5 deep-link routes preserved (no breaking change):
/concept-profile, /diagnostic-deep-dive, /revision, /syllabus, /analysis,
/error-patterns — all reachable from Insights tab + command palette
```

### 6.2 New shared components

| Component | Sprint | Used in |
|---|---|---|
| `MissionCard` | S50 | Home (web + mobile) |
| `WeeklyNarrativeCard` | S53 | Home + Insights |
| `IntentSelector` (3-button) | S54 | Pre-quiz |
| `FrictionPrompt` (bottom-sheet) | S54 | Quiz mid-session |
| `PostQuizCalibration` | S54 | QuizResult |
| `PlanEditor` (desktop week-grid + mobile list-with-swipe) | S55 | /insights/plan |
| `ImpactPreviewPopover` | S55 | PlanEditor |
| `RecoveryBanner` | S57 | Home |
| `ReflectionPrompt` | S57 | Post-session, post-mock, post-narrative |
| `LowBandwidthToggle` + offline-cache layer | S57 | Me settings + global |
| `CommandPalette` (`⌘K` / `Ctrl+K`) | S58 | Global |
| `QuickActionsTray` | S58 | Mobile FAB long-press |

### 6.3 Mobile bottom-nav

```
┌────────────┬────────────┬────────────┬────────────┐
│   Home     │  Practice  │  Insights  │     Me     │
│    🏠      │     ✏️      │     📊     │     👤     │
└────────────┴────────────┴────────────┴────────────┘
```

The four icons map 1:1 to web sidebar labels. Long-press the centre point opens Quick Actions tray (S58).

### 6.4 Mobile quiz redesign (S51)

| Surface | Today | Phase 6 |
|---|---|---|
| Layout | Sidebar + question + footer (cramped on mobile) | Question-first; sidebar collapsed to bottom-sheet |
| Difficulty controls | (None) | Pre-quiz `IntentSelector` modal; mid-quiz `FrictionPrompt` non-modal sheet (passive) |
| Network drop | Lost; restart session | Local answer queue; replay on reconnect |
| Bookmark / report / hint | Footer row | Bottom-sheet "More" button |

Implementation: extract a `QuizPlayer` component shared by desktop and mobile; mobile variant gates on `< 640 px`. Same backend contract.

---

## 7. Backwards-compatibility audit

Every Phase 6 change is **additive** at the API contract level. No existing endpoint changes its response shape. Specifically:

| Surface | Risk | Mitigation |
|---|---|---|
| `quiz_sessions` table | New columns | NULL default; pre-Phase-6 callers work |
| `quiz.session.completed` NATS payload | New optional fields | `omitempty`; pre-Phase-6 consumers ignore them |
| `/api/v1/content/questions` etc. | None | Phase 6 doesn't touch content routes |
| Phase-5 student routes | None | Preserved as deep links |
| Phase-5 admin dashboards | None | Phase 6 adds 2 new admin pages, doesn't modify existing |

The only **breaking** change is the Home page layout — but Home is a destination, not an API, so "breaking" here means visual restructure with a "What changed?" toast on first post-rollout login.

---

## 8. Telemetry inventory (UX-34)

The 11 KPIs from §13 of the UX review map to event names emitted by the client SDK:

| KPI | Event(s) |
|---|---|
| Guest screening completion rate | `screening.start`, `screening.q_answered`, `screening.complete`, `screening.signup_after` |
| Landing-to-signup conversion after screening | `screening.signup_clicked`, `screening.signup_completed` |
| First session completion rate | `quiz.session.start` (first ever for user), `quiz.session.complete` |
| Today's Mission start rate | `mission.shown`, `mission.started` |
| Today's Mission completion rate | `mission.started`, `mission.completed`, `mission.skipped` |
| Insights open rate after 3+ sessions | `insights.tab.opened` |
| Weekly narrative read/completion rate | `narrative.shown`, `narrative.section_expanded`, `narrative.evidence_drilled` |
| Plan edit-to-adherence ratio | `plan.edited` (kind), `mission.completed`, `mission.skipped` |
| Difficulty adjustment frequency | `difficulty.intent.set`, `difficulty.friction.shown`, `difficulty.friction.taken`, `difficulty.calibration.set` |
| Mid-quiz disconnect recovery success | `quiz.network.lost`, `quiz.network.replay`, `quiz.network.replay.success` |
| 7d / 30d retention | server-derived from session activity over time |

Event payload schema is fixed (typed, JSON Schema validated by the engagement endpoint) — adding fields without bumping the version causes ingestion to drop the row. Forces engineering discipline.

---

## 9. Migration / rollout

Phase 6 ships behind a feature flag `ux_copilot_enabled` per ADR-0001 (feature-flag platform). Default off in prod; on for opt-in cohorts; ramp by region (UPSC pilot first, then JEE, then NEET) over 4 weeks.

The 4-section IA toggles via the flag — when off, students see today's Home / Catalog / etc.; when on, students see the new 4-section layout. **One-time** "What's new?" toast on first login post-flag-on with a "tour" link.

Rollback: flip the flag off; old layout returns. Mission engine writes still happen in the background but aren't surfaced. No data loss, no schema rollback.

---

## 10. Risks (architectural)

| Risk | Mitigation |
|---|---|
| AI Gateway cost spike from weekly-narrative + plan-impact + mission-why | Per-touchpoint cost dashboards exist (ADR-0019); 80%/95% alerts; per-template cost target tracked weekly |
| ux_events table unbounded growth | Daily aggregation into ux_kpis_daily + 90-day retention on raw events (configurable) |
| Recovery engine over-triggers (2+ missed sessions in 7 days is too easy a threshold) | Threshold lives in config; can flip to 3+ in 10 days based on telemetry |
| Plan editor write-amplification on the engagement KPI aggregator | Aggregate is async (NATS subscriber); editor returns immediately on commit; KPI catches up within seconds |
| Anonymous screening Redis token misuse (DDoS the LLM via screening) | Token TTL 30 min; rate-limited per IP via Redis; LLM call only at "persist" step (post-signup) |
| Mobile bundle size growth (4-section IA + new components) | Code-split per route via Vite's lazy import; bundle-analyzer in CI fails build above 1.2 MB gz |
| Rollout breaking student bookmarks | Old routes preserved; flag-off restores old layout; a 4-week ramp gives telemetry time |

---

## 11. Open questions to resolve before S49 start

| ID | Question | Owner | Decision by |
|---|---|---|---|
| P6-OAQ-1 | Recovery threshold: 2+/7 days vs 3+/10 days? | Product + Eng | Before S57 |
| P6-OAQ-2 | Mid-quiz friction trigger thresholds (3 wrong, < 5 s, > 30 s)? Tune via telemetry? | ML Eng | Before S54 |
| P6-OAQ-3 | Cost ceiling per student per month for Phase 6 AI surfaces (₹X)? | Finance | Before S53 |
| P6-OAQ-4 | Push notification for missed-mission tomorrow (Phase 7) — scope today as "Phase 6 ships without push, evaluate uplift" | Product | Confirm at S58 close |
| P6-OAQ-5 | Mobile bottom-nav order — Home / Practice / Insights / Me — confirm with user research before S52 | Design | Before S52 |
| P6-OAQ-6 | Editorial review cadence on weekly_narrative outputs (weekly sample size, escalation trigger) | Editorial Lead | Before S53 |
