# ADR-0028: Design System v2 — "Aurora"

- **Status**: accepted (frontend + backend shipped — see Phase 5/6 commits)
- **Date**: 2026-05-13
- **Deciders**: Frontend Platform · Design · Product
- **Related**:
  - [`docs/02-design/design-system-v2-aurora.md`](../02-design/design-system-v2-aurora.md) (master spec)
  - [`docs/02-design/design-system-v1.md`](../02-design/design-system-v1.md) (predecessor)
  - [ADR-0029 — Component Primitives Package](0029-component-primitives-package.md) (companion)
  - [ADR-0003 — Three-web-app split](0003-three-web-app-split.md)
  - [`docs/ui/00_MASTER_README.md`](../ui/00_MASTER_README.md)

## Context

Design System v1 ([`design-system-v1.md`](../02-design/design-system-v1.md), 2026-05-13) established the strategic skeleton — three personas (Riya / Arjun / Priya), brand indigo, semantic mastery palette, subject color encoding, Inter + Nunito + JetBrains Mono, Tailwind + shadcn/ui target — but stopped at principles. The implementation gap left the running app with:

- **314+ inline `style={{}}` blocks** across [`apps/web-student/src/components/`](../../apps/web-student/src/components/), enforcing inconsistency.
- **No component primitives package** — `packages/design-system` exports tokens only.
- **Light theme bolted onto `tokens.css` on 2026-05-11** without per-screen audit; hardcoded hex values and shadow colors don't invert.
- **No mobile navigation** — 220px sidebar persists down to 720px; Class 5–10 users (predominantly mobile) experience broken IA.
- **No engagement architecture** — streaks, missions, mastery rings rendered as plain rows with no celebration moments, no shared visual language for AI / progress / reward.
- **Sparse Home, crammed Leaderboards** — same density wrong for both screens and both personas.
- **No keyboard global nav, no Cmd-K, no virtualization on the 51-row leaderboard.**

The user-facing risk is **adoption**. The platform is a learning app spanning Class 5 → UPSC aspirants → professional learners; competitors (Khanmigo, Allen Digital, Akash iTutor, Photomath) win retention with disciplined visual systems and reward loops. v1 named the problem; v2 ships the fix.

## Decision

We will adopt **Design System v2 — "Aurora"** as the canonical visual + interaction system for the student portal, fully specified in [`docs/02-design/design-system-v2-aurora.md`](../02-design/design-system-v2-aurora.md). The decision has six load-bearing parts:

1. **Tokens v2** — additive CSS custom properties under [`packages/design-system/src/tokens.v2.css`](../../packages/design-system/src/tokens.v2.css) with light + dark values designed pair-wise (not invert-and-pray), a 12-step neutral ramp, semantic mastery scale, subject-color universals, and the new **Aurora gradient triad** (`--aurora-ai` / `--aurora-celebration` / `--aurora-progress`) reserved for AI, celebration, and progress moments.

2. **Three density modes — Junior / Aspirant / Pro** — implemented as CSS custom property layers under `[data-density="..."]` (scalars for spacing, type, radius, motion). One design system; engineering builds each component once.

3. **Component primitives package** — see [ADR-0029](0029-component-primitives-package.md).

4. **Per-screen redesigns** — 9 reference screens with full ASCII wireframes and 62 routes covered at family-level IA + composition maps. All 71 routes from [`apps/web-student/src/routes.tsx`](../../apps/web-student/src/routes.tsx) accounted for.

5. **Engagement architecture as a first-class system layer** — streak system, mastery rings (universal visual), AI Aurora moments, level-up toasts, illustrated empty states (Junior only), opt-in sound/haptics, daily mission card as the home anchor.

6. **Mobile-first redesign with `MobileTabBar`** — fixes the no-mobile-nav gap; 5-slot bottom tab bar at xs/sm, collapsible sidebar at md+, full sidebar at xl+.

Continuity with v1 is explicit: brand indigo `#5B5BD6`, EWA mastery buckets (`STRONG ≥ 0.70 green`, etc.), subject color encoding, Inter+Nunito+JetBrains Mono, 4pt spacing grid, motion tokens, Lucide icons, Tailwind+shadcn target — all preserved verbatim. v2 adds the implementation layer v1 deferred.

Rollout is **doc-first → tokens → primitives → screens** across 8 sprints, gated on the user's review of this ADR and the master spec. Stage A (documentation) is the current deliverable; Stage B (implementation) starts only on approval.

## Alternatives considered

- **Stay on v1 + incremental fixes.** Pros: zero new spec work; existing v1 doc is already strategic. Cons: doesn't fix the 314+ inline-style sprawl, doesn't ship density modes, doesn't fix mobile nav, doesn't fix engagement architecture. v1 explicitly listed all these as "implementation phase" — the implementation phase is what v2 is.

