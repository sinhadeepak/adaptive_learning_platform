# ADR-0020: UX Co-Pilot scope + 4-section information architecture

- **Status**: accepted (frontend + backend shipped — see Phase 5/6 commits)
- **Date**: 2026-05-02
- **Deciders**: CTO, Tech Lead, Product Lead, Design Lead, ML Lead
- **Related**: Phase 6 gating ADR (S49–S58). Source: [`Adaptive_Learning_Platform_UX_Recommendations_Review.docx`](../additional_requirements/Adaptive_Learning_Platform_UX_Recommendations_Review.docx). Sprint plan: [`02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md`](../02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md). Builds on [ADR-0017](0017-multi-parameter-assessment-engine.md) (engine substrate), [ADR-0019](0019-ai-gateway-and-consolidation.md) (AI Gateway). Companion ADRs: [ADR-0021](0021-hybrid-weekly-narrative.md), [ADR-0022](0022-difficulty-agency.md), [ADR-0023](0023-constrained-plan-coediting.md), [ADR-0024](0024-todays-mission-entrypoint.md).

## Context

Phase 5 ships a best-in-industry assessment engine — concept-grain mastery, Bloom-depth, fluency, calibration, transfer, 22 question types, AI Gateway, localisation. The user-journeys audit (`docs/02_planning/10_UserJourneys_AdaptiveLearningPlatform.md`) confirms the diagnostic spine works end-to-end. **What's missing is the layer that turns diagnosis into daily action**: there's no daily mission, no weekly narrative, no plan a student can edit, no recovery posture when sessions are missed, and no consolidated "where am I and what should I do?" surface.

The current student app exposes 13+ top-level routes (Home, Catalog, Quiz, Mocks, Analysis, Concept Profile, Diagnostic Deep Dive, Revision, Syllabus, AI Tutor, Doubts, Bookmarks, History). Power users find the depth; first-time and casual users get lost or assemble the story themselves. The reviewer's framing — *"the platform is a quiz tool with a thin AI layer; the daily experience does not feel like guided learning"* — is correct.

Two design failures cluster under this:

1. **Route sprawl** masquerading as feature richness. Every analytical surface is its own route; none point at each other; the student must build their own mental map.
2. **No agency frame.** The student either takes a quiz the engine picked, or they don't. There's no "set my posture for today" affordance and no "edit my week" affordance.

The UX Recommendations Review proposes a **four-loop guided-learning model** (Analytics → Interpretation → Recommendation → Execution) and four-section information architecture (Home / Practice / Insights / Me). We accept the model and the IA, with one modification: the existing Phase-5 routes are kept alive as deep-link drill-downs underneath the new top-level Insights tab, so bookmarks survive and the curated Phase-5 work isn't orphaned.

## Decision

Adopt the **UX Co-Pilot model** with four top-level sections in the student app and matching mobile bottom-nav. Information architecture, scope of agency, and per-section ownership are codified here; companion ADRs define the load-bearing surfaces (narrative, agency, plan, mission).

**Top-level sections (web-student + mobile):**

| Section | Primary job (one sentence) | Owns |
|---|---|---|
| **Home** | Tell me what to do *now*. | Today's Mission card · Continue strip · Recovery prompt · Streak / readiness ribbon · Week preview |
| **Practice** | Let me choose work intentionally. | Browse / search topics · Adaptive practice · Revision ritual · Mock tests · Saved-practice filters |
| **Insights** | Help me understand my progress and what to do about it. | My State (concept profile, syllabus coverage, fluency, calibration) · What This Means (diagnostic deep-dive, error patterns, weekly narrative) · What To Do (mission queue, plan preview, revision) |
| **Me** | Manage my account, preferences, history. | Profile · Subscriptions · Bookmarks · History · Journey · Settings · Language · Notifications |

**Power-user acceleration on top of the 4-section default:**

- Global command palette on web (`⌘K` / `Ctrl+K`) — search topics, bookmarks, history, weak topics, mocks, doubts.
- Mobile Quick Actions tray (long-press FAB) — Start revision, Resume, Ask doubt, Bookmarks, Weak topics, Mock.
- Phase-5 routes (`/concept-profile`, `/diagnostic-deep-dive`, `/revision`, `/syllabus`, `/analysis`, `/error-patterns`) preserved as deep-link drill-downs reachable from the Insights tab and via the command palette. Direct URLs continue to work — no breaking redirects.

