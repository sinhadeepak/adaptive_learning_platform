# Migrating from Aurora v2 → Vidya v1

A practical playbook to rip out Aurora and install Vidya across the codebase.

> **Time estimate:** 1 senior FE engineer · 3-5 working days for web · 2-3 days for mobile · 1 day testing.

---

## Phase 0 · Inventory (1 hour)

Run this from repo root to know what you're changing:

```bash
# Count Aurora token usages
rg --type-add 'src:*.{ts,tsx,js,jsx,css,scss,dart}' -t src \
   '(--brand-|--aurora-|--bg-surface|--text-primary|--neutral-)' \
   | wc -l

# Find files importing Aurora
rg -l 'aurora|--brand-' --type-add 'src:*.{ts,tsx,css,dart}' -t src
```

Expect ~ **1,400 token references across ~120 files** in current codebase.

---

## Phase 1 · Install Vidya (30 min)

### Web

```bash
# 1. Place the new files
mkdir -p packages/design-system/src/vidya
cp design-system/02_tokens.css   packages/design-system/src/vidya/tokens.css
# (optional) cp design-system/vidya-base.css packages/design-system/src/vidya/base.css

# 2. Update package entry
# packages/design-system/src/index.ts
echo "export * from './vidya/tokens.css';" >> packages/design-system/src/index.ts

# 3. Import in app shell
# apps/web-student/src/main.tsx  (and 3 other apps)
import '@alp/design-system/vidya/tokens.css';
// remove: import '@alp/design-system/tokens.v2.css';
```

### Mobile (Flutter)

```bash
mkdir -p packages/design-tokens-flutter/lib/src/vidya
cp design-system/03_tokens.dart packages/design-tokens-flutter/lib/src/vidya/tokens.dart

# barrel export
# packages/design-tokens-flutter/lib/alp_design_tokens.dart
echo "export 'src/vidya/tokens.dart';" >> alp_design_tokens.dart
```

In `apps/mobile/lib/main.dart`:

```dart
MaterialApp(
  theme: VidyaTheme.material(brightness: Brightness.light),
  darkTheme: VidyaTheme.material(brightness: Brightness.dark),
  themeMode: ThemeMode.system,
  // ...
);
```

---

## Phase 2 · Search-replace (1–2 days, web)

### A. CSS variable renames (61 names)

Use this script (`scripts/aurora-to-vidya.sh`):

```bash
#!/usr/bin/env bash
set -e
PATTERN_FILES='*.{ts,tsx,js,jsx,css,scss}'

# Helper
sub() {
  rg -l --type-add "src:$PATTERN_FILES" -t src "$1" \
    | xargs -I{} sed -i.bak "s|$1|$2|g" {}
}

# 1. Surfaces
sub '--bg-base'         '--paper'
sub '--bg-surface1'     '--paper-2'
sub '--bg-surface2'     '--card'
sub '--bg-surface3'     '--paper-2'

# 2. Text
sub '--text-primary'    '--ink'
sub '--text-secondary'  '--ink-2'
sub '--text-muted'      '--ink-3'
sub '--text-faint'      '--ink-4'

# 3. Brand
sub '--brand-600'       '--accent'
sub '--brand-700'       '--accent-2'
sub '--brand-50'        '--accent-soft'
sub '--brand-100'       '--accent-soft'

# 4. Status (Aurora used different names)
sub '--color-green'     '--good'
sub '--color-red'       '--bad'
sub '--color-amber'     '--warn'
sub '--color-blue'      '--info'

# 5. Aurora AI gradients → solid gold
sub 'var(--aurora-ai)'  'var(--gold)'
sub 'var(--aurora-celebration)' 'var(--gold)'
sub 'var(--aurora-progress)'    'var(--accent)'
sub 'var(--aurora-ai-soft)'     'var(--gold-soft)'

# 6. Subject colors — Aurora had them, keep the same names
# (--subj-physics etc.) — no change needed

# 7. Mastery
sub '--strength-strong'      '--m-strong'
sub '--strength-developing'  '--m-dev'
sub '--strength-weak'        '--m-weak'
sub '--strength-mastered'    '--m-mastered'

# 8. Spacing scale (Aurora used --sp-*, same names) — no change
# 9. Radius (--r-*, same names) — no change

# 10. Typography role tokens
sub '--font-junior-display' '--font-display'   # we don't fork Junior typography
sub '"Nunito"' '"Instrument Serif"'
sub '"Inter", system-ui' '"Geist", system-ui'

# 11. Shadow tokens (rename)
sub '--sh-xs' '--shadow-xs'
sub '--sh-sm' '--shadow-sm'
sub '--sh-md' '--shadow-md'
sub '--sh-lg' '--shadow-lg'
sub '--sh-xl' '--shadow-lg'  # we consolidated 4 levels into 4

# 12. Motion
sub '--m-fast'  '--m-fast'        # same
sub '--m-base'  '--m-base'        # same
sub '--m-slow'  '--m-slow'        # same

echo "✓ Aurora → Vidya rename complete"
echo "Cleanup .bak files: find . -name '*.bak' -delete"
```

