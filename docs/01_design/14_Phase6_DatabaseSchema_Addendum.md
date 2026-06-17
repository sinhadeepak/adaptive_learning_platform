# Phase 6 — UX Co-Pilot · Database Schema Addendum

**Status:** Proposed (2026-05-02). Tracks ADR-0020 through ADR-0024.
**Scope:** All new tables and column additions for Phase 6 (S49–S58). Read alongside [`02_DatabaseSchema_ERD_AdaptiveLearningPlatform.docx`](02_DatabaseSchema_ERD_AdaptiveLearningPlatform.docx) and the [Phase 5 schema additions in 12_Phase5_Architecture_Addendum.md](12_Phase5_Architecture_Addendum.md).

> **Headline:** 11 new tables across 3 schemas. Two columns added to `quiz_schema.quiz_sessions`. **All migrations additive + reversible** (no destructive changes), per the Phase-4-retrospective constraint that's been load-bearing since Sprint 22.

---

## 1. Migration inventory

| Migration | Service | Schema | Sprint | Description |
|---|---|---|---|---|
| `engagement/analytics/0XX_ux_events.py` | engagement | analytics_schema | S49 | Append-only UX telemetry events |
| `engagement/analytics/0XX_ux_kpis_daily.py` | engagement | analytics_schema | S49 | Daily aggregation rollup |
| `learning/content/0XX_screening_attempts.py` | learning | content_schema | S49 | (Optional) persist anonymous screening to first session post-signup |
| `learning/content/0XX_daily_missions.py` | learning | content_schema | S50 | One row per (user, date) — daily mission state |
| `learning/content/0XX_study_plans.py` | learning | content_schema | S55 | Weekly study plan header |
| `learning/content/0XX_plan_sessions.py` | learning | content_schema | S55 | Sessions inside a plan |
| `learning/content/0XX_plan_edits.py` | learning | content_schema | S55 | Audit log of plan edits |
| `learning/content/0XX_weekly_narratives.py` | learning | content_schema | S53 | Cached weekly narrative payloads |
| `learning/content/0XX_recovery_proposals.py` | learning | content_schema | S57 | Recovery-mode proposals |
| `engagement/analytics/0XX_reflections_commitments.py` | engagement | analytics_schema | S57 | Student reflection + commitment loop |
| `quiz/0XX_quiz_session_intent.up.sql` | quiz (Go) | quiz_schema | S54 | Add `intent_anchor` + `calibration_feedback` + `friction_fired_at_idx` |

---

## 2. New tables — DDL

### 2.1 `analytics_schema.ux_events` (S49)

Append-only event log. ~10× the volume of quiz sessions — partitioned by month for retention.

```sql
CREATE TABLE analytics_schema.ux_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NULL,                -- nullable: anonymous screening
    session_id      UUID NULL,                -- optional link to quiz session
    event_name      TEXT NOT NULL,            -- e.g. mission.started
    properties      JSONB NOT NULL DEFAULT '{}'::jsonb,
    route           TEXT NULL,
    variant         TEXT NULL,                -- A/B test bucket
    user_agent      TEXT NULL,
    network_kind    TEXT NULL,                -- 4g/3g/2g/wifi (client-reported)
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_event_name_format CHECK (event_name ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
) PARTITION BY RANGE (occurred_at);

-- Auto-create monthly partitions via cron (similar to ai_gateway audit_log)
CREATE INDEX idx_ux_events_user ON analytics_schema.ux_events (user_id, occurred_at DESC);
CREATE INDEX idx_ux_events_event ON analytics_schema.ux_events (event_name, occurred_at DESC);
CREATE INDEX idx_ux_events_session ON analytics_schema.ux_events (session_id) WHERE session_id IS NOT NULL;
```

**Retention:** raw events keep for 90 days; daily aggregations live in `ux_kpis_daily` indefinitely.

### 2.2 `analytics_schema.ux_kpis_daily` (S49)

Aggregation rollup, computed nightly from `ux_events`.

```sql
CREATE TABLE analytics_schema.ux_kpis_daily (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date            DATE NOT NULL,
    kpi_name        TEXT NOT NULL,
    dimension       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- e.g. {"variant": "B", "exam": "JEE"}
    value           NUMERIC NOT NULL,
    sample_size     INT NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_ux_kpis_daily UNIQUE (date, kpi_name, dimension)
);

CREATE INDEX idx_ux_kpis_daily_kpi ON analytics_schema.ux_kpis_daily (kpi_name, date DESC);
```

**KPIs computed:** the 11 from §13 of the UX review + per-mission-kind start/completion rates.

### 2.3 `content_schema.daily_missions` (S50)

One row per (user, date). The mission card reads this; engagement writes to it on session-completion.

