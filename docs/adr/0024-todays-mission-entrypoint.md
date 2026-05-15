# ADR-0024: Today's Mission as the primary daily entrypoint

- **Status**: accepted (frontend + backend shipped — see Phase 5/6 commits)
- **Date**: 2026-05-02
- **Deciders**: CTO, Tech Lead, Product Lead, Design Lead, ML Lead
- **Related**: Phase 6 ADR family. Companion to [ADR-0020](0020-ux-copilot-scope-and-ia.md), [ADR-0021](0021-hybrid-weekly-narrative.md), [ADR-0023](0023-constrained-plan-coediting.md). Builds on [ADR-0017](0017-multi-parameter-assessment-engine.md) (concept-grain mastery + decay), [ADR-0014](0014-spaced-repetition-scheduling.md) (SRS revision queue).

## Context

Today's Home dashboard shows a wall of statistics: streak, readiness, recent sessions, recommended topics, weekly activity bars. Returning students decode this every morning to figure out *what to study right now* — and the friction is real. The reviewer's framing is direct: **"daily decision reducer"** — the home page should answer one question, not five.

The platform already has the inputs to answer that one question:

- **Concept-grain mastery** with EWA + decay (Phase 5 S39)
- **Bloom-level breakdown** (Phase 5 S39)
- **Spaced-repetition queue** with mastery clamp (S27)
- **Mock readiness gap** (Phase 4 readiness signal)
- **Error-pattern history** (S29 6-axis classifier)

What's missing is the synthesis: a single daily *prescription* that reads all those signals, picks one ~25-minute action, and tells the student *why* that action and not another.

The reviewer proposes a **Today's Mission card** that lives above the fold on Home. The card carries a clear mission, a duration, a reason, a primary CTA, and a "not today, pick something else" escape hatch. This is the daily-loop equivalent of the weekly narrative (ADR-0021) — same posture (AI synthesises, student decides) at a different cadence.

## Decision

Adopt **Today's Mission** as the primary daily entrypoint on Home (web-student) and on the mobile app's first tab. The mission is generated server-side by a `mission_engine` module (new in `alp-learning`), persisted in `daily_missions`, and rendered as a single card with one decision: *Start* or *Skip and pick yourself*.

### Mission types (5)

| Kind | Triggered when | Example payload |
|---|---|---|
| `refresh_decay` | Concept's `last_attempted > 14d` AND mastery > 0.4 | "Refresh Organic Reactions before it decays further · 25 min · 12 questions" |
| `weak_concept_drill` | Concept's mastery < 0.4 AND decay days < 7 | "Drill Newton's 3rd law — your mastery dropped to 0.32 · 30 min · 15 questions" |
| `bloom_lift` | Concept mastery ≥ 0.7 at REMEMBER but < 0.4 at APPLY | "Lift your Cell Biology to APPLY level · 20 min · 10 questions at JEE difficulty" |
| `revision_set` | SRS queue has ≥ 5 due-today items in same topic | "Today's revision set · 5 questions · ~10 min" |
| `mock_segment` | Last mock > 14 days ago | "Take a 30-min mock segment on Mechanics — your last mock was 16 days ago" |

The selector is a pure function:

```python
def select_mission(
    user_id: str,
    time_budget_minutes: int,             # default 25; configurable in Me settings
    concept_mastery: dict[str, MasteryRow],
    bloom_mastery: dict[tuple[str, str], MasteryRow],
    decay_signals: dict[str, DecayRow],
    revision_queue: list[RevisionItem],
    mock_history: list[MockAttempt],
    last_mission: DailyMission | None,     # avoid back-to-back same-kind missions
) -> Mission
```

Output:

```python
@dataclass(frozen=True)
class Mission:
    kind: str  # one of the 5 above
    concept_id: str | None
    expected_minutes: int
    expected_questions: int
    why_picked: str  # 1 sentence — populated by AI Gateway prompt mission_why@1.0.0
    primary_cta: dict  # e.g. {"action": "start_quiz", "topic_id": "...", "intent": "match"}
    secondary: dict  # always {"action": "skip", "label": "Not today — pick something else"}
```

### "Why picked" — concrete and signal-backed

The single most important field on the card. Like the weekly narrative's evidence links, the `why_picked` is a one-sentence rationale tied to a specific signal:

- **decay**: "This topic dropped from 0.68 to 0.51 after 11 days without practice."
- **weak**: "You missed 7 of 10 last attempt; this concept is the prerequisite for 3 upcoming chapters."
- **bloom**: "You can recall it; today's mission stretches you to apply it."
- **revision**: "Five questions are due today by spaced repetition."
- **mock**: "Mock-pace timing is your weakest signal — let's get a fresh data point."

Heuristic templates by default; AI Gateway (`mission_why@1.0.0`, touchpoint `mission_why`) for personalised prose when budget allows. Read-through cached on `(user_id, mission_kind, concept_id, day)`.

### Generation cadence

- **Generated once per day per user** at first Home open (lazy) OR at midnight UTC by the engagement worker (eager — for streak/notification side-effects).
- Cached in `daily_missions` keyed by `(user_id, date)`. Re-opening Home doesn't regenerate.
- "Skip and pick yourself" doesn't burn the day's mission — it sets `status='skipped'` and offers a fresh one tomorrow.
- "Complete" sets `status='completed'` and feeds the streak counter.