### B. Per-portal token files — delete

```bash
rm packages/design-system/src/portals/admin-tokens.css
rm packages/design-system/src/portals/teacher-tokens.css
rm packages/design-system/src/portals/author-tokens.css
rm packages/design-system/src/portals/mobile-tokens.css
# Vidya is portal-agnostic — accent override happens via [data-persona]
```

Update each web-* app's entry to set the persona attribute on `<html>`:

```html
<!-- apps/web-student/index.html -->
<html data-persona="aspirant" data-theme="light" data-density="regular">
```

```html
<!-- apps/web-admin/index.html -->
<html data-persona="pro" data-theme="light" data-density="compact">
<!-- Admin uses pro persona's ink accent + compact density -->
```

### C. Component-level migration

Aurora's old class names map directly:

```diff
- <div class="alp-card">
+ <div class="vdy card">

- <button class="alp-button alp-button--primary">
+ <button class="btn btn-primary">

- <span class="alp-pill alp-pill--success">
+ <span class="pill pill-good">
```

Or — even better — start fresh from the 14 components in `04_components.md`.

---

## Phase 3 · Typography (half day)

Aurora used **Inter** everywhere. Vidya uses **Instrument Serif (display) + Geist (UI) + Geist Mono (data)**.

### Self-host the fonts

```bash
mkdir -p apps/web-student/public/fonts/vidya

# Instrument Serif (SIL OFL · free commercial)
# https://fonts.google.com/specimen/Instrument+Serif
wget -O instrument-serif-regular.woff2 \
  'https://fonts.gstatic.com/s/instrumentserif/v8/...'

# Geist (SIL OFL · free commercial)
# https://vercel.com/font

# Geist Mono (SIL OFL)
```

Add @font-face declarations in `packages/design-system/src/vidya/fonts.css`:

```css
@font-face {
  font-family: 'Instrument Serif';
  src: url('/fonts/vidya/instrument-serif-regular.woff2') format('woff2');
  font-display: swap;
}
@font-face {
  font-family: 'Geist';
  src: url('/fonts/vidya/geist-variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: 'Geist Mono';
  src: url('/fonts/vidya/geist-mono-variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}
```

### Flutter

```yaml
# apps/mobile/pubspec.yaml
flutter:
  fonts:
    - family: InstrumentSerif
      fonts: [{ asset: assets/fonts/InstrumentSerif-Regular.ttf }]
    - family: Geist
      fonts:
        - asset: assets/fonts/Geist-Regular.ttf
        - asset: assets/fonts/Geist-Medium.ttf
          weight: 500
        - asset: assets/fonts/Geist-SemiBold.ttf
          weight: 600
    - family: GeistMono
      fonts: [{ asset: assets/fonts/GeistMono-Regular.ttf }]
```