```sql
CREATE TABLE content_schema.daily_missions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    mission_date        DATE NOT NULL,
    kind                TEXT NOT NULL
        CHECK (kind IN ('refresh_decay','weak_concept_drill','bloom_lift','revision_set','mock_segment')),
    concept_id          UUID NULL,
    expected_minutes    INT NOT NULL,
    expected_questions  INT NOT NULL,
    why_picked          TEXT NOT NULL,
    why_picked_source   TEXT NOT NULL DEFAULT 'heuristic'
        CHECK (why_picked_source IN ('heuristic','ai')),
    primary_cta         JSONB NOT NULL,
    plan_session_id     UUID NULL,                  -- linked to plan_sessions when applicable
    status              TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','started','completed','skipped','expired')),
    started_at          TIMESTAMPTZ NULL,
    completed_at        TIMESTAMPTZ NULL,
    skipped_at          TIMESTAMPTZ NULL,
    linked_session_id   UUID NULL,                  -- the actual quiz session when started
    completion_quality_score NUMERIC NULL,          -- 0..1; computed at completion (≥ 60% completion + ≥ 30s/q)
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_daily_missions_user_date UNIQUE (user_id, mission_date)
);

CREATE INDEX idx_daily_missions_user ON content_schema.daily_missions (user_id, mission_date DESC);
CREATE INDEX idx_daily_missions_status ON content_schema.daily_missions (status, mission_date);
```

### 2.4 `content_schema.study_plans` (S55)

```sql
CREATE TABLE content_schema.study_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    week_start          DATE NOT NULL,
    target_date         DATE NULL,
    daily_minutes_goal  INT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','superseded','completed','abandoned')),
    source              TEXT NOT NULL DEFAULT 'ai_initial'
        CHECK (source IN ('ai_initial','ai_regenerated','student_edited')),
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_edited_at      TIMESTAMPTZ NULL,

    CONSTRAINT uq_study_plans_user_week UNIQUE (user_id, week_start)
);

CREATE INDEX idx_study_plans_user_active
    ON content_schema.study_plans (user_id, week_start)
    WHERE status = 'active';
```

### 2.5 `content_schema.plan_sessions` (S55)

```sql
CREATE TABLE content_schema.plan_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             UUID NOT NULL REFERENCES content_schema.study_plans(id) ON DELETE CASCADE,
    day_offset          SMALLINT NOT NULL CHECK (day_offset BETWEEN 0 AND 6),
    slot                TEXT NOT NULL CHECK (slot IN ('morning','afternoon','evening','flex')),
    kind                TEXT NOT NULL CHECK (kind IN ('practice','revision','mock')),
    concept_id          UUID NULL,
    expected_minutes    INT NOT NULL,
    expected_questions  INT NOT NULL,
    is_required         BOOLEAN NOT NULL DEFAULT false,
    locked_reason       TEXT NULL,                  -- populated when is_required=true
    status              TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','in_progress','completed','missed','postponed','removed')),
    completed_at        TIMESTAMPTZ NULL,
    linked_session_id   UUID NULL,
    position            INT NOT NULL DEFAULT 0      -- ordering within (day_offset, slot)
);

CREATE INDEX idx_plan_sessions_plan ON content_schema.plan_sessions (plan_id, day_offset, position);
CREATE INDEX idx_plan_sessions_required
    ON content_schema.plan_sessions (plan_id, is_required) WHERE is_required = true;
```

### 2.6 `content_schema.plan_edits` (S55) — audit log

```sql
CREATE TABLE content_schema.plan_edits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID NOT NULL REFERENCES content_schema.study_plans(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    edit_kind       TEXT NOT NULL
        CHECK (edit_kind IN ('move','swap','rest','shorten','add','regenerate','replace','postpone','split')),
    payload         JSONB NOT NULL,
    impact_preview  JSONB NULL,                     -- the AI Gateway response
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_edits_plan ON content_schema.plan_edits (plan_id, occurred_at DESC);
```

### 2.7 `content_schema.weekly_narratives` (S53)

