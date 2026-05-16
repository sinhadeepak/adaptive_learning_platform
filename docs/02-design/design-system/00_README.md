# Vidya Design System · v1.0

Production design system to replace Aurora v2 across the Adaptive Learning Platform — web portals (student / admin / institute / author), Flutter mobile app, and marketing site.

> **Identity:** editorial-premium · paper, ink, emerald, gold · serif numbers, sans UI, mono data.

---

## Folder contents

| File | What it is | Where it goes |
|---|---|---|
| `00_README.md` | This file. Start here. | — |
| `01_tokens.md` | Every token, named, with reasoning | Design + dev reference |
| `02_tokens.css` | **Production CSS** — drop into the web portals | `packages/design-system/src/tokens.css` (replaces v1 + v2) |
| `03_tokens.dart` | **Production Flutter** — drop into the mobile app | `packages/design-tokens-flutter/lib/vidya/` |
| `04_components.md` | Component anatomy + usage rules | Engineering reference |
| `05_migration_from_aurora.md` | Aurora → Vidya rename map + how-to-rip-it-out | Engineering playbook |
| `06_accessibility.md` | WCAG 2.2 AA targets, contrast tables, motion rules | Compliance |

---

## How to integrate (TL;DR)

### Web portals (apps/web-* using packages/design-system)

```bash
# 1. Replace token files
cp design-system/02_tokens.css packages/design-system/src/tokens.css
rm packages/design-system/src/tokens.v2.css          # Aurora dead
rm packages/design-system/src/density.css            # merged into tokens.css

# 2. Add Vidya base reset
cp design-system/vidya-base.css packages/design-system/src/base.css

# 3. Update package entry
# edit packages/design-system/src/index.ts → export from ./vidya
```

Search-replace across the 4 web apps:

| Aurora token | Vidya token |
|---|---|
| `--brand-600` | `--accent` |
| `--aurora-ai` | `var(--gold)` (gradient → solid) |
| `--bg-base`, `--bg-surface1/2/3` | `--paper`, `--paper-2`, `--card` |
| `--text-primary` | `--ink` |
| `--text-secondary` | `--ink-2` |
| `--neutral-*` ramp | `--paper / paper-2 / rule / rule-2 / ink-4 / ink-3 / ink-2 / ink` |
| `--font-display` (Inter) | `--font-display` (Instrument Serif) |

See `05_migration_from_aurora.md` for the complete map (62 renames).

### Mobile app (Flutter)

```bash
# 1. Drop in new tokens lib
cp -r design-system/flutter/* packages/design-tokens-flutter/lib/src/vidya/
# 2. Update barrel export
# edit packages/design-tokens-flutter/lib/alp_design_tokens.dart
# 3. Replace AuroraTheme.of(context) with VidyaTheme.of(context)
```

---

## Versioning & principles

- **One semantic per token.** No `--bg-surface3-hover-active`. Always: `paper / paper-2 / card / rule`.
- **Five tokens deep, max.** If you need more, the design is wrong, not the tokens.
- **Dark mode pairs are designed**, not inverted. Same hue · different lightness · same emotional weight.
- **Density via attribute, not class.** `[data-density="compact|regular|comfy"]` scales spacing + type, not color.
- **Persona via attribute.** `[data-persona="junior|senior|aspirant|pro|lifelong"]` shifts headline numeral (Stars vs Score), not the whole system.

---

## What we removed from Aurora

- **Cyan/violet gradient AI mark** → single gold ◈
- **Five portal accent colors** → one accent + token-level overrides per persona
- **Inter for display** → Instrument Serif for display, Geist Sans for UI
- **Three-tier elevation shadows** → hairline-borders + one subtle drop shadow
- **`--aurora-ai-soft / --aurora-celebration / --aurora-progress` gradients** → never used in production; deleted
- **Per-portal token files** (`teacher-tokens.css`, etc.) → single source

---

## Conformance

Every screen built on Vidya must:

1. Use only tokens from `02_tokens.css` — **no hard-coded hex** in components
2. Pass WCAG AA contrast (4.5:1 body, 3:1 large text) — see `06_accessibility.md`
3. Render correctly in light + dark, 3 densities, 5 personas
4. Support `prefers-reduced-motion` for any animation > 200ms

Linting rule (regex for CI): `/#[0-9A-Fa-f]{3,6}\b/` in any `.css`, `.tsx`, `.dart` file fails the build outside `02_tokens.css` and `03_tokens.dart`.

---

*Vidya design system · v1.0 · May 2026 · supersedes Aurora v2*