- **Rewrite on Tailwind + shadcn/ui from scratch.** Pros: large component library out of the box. Cons: discards the existing token system (which is good), forces a hard breaking migration of all 33 components in lockstep, and the Tailwind primitives still need branding overrides. **We adopt Tailwind+shadcn selectively** (per v1) but build the primitives package on our own tokens to keep control over Aurora / mastery / density behavior.

- **Adopt Material UI / Chakra / Mantine wholesale.** Pros: instant component library. Cons: opinionated visual language overrides ours; cost of de-opinionating is greater than building primitives on Radix + tokens. Rejected.

- **Two design systems (one for K-12, one for adults).** Pros: each persona perfectly tuned. Cons: 2× engineering, 2× design, 2× testing; never sustained at scale (Notion, Khanmigo, Linear all use one system with density modes). Rejected — v2's density mode approach gets the per-persona feel without forking.

- **Defer mobile nav to a separate sprint.** Pros: smaller v2 scope. Cons: mobile is the canonical platform for K-12 users; shipping a "new design system" with broken mobile IA is a regression. Bundled with v2.

## Consequences

### Positive

- **One source of truth for tokens** — eliminates inline-style drift across the app.
- **One component library** — primitives consumed by web-student, web-portal, web-admin (token mirror to Flutter for mobile in a parallel sprint).
- **Light and dark mode designed, not inverted** — eliminates the AA contrast and hardcoded-hex problems from the 2026-05-11 light-theme retrofit.
- **Mobile-first across all 71 routes** — fixes the no-bottom-nav adoption blocker for K-12 users.
- **Engagement layer codified** — streak / mastery / celebrations become design-system properties, not screen-by-screen reinvention.
- **Three personas served by one system** — engineering cost stays flat while perceptual experience adapts.
- **Coverage of all 71 routes documented** — no screen left to chance during migration.
- **WCAG 2.1 AA from day one** — contrast, keyboard, focus, motion-reduce all spec'd; CI gates.

### Negative

- **Multi-sprint migration cost.** 8 sprints to fully retire v1 inline-style codebase. During migration both systems live in parallel; complexity peaks mid-rollout (S4–S6).
- **Token additive surface area.** Legacy tokens kept for 1 release alongside v2; total CSS payload grows ~30% temporarily. Mitigated by token tree-shaking at the end of S8.
- **Storybook + Chromatic infrastructure to set up.** ~3 days of engineering work in S2 before first primitive ships.
- **Mobile illustrated empty states (Junior mode) need illustration commission.** Out-of-scope for engineering; design ticket in S7. v2 ships abstract aurora illustrations as fallback if mascot work isn't ready.
- **Performance budget:** primitives package must stay < 25 KB gzip total in initial chunk; enforced in CI. Risk if we pull in too many Radix dependencies.

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| v2 breaks existing screens during migration | Feature flag `flag.ui.design_system_v2` per route; rollback granularity = one screen |
| Density mode CSS introduces specificity issues | Storybook test matrix across all three modes per primitive; CI fails if visual regression |
| AA contrast regression on legacy components reading new tokens | Pa11y CI runs per PR; AA violation = block merge |
| Light-mode hardcoded hex values not all converted | Stylelint `color-no-hex` rule outside `tokens.v2.css`; ratchet rollout |
| Bundle size creep from primitives | Per-route JS budget tracked in CI |

### Follow-up work

- [ ] [ADR-0029](0029-component-primitives-package.md) — split tokens from components; new `packages/ui` workspace
- [ ] Sprint S1 — tokens v2 land in `packages/design-system` (additive; legacy preserved 1 release)
- [ ] Sprint S2 — atoms (18 components) in `packages/ui` + Storybook
- [ ] Sprint S3 — molecules + organisms (core nav/layout); MobileTabBar live
- [ ] Sprints S4–S7 — per-screen redesigns (Home → Catalog → Topic → Practice → Analysis → Social → Engagement)
- [ ] Sprint S8 — auth + onboarding redesign + inline-style codemod + legacy CSS removal + full a11y audit + WCAG AA sign-off
- [ ] Commission Junior-mode illustration set (Aura mascot or abstract aurora variations) — design ticket, owner TBD
- [ ] Flutter mirror of `packages/ui` (`packages/ui-flutter`) — parallel sprint, separate ADR if scope warrants
- [ ] Update [`docs/ui/00_MASTER_README.md`](../ui/00_MASTER_README.md) to point at v2 once accepted
- [ ] Mark v1 doc as `superseded by ADR-0028` once v2 is `accepted`

## Review

Revisit by **2026-08-13** (3 months) or when:

- Sprint S8 completes (revisit to mark `accepted` and supersede v1).
- A persona-experience metric (Junior session length, Aspirant streak retention, Pro power-user usage) regresses by >10% relative to v1 baseline.
- A competitor study (Khanmigo / Akash / Allen) ships a substantially new pattern that should change our north-star.
- Phase 5 Localisation enters integration (Hindi v1) — verify Devanagari rendering and right-rail layout under longer translations.
