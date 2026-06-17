# Phase 6 — UX Co-Pilot · Low-Level Design Addenda

**Status:** Proposed (2026-05-02). Tracks ADR-0020 through ADR-0024.
**Scope:** Module-level design for the new Phase 6 modules — function signatures, data contracts, integration points. Read alongside [`08_Phase5_LLD_Addenda.md`](08_Phase5_LLD_Addenda.md) and [`13_Phase6_Architecture_Addendum.md`](../01_design/13_Phase6_Architecture_Addendum.md).

This LLD is **interface-and-contract-level**, not implementation-detail. Code comments + tests in the actual modules will carry the implementation specifics.

---

## 1. learning.mission (S50)

```
services/learning/src/learning/mission/
├── __init__.py
├── selector.py       — pure function: select_mission(...)
├── repositories.py   — daily_missions read/write
├── why_picked.py     — heuristic + AI Gateway call (mission_why@1.0.0)
├── routes.py         — POST /missions/today, /start, /complete, /skip
└── schemas.py        — Pydantic models
```

### 1.1 Mission selector (pure function)

```python
# selector.py

@dataclass(frozen=True)
class Mission:
    kind: Literal["refresh_decay","weak_concept_drill","bloom_lift","revision_set","mock_segment"]
    concept_id: UUID | None
    expected_minutes: int
    expected_questions: int
    why_picked: str          # populated post-selection
    primary_cta: dict[str, Any]
    secondary: dict[str, Any] = field(default_factory=lambda: {"action": "skip"})

def select_mission(
    *,
    user_id: UUID,
    time_budget_minutes: int,
    concept_mastery: dict[UUID, MasteryRow],
    bloom_mastery: dict[tuple[UUID, str], MasteryRow],
    decay_signals: dict[UUID, DecayRow],
    revision_queue: list[RevisionItem],
    mock_history: list[MockAttempt],
    last_mission: Mission | None = None,
    plan_session_today: PlanSession | None = None,  # S55 integration
) -> Mission:
    """Pick a single daily mission. Pure function; does NOT call AI Gateway.

    Resolution order:
      1. plan_session_today exists → wrap that as a mission
      2. Highest-priority decay (mastery > 0.4 + days > 14) → refresh_decay
      3. Highest-priority weak concept (mastery < 0.4) → weak_concept_drill
      4. Bloom inversion (mastery ≥ 0.7 at REMEMBER, < 0.4 at APPLY) → bloom_lift
      5. SRS queue ≥ 5 same-topic due-today → revision_set
      6. Last mock > 14 days ago → mock_segment
      7. Else: weak_concept_drill on the lowest-mastery concept

    Anti-repeat: if last_mission.kind == picked.kind AND last_mission.concept_id ==
    picked.concept_id, demote to next-priority candidate (avoid back-to-back same).
    """
```

### 1.2 Why-picked (templated + LLM)

```python
# why_picked.py

HEURISTIC_TEMPLATES: dict[str, str] = {
    "refresh_decay":
        "This topic dropped from {before:.2f} to {after:.2f} after {days} days without practice.",
    "weak_concept_drill":
        "You missed {wrong}/{total} on your last attempt; mastery is at {ewa:.0%}.",
    "bloom_lift":
        "You can recall it (REMEMBER {recall:.0%}); today's mission stretches you to apply it.",
    "revision_set":
        "{count} questions are due today by spaced repetition.",
    "mock_segment":
        "Mock-pace is your weakest signal — last mock was {days} days ago.",
}

async def populate_why_picked(
    mission: Mission,
    signals: MissionSignals,
    session: AsyncSession,
    use_llm: bool = False,
) -> Mission:
    """Fill mission.why_picked. Heuristic by default; LLM optional for prose
    that connects to the student's recent history (mission_why@1.0.0)."""
```

### 1.3 Routes

```python
@router.post("/missions/today")        # GET-style; idempotent for the same day
@router.post("/missions/{mid}/start")
@router.post("/missions/{mid}/complete")
@router.post("/missions/{mid}/skip")
```

### 1.4 Wire into existing engagement consumer

`services/engagement/src/engagement/analytics/events.py::process_session` extends:

```python
# After mastery + readiness updates (existing):
try:
    await link_session_to_mission(
        session=engagement_db,
        user_id=user_id,
        session_id=item.session_id,
        completed_at=item.completed_at,
    )
except Exception as e:
    log.warn("mission_link_failed", err=e)  # best-effort fan-out per existing pattern
```

`link_session_to_mission` reads today's `daily_missions` row, sets `status='completed'` if the underlying session passed quality gates (≥ 60% completion, avg ≥ 30s/q).

