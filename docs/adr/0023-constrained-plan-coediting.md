# ADR-0023: Constrained plan co-editing — student moves, AI protects required work

- **Status**: proposed
- **Date**: 2026-05-02
- **Deciders**: CTO, Tech Lead, Product Lead, Design Lead, Editorial Lead
- **Related**: Phase 6 ADR family. Companion to [ADR-0020](0020-ux-copilot-scope-and-ia.md), [ADR-0024](0024-todays-mission-entrypoint.md). Builds on [ADR-0019](0019-ai-gateway-and-consolidation.md) (AI Gateway provides the impact-preview prompt).

## Context

The platform doesn't have a study plan today. Students browse the catalog, take quizzes, and let the engine pick. The reviewer flags this as the third loop missing — *Recommendation* — and proposes that Phase 6 ship a weekly plan the student can edit.

The risk with editable plans is well-documented in education product research: **full edit freedom + procrastination = students delete the hard work**. A student given complete control over their week will move the difficult mock test to "next week, definitely," then "next week," forever. Under-confident students will silently delete weak-topic interventions because they're uncomfortable. The plan becomes a comfort blanket instead of a forcing function.

The opposite extreme — **read-only AI-generated plan** — fails the other way: students ignore it because it doesn't fit their actual life. A locked Tuesday-evening 60-minute mechanics block doesn't survive contact with reality (commute, dinner, exam-prep coaching class). Students stop opening the plan after week 2.

The reviewer's framing — *"students should be able to change when and how they study, but not silently remove the minimum work required to reach the goal"* — matches the agency principle from [ADR-0022](0022-difficulty-agency.md) but applied to time/scope rather than difficulty: **the algorithm chooses what work is required; the student chooses when and how to do it**.

## Decision

Adopt **constrained co-editing** with six action types, an `is_required` flag on every session, and an AI-generated impact-preview on every edit.

### Six edit actions

| Action | Allowed? | Guardrail |
|---|---|---|
| **Move** session to another day | ✓ | Auto-rebalance the week; preserve plan intent; respect rest-day caps |
| **Swap** session for another type | ✓ | AI surfaces 3 alternatives (different topic / mode / length) for the same readiness target |
| **Mark rest day** | ✓ | Default 1–2 rest days/week; cap based on target date + current readiness |
| **Shorten** session | ✓ | Show readiness impact ("shortening this from 60→30 min reduces estimated readiness gain by 1.2 pts") |
| **Add** extra session | ✓ | Ask "what should I add?"; suggest highest-ROI option from the engine's queue |
| **Regenerate** week | ✓ | Limit to once per day or after major constraint change (target date, daily-goal, exam date) |
| ~~**Delete** required session~~ | ✗ | **Replaced** with three soft actions: Replace · Postpone · Split |

### `is_required` flag — the load-bearing invariant

Every `plan_sessions` row carries an `is_required` boolean and a `locked_reason` text. A session is `is_required=true` when:

