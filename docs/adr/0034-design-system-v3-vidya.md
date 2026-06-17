# ADR-0034: Design System v3 — "Vidya"

- **Status**: accepted (web cutover shipped; Flutter migration deferred — see Decision §6)
- **Date**: 2026-05-16
- **Deciders**: Design Lead · Frontend Platform · Mobile · Product
- **Related**:
  - [`docs/02-design/design-system/`](../02-design/design-system/) (master spec — 7 documents)
  - [ADR-0028 — Design System v2 "Aurora"](0028-design-system-v2-aurora.md) (**superseded**)
  - [ADR-0029 — Component Primitives Package](0029-component-primitives-package.md) (still load-bearing — package retained, contents re-themed)
  - [ADR-0003 — Three-web-app split](0003-three-web-app-split.md)
  - [ADR-0002 — Mobile stack: Flutter](ADR-002-mobile-stack-flutter.md)

## Context

Aurora v2 (ADR-0028, May 2026) shipped a complete component library + token system but accumulated three structural debts in production:

1. **Color sprawl.** Five portal-accent files (`packages/design-system/src/portals/{admin,teacher,author,mobile}.css`) re-aliased the same `--info` slot to red/green/purple/blue per audience. Apps had to know which portal they were inside to render correctly, and the cross-portal admin tooling broke whenever the wrong file loaded first.
2. **Gradient ambiguity.** The Aurora "AI tone" was a cyan→violet gradient (`--aurora-ai`) layered onto buttons, badges, hero cards, and inline text. Three issues compounded: dark-mode inversion was eyeballed (no designed pair), the gradient failed WCAG contrast at small sizes, and engineering kept inventing one-off `linear-gradient(...)` calls to "match the AI vibe" without a token to point at.
3. **Persona/density tangle.** Aurora wrote persona names (junior/aspirant/pro) into the density attribute, conflating "who is this user" with "how dense is the layout." Engineers couldn't ship a comfy-density UI for an aspirant.

The team also faced an editorial credibility problem. The platform sells to NEET/JEE/UPSC aspirants and to professional learners; market research showed the Aurora cyan/violet/indigo palette read as "another EdTech app" against domestic competitors (Akash iTutor, Allen Digital, Photomath). Premium positioning required a quieter, more confident visual language: paper-white surfaces, editorial serif display, emerald for trust, gold reserved exclusively for AI signal.

The user-facing risk that drives this ADR is **conversion**. Aurora performs adequately for engagement once a user is in; Vidya is the bet that a more editorial, less neon visual identity reduces the bounce rate on the marketing site and the first three screens of onboarding.

## Decision

We adopt **Vidya v1** as the canonical design system across all web portals and (in a deferred follow-up) the Flutter mobile app. Six load-bearing parts:

1. **One semantic per token.** No `--bg-surface3-hover-active`. The token family collapses to `--paper / --paper-2 / --card / --rule / --rule-2`, ink levels `--ink / --ink-2 / --ink-3 / --ink-4`, brand `--accent / --accent-2 / --accent-soft + --gold / --gold-2 / --gold-soft`, status `--good / --warn / --bad / --info` (each with `-soft` peer), the canonical 5-bucket mastery scale (`--m-mastered / --m-strong / --m-dev / --m-weak / --m-none`), and 8 subject hues. Defined in `docs/02-design/design-system/01_tokens.md`; canonical implementation in `packages/design-system/src/vidya/tokens.css`.

2. **Persona via attribute, density via attribute, theme via attribute.** Three orthogonal `<html>` attributes:
   - `data-theme="light|dark"` — designed pairs, not invert-and-pray
   - `data-persona="aspirant|junior|senior|pro|lifelong"` — shifts `--accent` (and the headline numeral the persona prefers: Readiness 0–900 vs Stars vs Board % vs Cert vs Topics-explored)
   - `data-density="compact|regular|comfy"` — scales `--d-row-h / --d-card-p / --d-gap / --d-font / --touch-target` without re-coloring

3. **Editorial typography.** Instrument Serif (SIL OFL) for display + Geist + Geist Mono (SIL OFL) for UI + data. Self-hosted via `scripts/vidya/install-fonts.sh`; gitignored binaries. Aurora's Inter/Nunito system retired.

4. **Gold is for AI, full stop.** The Aurora cyan→violet AI gradient is removed. Wherever AI authored, recommended, computed, or calibrated something, surface the new `<AiTag>` primitive — a 10.5px mono uppercase overline in `--gold-2` with a 6px `--gold` dot. This is the *only* place gold is used as a primary color anywhere in the system.

5. **Hard cutover, not parallel period.** Two design systems competing in one codebase is the actual risk (see Migration §5 of the master doc). Aurora web tokens, density layer, and per-portal accent files have been deleted in the same change-set that introduces Vidya tokens. Reversion is a single `git revert` of the Vidya commit range.

6. **Web cutover in this ADR; Flutter migration deferred.** The mobile app consumes ~100 `Aurora*` widget classes across 30+ screens (AuroraButton, AuroraCard, AuroraTextField, AuroraScaffold, etc.). The Vidya widget catalog spans 14 primitives — a 1:1 replacement does not exist. Wholesale deletion of `packages/design-tokens-flutter/lib/src/aurora_*.dart` would brick the mobile build. We therefore ship Vidya for web in this change and keep the Flutter Aurora source alive (`alp_design_tokens` barrel re-exports both Vidya canonical and Aurora for the migration window). The Flutter migration is a dedicated follow-up sprint, owners TBA — see Open Questions §3.

