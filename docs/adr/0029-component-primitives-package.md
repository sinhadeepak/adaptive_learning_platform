# ADR-0029: Component Primitives Package (`packages/ui`)

- **Status**: proposed
- **Date**: 2026-05-13
- **Deciders**: Frontend Platform · Design
- **Related**:
  - [ADR-0028 — Design System v2 (Aurora)](0028-design-system-v2-aurora.md) (parent)
  - [`docs/02-design/design-system-v2-aurora.md`](../02-design/design-system-v2-aurora.md) §7 "Component primitives library"
  - [ADR-0003 — Three-web-app split](0003-three-web-app-split.md)

## Context

Today `packages/design-system` exports **tokens only** (CSS custom properties + a TypeScript mirror under [`packages/design-system/src/tokens/`](../../packages/design-system/src/tokens/index.ts)). Every component lives inside the consuming app — [`apps/web-student/src/components/`](../../apps/web-student/src/components/) has 33 custom components plus 314+ inline `style={{}}` blocks. There is **no Button, Card, Input, Modal, or Toast primitive** that web-student, web-portal, and web-admin can share.

The consequences:

- Three apps reinvent buttons/inputs/cards three times, drifting independently.
- Inline styles bypass tokens; consistency is policy, not enforcement.
- No Storybook means no visual contract; design and engineering disagree on what "primary button" means.
- No keyboard / accessibility primitives means each component reimplements `aria-*`, focus-trap, etc., often incorrectly.
- Density modes (per [ADR-0028](0028-design-system-v2-aurora.md)) require token consumption inside components — only feasible if components are token-aware by construction.

## Decision

We will introduce a new workspace package **`packages/ui`** that owns all reusable React component primitives. Specifically:

1. **Scope**: 18 atoms + 14 molecules + 13 organisms as enumerated in [`design-system-v2-aurora.md` §7](../02-design/design-system-v2-aurora.md#7-component-primitives-library). Atoms ship first (S2); molecules + core organisms next (S3); domain organisms iteratively (S4–S7).

2. **Dependencies**:
   - **Peer:** `packages/design-system` (tokens) — `packages/ui` consumes tokens but does not redefine them.
   - **Runtime:** `react`, `react-dom`, `@radix-ui/*` (Listbox, Dialog, Tabs, Tooltip, Slider, Switch, Toast, etc. — proven accessibility primitives, MIT), `framer-motion` (motion), `lucide-react` (icons), `class-variance-authority` (variant API), `tailwind-merge` (className utility).
   - **Optional adopters:** Tailwind classes consumed by some primitives via `tailwind-variants`; tokens accessible via CSS custom property reads regardless of consumer's CSS strategy.

3. **API conventions**:
   - Variant API via `class-variance-authority`: `<Button variant="primary" size="md" />`.
   - All visual properties (color, spacing, radius, motion) read tokens — **no hex literals or magic numbers** inside `packages/ui` (Stylelint `color-no-hex` enforced).
   - All atoms support `as` polymorphism for `<a>` / `Link` / `<button>` patterns.
   - All interactive primitives forward `aria-*` and `data-*` props.
   - All primitives expose a `dataTestId` prop for E2E tests.

4. **Storybook**: `packages/ui` ships its own Storybook (Vite + Storybook 8) with one `.stories.tsx` per component, covering every variant × size × state matrix. Storybook is the primary contract between design and engineering.

5. **Tests**: Vitest unit tests for behavior (keyboard, ARIA), Playwright visual regression for appearance (via Chromatic or self-hosted Playwright screenshots), `axe-core` accessibility tests in Storybook.

6. **Tree-shakability**: `packages/ui/package.json` declares `"sideEffects": false`; ESM-only build via `tsup`; per-component named exports (`import { Button } from '@alp/ui'`).

7. **Versioning**: starts at `0.1.0` (S2). Each sprint cuts a minor (`0.2.0`, `0.3.0`, …). Hits `1.0.0` at end of S8 when legacy components are retired and `flag.ui.design_system_v2` is removed.

8. **Cross-app adoption**: web-portal and web-admin adopt opportunistically — no forced migration. Their existing components remain functional; they pull from `packages/ui` for new work.

9. **Flutter mirror**: explicitly **out of scope** for `packages/ui`. A parallel `packages/ui-flutter` (or extension of `packages/design-tokens-flutter`) covers mobile. Token names align across both; widgets are platform-native.

10. **Migration mechanics**: a `jscodeshift` codemod (`scripts/codemods/inline-styles-to-primitives.ts`) maps common inline-style patterns to primitive props during S2–S8. Manual review per PR; no big-bang migration.

## Alternatives considered

- **Keep components inside `apps/web-student/src/components/` and just clean up inline styles.** Pros: zero new package overhead. Cons: doesn't help web-portal / web-admin, doesn't enforce token consumption, doesn't deliver Storybook, doesn't enable the density-modes implementation in ADR-0028. Rejected.

- **Adopt shadcn/ui in place (copy components into our repo).** Pros: large existing component library, accessibility built-in via Radix. Cons: shadcn ships as a "copy-paste" model (no package), which doesn't give us the cross-app sharing we need. We **do** adopt the shadcn pattern (Radix + Tailwind + tokens) but package it ourselves. Rejected as a wholesale solution.

- **Adopt Mantine / Chakra / MUI as the primitives layer.** Pros: instant full library. Cons: opinionated visual language; cost of overriding their tokens, theming, and dark-mode for Aurora exceeds the cost of building primitives on our tokens directly. Rejected.

- **Build primitives inside `packages/design-system` (not a new package).** Pros: fewer packages. Cons: violates separation of concerns — `packages/design-system` should be visual primitives (tokens) consumable by Flutter and web. Mixing React components into it forces non-React consumers to deal with the React surface. Rejected.

- **Headless-only primitives (Radix only, no styling).** Pros: maximum flexibility. Cons: every consumer re-styles Buttons, defeating the consistency purpose. We adopt Radix as the headless layer **underneath** our styled primitives — best of both. Selected.

## Consequences

### Positive

- Single source of truth for component appearance + behavior across web apps.
- Storybook gives design + engineering + QA + product one place to inspect, compare, and validate every state.
- Inline-style sprawl can be banned at PR time by ESLint rule once primitives ship.
- Density modes from [ADR-0028](0028-design-system-v2-aurora.md) become implementable — primitives read `--space-scale` etc. uniformly.
- A11y improvements compound: a fix to Button focus ring helps every screen, instead of being re-implemented N times.
- Adoption pressure on web-portal / web-admin to standardize, without forcing migration.
- Primitives are testable in isolation; no app boot required for component tests.

### Negative

- Yet another package in an already-9-package monorepo. Discoverability cost.
- Initial bootstrap cost ~ 3 dev-days (workspace wiring, tsup build, Storybook, Chromatic).
- Two packages to keep in sync (tokens + ui). Versioning discipline required.
- Radix + Framer Motion adds ~ 40 KB gzip baseline to the package — must be tree-shaken aggressively.
- Component versioning: a breaking change in Button affects 3 apps. Mitigated by Storybook + visual-regression CI.

### Follow-up work

- [ ] Workspace wiring — `pnpm-workspace.yaml` (or `yarn workspaces`) adds `packages/ui`; root `package.json` registers
- [ ] `packages/ui/package.json` — `"type": "module"`, `"exports"`, `"sideEffects": false`
- [ ] `packages/ui/tsup.config.ts` — ESM build, declaration files
- [ ] Storybook 8 in `packages/ui/.storybook/`
- [ ] Visual regression via Playwright screenshots (or Chromatic if budget allows)
- [ ] CI workflow: build, test, Storybook, axe-core
- [ ] First sprint deliverable (S2): Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Slider, Tag, Badge, Chip, Avatar, Tooltip, Divider, Skeleton, Spinner, KBD — 18 atoms
- [ ] ESLint rule `react/forbid-component-props` for `style` prop on JSX (excluded list: charts, drag/drop)
- [ ] Stylelint `color-no-hex` rule outside `tokens.v2.css`
- [ ] Codemod `scripts/codemods/inline-styles-to-primitives.ts` (jscodeshift)
- [ ] Component-adoption tracker — per-component PR migrating consumers (link from this ADR once tracked in Linear)
- [ ] Flutter mirror plan — separate ADR if scope warrants (per `docs/CLAUDE.md` notes the Flutter token bridge exists; primitives are platform-native)

## Review

Revisit by **2026-08-13** (3 months) or when:

- `packages/ui` reaches `1.0.0` (end of S8) — mark ADR `accepted` and document any deviations.
- Per-route JS bundle size grows past CI budget — investigate tree-shaking or split into sub-entries.
- A new consumer (e.g. Phase 5 authoring portal, web-admin, white-label) needs a primitive that doesn't fit the current API — extend or rebuild deliberately.
- Radix or Framer Motion ship a major-version that requires migration — revisit dependency choices.