- Its concept's mastery EWA < 0.4 (weak band)
- Its concept's decay days > 14 (decayed)
- It's the week's mandatory mock (per the reviewer's "one mock per week" rule)
- The student is < 30 days from exam date and the concept is below target band

`is_required=true` rows cannot be deleted via the plan editor. Attempting Delete opens the soft-action menu:

| Soft action | What happens |
|---|---|
| **Replace** | AI offers 3 alternative shapes (shorter same-topic, equivalent ROI different topic, weakened-content drill) |
| **Postpone** | Shifts to the latest day in the same week; flags it red on the editor; cannot be postponed again that week |
| **Split** | Breaks the 60-minute session into 2 × 30-minute slots on different days |

`is_required=false` rows can be freely deleted; the editor renders them with a less-prominent "Remove" option.

### Impact preview — every edit, before commit

Every edit generates a synchronous **impact preview** before the student confirms. The preview is one or two sentences from the AI Gateway:

```
[Move Tuesday's Mechanics → Saturday]
"Moving this to Saturday is fine. No readiness impact."

[Shorten Wednesday Organic from 60 → 30 min]
"Shortening this reduces this week's expected readiness gain by ~1.2 pts.
Want to add 30 minutes elsewhere?"

[Postpone Friday mock]
"Postponing the mock means you won't have a mock-pace data point this
week. Replace with a 25-minute timed practice instead?"

[Mark all of Sunday + Monday as rest]
"You've marked 4 rest days this week. To stay on the plan, the
remaining 3 sessions become 50 minutes each. Continue?"
```

Implementation:
- AI Gateway prompt template `plan_impact@1.0.0` (pinned per ADR-0019)
- Touchpoint = `plan_impact` with its own routing config + cost target ≤ ₹0.02 per edit
- Read-through cached on `(plan_id, edit_kind, payload_hash)` so re-attempting the same edit doesn't re-spend
- Heuristic fallback: rule-based templates for the 6 edit kinds when LLM is down

### Regenerate-week semantics

`Regenerate week`:

- Triggered by student action OR auto-fired when `target_date`, `daily_minutes_goal`, or `exam_date` changes
- Throws away the existing `plan_sessions` for the current week's day_offsets ≥ today
- Calls `plans.generator.generate_week(user_id, current_state) → new sessions`
- Hard-rate-limited: at most once per 24 hours per student (stops thrashing)
- Carries forward `is_required=true` sessions whose dates are still in-range (don't regenerate around required mocks)

### Plan generation — initial vs. regenerate

| Source | When | Trigger |
|---|---|---|
| `ai_initial` | First plan after onboarding completes | Onboarding final step writes a plan; pre-fills the week |
| `ai_regenerated` | Student-triggered or constraint change | Edit endpoint with `kind=regenerate` |
| `student_edited` | Per-edit | Every Move/Swap/Rest/Shorten/Add operation |

`source` lives on the `study_plans` row's audit log, not on individual sessions. The audit log is the `plan_edits` table.

## Alternatives considered (rejected)

- **Full edit freedom** (delete anything, no impact preview). Rejected — students delete hard work; plan becomes useless. Documented education-product anti-pattern.
- **Read-only plan**. Rejected — students stop opening it after week 2 because it doesn't fit life.
- **Suggest-only plan** (AI shows what *should* happen but doesn't track adherence). Rejected — same engagement collapse as read-only; no telemetry signal for plan-edit-to-adherence ratio (UX-34 metric).
- **Daily plan** instead of weekly plan. Rejected — students plan in week chunks; daily plans feel like a to-do list, not a strategy. Reviewer agrees: weekly cadence anchors the rest of the loop.
- **Skip impact preview** (silent edits). Rejected — students wouldn't see the consequence of skipping the mock until exam day; defeats the coaching frame. Cost of impact preview (~₹0.02/edit) is acceptable.
- **Hard-block under-confident students from editing**. Rejected — paternalistic; collides with ADR-0020's agency principle. The right answer is `is_required` flagging + soft actions, not editing-rights gating.

## Consequences

### Positive

- **Adherence > rigidity.** Students who can move and shorten sessions without breaking the plan integrity stay engaged. The reviewer's measurement target — *adherence after edit ≥ adherence before edit* — is the right KPI.
- **Hard work is protected.** Weak-topic interventions and weekly mocks survive student procrastination. The `is_required` flag is the forcing function.
- **Honest consequences.** Impact preview makes the cost of every edit visible *before* commit. No silent regret.
- **Cost-bounded.** Per-edit AI call (~₹0.02 cached) × ~5 edits/student/week × cohort = predictable.
- **Auditable.** `plan_edits` table is append-only; full edit history per plan; lets editorial team reason about plan-quality vs. student-edit patterns.

### Negative

- **Some students will hit the `is_required` wall and disengage.** A student who feels "the system won't let me skip" may rage-quit. Mitigated by: the soft actions (Replace / Postpone / Split) cover ~95% of legitimate scheduling pressure; the messaging is *"here's a way to keep moving"* not *"you must do this."*
- **AI plan quality is the load-bearing input.** A bad initial plan generates more edits, which generates more cost. Mitigated by: editorial review of the plan-generation prompt before S55 ships; the same kappa-style monthly review pattern.
- **Student-edited plans drift away from the AI's intent.** A student who Moves + Postpones + Replaces aggressively can end up with a plan barely related to the original. Mitigated by: regenerate-week button (one tap, no penalty) + weekly-narrative section "Week ahead" (ADR-0021) re-grounds the student in what the engine recommends.
- **Mobile UX of plan editor is non-trivial.** Drag-to-reorder weekly grids on a 4-inch screen is cramped. Mitigated by: list-view default on mobile with "swipe-action" verbs (swipe left = postpone, swipe right = shorten); week-grid view only on tablet/desktop.

### Follow-up work

- [ ] **S55** schema migrations: `study_plans`, `plan_sessions`, `plan_edits`
- [ ] **S55** `learning.plans.generator` — initial + regenerate (pure-function; takes user state + signals → list of sessions)
- [ ] **S55** `learning.plans.editor` — Move / Swap / Rest / Shorten / Add (mutates `plan_sessions`)
- [ ] **S55** AI Gateway prompt template `plan_impact@1.0.0` + cache + heuristic fallback
- [ ] **S55** plan editor UI — desktop week-grid + mobile list-with-swipe
- [ ] **S55** soft-action picker (Replace / Postpone / Split)
- [ ] **S55** impact-preview pop-over component
- [ ] **S55** `plan_edits` audit log + admin telemetry tile (which edit kinds are most used)
- [ ] **S57** recovery-mode (different ADR scope, but reads `plan_edits` to detect 2+ missed sessions)

## Review

Quarterly review of the `is_required` rules — confirm they still match exam-prep best practice. The rule set is config-driven (not hard-coded) so editorial can tune without code changes; review at the same cadence as the prompt-template review.