---

## 2. learning.plans (S55)

```
services/learning/src/learning/plans/
├── __init__.py
├── generator.py      — generate_initial(...) + regenerate_week(...)
├── editor.py         — Move / Swap / Rest / Shorten / Add operations
├── soft_actions.py   — Replace / Postpone / Split (used when is_required blocks delete)
├── impact_preview.py — AI Gateway call + heuristic fallback
├── repositories.py
├── routes.py
└── schemas.py
```

### 2.1 Plan generator (pure function)

```python
@dataclass(frozen=True)
class GeneratedSession:
    day_offset: int             # 0..6 within the week
    slot: Literal["morning","afternoon","evening"]
    kind: Literal["practice","revision","mock"]
    concept_id: UUID
    expected_minutes: int
    expected_questions: int
    is_required: bool
    locked_reason: str | None   # populated when is_required=true

def generate_week(
    *,
    user_id: UUID,
    daily_minutes_goal: int,
    target_date: date,
    exam_date: date,
    concept_mastery: dict[UUID, MasteryRow],
    bloom_mastery: dict[tuple[UUID, str], MasteryRow],
    decay_signals: dict[UUID, DecayRow],
    days_since_last_mock: int,
) -> list[GeneratedSession]:
    """Pure function. Heuristic v1: cover the highest-impact concepts at
    appropriate cadence. is_required=true for weak (< 0.4) AND prerequisite-
    chained AND for the weekly mock. Cap rest days based on
    target_date - today. Distribute across mornings/evenings."""
```

### 2.2 Editor (mutates plan_sessions)

```python
class EditKind(str, Enum):
    MOVE = "move"
    SWAP = "swap"
    REST = "rest"
    SHORTEN = "shorten"
    ADD = "add"
    REGENERATE = "regenerate"

async def apply_edit(
    *,
    plan_id: UUID,
    edit: EditPayload,
    session: AsyncSession,
    impact_preview: ImpactPreview,
) -> tuple[list[PlanSession], PlanEdit]:
    """Validates the edit (is_required guard), applies the mutation,
    appends a plan_edits audit row. Returns (new sessions list, edit row)."""
```

### 2.3 Impact preview

```python
async def compute_impact(
    *,
    plan_id: UUID,
    edit: EditPayload,
    plan_state_before: list[PlanSession],
    use_llm: bool = True,
) -> ImpactPreview:
    """AI Gateway call (plan_impact@1.0.0). Cached on
    (plan_id, edit_kind, payload_hash). Heuristic fallback per edit_kind."""
```

### 2.4 Routes

```python
@router.post("/plans/generate")               # First plan after onboarding
@router.get("/plans/{user_id}/active")
@router.post("/plans/{plan_id}/edit")          # returns ImpactPreview
@router.post("/plans/{plan_id}/edit/{preview_id}/confirm")
@router.post("/plans/{plan_id}/regenerate")
```

---

## 3. learning.adaptive.weekly_narrative (S53)

```python
# services/learning/src/learning/adaptive/weekly_narrative.py

PROMPT_TEMPLATE_ID = "weekly_narrative"
PROMPT_TEMPLATE_VERSION = "1.0.0"

NARRATIVE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["improved", "slipping", "hidden_pattern", "forecast", "week_ahead"],
    "properties": {
        "improved": {
            "type": "object",
            "required": ["text", "data_link"],
            "properties": {
                "text": {"type": "string", "description": "1 sentence..."},
                "data_link": {"$ref": "#/$defs/data_link"},
            },
        },
        # slipping, hidden_pattern, forecast, week_ahead — same shape
    },
    "$defs": {
        "data_link": {
            "type": "object",
            "required": ["kind"],
            "properties": {
                "kind": {"enum": ["concept_mastery_delta", "decay", "time_of_day_accuracy", "readiness_slope", "plan_session_id"]},
                # ... plus per-kind fields
            },
        },
    },
}

async def generate_weekly_narrative(
    *,
    user_id: UUID,
    week_start: date,
    signals: WeeklySignals,
    session: AsyncSession,
) -> WeeklyNarrative:
    """Calls AI Gateway, persists to weekly_narratives, returns row."""
```

`WeeklySignals` is a dataclass that aggregates the 6 inputs from §3.1 (per-concept EWA delta, decay arrows, time-of-day, mock results, readiness slope, plan adherence).

### 3.1 Cron + event-trigger

```python
# services/learning/src/learning/adaptive/weekly_narrative_cron.py
async def run_weekly_cron():
    """Subject `weekly_narrative.due` consumer. Iterates active users;
    skips those with a row for current week_start. Idempotent."""

# services/engagement/src/engagement/analytics/events.py — fan-out
async def maybe_publish_narrative_delta(user_id, signal_change):
    """If 5+ meaningful sessions since last narrative OR mock complete OR
    readiness Δ ≥ 5pp, publish weekly_narrative.delta."""
```

