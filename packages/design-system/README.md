# @alp/design-system

Vidya v1 design system for the three ALP web apps (`web-student`, `web-portal`, `web-admin`).

> **Status**: Vidya v1 · supersedes Aurora v2 ([ADR-0034](../../docs/adr/0034-design-system-v3-vidya.md)).
> **Spec**: [docs/02-design/design-system/](../../docs/02-design/design-system/) — 7 documents covering tokens, components, accessibility, migration.

## What this package ships

| Entry point | What it is | Use it where |
|---|---|---|
| `@alp/design-system/vidya/tokens.css` | Canonical Vidya CSS custom properties — `--paper`, `--ink`, `--accent`, `--gold`, `--good`/`--warn`/`--bad`/`--info`, `--m-*` mastery scale, 8 subject hues, typography + spacing + radius + shadow + motion + z-index + breakpoint + focus tokens. | App entry, once. |
| `@alp/design-system/vidya/density-scalars.css` | Compat layer exposing `--space-scale` / `--type-scale` / `--radius-scale` / `--motion-scale` under `[data-density="compact\|regular\|comfy"]`. Components built during Aurora consume these inside `calc()`. | App entry, after tokens.css. |
| `@alp/design-system/vidya/fonts.css` | `@font-face` declarations for Instrument Serif (display), Geist (UI), Geist Mono (data). Binaries live in each app's `public/fonts/vidya/` — install via `scripts/vidya/install-fonts.sh`. | App entry, after density-scalars.css. |
| `@alp/design-system/shell.css` | App-shell chrome + the legacy primitive class library (`.app-shell`, `.sidebar`, `.topbar`, `.btn`, `.card`, `.row-link`, `.form-input`, `.option-card`, `.stepper`, …). All references re-tokened to Vidya. | All 3 web apps. |
| `@alp/design-system` (JS) | Documentation stub. The TS runtime surface was removed in Vidya P5 — nobody consumed it, and Vidya's design intent is for components to read CSS custom properties directly. | Not for runtime use. |

## Usage

```tsx
// apps/web-*/src/main.tsx
import "@alp/design-system/vidya/tokens.css";
import "@alp/design-system/vidya/density-scalars.css";
import "@alp/design-system/vidya/fonts.css";
import "@alp/design-system/shell.css";
import "@alp/ui/ui.css";
```

Set the active surface on `<html>` in each app's `index.html`:

```html
<!-- apps/web-student/index.html -->
<html lang="en" data-theme="light" data-persona="aspirant" data-density="regular">

<!-- apps/web-admin/index.html -->
<html lang="en" data-theme="light" data-persona="pro" data-density="compact">
```

The three attributes — `data-theme` / `data-persona` / `data-density` — are orthogonal. The pre-React bootstrap in each `index.html` reads localStorage and applies them before stylesheets paint to avoid flash.

## Token surface (TL;DR)

| Family | Tokens | Use |
|---|---|---|
| Surfaces | `--paper / --paper-2 / --card / --rule / --rule-2` | Backgrounds + dividers |
| Ink | `--ink / --ink-2 / --ink-3 / --ink-4` | Text foreground (ink-4 = decorative only) |
| Brand | `--accent / --accent-2 / --accent-soft` | CTAs + active nav + selection |
| AI | `--gold / --gold-2 / --gold-soft` | **AI signal · readiness numeral · celebration only** |
| Status | `--good / --warn / --bad / --info` + `*-soft` peers | Pills, alerts, semantic states |
| Mastery | `--m-mastered / --m-strong / --m-dev / --m-weak / --m-none` | The canonical 5-bucket EWA scale |
| Subjects | `--subj-{physics,chemistry,biology,maths,english,history,cs,hindi}` | Row left-borders + chart series |
| Spacing | `--sp-1 … --sp-20` | 4pt grid |
| Density | `--d-row-h / --d-card-p / --d-gap / --d-font / --touch-target` | Cascade-driven by `data-density` |

Full reference: [docs/02-design/design-system/01_tokens.md](../../docs/02-design/design-system/01_tokens.md).

## Anti-patterns

- `background: linear-gradient(...)` — Vidya has no gradients. Use solid `--accent` or `--gold`.
- `color: #1F6B4A` — use `var(--accent)`. Stylelint + ESLint catch this.
- `font-family: Inter` — use `var(--font-ui)` (Geist, falls back to Inter as system).
- `--info` as an accent slot — Aurora's `--info` doubled as the per-portal accent. Vidya uses `data-persona` for accent overrides instead.