### Mission card UX (sealed)

```
┌─────────────────────────────────────────────────────┐
│ ✦ TODAY'S MISSION                                   │
│                                                     │
│ Refresh Organic Reactions before it decays further  │
│                                                     │
│ 25 min · 12 questions · Match your level            │
│                                                     │
│ Why picked:                                         │
│ This topic dropped from 0.68 to 0.51 after 11 days  │
│ without practice.                                   │
│                                                     │
│ ┌──────────────┐  ┌──────────────────────────────┐  │
│ │ Start mission│  │ Not today — pick yourself    │  │
│ └──────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

The card is the **only** content above the fold on Home for daily-active students. Stats / streak / readiness / week preview move below.

### Plan editor (ADR-0023) integration

When the student has an active study plan (`study_plans.status = 'active'`), Today's Mission picks **today's first plan_sessions row** as the mission *before* falling back to the heuristic engine. This keeps the mission card consistent with the plan the student edited. The mission engine's role then becomes:
1. Read today's `plan_sessions` for the user.
2. If none (rest day) — show "Today is a rest day, see you tomorrow" card.
3. If plan_sessions empty (no active plan) — fall back to heuristic mission selector.

## Alternatives considered (rejected)

- **Show all 5 mission options simultaneously.** Rejected — defeats "daily decision reducer." The card's job is to *eliminate* choice on the daily timescale, not present it.
- **Random mission rotation** (cycle through the 5 kinds). Rejected — ignores the actual signals; a student with no decay should not get a `refresh_decay` mission.
- **Multi-mission daily plan** (e.g. 3 missions: morning / afternoon / evening). Rejected — 90% of students study in one block; the rare student who studies multiple times can hit the *Skip & pick yourself* path or use Practice tab. ADR-0020's "fewer top-level decisions" principle dominates.
- **Server pushes mission via NATS to a notification.** Rejected for v1 — adds complexity, push tokens, channel preferences. Lazy generation on Home open is sufficient. Push notification is a Phase 7 followup.
- **Let the student configure mission criteria** (e.g. "always pick weak topics over decay"). Rejected — paternalistic in the *opposite* direction; the engine's signal-priority is the right default. Power-user customisation is post-launch telemetry-driven.

## Consequences

### Positive

- **One decision per day.** The reviewer's primary KPI — *Today's Mission start rate* — becomes measurable from S49 instrumentation.
- **Signal-backed rationale.** Every mission card cites the specific data that triggered it; students learn what the engine notices.
- **Connects to plan editor.** When a plan exists, the mission *is* the plan. When no plan exists, mission picks heuristically. Same surface, two backends.
- **Cheap.** Mission generation is a pure-function call by default; AI Gateway "why_picked" is optional and cached. ~₹0.005 per mission worst case.
- **Composable with weekly narrative.** Sunday's narrative section "Week ahead" lists missions for the week; daily Home shows today's. Shared mental model.

### Negative

- **What if the engine picks wrong?** A returning student might disagree ("I don't want to refresh Organic Reactions today, I want to start Mechanics"). Mitigated by: explicit "Not today — pick yourself" CTA with one tap to Practice tab; rejection feeds the engine ("3 mission_kind=X rejections in a row → de-prioritise that kind").
- **Cold-start problem.** A new student with no signals can't get a meaningful mission. Mitigated by: post-screening, the mission engine reads the screening-test concept breakdown to seed; first three missions are tutorial-style.
- **Plan integration is a coupling point.** If the plan editor breaks, the mission card breaks. Mitigated by: the engine treats "no plan" as a normal state (heuristic fallback); plan_sessions read is wrapped in try/except like other engagement read paths.
- **Streak gamification risk.** A mission-completion-driven streak could pressure students into low-quality fast clicks. Mitigated by: streak only counts a mission as "complete" when the underlying session has ≥ 60% completion AND ≥ 30s average per question — `mission.status` set by the quiz session's actual completion, not by the student tapping a button.

### Follow-up work

- [ ] **S50** new module `learning.mission` with pure-function selector + AI Gateway hook
- [ ] **S50** `daily_missions` schema migration (per Phase 6 schema addendum)
- [ ] **S50** `POST /missions/today` (lazy generate) and `POST /missions/{id}/start` and `POST /missions/{id}/complete` and `POST /missions/{id}/skip`
- [ ] **S50** mission card on Home (web-student + mobile)
- [ ] **S50** rejection-feedback signal: 3 same-kind rejections de-prioritise that kind for 14 days
- [ ] **S55** mission engine reads `plan_sessions` first; falls back to heuristic
- [ ] **S58** mission analytics tile on `admin/ux-health` — start rate × completion rate × kind mix
- [ ] **Post-S58** push-notification integration (Phase 7)

## Review

The mission card is the highest-leverage daily surface in Phase 6. UX-34 telemetry must include: `mission.shown`, `mission.started`, `mission.skipped`, `mission.completed`, `mission.kind`, `mission.completion_quality_score`. Quarterly review of the kind-mix and the why_picked prompt template's output quality.
