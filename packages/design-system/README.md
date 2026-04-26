# @alp/design-system

Shared design system for the three ALP web apps (`web-student`, `web-portal`, `web-admin`).

Spec: [docs/01_design/07_CommonControls_Specification_AdaptiveLearningPlatform.md](../../docs/01_design/07_CommonControls_Specification_AdaptiveLearningPlatform.md).
Source-of-truth for the dark-theme palette + AI-cyan accent: [docs/ui/01_StudentPortal_Web/00_design-system.css](../../docs/ui/01_StudentPortal_Web/00_design-system.css).

## What this package ships

| Entry point | What it is | Used by |
|-------------|-----------|---------|
| `@alp/design-system/tokens.css` | CSS custom properties (`--bg-base`, `--color-blue`, `--text-primary`, …). Apply once at the page root. | All 3 web apps |
| `@alp/design-system/shell.css` | The chrome + primitive class library (`.app-shell`, `.sidebar`, `.topbar`, `.btn`, `.card`, `.row-link`, `.form-input`, `.option-card`, `.stepper`, …). | All 3 web apps |
| `@alp/design-system/portals/{teacher,admin,author,mobile}.css` | Per-portal accent overrides — e.g. `teacher.css` aliases `--color-blue → --color-green` so the same chrome renders green for the teacher app. | Each portal app imports its own |
| `@alp/design-system` (JS) | TypeScript token map (`tokens.colors.text.primary`, etc.) for any TS code that needs token values at runtime. | Currently unused — kept for future TS-driven UI utilities |

## Usage

```tsx
// Apply the dark-theme tokens + shell chrome at app entry:
import "@alp/design-system/tokens.css";
import "@alp/design-system/shell.css";

// Optional: portal-specific accent override (web-portal example):
import "@alp/design-system/portals/teacher.css";
```

Then in components, use the shared class library directly:

```tsx
<button className="btn btn-primary">Save</button>
<div className="card">
  <p className="row-link-title">A row title</p>
</div>
<input className="form-input" />
```

For an end-to-end example, see [`apps/web-student/src/components/AppShell.tsx`](../../apps/web-student/src/components/AppShell.tsx).

## What's NOT here anymore

The original `<Button>` / `<Badge>` / `<Input>` / `<Modal>` React components shipped in Sprint 0 v0.1 were superseded in PRs #42–#53 by the `shell.css` class library. They were removed once the last consumer (`web-student`) finished migrating. **If you need a button, use `<button className="btn btn-primary">` directly.**

To re-introduce a React-component layer in the future (e.g. for a Storybook gallery), build it on top of the existing classes — don't re-implement the styling.