---

## Phase 4 · Component rebuild order

Suggested order (low → high risk):

1. **Buttons + pills + form fields** — 200 instances · use the tokens, structure stays
2. **Cards + stat tiles** — 80 instances · drop shadow rules change
3. **Tables** — 25 instances · header style + row height shifts
4. **Sidebars + topbars** — 5 instances · wordmark + density changes
5. **Charts** — 14 instances · update SVG colors to tokens
6. **Mastery / readiness components** — 6 instances · canonical 5-bucket scale
7. **AI tag + signal cards** — many instances · gold ◈ replaces cyan/violet
8. **Dark hero cards** — new pattern · readiness + earnings · pixel-test these

---

## Phase 5 · QA gates (1 day)

### Linting · block hard-coded hex outside tokens file

`.eslintrc.cjs`:

```js
{
  plugins: ['no-restricted-syntax'],
  rules: {
    'no-restricted-syntax': ['error', {
      selector: "Literal[value=/^#[0-9A-Fa-f]{3,6}$/]",
      message: 'Use --vidya-* token instead of hex literal',
    }],
  },
  overrides: [{
    files: ['packages/design-system/**'],
    rules: { 'no-restricted-syntax': 'off' },
  }],
}
```

CSS lint (`stylelint`):

```json
{
  "rules": {
    "color-no-hex": [true, {
      "ignore": ["packages/design-system/**"]
    }]
  }
}
```

### Visual regression

Use **Playwright + pixel-diff** against the 108 reference screens shipped in the design canvas. Threshold ≤ 0.5% diff per artboard.

### Accessibility

Run **axe-core** on all 4 web apps + Flutter accessibility scanner. Vidya target: 0 violations · WCAG AA · contrast verified per token in `06_accessibility.md`.

### Performance

- First contentful paint should not regress vs Aurora (the design is lighter, not heavier).
- Self-hosted fonts must be preloaded:

```html
<link rel="preload" href="/fonts/vidya/geist-variable.woff2"
      as="font" type="font/woff2" crossorigin>
```

---

## Phase 6 · Cleanup (half day)

Delete the corpses:

```bash
rm packages/design-system/src/tokens.v2.css         # Aurora v2 file
rm packages/design-system/src/density.css           # merged
rm -r packages/design-system/src/portals/           # per-portal accents
rm packages/design-tokens-flutter/lib/src/aurora_*  # Aurora Flutter
rm packages/design-tokens-flutter/lib/src/persona.dart   # superseded
rm packages/design-tokens-flutter/lib/src/persona_theme.dart
rm packages/design-tokens-flutter/lib/src/colors.dart    # v1 legacy
# ...etc.
```

Update `packages/design-system/README.md` and `packages/design-tokens-flutter/README.md` to reference Vidya.

Tag the release: `git tag design-system@v1.0.0-vidya`.

Update the ADR: write `docs/adr/0034-design-system-v3-vidya.md` superseding ADR-0028 (Aurora) and ADR-0029 (component primitives).

---

## Rollback plan

If Vidya needs to be reverted:

1. `git revert <vidya-tag>..HEAD` — single commit reverts everything
2. Keep `packages/design-system/src/tokens.v2.css` archived in `legacy/` for one full release cycle
3. Aurora ADRs stay as historical record

This is why we ship Vidya as a clean break, **not an additive layer**. Two systems competing in one codebase is the actual risk.

---

## Open questions to resolve before starting

- [ ] Which font CDN / self-hosting strategy? (recommend self-host)
- [ ] Do we want a 6-week Aurora-Vidya parallel period (feature flag) or hard cutover?
- [ ] Who owns the visual-regression baseline (108 reference screenshots)?
- [ ] What's the comms plan to existing 2.4M users about the visual change?

---

*Migration guide · Vidya v1.0 · paired with `00_README.md` and `04_components.md`*