---

## 4. learning.adaptive.intent_anchor + friction_prompt (S54)

### 4.1 Intent anchor

```python
# learning.adaptive.irt — extended

def select_initial_item(
    intent_anchor: Literal["match", "push", "build_confidence"],
    theta_hat: float,
    candidates: list[Item],
    exposure: dict[UUID, int],
) -> Item:
    offset = {"match": 0.0, "push": +0.4, "build_confidence": -0.4}[intent_anchor]
    return select_mfi(theta_hat + offset, candidates, exposure)
```

The offset is **session-bounded** — every subsequent EAP θ̂ update uses real responses unmodified.

### 4.2 Friction prompt heuristic

```python
# learning.adaptive.friction_prompt

@dataclass(frozen=True)
class FrictionTrigger:
    reason: Literal["repeated_wrong","fast_correct","long_hesitation","repeated_skip"]
    suggested_offset: float       # ±0.2

def evaluate_friction(
    session_history: list[ItemAttempt],   # from current session
    last_friction_at: int | None,         # idx of last fired prompt
) -> FrictionTrigger | None:
    """Returns a FrictionTrigger if a heuristic fires, else None.
    Constraint: at most one prompt per session — caller checks last_friction_at."""
```

Quiz Go calls `POST /adaptive/friction/check` between items with the session history; receives a single trigger or 204. Mid-quiz UI shows the bottom-sheet only when a trigger comes back.

### 4.3 Schema additions

`quiz_schema.quiz_sessions` adds:

```sql
intent_anchor TEXT NOT NULL DEFAULT 'match'
  CHECK (intent_anchor IN ('match','push','build_confidence')),
calibration_feedback TEXT NULL
  CHECK (calibration_feedback IS NULL OR calibration_feedback IN ('too_easy','right','too_hard')),
friction_fired_at_idx INT NULL
```

---

## 5. learning.recovery (S57)

```python
# learning.recovery.recovery_engine

@dataclass(frozen=True)
class RecoveryProposal:
    plan_id: UUID
    catch_up_sessions: list[GeneratedSession]   # 3-4 days, prioritised by is_required
    rationale: str
    expected_minutes: int

def propose_recovery(
    *,
    plan: StudyPlan,
    sessions: list[PlanSession],
    missed_session_ids: list[UUID],
    today: date,
    target_date: date,
) -> RecoveryProposal:
    """Pure-function. v1 heuristic: take the missed is_required sessions,
    spread them across the next 3-4 days, drop optional sessions to make
    room. Cap total daily minutes at the user's daily_minutes_goal."""
```

Routes:

```python
@router.get("/recovery/active")             # returns the latest unaccepted proposal
@router.post("/recovery/{proposal_id}/accept")
@router.post("/recovery/{proposal_id}/decline")
```

Detector lives in `learning.recovery.detector` as a NATS consumer on subject `quiz.session.completed` — checks the rolling window of plan_sessions for a 2+/7d miss.

---

## 6. learning.screening (S49)

```python
# learning.screening.blueprint

EXAM_AGNOSTIC_BLUEPRINT = [
    # 12 questions across 5 concepts × 3 difficulties + 2 sanity items
    # Hard-coded for v1; can become exam-specific in v2
]

async def start_screening(language: str = "en") -> ScreeningSession:
    """Anonymous-friendly. Returns a token + first question."""

async def answer(token: str, item_idx: int, answer_idx: int) -> ScreeningStep:
    """Stores in Redis under token; no DB write."""

async def reveal(token: str) -> ScreeningResult:
    """Pre-signup result: score + topic breakdown + readiness band suggestion."""

async def persist_to_user(token: str, user_id: UUID, session: AsyncSession):
    """After signup completes — write the screening session as the user's
    first quiz session in quiz_schema."""
```

Routes (no auth required for first three):

```python
@router.post("/screening/start")
@router.get("/screening/{token}/next")
@router.post("/screening/{token}/answer")
@router.get("/screening/{token}/reveal")
@router.post("/screening/{token}/persist")     # AUTH REQUIRED
```

---

## 7. engagement.analytics.ux_events (S49)

