# @alp/ui

Vidya v1 component primitives for the three ALP web apps.

> **Status**: Vidya v1 — formerly Aurora v2 primitives. See [ADR-0034](../../docs/adr/0034-design-system-v3-vidya.md).
> **Spec**: [docs/02-design/design-system/04_components.md](../../docs/02-design/design-system/04_components.md) — 14 core components.

## Install + import

```tsx
// apps/web-*/src/main.tsx
import "@alp/design-system/vidya/tokens.css";
import "@alp/design-system/vidya/density-scalars.css";
import "@alp/design-system/vidya/fonts.css";
import "@alp/ui/ui.css";   // ← component CSS MUST load after tokens
```

The component CSS references CSS custom properties from `vidya/tokens.css`, so import order matters.

## What's in the box

| Family | Primitive | Vidya spec |
|---|---|---|
| Atoms | `Button` `Tag` `Avatar` `Skeleton` `Checkbox` `Input` `AiTag` | §1, §3, §8, —, —, —, §12 |
| Molecules | `Card` `FormField` `Tabs` `Modal` `Sheet` `EmptyState` `MasteryBar` `MasteryStack` | §2, §4, —, —, —, —, §6, §6 |
| Organisms | `TopBar` `NavSidebar` `MobileTabBar` `AppShell` | §10, §9, §14, — |
| Domain | `ProgressRing` `StatCard` `AIInsightCard` `StreakChip` `Sparkline` | §7, §5, §12, —, §13 |

`AiTag` + `MasteryBar` + `MasteryStack` + `Sparkline` are the Vidya v1 additions. The rest were carried over from Aurora and rebound to Vidya tokens via the Phase 3 rename. Some Aurora variants survive as legacy aliases (e.g. `Button variant="aurora"` now renders solid gold; the canonical AI signal is the `AiTag` overline).

## Style scope

Components consume only Vidya tokens. No hard-coded hex; no gradients. Three density attributes (`compact / regular / comfy`) scale padding + type via `--space-scale` / `--type-scale` / `--radius-scale` / `--motion-scale` from `@alp/design-system/vidya/density-scalars.css`. The `data-persona` attribute (`aspirant / junior / senior / pro / lifelong`) shifts the `--accent` token cascade.

## Anti-patterns

- Reading hex in JSX: `<div style={{ color: "#1F6B4A" }}>` — ESLint catches this.
- Adding a gradient to a CTA — Vidya has zero gradients. Solid accent or solid gold.
- Using gold for anything that isn't AI-touched. The `AiTag` is the *only* place gold appears as a primary color.
- Adding a new tone variant to `Tag` without checking the canonical six: default / good / warn / bad / accent / ai.

## Migration from Aurora

Most Aurora primitives keep their import name + props. The class names emitted by each primitive still start with `alp-`. The visual difference is entirely in the Vidya token cascade — emerald + paper + ink + gold-for-AI — not in component structure. New code: prefer the Vidya additions (`AiTag`, `MasteryBar`, `MasteryStack`, `Sparkline`) where Aurora had nothing equivalent.