```sql
CREATE TABLE content_schema.weekly_narratives (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL,
    week_start               DATE NOT NULL,
    narrative                JSONB NOT NULL,
    signals_snapshot         JSONB NOT NULL,        -- for explain-this drill-downs
    source                   TEXT NOT NULL DEFAULT 'ai'
        CHECK (source IN ('ai','heuristic_fallback')),
    model                    TEXT NULL,
    prompt_template_id       TEXT NOT NULL,
    prompt_template_version  TEXT NOT NULL,
    is_delta                 BOOLEAN NOT NULL DEFAULT false,
    delta_trigger            TEXT NULL              -- 'meaningful_sessions' | 'mock_complete' | 'readiness_jump'
        CHECK (delta_trigger IS NULL OR delta_trigger IN ('meaningful_sessions','mock_complete','readiness_jump')),
    generated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    seen_at                  TIMESTAMPTZ NULL,
    sections_expanded        JSONB NULL             -- which sections the student opened (telemetry)
);

CREATE UNIQUE INDEX uq_weekly_narratives_full
    ON content_schema.weekly_narratives (user_id, week_start, prompt_template_version)
    WHERE is_delta = false;

CREATE INDEX idx_weekly_narratives_user ON content_schema.weekly_narratives (user_id, week_start DESC);
```

The unique constraint allows one full narrative per (user, week, version) but unlimited deltas.

### 2.8 `content_schema.recovery_proposals` (S57)

```sql
CREATE TABLE content_schema.recovery_proposals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    plan_id             UUID NOT NULL REFERENCES content_schema.study_plans(id) ON DELETE CASCADE,
    triggered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    missed_session_ids  JSONB NOT NULL,              -- array of UUIDs from plan_sessions
    catch_up_payload    JSONB NOT NULL,              -- the proposed 3-4 day plan
    rationale           TEXT NOT NULL,
    expected_minutes    INT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','accepted','declined','expired')),
    decided_at          TIMESTAMPTZ NULL
);

CREATE INDEX idx_recovery_user_pending
    ON content_schema.recovery_proposals (user_id, triggered_at DESC)
    WHERE status = 'pending';
```

### 2.9 `analytics_schema.reflections_commitments` (S57)

```sql
CREATE TABLE analytics_schema.reflections_commitments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL,
    trigger                 TEXT NOT NULL
        CHECK (trigger IN ('session','mock','weekly')),
    trigger_artifact_id     UUID NULL,                  -- session_id / mock_id / narrative_id
    prompt_id               TEXT NOT NULL,              -- from a static prompt registry
    response                TEXT NULL,
    commitment              TEXT NULL,
    commitment_due_at       TIMESTAMPTZ NULL,
    commitment_status       TEXT NULL
        CHECK (commitment_status IS NULL OR commitment_status IN ('pending','kept','missed')),
    check_in_response       TEXT NULL,
    occurred_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_check_in_at        TIMESTAMPTZ NULL
);

CREATE INDEX idx_reflections_user ON analytics_schema.reflections_commitments (user_id, occurred_at DESC);
CREATE INDEX idx_commitments_due
    ON analytics_schema.reflections_commitments (commitment_due_at)
    WHERE commitment_status = 'pending';
```

### 2.10 `content_schema.screening_attempts` (S49) — optional persistence

Anonymous screening lives in Redis (token cache, 30-min TTL). Post-signup we persist the attempt:

```sql
CREATE TABLE content_schema.screening_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,           -- always set; anonymous attempts only persist after signup
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_responses  JSONB NOT NULL,          -- {q_id: {picked, correct, time_ms}}
    score_pct       NUMERIC NOT NULL,
    topic_breakdown JSONB NOT NULL,          -- {topic_id: {correct, total}}
    readiness_seed  NUMERIC NOT NULL,        -- post-screening readiness band
    blueprint_version TEXT NOT NULL DEFAULT '1.0.0'
);

CREATE INDEX idx_screening_user ON content_schema.screening_attempts (user_id, completed_at DESC);
```

---

## 3. Column additions to existing tables

### 3.1 `quiz_schema.quiz_sessions` (S54)

Quiz Go service. Up migration:

```sql
ALTER TABLE quiz_schema.quiz_sessions
    ADD COLUMN intent_anchor       TEXT NOT NULL DEFAULT 'match'
        CHECK (intent_anchor IN ('match','push','build_confidence')),
    ADD COLUMN calibration_feedback TEXT NULL
        CHECK (calibration_feedback IS NULL OR calibration_feedback IN ('too_easy','right','too_hard')),
    ADD COLUMN friction_fired_at_idx INT NULL;
```

Down migration drops all three columns. The `intent_anchor` default of `'match'` means pre-Phase-6 rows behave identically to today's quiz sessions.

### 3.2 `analytics_schema.concept_mastery` — no schema change, just consumer

The existing Phase-5 table is read by the new `topic_decay` and `mission` modules. **No new columns** — the `last_seen_at` and `n` columns already provide everything decay needs.

---

## 4. Foreign-key map (cross-service awareness)

Per ADR-0005, services don't share databases — but they reference foreign keys logically across DB boundaries. Cross-service references in this addendum:

| New row | References | Service boundary |
|---|---|---|
| `daily_missions.linked_session_id` | `quiz_schema.quiz_sessions.id` | learning ↔ quiz (logical only; no FK) |
| `plan_sessions.linked_session_id` | `quiz_schema.quiz_sessions.id` | learning ↔ quiz (logical only) |
| `weekly_narratives.signals_snapshot` (JSONB) | `analytics_schema.concept_mastery` rows | learning ↔ engagement (snapshotted at write time, not FK'd) |
| `recovery_proposals.missed_session_ids` (JSONB array) | `plan_sessions.id` | within learning |

The `plan_sessions.linked_session_id` and `daily_missions.linked_session_id` are populated by the engagement consumer when `quiz.session.completed` fires — so the cross-service write is event-driven, not synchronous.

---

## 5. Indexes & retention summary

| Table | Volume estimate (cohort 10K students × 1 yr) | Retention |
|---|---|---|
| `ux_events` (partitioned monthly) | ~50M rows / yr | 90 days raw; aggregated forever in `ux_kpis_daily` |
| `ux_kpis_daily` | ~3K rows / yr | Forever |
| `daily_missions` | ~3.6M rows / yr (1/student/day) | Forever (small) |
| `study_plans` | ~520K rows / yr (1/student/week) | Forever |
| `plan_sessions` | ~10M rows / yr (~20/plan) | Tied to `study_plans` cascade |
| `plan_edits` | ~5M rows / yr (~10 edits/plan) | Forever (audit) |
| `weekly_narratives` | ~520K full + ~1M deltas / yr | Forever (cache + audit) |
| `recovery_proposals` | ~50K rows / yr | Forever (audit) |
| `reflections_commitments` | ~3M rows / yr (~1/session) | Forever |
| `screening_attempts` | ~10K rows / yr (1/student) | Forever (research signal) |
| `quiz_sessions` columns | (no row delta) | n/a |

---

## 6. PII / data-classification posture

| Table | Contains PII? | DPDP classification |
|---|---|---|
| `ux_events` | `properties` may contain free-form fields — schema enforces no email/phone shapes | Sensitive — pseudonymous; user_id hashable on export |
| `daily_missions`, `study_plans`, `plan_sessions`, `plan_edits` | Concept references + status; no PII | Internal |
| `weekly_narratives` | LLM prose may include the student's first name (rare) — sanitised by AI Gateway PII scrubber per ADR-0019 §1.4 | Sensitive |
| `recovery_proposals` | No PII | Internal |
| `reflections_commitments` | Free-text `response` and `commitment` fields — student-authored, may contain PII | Sensitive |
| `screening_attempts` | No PII (item-level data only) | Internal |

The AI Gateway PII scrubber (per ADR-0019) is the chokepoint for any free-text leaving the platform. No new PII channels open in Phase 6.

---

## 7. Test data fixtures

Each new table gets a fixture-builder in tests:

```python
# services/learning/tests/fixtures/missions.py
def make_daily_mission(user_id, date=today, kind="weak_concept_drill", **kwargs): ...

# services/engagement/tests/fixtures/ux_events.py
def make_ux_event(user_id, event_name="mission.started", **kwargs): ...

# services/learning/tests/fixtures/plans.py
def make_study_plan(user_id, **kwargs): ...
def make_plan_session(plan_id, **kwargs): ...
```

Smoke tests use these fixtures to seed before verifying the route handlers. No new seeded data lands in production migrations — migrations are structure-only.

---

## 8. Rollback discipline

Every migration in this addendum is **reversible**. Down-migrations are tested in CI.

The one risky change is `quiz_schema.quiz_sessions` getting three new NOT-NULL-with-default columns. Rollback drops them; pre-Phase-6 quiz Go code reads no extra columns; no break.

For the new tables, rollback simply DROPs them. They are downstream of the application; no cross-service dependency. The order of rollback (if multiple sprints had to revert at once) is reverse-of-up; cascade FKs handle the cleanup.

---

## 9. Open schema questions

| ID | Question | Owner | Decision by |
|---|---|---|---|
| P6-SCH-1 | Partition `ux_events` monthly or weekly? Volume estimate suggests monthly is enough. | DBA | Before S49 |
| P6-SCH-2 | Should `weekly_narratives.signals_snapshot` include the full mastery vector (~100 concepts) or be a summary? Snapshot size impacts row weight. | Eng | Before S53 |
| P6-SCH-3 | `plan_edits` retention — keep forever (audit) or trim to 1 year? | Compliance + Eng | Before S55 |
| P6-SCH-4 | `recovery_proposals` triggered by 2+/7d — store the threshold in DB (per-user) or config? | Product + Eng | Before S57 |
| P6-SCH-5 | `screening_attempts` linked to the user's first persisted quiz session? Cross-service FK style. | Eng | Before S49 |