```python
# engagement.analytics.ux_events

@dataclass(frozen=True)
class UxEvent:
    user_id: UUID | None       # nullable: anonymous screening events
    session_id: UUID | None
    event_name: str            # snake_case_dotted: e.g. mission.started
    properties: dict[str, Any]
    occurred_at: datetime
    route: str | None
    variant: str | None        # for A/B tests
    user_agent: str | None
    network_kind: str | None   # 4g | 3g | 2g | wifi (from client)

async def insert_events(
    session: AsyncSession, events: list[UxEvent]
) -> int:
    """Bulk insert (1 INSERT per batch); validates event_name against the
    static allow-list ALLOWED_EVENTS to prevent ingestion of arbitrary
    field names. Drops invalid rows silently with a warning log."""
```

Aggregator runs nightly to populate `ux_kpis_daily` — one row per (date, kpi_name, dimension). KPIs from §13 of the UX review.

---

## 8. engagement.analytics.topic_decay + readiness_bands (S56)

### 8.1 Topic decay (pure function)

```python
@dataclass(frozen=True)
class DecayRow:
    decay_days: int
    decay_severity: Literal["fresh","mild","stale","critical"]

def compute_decay(
    *,
    last_attempted_at: datetime | None,
    current_ewa: float,
    n_attempts: int,
    today: datetime,
) -> DecayRow:
    """fresh: last_attempted within 7 days
       mild: 7–14 days
       stale: 14–30 days
       critical: > 30 days AND ewa > 0.4

    n_attempts < 3 → 'fresh' regardless (signal too thin)."""
```

### 8.2 Readiness bands (pure function)

```python
def readiness_band(
    readiness_score: float,
    days_to_exam: int,
    target_score: float,
) -> Literal["approaching","on_track","behind","at_risk"]:
    """approaching: score ≥ target
       on_track: gap < (days_to_exam × 0.005)         # ~+5pp/month linear
       behind: gap < (days_to_exam × 0.010)
       at_risk: gap >= (days_to_exam × 0.010)
    """
```

Thresholds live in `config/readiness_bands.yaml` for editorial tuning.

---

## 9. engagement.reflection (S57)

```python
# engagement.reflection.routes

@router.post("/reflections")     # Body: {trigger, prompt_id, response, commitment, commitment_due_at}
@router.post("/commitments/{id}/check-in")    # Body: {kept: bool, note?: str}
@router.get("/commitments/{user_id}")         # List the user's commitments
```

Cron: nightly worker fires due-tomorrow notifications.

---

## 10. apps/web-student client SDK (S49 instrumentation)

```typescript
// apps/web-student/src/lib/instrumentation.ts

import { auth, env } from "./api";

interface UxEvent {
  event_name: string;
  properties?: Record<string, unknown>;
  route?: string;
  variant?: string;
}

const _BUFFER: UxEvent[] = [];
let _flushTimer: number | null = null;

export function track(event_name: string, properties?: Record<string, unknown>) {
  _BUFFER.push({
    event_name,
    properties,
    route: window.location.pathname,
  });
  scheduleFlush();
}

function scheduleFlush() {
  if (_flushTimer !== null) return;
  _flushTimer = window.setTimeout(flush, 4000);
}

async function flush() {
  _flushTimer = null;
  if (_BUFFER.length === 0) return;
  const batch = _BUFFER.splice(0);
  try {
    await auth.fetch(`${env.apiBaseUrl}/analytics/ux-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // Drop on failure; UX telemetry must NEVER break the page.
  }
}

// Page-view auto-tracking
export function useTrackPage() {
  const location = useLocation();
  useEffect(() => track("page.viewed", { path: location.pathname }), [location]);
}
```

Used as: `track("mission.started", { mission_id, kind, concept_id })`.

---

## 11. Smoke test additions per sprint

Phase 6 grows the smoke test from ~120 steps to ~165:

| Sprint | Smoke steps added |
|---|---|
| S49 | screening guest-flow end-to-end, ux-events ingestion, ux_kpis_daily aggregation, kpi-dashboard renders |
| S50 | mission generation by signal, mission card render, start/complete/skip routes, link-on-completion in engagement |
| S51 | mobile quiz layout (viewport-gated), offline-replay, result page 3-zone layout |
| S52 | insights hub aggregator endpoint, deep-link preservation |
| S53 | weekly_narrative generation cold + warm cache, evidence-link round-trip, mini-narrative event-trigger |
| S54 | intent_anchor → IRT offset, friction prompt heuristic firing, post-quiz calibration |
| S55 | plan generation, edit + impact preview round-trip, regenerate cap, soft-action menu |
| S56 | decay computation, readiness band classification, revision-as-ritual end-to-end |
| S57 | recovery proposal trigger, accept flow, reflection write, low-bandwidth toggle |
| S58 | command palette opens + searches, quick-actions tray, confidence calibration write, error-pattern coaching cards, doubt-to-practice |