## Alternatives considered

- **Tweak Aurora colors in place.** Pros: zero migration cost; existing Aurora components keep working. Cons: doesn't address the per-portal accent sprawl (each portal file would still need editing), doesn't address the persona/density tangle (still encoded in the attribute), doesn't address the cyan/violet AI gradient gap (still a gradient). Cosmetic, not structural.

- **Parallel period with a feature flag.** Ship Vidya alongside Aurora gated on an env var; cut over incrementally per app over 6 weeks. Pros: lower individual-PR risk. Cons: every component file needs `if (vidya) else` branching across 3,514 token-reference sites; doubles the testing matrix; doubles the visual regression baseline. The migration doc explicitly identifies this as the higher-risk path. Rejected.

- **Adopt an off-the-shelf system (Radix, shadcn, Mantine).** Pros: zero design work; vibrant ecosystem. Cons: none of these encode our mastery buckets, subject palette, persona system, or the AI-provenance signal. We'd end up extending the off-the-shelf primitives anyway and lose the editorial identity. Rejected.

- **Hard cutover including Flutter.** Pros: cleanest end state; ships everything together. Cons: requires a multi-day rebuild of 30+ mobile screens against 14 Vidya primitives + a widget shim layer (AuroraButton → VidyaButton wrapper). Out of scope for the current sprint; commits to spec the Flutter rebuild as a follow-up.

## Consequences

### What we gain
- One token surface for every web app + every persona + every density + every theme. No more "which portal CSS file loads first" bugs.
- Editorial-premium visual identity that fits the platform's domestic positioning vs Akash/Allen/Photomath.
- Self-hosted fonts → no third-party DNS dependency, no Google Fonts privacy concerns in India, no FOIT on slow connections (font-display: swap + system fallback).
- AI signal becomes legible at scale — `<AiTag>` is a tight, accessible overline that screen readers + colorblind users both pick up.
- WCAG 2.2 AA contrast verified per token pair in `docs/02-design/design-system/06_accessibility.md`. `--ink` on `--paper` = 19.5:1.
- A single source of truth in `docs/02-design/design-system/` (7 documents). No `tokens.v2.css` vs `tokens.v3.css` vs portal accents to reason about.
- The `[data-persona]` attribute decouples user identity from app identity — the same student app can render Junior vs Aspirant vs Lifelong accents based on the user's profile without a rebuild.

### What we give up
- The Aurora gradient triad is gone. Engineering can no longer reach for `linear-gradient(...)` as a "premium" affordance — solid emerald (accent) or solid gold (AI) only.
- Per-portal accent customization is no longer a token override; teams that want admin-red or teacher-green must add a `data-persona` value (and update the Vidya persona palette to support it).
- 43 existing `.tsx` files still contain hard-coded hex literals (mostly `"#fff"`/`"#000"` for SVG). The ESLint rule that catches these is set to **warn**, not error, until the backlog clears. Cleanup is a tracked follow-up.
- The Flutter mobile app continues to ship Aurora until the dedicated migration sprint lands. Web + mobile have visually different identities during this window — acceptable per the user-research finding that mobile users are predominantly Junior/Teen personas (where the visual delta is least jarring).

### Migration receipts

The cutover ran in 8 phases across this PR's commit range:

| Phase | Commit | Scope |
|---|---|---|
| 1 | 321ca0c | Install Vidya tokens (CSS + Dart) + barrel exports + html attrs |
| 2 | 321ca0c | Self-host fonts (Instrument Serif + Geist + Geist Mono) for web + Flutter via `scripts/vidya/install-fonts.sh` |
| 3 | 3a0ebd1 | Rename 3,057 Aurora token references across 173 files via `scripts/vidya/rename-aurora-to-vidya.sh` |
| 4 | (in this PR) | Add 4 missing Vidya primitives (AiTag, MasteryBar, MasteryStack, Sparkline) + post-rename fixes + density-scalars compat layer |
| 5 | (in this PR) | Delete Aurora web corpses (tokens.css / tokens.v2.css / density.css / portals/ / tokens/) |
| 6 | (in this PR) | ESLint hex-literal gate (warn) + stylelint config + a11y QA playbook |
| 7 | (in this PR) | **This ADR + package READMEs** |
| 8 | (in this PR) | Build + test verification |

Reversion: `git revert 321ca0c..HEAD` on this branch returns the codebase to ADR-0028 Aurora. The Vidya tokens stay reachable as `docs/02-design/design-system/` for the next attempt.

## Open questions to resolve before close

1. **Visual regression baseline.** The 108 reference screens in the design canvas need a Playwright pixel-diff sweep against the post-Vidya build before we declare the cutover green. Owner TBA.
2. **User comms for 2.4M users.** The visual change is significant. Product needs to draft an in-app announcement + a help-center article before production deploy. Owner: Product.
3. **Flutter migration sprint.** Mobile widgets (~100 Aurora primitives) need to be migrated to Vidya equivalents. Estimate: 2-3 sprints for the widget shim + 1 sprint per screen group (onboarding, home, quiz, insights, study plan, profile). Owner TBA. Until this lands, mobile ships Aurora.
4. **Tamil + RTL Urdu support.** Vidya v1 ships English + Hindi only. v1.1 is scheduled for Tamil + RTL Urdu — needs a separate ADR once the script support is scoped.