**Scope of student agency** (the reviewer's *"agency over posture, not over the algorithm"* principle):

| Control | Student choosing | AI choosing |
|---|---|---|
| When to study | ✓ (move/swap/rest in plan editor) | suggest |
| Which mode (mock / practice / revision) | ✓ (with impact preview) | suggest |
| Difficulty *posture* (Match / Push / Build confidence) | ✓ (intent anchor) | sets path inside posture |
| Which item to serve next | — | ✓ (multi-dim selector) |
| Mastery scoring rules | — | ✓ (engine, scoring is sealed) |
| Plan generation | — | ✓ (initial + regenerate on demand) |
| Plan deletion of *required* sessions | — | (blocked — Replace/Postpone/Split instead) |

The rule of thumb: **the algorithm chooses the learning path; the student chooses the learning posture**.

## Alternatives considered (rejected)

- **Keep the existing 13-route structure.** Rejected — first-time students cannot assemble the learning story; dashboards proliferate and engagement signal degrades. Phase-5 evidence confirmed this: ConceptProfile and DiagnosticDeepDive routes shipped and are functional but had ~zero discovery from the home page.
- **Three-section IA (drop "Practice" or merge "Me" into Home).** Rejected — practice is the single highest-volume action a student takes; conflating it with Home or burying it under Insights muddies daily intent. "Me" is a reflexive mental model for account / settings; merging it into Home makes Home cluttered.
- **Five-section IA (split Insights into Progress + Plan).** Rejected — five labels exceed mobile bottom-nav best practice (4 ± 1) and the reviewer's research-backed compression argument. The extra split bought no real coverage; "What To Do" already lives inside Insights with sufficient prominence.
- **Pure replacement of legacy Phase-5 routes.** Rejected — would orphan curated content, break student bookmarks, and collide with the user-journeys document already indexed for support. Deep-link preservation is cheap and friction-free.
- **Add an entirely new dashboard service ("ai-coach" microservice).** Rejected — violates ADR-0005 (service ceiling = 6). The mission engine, plan editor, weekly narrative, and recovery FSM all land as modules inside `alp-learning` and `alp-engagement`.

## Consequences

### Positive

- **Decision reduction.** A returning student lands on Home and sees one decision: start today's mission. The reviewer's *first 15-minute value loop* (for first-timers) and *daily decision reducer* (for repeat users) both ship from this IA.
- **Deep-feature reachability.** Every Phase-5 surface remains reachable; the Insights tab is the single discoverable on-ramp to all of them, plus the command palette adds direct power-user access.
- **Mobile parity by design.** Four sections fit a mobile bottom nav cleanly. The desktop sidebar and the mobile bottom-nav share the same labels, lowering cognitive load when a student switches devices.
- **Clear scope envelope for agency features.** Companion ADRs (0021–0024) inherit the "posture, not algorithm" frame and avoid the trap of ad-hoc difficulty toggles or unconstrained plan editing.

### Negative

- **Migration cost.** Existing students with a learned mental map of "Catalog / Quiz / Analysis" must re-orient. Mitigated by: keeping legacy routes alive, a single "What changed?" toast on first login post-rollout, and command-palette discoverability from day one.
- **Insights tab will be dense.** Three subsections (My State / What This Means / What To Do) with ~10+ tiles between them risks the same problem we're fixing elsewhere. Mitigated by: each tile follows a strict template (number + 1-line interpretation + 1-line action) and tiles are role-aware (e.g. mock-related tiles only after first mock).
- **Power-user search backend.** A global command palette needs a fast cross-domain search. We reuse the existing OpenSearch `topics_v2` alias and add a thin client-side router for non-topic targets (bookmarks / history) — no new index. Reviewable in S58.

### Follow-up work (Phase 6 sprints)

- [ ] **S49** Ship `/screening` end-to-end + collapse onboarding to one mandatory step
- [ ] **S49** UX-34 instrumentation foundation; KPI dashboard at `/admin/ux-health`
- [ ] **S50** Today's Mission card + Home redesign
- [ ] **S51** Mobile quiz redesign with bottom-sheet difficulty agency
- [ ] **S52** Build the Insights hub; preserve all Phase-5 routes as deep links
- [ ] **S58** Global command palette (`⌘K`) + mobile Quick Actions tray
- [ ] **Post-S58** Telemetry-driven IA audit (drop-rate per section, time-to-action) at the 60-day mark

## Review

This ADR is gating for Phase 6. No Phase-6 sprint ships before this is `accepted`. The Phase-5 multi-parameter engine continues to ship independently — Phase 6 consumes its outputs but does not block it.
