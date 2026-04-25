# Common Controls & Design System — Engineering Specification

**Project**: Adaptive Learning Platform — Phase 1 (India)
**Version**: v0.1 — Sprint 0 skeleton (values TBD by Designer)
**Scope**: This document is the engineering-oriented specification for the **shared design tokens** and **common controls library** used across all three web surfaces (`apps/web-student`, `apps/web-portal`, `apps/web-admin`) and mirrored in the Flutter mobile app (`apps/mobile`).
**Complements**: [04_UIUX_Wireframe_DesignSystem_AdaptiveLearningPlatform.docx](04_UIUX_Wireframe_DesignSystem_AdaptiveLearningPlatform.docx) (visual design + wireframes — canonical).
**Structure reference**: Patterned after Governata Design System Specification v1 — foundations → inventory → control-by-control spec.
**Owners**: Designer (tokens, visual specs) + FE Lead A (package authoring) + FE Lead B (operator-surface controls). Review by Tech Lead.

---

## 1. Why a shared controls library

Three web apps share 80%+ of their surface controls (inputs, buttons, tables, modals, nav, badges). Reimplementing them per app produces drift: different focus rings, different table paddings, different error semantics. This spec + the accompanying `@alp/design-system` npm package guarantee:

- **Visual consistency** across student / operator / platform-admin surfaces.
- **A single place** to fix a bug or update a token (Sprint 3+ velocity multiplier).
- **Mobile parity** — the same token names exist in `packages/design-tokens-flutter` so Flutter consumes the same brand values.
- **A11y baseline** — each control ships with focus, keyboard, and SR behaviour spec'd once.

Rule: a web app MUST import from `@alp/design-system` for any control listed in §3. Local variants require an ADR.

---

## 2. Design System Foundations

> Values marked **TBD** are owned by the Designer and locked in Sprint 0. Brand colours, primary typeface, and logo lockup derive from the Brand Guidelines (separately owned).

### 2.1 Typography

Primary UI typeface: **TBD — Designer to select** (candidates: Inter, Poppins, DM Sans). Monospace for code/IDs/versions: JetBrains Mono (fallback Courier New).

**Type scale** (to be finalised; starting slots):

| Role | Size (px) | Weight | Color token | Applied to |
|---|---|---|---|---|
| Page / Module Title | 20 | 600 | `text-primary` | Top-level heading |
| Section Heading | 16 | 600 | `text-primary` | Card headings, panel titles |
| Sub-heading | 14 | 600 | `text-primary` | Form sections, table groups |
| Body / UI Text | 14 | 400 | `text-secondary` | Nav, table cells, descriptions |
| Form Label | 12 | 500 | `text-secondary` | Above inputs |
| Hint / Helper | 12 | 400 | `text-muted` | Below inputs |
| Badge / Chip | 11 | 500 | context | Status badges, chips |
| Micro / Timestamp | 11 | 400 | `text-muted` | Logs, relative times |
| Table Column Header | 11 | 600 | `text-secondary` | UPPERCASE, letter-spacing 0.05em |
| Button Label | 14 | 500 | context | sm 12 / md 14 / lg 16 |

### 2.2 Color Tokens

Never hardcode hex. Reference tokens only. Designer fills the hex values; the table slots below are fixed (names are the contract).

**2.2.1 Brand + interactive**

| Token | Hex (TBD) | Usage |
|---|---|---|
| `brand-primary` | TBD | Primary button bg, nav accent, key links |
| `brand-primary-hover` | TBD | Primary button hover |
| `brand-secondary` | TBD | Secondary accent |
| `brand-tint` | TBD | Selected-row fill, active-nav bg |
| `focus-ring` | TBD | 3px outline colour for focus |

**2.2.2 Semantic (foreground/background pairs)**

| Pair | Foreground Token | Background Token | Usage |
|---|---|---|---|
| Success | `success-fg` | `success-bg` | Positive / correct-answer / paid |
| Warning | `warning-fg` | `warning-bg` | Pending / low-mastery / approaching-deadline |
| Danger | `danger-fg` | `danger-bg` | Errors / wrong-answer / payment-failed |
| Info | `info-fg` | `info-bg` | Informational banners, tooltips |

**2.2.3 Neutrals + text**

| Token | Hex (TBD) | Usage |
|---|---|---|
| `surface-primary` | #FFFFFF | Cards, inputs, modals |
| `surface-secondary` | TBD | Page background |
| `surface-tertiary` | TBD | Selected tab, chip fill, disabled input |
| `border-default` | TBD | Input / card / divider borders |
| `border-strong` | TBD | Input hover, major zone divider |
| `text-primary` | TBD | Headings, values, active labels |
| `text-secondary` | TBD | Body, descriptions, form labels |
| `text-muted` | TBD | Placeholders, hints, timestamps |
| `text-disabled` | TBD | Disabled values |

### 2.3 Spacing Scale

4px base grid. Only these values:

| Token | Value | Common use |
|---|---|---|
| `space-1` | 4 px | Icon-to-text inside badge |
| `space-2` | 8 px | Checkbox-to-label, button icon gap |
| `space-3` | 12 px | Compact chip padding |
| `space-4` | 16 px | Card padding, form field gap |
| `space-5` | 20 px | Panel internal padding |
| `space-6` | 24 px | Page gutter, block gap |
| `space-8` | 32 px | Section gap |

### 2.4 Shape + Elevation

| Component type | Radius |
|---|---|
| Inputs, selects, buttons | 6 px |
| Cards, panels, dropdown panels | 8 px |
| Modal dialogs | 12 px |
| Badges, pills, chips | 9999 px |
| Avatars | 50% |
| Checkboxes | 3 px |
| Code chips | 4 px |

| Elevation | box-shadow |
|---|---|
| Flat (default) | none |
| Hover | 0 2px 8px rgba(0,0,0,0.06) |
| Dropdown | 0 4px 16px rgba(0,0,0,0.10) |
| Focus ring | 0 0 0 3px `focus-ring` |

### 2.5 Breakpoints + Layout Grid

Breakpoints are **min-width**. The student app is fully responsive; operator (`web-portal`) and admin (`web-admin`) surfaces are desktop-first and ship a compact read-only view below `bp-lg` (full write operations require `bp-lg` or higher).

**2.5.1 Breakpoint tokens**

| Token | Min width | Primary audience | Write operations |
|---|---|---|---|
| `bp-xs` | 0 px | Student mobile web (portrait) | Yes |
| `bp-sm` | 480 px | Student mobile web (landscape / large phones) | Yes |
| `bp-md` | 768 px | Student tablet | Yes |
| `bp-lg` | 1024 px | Student desktop, operator portal min | Yes |
| `bp-xl` | 1280 px | Operator / admin default | Yes |
| `bp-2xl` | 1536 px | Admin dense dashboards | Yes |

**2.5.2 Grid system**

12-column grid across all breakpoints. Column width is derived — designers and engineers work in **columns + gutter + outer margin**, never absolute pixel positions.

| Breakpoint | Columns | Gutter | Outer margin | Max content width |
|---|---|---|---|---|
| `bp-xs` (0–479) | 4 | `space-3` (12 px) | `space-4` (16 px) | 100% |
| `bp-sm` (480–767) | 4 | `space-4` (16 px) | `space-4` (16 px) | 100% |
| `bp-md` (768–1023) | 8 | `space-4` (16 px) | `space-6` (24 px) | 720 px |
| `bp-lg` (1024–1279) | 12 | `space-5` (20 px) | `space-6` (24 px) | 960 px |
| `bp-xl` (1280–1535) | 12 | `space-6` (24 px) | `space-8` (32 px) | 1200 px |
| `bp-2xl` (1536+) | 12 | `space-6` (24 px) | `space-8` (32 px) | 1440 px |

**2.5.3 Per-app layout reference**

Each app composes its own chrome on top of the grid. Content always flows inside the grid's Max-content-width container.

| App | `bp-xs` → `bp-md` | `bp-lg`+ |
|---|---|---|
| `web-student` | Top Nav §3.4 (student variant, 56 px) + full-width content (no side nav) + bottom tab bar (mobile-only, 56 px) | Top Nav (56 px) + centered content (max 1200 px) — no side nav |
| `web-portal` | Read-only compact (Top Nav + content; side nav collapsed into top overflow menu). Write actions surface a banner "Switch to desktop to edit" | Top Nav (56 px) + Side Nav §3.5 (240 px expanded / 64 px collapsed) + content fills remainder up to max-content-width |
| `web-admin` | NOT SUPPORTED below `bp-lg`. Below `bp-lg` shows a hard block screen: "Admin surface requires a desktop browser." | Top Nav (56 px) + Side Nav (240 px) + content (Max 1440 px) |
| Mobile (Flutter) | Native layout; tokens mirror but grid semantics do not apply (Flutter uses `Row`/`Column`/`Flex`) | N/A |

**2.5.4 Layout primitives**

The design system exports three layout primitives that encode the grid rules so consumers don't compute gutters manually:

| Primitive | Purpose |
|---|---|
| `<Container>` | Max-content-width wrapper with responsive outer-margin padding |
| `<Grid cols={12} gap={...}>` | 12-column grid; `cols` overridable per breakpoint |
| `<Stack gap={...} direction="row\|column">` | Flex stack with token-gap; direction-responsive via `{ xs: 'column', md: 'row' }` |

Sprint 1 ships `<Container>` + `<Stack>`; Sprint 2 adds `<Grid>` (needed once Data Table composes inside complex detail layouts).

**2.5.5 Density modes**

Some surfaces (admin dashboards, content author tables) are data-dense and should tighten row heights + padding. Density is a token, not a per-surface override.

| Token | Row height (Data Table) | Form field gap | Card padding |
|---|---|---|---|
| `density.compact` | 40 px | `space-2` | `space-4` |
| `density.regular` (default) | 48 px | `space-3` | `space-5` |
| `density.comfortable` | 56 px | `space-4` | `space-6` |

- `web-student` → `regular` (touch-friendly, text-dense layouts are rare).
- `web-portal` → `regular` default; user can switch to `compact` for table-heavy views (persisted in localStorage `alp.density`).
- `web-admin` → `compact` default.

### 2.6 Motion

| Token | Value | Usage |
|---|---|---|
| `duration-instant` | 80 ms | Focus, hover |
| `duration-fast` | 150 ms | Toggles, small opacity |
| `duration-base` | 220 ms | Modals, drawers |
| `easing-standard` | cubic-bezier(0.2, 0, 0, 1) | Default |

Respect `prefers-reduced-motion` — in reduced mode, all durations clamp to 0 except focus ring.

### 2.7 Iconography

Icons carry almost as much semantic weight as text in operator and admin surfaces. The system pins one icon family for UI use and one narrow set of custom brand icons.

**2.7.1 Source + delivery**

| Concern | Decision |
|---|---|
| Primary icon set | **Lucide** (`lucide-react` for web, `lucide_icons` for Flutter) — MIT-licensed, ~1500 icons, consistent 24 px viewBox @ 2 px stroke |
| Package | `@alp/icons` — re-exports the ~120 icons we use, so bundler tree-shakes and brand-custom icons live alongside |
| Brand / product-specific icons | Custom SVGs in `@alp/icons/custom/` (logo marks, readiness-ring decoration, streak flame, exam-category marks). Source in Figma; exported as optimised SVG via SVGO |
| Never | Font-awesome, Material Icons, or mixing two icon families. Emoji is allowed for user-generated content only (chat, profile), never in UI chrome |

**2.7.2 Size scale**

| Token | Size | Stroke | Use |
|---|---|---|---|
| `icon.xs` | 12 px | 1.5 px | Inline with 11 px badge / micro text; sort indicators (§3.21); chevrons inside pills |
| `icon.sm` | 14 px | 1.75 px | Inline with body text; form field right/left adornments; tag close-`×` |
| `icon.md` (default) | 16 px | 2 px | Buttons (md), table row actions, top-nav icons, input icons |
| `icon.lg` | 20 px | 2 px | Buttons (lg), side-nav items, empty-state compact, log-row level badge |
| `icon.xl` | 24 px | 2 px | Card headers, modal headers, feature tiles |
| `icon.2xl` | 32 px | 2.25 px | File-upload dropzone, large illustrations in-line |
| `icon.3xl` | 48 px | 2.5 px | Empty-state compact illustration |
| `icon.4xl` | 96 px | — | Empty-state full illustration (raster or multi-stroke SVG — stroke rule relaxes here) |

Stroke width is baked into the Lucide source; custom icons authored at 24 px viewBox with matching 2 px stroke. Do NOT scale icons with CSS `zoom` or non-uniform `transform` — always use the size token.

**2.7.3 Colour rules**

Icons inherit `currentColor` from their container by default. Specific roles:

| Role | Colour token |
|---|---|
| Default / inline with text | inherits `currentColor` |
| Muted / decorative | `text-muted` (#94A3B8) |
| Primary action icon (on brand button) | `surface-primary` (#FFFFFF) |
| Semantic (success/warning/danger/info) | matching foreground token |
| Disabled | `text-disabled` |
| Brand mark (logo) | brand-specific colours; do not recolour |

Never apply semantic colours to decorative icons (a green checkmark carries meaning — reserve for real success states).

**2.7.4 Naming**

Lucide names are preserved as-is (`ChevronDown`, `Search`, `X`, `AlertTriangle`). Custom icons follow `PascalCase` + `Alp` prefix to prevent collision: `AlpStreakFlame`, `AlpReadinessRing`, `AlpLogoMark`, `AlpExamBadgeJEE`.

**2.7.5 A11y**

| Case | Treatment |
|---|---|
| Icon *alongside* a text label (button, menu item) | `aria-hidden="true"` on the icon — the label carries the name |
| Icon-only button | `<button aria-label="...">` + `aria-hidden` on the SVG |
| Decorative icon (spacer, illustration) | `aria-hidden="true"` |
| Icon is the state (e.g. sort direction, success check) | Either `aria-label` on the SVG OR a `sr-only` sibling describing the state; never both |

**2.7.6 Inventory policy**

- Adding a new icon requires a Designer review — the inventory stays curated to avoid 12 near-duplicates.
- `@alp/icons` exports a flat namespace; the build fails if two distinct imports resolve to similar icons (manual audit, not automated — Sprint 3+).
- When an icon is retired, keep a deprecated re-export for one minor version, then delete.

**2.7.7 Flutter parity**

Flutter app imports the same logical names via a thin wrapper:

```dart
import 'package:alp_icons/alp_icons.dart';
// <AlpIcon.chevronDown size: AlpIconSize.md />
```

`AlpIconSize` enum mirrors the web sizes (xs/sm/md/lg/xl/2xl/3xl/4xl). Custom brand icons ship as Flutter `SvgPicture` assets from the same source SVGs.

---

## 3. Common Controls Specification

These controls MUST come from `@alp/design-system`. The Flutter app implements equivalents in `apps/mobile/lib/design_system/` with the same token names.

> **Note on hex values in this section**: concrete hex values below reference the §2.2 token palette (Designer locks brand values in Sprint 0 Day 5). When tokens change, this section's hex references update in lock-step — the **token names + dimensions + states + behaviour rules** are the contract and do not change.

### 3.0 Inventory

| # | Control | Scope |
|---|---|---|
| 3.1 | Input (text / email / password / number / textarea) | all |
| 3.2 | Button | all |
| 3.3 | Status Badge | all |
| 3.4 | Top Navigation Bar | all (variants) |
| 3.5 | Side Navigation | web-portal, web-admin |
| 3.6 | Tabs | all |
| 3.7 | Stepper | web-student, web-portal |
| 3.8 | Dropdown / Select | all |
| 3.9 | Checkbox | all |
| 3.10 | Table Cell + Row Action Icons | web-portal, web-admin |
| 3.11 | Progress — Circular | web-student, web-portal |
| 3.12 | Progress — Horizontal | all |
| 3.13 | File Upload | web-portal |
| 3.14 | Data Card | all |
| 3.15 | Empty State | all |
| 3.16 | Log / Event Row | web-admin |
| 3.17 | Tooltip | all |
| 3.18 | Data Table | web-portal, web-admin |
| 3.19 | Table Toolbar | web-portal, web-admin |
| 3.20 | Pagination | web-portal, web-admin |
| 3.21 | Column Sort Indicator | web-portal, web-admin |
| 3.22 | Breadcrumb | web-portal, web-admin |
| 3.23 | Modal / Dialog | all |
| 3.24 | Context Menu | web-portal, web-admin |
| 3.25 | Alert Banner | all |
| 3.26 | Date / Date-Range Picker | web-portal, web-admin |
| 3.27 | Toggle Switch | all |
| 3.28 | Multi-Select Tag Input | web-portal |
| 3.29 | Radio Group | web-student |
| 3.30 | Search Input (standalone) | all |
| 3.31 | Loading States — Skeleton + Spinner | all |
| 3.32 | Avatar | all |
| 3.33 | Inline Edit | web-portal |
| 3.34 | Accordion | all |
| 3.35 | Question Card (MCQ renderer) | web-student, mobile |
| 3.36 | Answer Option Button | web-student, mobile |
| 3.37 | Readiness Score Ring | web-student, mobile |
| 3.38 | Streak Counter | web-student, mobile |
| 3.39 | Leaderboard Row | web-student, mobile |

---

### 3.1 Input (text / email / password / number / textarea)

Single-line text inputs plus textarea. All variants share identical base geometry — only border colour and background change between states.

**3.1.1 Base anatomy**

| Property | Value | Notes |
|---|---|---|
| Height | 40 px (md), 32 px (sm), 48 px (lg) | `md` default |
| Horizontal padding | `space-3` (12 px) | +24 px on any side that has an icon slot |
| Font | `body` (14 px / 400) family `ui` | Weight steps to 500 on focus |
| Value text | `text-primary` (#0F172A) | — |
| Placeholder | `text-muted` (#94A3B8) | — |
| Border radius | `radius.input` (6 px) | — |
| Background (default) | `surface-primary` (#FFFFFF) | Disabled → `surface-secondary` (#F8FAFC) |
| Label | 12 px / 500 / `text-secondary` | 4 px gap above input. Required: append red `*` |
| Hint | 12 px / 400 / `text-muted` | 4 px gap below input |
| Error text | 12 px / 400 / `danger-fg` | Replaces hint. Prefixed with warning icon (12 px) |
| Icon slot (left / right) | 16×16 px, `text-muted` | Pointer-events: none unless interactive (e.g. clear/toggle password) |

**3.1.2 States**

| State | Border | Background | Other |
|---|---|---|---|
| Default / Empty | 1 px `border-default` (#E2E8F0) | `surface-primary` | Placeholder visible |
| Filled | 1 px `border-default` | `surface-primary` | Value `text-primary` |
| Hover | 1 px `border-strong` (#CBD5E1) | `surface-primary` | — |
| Focus | 1 px `brand-primary` (#2563EB) | `surface-primary` | `elevation.focusRing` box-shadow |
| Error | 1 px `danger-fg` (#DC2626) | `surface-primary` | Label → `danger-fg`; error text replaces hint; `aria-invalid="true"` |
| Disabled | 1 px `border-default` | `surface-secondary` | Value `text-disabled`; cursor `not-allowed`; no hover/focus |
| Read-only | 1 px `border-default` | `surface-secondary` | Value `text-secondary`; cursor `default`; tabbable |

**3.1.3 Variants**

| Variant | Spec |
|---|---|
| Textarea | Min-height 96 px (4 rows). Resize vertical only. Optional character counter 11 px / `text-muted` — turns `danger-fg` at ≥ 95% of max |
| Number | Right edge: stacked stepper arrows (24 px wide, border-left 1 px `border-default`, bg `surface-secondary`). Keyboard: ↑/↓ adjust by `step`. Disabled at min/max |
| Password | Right icon (eye / eye-off) toggles visibility. `autocomplete="current-password"` or `"new-password"` as appropriate |
| Search | See §3.30 (standalone search input) |

**3.1.4 Behaviour + a11y**

- Associate `<label htmlFor={id}>` with `<input id={id}>`. When only `aria-label` is used, the visual label is still preferred for a11y.
- Errors surface via `aria-invalid="true"` + `aria-describedby` pointing at the error-text element.
- Don't clobber native browser autofill — use `autocomplete` attributes.
- Rate-limit validation: run on blur by default; on change only for obvious issues (length limits).
- Never truncate input value — allow horizontal scroll.

---

### 3.2 Button

Interactive surface for all commit, navigation, and destructive actions. Three sizes, five variants, one loading state.

**3.2.1 Base anatomy**

| Property | sm | md (default) | lg |
|---|---|---|---|
| Height | 28 px | 36 px | 44 px |
| Horizontal padding | 10 px | 14 px | 18 px |
| Font size | 12 px | 14 px | 16 px |
| Font weight | 500 | 500 | 500 |
| Icon size (leading/trailing) | 14 px | 16 px | 18 px |
| Icon-to-label gap | `space-2` (8 px) | `space-2` | `space-2` |
| Border radius | `radius.button` (6 px) | | |
| Min-width | 64 px | 80 px | 96 px |
| Active (press) | `transform: scale(0.98)` | | |

**3.2.2 Variants**

| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| Primary | `brand-primary` (#2563EB) | `surface-primary` (#FFFFFF) | transparent | bg → `brand-primaryHover` (#1D4ED8) |
| Secondary | `surface-primary` | `text-primary` | 1 px `border-default` | bg → `surface-tertiary` (#F1F5F9) |
| Ghost | transparent | `text-primary` | transparent | bg → `surface-tertiary` |
| Danger | `danger-fg` (#DC2626) | `surface-primary` | transparent | bg → `#B91C1C` |
| Link | transparent | `brand-primary` | transparent | underline; color → `brand-primaryHover` |

**3.2.3 States**

| State | Treatment |
|---|---|
| Default | Per variant table |
| Hover | Per variant table |
| Focus-visible | `elevation.focusRing` (3 px `focus-ring`) outside the border |
| Active | `transform: scale(0.98)` |
| Disabled | opacity 0.45; cursor `not-allowed`; no hover/focus treatment |
| Loading | Spinner (14 px) replaces leading icon; label stays; `aria-busy="true"`; click suppressed |

**3.2.4 Behaviour + a11y**

- Use `<button type="button">` unless the button submits a form (`type="submit"`).
- `aria-label` required when the button has no visible text (icon-only). Minimum hit target 28×28 px on touch devices (iOS HIG).
- Destructive actions (`danger`) ALWAYS followed by a confirmation modal (§3.23) unless the action is reversible within 5 s (e.g. undo toast).
- Don't stack two `primary` buttons in the same region — rule of one primary per surface.

---

### 3.3 Status Badge

Pill-shaped inline label for entity state. Not interactive.

**3.3.1 Base anatomy**

| Property | Value |
|---|---|
| Height | 20 px |
| Padding | 2 px 8 px |
| Font | 11 px / 500 / `ui` |
| Border radius | `radius.pill` (9999 px) |
| Max width | 160 px (truncate with `…`) |
| Icon (optional leading) | 12 px; gap `space-1` (4 px) |

**3.3.2 Variants (semantic)**

| Tone | Background | Text | Represents |
|---|---|---|---|
| Success | `success-bg` (#DCFCE7) | `success-fg` (#16A34A) | Active, passed, paid, published |
| Warning | `warning-bg` (#FEF3C7) | `warning-fg` (#D97706) | Pending, review, approaching-deadline |
| Danger | `danger-bg` (#FEE2E2) | `danger-fg` (#DC2626) | Failed, rejected, overdue |
| Info | `info-bg` (#DBEAFE) | `info-fg` (#2563EB) | Informational, new, scheduled |
| Neutral | `surface-tertiary` (#F1F5F9) | `text-secondary` (#475569) | Archived, draft, default |

**3.3.3 Behaviour + a11y**

- Never used as a button — wrap in `<button>` if interactive and promote to a chip pattern (Sprint 3+).
- Text content is terse (1–2 words). For longer states, use Tooltip (§3.17).
- `role="status"` only when the badge reports live-changing state and an AT should announce it.

---

### 3.4 Top Navigation Bar

Persistent horizontal bar at the top of every authenticated page. Three variants — one per web app. Fixed to viewport top.

**3.4.1 Base anatomy**

| Property | Value |
|---|---|
| Height | 56 px |
| Background | `surface-primary` |
| Border-bottom | 1 px `border-default` |
| Horizontal padding | `space-6` (24 px) |
| Logo slot (left) | 32 px tall, flexible width |
| Right cluster gap | `space-4` (16 px) |
| Z-index | 40 |

**3.4.2 Variants**

| Variant | Left | Middle | Right |
|---|---|---|---|
| Student (`web-student`) | Logo | Search Input (§3.30, `max-width: 480px`) | Notifications bell, Avatar dropdown |
| Portal (`web-portal`) | Logo + tenant name | (empty) | Environment badge (if non-prod), User menu |
| Admin (`web-admin`) | Logo + "Super Admin" badge | (empty) | Environment badge (ALWAYS shown), User menu, MFA status icon |

**3.4.3 States (for interactive clusters)**

| Element | Default | Hover | Focus | Active |
|---|---|---|---|---|
| Logo link | `text-primary` | bg `surface-tertiary` | focus-ring | — |
| Nav icon button | `text-secondary` | bg `surface-tertiary` | focus-ring | bg `brand-tint` + color `brand-primary` |
| Avatar dropdown trigger | default | subtle bg | focus-ring | panel open |

**3.4.4 Behaviour + a11y**

- `<header role="banner">` wraps. Nav cluster in `<nav aria-label="Primary">`.
- User menu opens on click (not hover) to be keyboard-accessible; closes on Escape / outside click / item select.
- Environment badge (`web-admin`, `web-portal`) colour: `danger-bg` for "production", `warning-bg` for "staging", `info-bg` for "local".
- Fixed position: body `padding-top: 56px` on authenticated layouts.

---

### 3.5 Side Navigation

Collapsible vertical nav used on operator surfaces (`web-portal`, `web-admin`). Role-aware link filtering: links a user can't reach are never rendered.

**3.5.1 Base anatomy**

| Property | Expanded | Collapsed |
|---|---|---|
| Width | 240 px | 64 px |
| Background | `surface-primary` | `surface-primary` |
| Border-right | 1 px `border-default` | 1 px `border-default` |
| Item height | 40 px | 40 px |
| Item padding | 0 `space-4` | centered icon only |
| Icon size | 20 px | 20 px |
| Label | 14 px / 500 / `text-secondary` | hidden (tooltip on hover) |
| Section heading | 11 px / 600 / `text-muted`, UPPERCASE, letter-spacing 0.05em | hidden |
| Active indicator | 3 px left border in `brand-primary` | same |

**3.5.2 States**

| State | Background | Text / Icon |
|---|---|---|
| Default | transparent | `text-secondary` |
| Hover | `surface-tertiary` | `text-primary` |
| Focus-visible | transparent + focus-ring | `text-primary` |
| Active (current route) | `brand-tint` (#EFF6FF) + 3 px left border `brand-primary` | `brand-primary` |
| Disabled (role-gated) | NOT RENDERED | — |

**3.5.3 Behaviour + a11y**

- `<nav aria-label="Secondary">`. Current route: `aria-current="page"`.
- Collapse toggle persists in `localStorage` key `alp.nav.collapsed`.
- Keyboard: Tab reaches group header → Tab into items → ↑/↓ within group.
- Collapsed tooltips are Tooltip (§3.17) with keyboard-reachable focus.

---

### 3.6 Tabs

Horizontal underline tabs for in-page section switching.

**3.6.1 Base anatomy**

| Property | Value |
|---|---|
| Tablist height | 40 px |
| Item padding | 8 px `space-3` (12 px) |
| Item font | 14 px / 500 / `ui` |
| Gap between tabs | `space-4` (16 px) |
| Underline height | 2 px |
| Underline color (active) | `brand-primary` |
| Underline animation | translateX 220 ms `easing.standard` |
| Tablist border-bottom | 1 px `border-default` |

**3.6.2 States**

| State | Text | Underline |
|---|---|---|
| Default | `text-secondary` | none |
| Hover | `text-primary` | 2 px `border-strong` |
| Focus-visible | `text-secondary` + focus-ring on item | none |
| Active | `text-primary` | 2 px `brand-primary` |
| Disabled | `text-disabled` | none; cursor `not-allowed` |
| With badge | trailing Badge (§3.3), neutral tone | — |

**3.6.3 Behaviour + a11y**

- `role="tablist"` / `role="tab"` / `role="tabpanel"` with `aria-selected`, `aria-controls`, `aria-labelledby`.
- Keyboard: ←/→ move between tabs (wraps); Home / End jump. Tab leaves tablist into panel.
- Panel `tabIndex={0}` so screen readers can enter with Tab.
- Use for 2–6 tabs. Beyond 6, use Side Nav (§3.5) or Dropdown (§3.8).

---

### 3.7 Stepper

Guided multi-step flow indicator (horizontal) or vertical list.

**3.7.1 Base anatomy (horizontal)**

| Property | Value |
|---|---|
| Step indicator circle | 28 px diameter |
| Completed circle | bg `success-bg`, check icon 14 px `success-fg` |
| Active circle | bg `brand-primary`, number 14 px #FFFFFF, 1 px ring `brand-tint` |
| Pending circle | bg `surface-tertiary`, number 14 px `text-muted` |
| Connector line | 2 px, `border-default` (pending) or `success-fg` (complete) |
| Step label | 12 px / 500, below circle, `text-primary` active / `text-muted` pending |
| Spacing between steps | `space-6` (24 px) minimum |

**3.7.2 Variants**

| Variant | Spec |
|---|---|
| Horizontal | Default; used in onboarding, content authoring wizard |
| Vertical | Used where step detail sits inline (sidebar + panels); connector on left at x=14 px |
| With errors | Error step: circle bg `danger-bg`, border `danger-fg`, icon `!` |

**3.7.3 States**

| State | Circle | Label | Connector to next |
|---|---|---|---|
| Complete | `success-bg` + check | `text-primary` | `success-fg` |
| Active | `brand-primary` + number | `text-primary` 600 | `border-default` |
| Pending | `surface-tertiary` + number | `text-muted` | `border-default` |
| Error | `danger-bg` + `!` | `danger-fg` | `border-default` |

**3.7.4 Behaviour + a11y**

- `<ol>` semantic; `aria-current="step"` on active.
- Clicking a completed step may navigate back (opt-in per consumer) — never navigate forward by click.
- Flutter mobile mirrors the horizontal variant for onboarding.

---

### 3.8 Dropdown / Select

Single-value selector. Typeahead search shown automatically when option count > 10.

**3.8.1 Base anatomy (trigger)**

Trigger inherits Input (§3.1) dimensions. Additional:

| Property | Value |
|---|---|
| Chevron icon | 16 px `text-muted`, right padding `space-3` |
| Placeholder | `text-muted`, same font as Input |

**3.8.2 Panel**

| Property | Value |
|---|---|
| Background | `surface-primary` |
| Border | 1 px `border-default` |
| Radius | `radius.panel` (8 px) |
| Shadow | `elevation.dropdown` |
| Min-width | trigger width |
| Max-height | 320 px (scroll) |
| Option height | 36 px |
| Option padding | 8 px 12 px |
| Option font | 14 px / 400 |

**3.8.3 Option states**

| State | Background | Text | Other |
|---|---|---|---|
| Default | `surface-primary` | `text-primary` | — |
| Hover / highlighted | `surface-tertiary` | `text-primary` | — |
| Selected | `brand-tint` | `brand-primary` 500 | trailing check 14 px |
| Disabled | `surface-primary` | `text-disabled` | cursor `not-allowed` |

**3.8.4 Behaviour + a11y**

- `role="combobox"` + `aria-expanded` + `aria-controls` on trigger; `role="listbox"` + `aria-activedescendant` on panel.
- Keyboard: ↓ opens panel and highlights first; ↑/↓ move; Enter selects; Esc closes. Typing filters when search enabled.
- Search shown when options.length > 10 OR `searchable` prop forces it.
- Panel pins to trigger; flips up if below would overflow viewport.

---

### 3.9 Checkbox

Binary / indeterminate control.

**3.9.1 Base anatomy**

| Property | Value |
|---|---|
| Box size | 16 px |
| Border radius | `radius.checkbox` (3 px) |
| Border (default) | 1 px `border-strong` |
| Icon (checked) | 12 px check, `surface-primary` |
| Icon (indeterminate) | 10 px horizontal bar, `surface-primary` |
| Gap to label | `space-2` (8 px) |
| Label | 14 px / 400 / `text-primary` |
| Hit area | 20×20 px minimum |

**3.9.2 States**

| State | Box background | Border | Icon |
|---|---|---|---|
| Unchecked | `surface-primary` | `border-strong` | none |
| Hover (unchecked) | `surface-primary` | `brand-primary` | none |
| Checked | `brand-primary` | `brand-primary` | check |
| Indeterminate | `brand-primary` | `brand-primary` | bar |
| Focus-visible | — | — | `focus-ring` shadow on box |
| Disabled | `surface-secondary` | `border-default` | icon `text-disabled` if set |
| Error | as checked/unchecked | `danger-fg` | — |

**3.9.3 Behaviour + a11y**

- `<input type="checkbox">` + associated `<label>`. Indeterminate set via `ref.current.indeterminate = true`.
- Space toggles. Click anywhere on label also toggles.
- Indeterminate in table header = mix of selected/unselected rows (→ §3.18).

---

### 3.10 Table Cell + Row Action Icons

Standard cell layout and the right-edge action icon cluster.

**3.10.1 Cell anatomy**

| Property | Value |
|---|---|
| Row height (compact) | 40 px |
| Row height (regular) | 48 px |
| Row height (comfortable) | 56 px |
| Horizontal padding | `space-4` (16 px) |
| Font | 14 px / 400 / `text-primary` |
| Border-bottom (row) | 1 px `border-default` |
| Numeric cells | right-aligned, tabular-nums |
| Link cells | `brand-primary`; underline on hover |

**3.10.2 Row action icons**

Right-aligned cluster inside the last cell. Visible on row hover (desktop) / always visible on touch.

| Property | Value |
|---|---|
| Icon size | 16 px |
| Button size | 28×28 px hit target |
| Gap | `space-1` (4 px) |
| Color (default) | `text-muted` |
| Color (hover) | `text-primary`; destructive → `danger-fg` |
| Tooltip | Required for every icon (§3.17) |

**3.10.3 Row states**

| State | Background |
|---|---|
| Default | `surface-primary` |
| Zebra (alt) | `surface-secondary` (opt-in) |
| Hover | `surface-tertiary` |
| Selected | `brand-tint` |
| Selected + hover | `brand-tint` darker by 4% |
| Disabled row | opacity 0.5; cursor `not-allowed` |

**3.10.4 Behaviour + a11y**

- Keyboard: Tab into row's first interactive element; Shift+Tab exits; Enter on action button = activate.
- Action icons have `aria-label`. If > 3 actions, collapse secondary ones into a Context Menu (§3.24).

---

### 3.11 Progress — Circular

Used for completion and readiness-style scores.

**3.11.1 Sizes**

| Size | Diameter | Track width | Value label |
|---|---|---|---|
| sm | 24 px | 3 px | none |
| md | 48 px | 4 px | 14 px / 600 center |
| lg | 96 px | 6 px | 20 px / 600 center + 11 px / `text-muted` caption |

**3.11.2 Colours**

| Range (0–100) | Arc color | Track color |
|---|---|---|
| 0–34 | `danger-fg` | `surface-tertiary` |
| 35–69 | `warning-fg` | `surface-tertiary` |
| 70–100 | `success-fg` | `surface-tertiary` |
| Indeterminate | `brand-primary` | `surface-tertiary` |

**3.11.3 Behaviour + a11y**

- `role="progressbar"` + `aria-valuenow` / `aria-valuemin="0"` / `aria-valuemax="100"`.
- Animate arc with `stroke-dashoffset`; duration 400 ms `easing.standard`.
- Respect `prefers-reduced-motion` — drop the transition.

---

### 3.12 Progress — Horizontal

Linear bar for determinate + indeterminate progress.

**3.12.1 Anatomy**

| Property | Value |
|---|---|
| Height | 8 px (default); 4 px (thin); 12 px (thick) |
| Radius | `radius.pill` |
| Track | `surface-tertiary` |
| Fill (determinate) | `brand-primary` |
| Fill (success / error state) | `success-fg` / `danger-fg` |
| Label (optional above) | 12 px / 500 / `text-secondary`; right-aligned % value |

**3.12.2 Variants**

| Variant | Spec |
|---|---|
| Determinate | Width = value%; transition width 220 ms |
| Indeterminate | Animated 40%-width segment sliding left-to-right, loop 1.2 s |
| Segmented | N equal segments (e.g. onboarding progress); filled left-to-right |
| Stacked | Multiple colour segments summing to 100% (e.g. mastery breakdown) |

**3.12.3 Behaviour + a11y**

- Same ARIA as §3.11.
- Do not animate on every small change — batch by 1% step.

---

### 3.13 File Upload

Drag-drop or click-to-browse. Used on content authoring (CSV upload, question asset).

**3.13.1 Anatomy**

| Property | Value |
|---|---|
| Container min-height | 140 px |
| Border | 2 px dashed `border-strong` |
| Background | `surface-secondary` |
| Radius | `radius.card` (8 px) |
| Icon | 32 px cloud-upload, `text-muted`, center |
| Primary text | 14 px / 500 / `text-primary`, "Drag files here or click to browse" |
| Secondary text | 12 px / `text-muted` ("CSV up to 5 MB") |

**3.13.2 States**

| State | Border | Background | Other |
|---|---|---|---|
| Default | 2 px dashed `border-strong` | `surface-secondary` | — |
| Drag-hover | 2 px dashed `brand-primary` | `brand-tint` | icon color `brand-primary` |
| Uploading | 2 px solid `border-default` | `surface-secondary` | Horizontal progress bar §3.12 determinate |
| Success | 2 px solid `success-fg` | `success-bg` | File row with name + size + remove icon |
| Error | 2 px solid `danger-fg` | `danger-bg` | Error message + retry button |
| Disabled | 2 px dashed `border-default` | `surface-secondary` | opacity 0.5 |

**3.13.3 Behaviour + a11y**

- Underlying `<input type="file">` is visually hidden but tab-reachable. The container is `role="button"` with `tabIndex={0}`.
- Validate `accept` + `max size` on the client before upload; server must re-validate.
- Support paste (Ctrl+V of copied file).
- Show per-file progress in a list below the dropzone when `multiple`.

---

### 3.14 Data Card

Generic content card.

**3.14.1 Anatomy**

| Property | Value |
|---|---|
| Padding | `space-5` (20 px) |
| Background | `surface-primary` |
| Border | 1 px `border-default` |
| Radius | `radius.card` (8 px) |
| Shadow | `elevation.flat` (none) default |
| Header-to-body gap | `space-3` (12 px) |
| Body-to-footer gap | `space-4` (16 px) |
| Heading | `sectionHeading` (16 px / 600) |
| Subheading | `body` (14 px / 400 / `text-secondary`) |

**3.14.2 States**

| State | Spec |
|---|---|
| Default | As anatomy |
| Clickable (hover) | `elevation.hover` shadow; cursor `pointer` |
| Selected | 1 px border → `brand-primary`; bg → `brand-tint` |
| Disabled | opacity 0.5; cursor `not-allowed` |

**3.14.3 Behaviour + a11y**

- When clickable, wrap in `<button>` OR `<a>` — never `<div onClick>`.
- Keyboard: Enter / Space activates (for button-wrapped cards).

---

### 3.15 Empty State

Shown when a dataset, list, or view has no content.

**3.15.1 Anatomy**

| Property | Value |
|---|---|
| Illustration slot | 96×96 px (full) or 48×48 px (compact) |
| Title | 16 px / 600 / `text-primary` |
| Description | 14 px / 400 / `text-secondary`, max-width 360 px, centered |
| CTA (optional) | Primary Button (§3.2) |
| Vertical rhythm | `space-4` between each block |
| Container padding | `space-8` top/bottom; horizontal centered |

**3.15.2 Variants**

| Variant | Use |
|---|---|
| First-run | "You haven't created anything yet" — always include a primary CTA |
| No-results | Search/filter returned nothing — include "Clear filters" action |
| Error | Something went wrong — include "Try again" action and contact link |
| Access-denied | Restricted — show permission hint; do not reveal resource details |

**3.15.3 Behaviour + a11y**

- `role="status"` on first-run empty states reporting expected content arrival (otherwise omit).
- Error variants pair with the Alert Banner (§3.25) at the page level if the failure was system-wide.

---

### 3.16 Log / Event Row

Audit-log row used in `web-admin` (compliance / audit surface).

**3.16.1 Anatomy**

| Property | Value |
|---|---|
| Row height (collapsed) | 40 px |
| Row padding | `space-3` / `space-4` |
| Level badge (left) | Badge §3.3 size sm |
| Timestamp | 11 px / 400 / `text-muted`, width 160 px, tabular-nums |
| Actor | 13 px / 500 / `text-primary`, width 160 px truncate |
| Action | 13 px / 400 / `text-primary`, flex-grow |
| Expand chevron | 16 px `text-muted`, rotates 90° on expand |

**3.16.2 Level tones** (mapped to Badge §3.3)

| Level | Tone |
|---|---|
| INFO | info |
| NOTICE | info |
| WARN | warning |
| ERROR | danger |
| CRITICAL | danger (filled) |
| AUDIT | neutral |

**3.16.3 Expanded state**

| Field | Spec |
|---|---|
| JSON payload | Monospace 12 px, `surface-secondary` bg, padding `space-3`, max-height 320 px with scroll |
| Copy button | Top-right of expanded area |

**3.16.4 Behaviour + a11y**

- Rows `role="button"` with `aria-expanded`. Enter / Space toggle.
- Keyboard ↑/↓ move between rows when the log list owns focus management.
- Filter (level, actor, date range) lives in the Table Toolbar (§3.19) above the list.

---

### 3.17 Tooltip

Contextual micro-overlay.

**3.17.1 Anatomy**

| Property | Value |
|---|---|
| Padding | 6 px 8 px |
| Font | 12 px / 400 |
| Background | `text-primary` (#0F172A) |
| Text | `surface-primary` (#FFFFFF) |
| Radius | `radius.codeChip` (4 px) |
| Max width | 240 px |
| Arrow | 6 px triangle |
| Offset from anchor | 6 px |

**3.17.2 Behaviour + a11y**

- Show delay 500 ms (hover) / 0 ms (focus). Hide delay 100 ms.
- Always reachable by keyboard — appears on focus, not only hover.
- Content is descriptive, not mission-critical — never put essential info only in a tooltip.
- `role="tooltip"` + anchor has `aria-describedby` pointing at it.
- Respect `prefers-reduced-motion` — fade only, no slide.

---

### 3.18 Data Table

Tabular list with sort, paginate, select, filter. Composes §3.10 cells, §3.21 sort indicator, §3.19 toolbar, §3.20 pagination.

**3.18.1 Header row**

| Property | Value |
|---|---|
| Height | 40 px |
| Background | `surface-secondary` |
| Font | `columnHeader` (11 px / 600 / UPPERCASE / letter-spacing 0.05em / `text-secondary`) |
| Border-bottom | 1 px `border-default` |
| Cell padding | `space-4` |

**3.18.2 Features**

| Feature | Spec |
|---|---|
| Sortable columns | Click header → cycle asc → desc → unset (§3.21) |
| Selectable rows | Leftmost 40 px column with Checkbox (§3.9); header checkbox = indeterminate when mixed |
| Sticky header | `position: sticky; top: 0` within scroll container |
| Sticky first column | Opt-in (long tables) |
| Resizable columns | Opt-in (operator tables); drag handle on right edge of header cell |
| Empty state | Replace tbody with §3.15 no-results |
| Loading state | Skeleton rows (§3.31) in place of data rows |

**3.18.3 Behaviour + a11y**

- `<table>` semantic markup (`<thead>`, `<tbody>`, `<th scope="col">`).
- Sort controls must be `<button>` inside `<th>` with `aria-sort="ascending|descending|none"`.
- Announce page changes via polite live region.
- Row keyboard navigation — Arrow keys move between cells; Enter activates primary row action.
- Never rely on hover-only reveal for essential actions — move them into a Context Menu (§3.24) that is tab-reachable.

---

### 3.19 Table Toolbar

Bar above a Data Table offering search, filter, bulk actions, export.

**3.19.1 Anatomy**

| Property | Value |
|---|---|
| Height | 56 px |
| Padding | 0 `space-4` |
| Background | `surface-primary` |
| Gap | `space-3` |
| Left cluster | Search Input (§3.30, 320 px) + Filter chips (Badge §3.3 with clear-X) |
| Right cluster | Secondary Button "Filter" (opens filter panel) + primary action |

**3.19.2 Bulk-actions mode**

When ≥ 1 row selected, the toolbar swaps into bulk-actions mode:

| Element | Spec |
|---|---|
| Background | `brand-tint` |
| Left | "N selected" text + "Clear selection" link button |
| Right | Action buttons (primary = most common bulk op; danger actions require confirm) |

**3.19.3 Behaviour + a11y**

- Filter panel: `role="dialog"` with focus trap.
- Filter chips are tab-reachable; Enter or clear-X removes.
- Bulk-action toolbar is announced via live region on transition.

---

### 3.20 Pagination

Page navigation below Data Table.

**3.20.1 Anatomy**

| Property | Value |
|---|---|
| Height | 48 px |
| Padding | 0 `space-4` |
| Background | `surface-primary` |
| Border-top | 1 px `border-default` |
| Font | 12 px / 400 / `text-secondary` |
| Left cluster | "Rows per page" label + Dropdown §3.8 (values 10 / 25 / 50 / 100) |
| Middle cluster | "Showing 1–25 of 312" text |
| Right cluster | Prev icon button, numeric page buttons (max 7 shown, with ellipsis), Next icon button |

**3.20.2 Page button states**

| State | Background | Text |
|---|---|---|
| Default | transparent | `text-secondary` |
| Hover | `surface-tertiary` | `text-primary` |
| Active (current page) | `brand-primary` | `#FFFFFF` |
| Disabled (first=1 on prev; last=N on next) | transparent | `text-disabled` |

**3.20.3 Behaviour + a11y**

- `<nav aria-label="Pagination">`.
- Keyboard: ← / → move pages when pagination owns focus.
- URL-sync `?page=N&perPage=M` so refresh + deep-link preserves state.

---

### 3.21 Column Sort Indicator

Embedded inside `<th>` — three states.

**3.21.1 Anatomy**

| Property | Value |
|---|---|
| Icon | 12 px double-chevron (both faded when unset; upper lit = asc; lower lit = desc) |
| Color (unset) | `text-muted` |
| Color (active) | `text-primary` |
| Gap from label | `space-1` (4 px) |

**3.21.2 Behaviour + a11y**

- Full `<th>` is clickable to sort.
- `aria-sort="ascending|descending|none"`.
- Cycle: none → asc → desc → none.

---

### 3.22 Breadcrumb

Location trail within operator / admin surfaces.

**3.22.1 Anatomy**

| Property | Value |
|---|---|
| Font | 12 px / 400 |
| Separator | `/` or chevron icon 12 px `text-muted` |
| Item color (non-last) | `text-secondary` |
| Item hover | `text-primary` |
| Current (last) | `text-primary` 500, not a link |
| Max levels | 4. Middle segments collapse into an ellipsis menu beyond 4. |

**3.22.2 Behaviour + a11y**

- `<nav aria-label="Breadcrumb">` containing an `<ol>`.
- Current segment has `aria-current="page"` and is NOT a link.

---

### 3.23 Modal / Dialog

Overlaid dialog for confirmation, form, or detail view.

**3.23.1 Anatomy**

| Property | Value |
|---|---|
| Overlay | rgba(15, 23, 42, 0.5); covers viewport |
| Panel background | `surface-primary` |
| Panel radius | `radius.modal` (12 px) |
| Panel shadow | `elevation.dropdown` |
| Width | sm 400 px / md 560 px / lg 720 px / xl 960 px |
| Padding | `space-6` (24 px) |
| Header | title (`pageTitle` 20 px / 600) + close icon button (right) |
| Header border-bottom | 1 px `border-default` (divided layout variant only) |
| Footer | action buttons, right-aligned, gap `space-3` |
| Footer border-top | 1 px `border-default` (divided layout variant only) |

**3.23.2 Variants**

| Variant | Use |
|---|---|
| Confirmation | Danger-critical ops. Primary button = destructive variant. |
| Form | Wraps form inputs; submit disables while busy; escape confirms loss if dirty |
| Detail | Read-only content view with a single "Close" button |
| Drawer | Variant: slides from right, full-height, width 480 px (operator surfaces) |

**3.23.3 Behaviour + a11y**

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing to title.
- Focus trap: first focusable on open; return focus to trigger on close.
- Esc closes (unless `dismissOnEscape=false` for critical confirmations).
- Overlay click closes (unless dirty form — prompt first).
- Do not nest modals. If a second step is needed, replace the content.

---

### 3.24 Context Menu

Right-click / overflow-icon menu offering row or item actions.

**3.24.1 Anatomy**

| Property | Value |
|---|---|
| Panel bg | `surface-primary` |
| Panel border | 1 px `border-default` |
| Radius | `radius.panel` (8 px) |
| Shadow | `elevation.dropdown` |
| Min width | 180 px |
| Item height | 32 px |
| Item padding | 6 px 12 px |
| Item font | 13 px / 400 |
| Item icon | 14 px, leading, `space-2` gap |
| Divider | 1 px `border-default`, margin `space-1` 0 |

**3.24.2 Item states**

| State | Bg | Text |
|---|---|---|
| Default | `surface-primary` | `text-primary` |
| Hover / highlighted | `surface-tertiary` | `text-primary` |
| Danger item | `surface-primary` | `danger-fg` |
| Disabled | `surface-primary` | `text-disabled` |
| Focus-visible | — | focus-ring inside item |

**3.24.3 Behaviour + a11y**

- `role="menu"` / `role="menuitem"`; `aria-haspopup="menu"` on trigger.
- Keyboard: Enter / Space / ↓ opens and focuses first; ↑/↓ move; Enter activates; Esc closes.
- Closes on outside click, item select, Escape.
- Keyboard shortcuts shown right-aligned in `text-muted`.

---

### 3.25 Alert Banner

Page- or section-level message.

**3.25.1 Anatomy**

| Property | Value |
|---|---|
| Min height | 48 px |
| Padding | `space-3` `space-4` |
| Left icon | 20 px |
| Font (title) | 14 px / 500 |
| Font (description) | 13 px / 400 / `text-secondary` |
| Dismiss icon (right) | 16 px `text-muted` |
| Radius | `radius.panel` (8 px) |
| Border (left accent) | 4 px, semantic fg |

**3.25.2 Variants**

| Tone | Background | Border-left | Icon color |
|---|---|---|---|
| Info | `info-bg` | `info-fg` | `info-fg` |
| Success | `success-bg` | `success-fg` | `success-fg` |
| Warning | `warning-bg` | `warning-fg` | `warning-fg` |
| Danger | `danger-bg` | `danger-fg` | `danger-fg` |

**3.25.3 Behaviour + a11y**

- `role="alert"` for danger; `role="status"` for info/success/warning.
- Dismiss persists per user via localStorage key (when banner is global + dismissible).
- Never use an Alert for form-field errors — use inline error text on Input (§3.1).

---

### 3.26 Date / Date-Range Picker

Single date or date-range selection. Locale-aware.

**3.26.1 Trigger anatomy**

Inherits Input §3.1; right icon calendar 16 px `text-muted`.

**3.26.2 Calendar panel**

| Property | Value |
|---|---|
| Background | `surface-primary` |
| Border | 1 px `border-default` |
| Radius | `radius.panel` |
| Shadow | `elevation.dropdown` |
| Width | 280 px (single month) / 560 px (dual month for range) |
| Month header | 14 px / 600 center; prev/next chevrons on sides |
| Weekday row | 11 px / 600 / `text-muted`, UPPERCASE |
| Day cell | 36×36 px |

**3.26.3 Day states**

| State | Bg | Text |
|---|---|---|
| Default | transparent | `text-primary` |
| Today | 1 px ring `brand-primary` | `brand-primary` |
| Hover | `surface-tertiary` | `text-primary` |
| Selected | `brand-primary` | `#FFFFFF` |
| In range (middle) | `brand-tint` | `text-primary` |
| Range endpoint | `brand-primary` | `#FFFFFF` |
| Outside month | transparent | `text-disabled` |
| Disabled (min/max bound) | transparent | `text-disabled` + `line-through` |

**3.26.4 Behaviour + a11y**

- Locale: `en-IN` default, `hi-IN` when user preference set.
- Keyboard: ← / → / ↑ / ↓ move day; PgUp / PgDn month; Shift+PgUp / PgDn year; Enter selects; Esc closes.
- `aria-label` on each day ("12 March 2026, Thursday").
- Presets (Today, Last 7 days, This month, Last 30 days, Custom) when `presets` prop supplied — shown as a left column.

---

### 3.27 Toggle Switch

On/off switch. Primary UI for `web-admin` feature-flag panel (ADR-0001).

**3.27.1 Anatomy**

| Property | Value |
|---|---|
| Track size | 32 × 18 px |
| Knob | 14 px circle |
| Radius | `radius.pill` |
| Track (off) | `border-strong` |
| Track (on) | `brand-primary` |
| Knob color | `surface-primary` |
| Transition | 150 ms |
| Label gap | `space-2` |

**3.27.2 States**

| State | Track | Knob | Other |
|---|---|---|---|
| Off | `border-strong` | at left 2 px | — |
| On | `brand-primary` | at right 2 px | — |
| Focus-visible | as above | — | `focus-ring` on track |
| Disabled | `border-default` | `surface-tertiary` | cursor `not-allowed` |
| Loading (toggle in flight) | as above | spinner replaces knob | `aria-busy="true"` |

**3.27.3 Behaviour + a11y**

- `role="switch"` + `aria-checked`.
- Danger-critical toggles (e.g. `checkout_enabled`) show confirmation modal (§3.23) before committing.
- Flag-UI in `web-admin` pairs the toggle with an audit link per change.

---

### 3.28 Multi-Select Tag Input

Input that accepts multiple tokens (e.g. topic tags). Create-on-enter supported when `creatable` prop set.

**3.28.1 Anatomy**

| Property | Value |
|---|---|
| Container | Input §3.1 geometry + auto-grow height |
| Tag | Badge §3.3 neutral tone, 20 px height, trailing 12 px `×` icon button |
| Tag gap | `space-1` |
| Inner text input | flex-grow, borderless |
| Option panel | as Dropdown §3.8 panel |

**3.28.2 Behaviour + a11y**

- Keyboard: Backspace on empty input deletes last tag; Enter creates / selects highlighted; ↑/↓ navigate options; Esc closes panel.
- `aria-multiselectable="true"` on the underlying listbox.
- Paste of comma- or newline-separated list splits into multiple tags.
- Max tag count (optional) surfaces as a hint; excess Paste is truncated with a toast.

---

### 3.29 Radio Group

Single-select from 2–N options. Used for quiz answer selection in `web-student` + mobile.

**3.29.1 Anatomy**

| Property | Value |
|---|---|
| Radio circle size | 18 px |
| Border (default) | 2 px `border-strong` |
| Inner dot (checked) | 8 px circle `brand-primary` |
| Gap to label | `space-2` |
| Label | 14 px / 400 / `text-primary` |
| Group gap (vertical) | `space-3` |

**3.29.2 States**

| State | Border | Inner | Label |
|---|---|---|---|
| Unchecked | `border-strong` | none | `text-primary` |
| Hover | `brand-primary` | none | `text-primary` |
| Checked | `brand-primary` | `brand-primary` dot | `text-primary` 500 |
| Focus-visible | — | — | `focus-ring` on circle |
| Disabled | `border-default` | — | `text-disabled` |
| Error (group) | `danger-fg` | — | label unchanged; group error text below |

**3.29.3 Behaviour + a11y**

- `role="radiogroup"` + `aria-labelledby`; each radio `role="radio"` + `aria-checked`.
- Keyboard: Tab reaches checked (or first if none); ↑/↓ or ←/→ move between options (wraps); Space / Enter confirms.
- **Single tab stop** — never multiple tab stops in one radio group.
- On quiz screens, labels extend the hit area — the entire option card (§3.36) is the target.

---

### 3.30 Search Input (standalone)

Dedicated search field (distinct from Input §3.1 search variant).

**3.30.1 Anatomy**

| Property | Value |
|---|---|
| Height | 40 px |
| Padding | 0 `space-3` |
| Background | `surface-secondary` |
| Border | 1 px transparent (default) → 1 px `border-default` on hover → 1 px `brand-primary` on focus |
| Leading icon | search, 16 px `text-muted` |
| Trailing icon | clear `×` (when value present) 16 px `text-muted` |
| Font | 14 px / 400 |
| Radius | `radius.input` |
| Loading state | spinner 14 px replaces trailing icon |

**3.30.2 Behaviour + a11y**

- `role="searchbox"`.
- Debounce default 300 ms before firing search. Cancel in-flight on new keystroke.
- Keyboard: `/` shortcut focuses (when not in an input) on `web-student` + `web-portal`.
- Typeahead panel mounts below following Dropdown §3.8 panel spec.

---

### 3.31 Loading States — Skeleton + Spinner

Two forms: **skeleton** for content shapes, **spinner** for short ops.

**3.31.1 Skeleton**

| Property | Value |
|---|---|
| Background | `surface-tertiary` |
| Shimmer gradient | linear-gradient, moves 1.4 s loop |
| Radius | matches target shape (`radius.input` for input rows, `radius.card` for cards) |
| Rules of use | Preferred for loads > 300 ms. Render the skeleton in the actual content slot — do not swap to a centered spinner. |

**3.31.2 Spinner**

| Size | Diameter | Stroke |
|---|---|---|
| sm | 14 px | 2 px |
| md | 20 px | 2.5 px |
| lg | 32 px | 3 px |

| Property | Value |
|---|---|
| Color (default) | `text-muted` |
| Color (on-primary button) | `surface-primary` |
| Color (brand contexts) | `brand-primary` |
| Rotation | 800 ms linear infinite |

**3.31.3 Behaviour + a11y**

- `aria-busy="true"` on the container; include visible or `sr-only` "Loading" text.
- Respect `prefers-reduced-motion` — skeleton shimmer becomes a static fill; spinner becomes a stepped rotation (8 frames).

---

### 3.32 Avatar

Circular user marker. Falls back from image → initials.

**3.32.1 Anatomy**

| Size | Diameter | Font (initials) |
|---|---|---|
| xs | 20 px | 10 px / 600 |
| sm | 28 px | 11 px / 600 |
| md | 36 px | 13 px / 600 |
| lg | 48 px | 16 px / 600 |
| xl | 64 px | 20 px / 600 |

| Property | Value |
|---|---|
| Radius | `radius.avatar` (50%) |
| Background (initials fallback) | derived from user-id hash across 8 palette colours |
| Initials | first + last name's first letter (2 chars max); UPPERCASE |
| Border | optional 2 px `surface-primary` (for overlapping groups) |
| Presence indicator | optional 8 px dot at bottom-right; `success-fg` online / `text-muted` offline |

**3.32.2 Behaviour + a11y**

- `<img alt>` required when image present.
- Initials version is `aria-hidden` with a sibling visually-hidden name.
- Group avatars (clustered): max 4 visible + "+N" final tile using the same initials geometry.

---

### 3.33 Inline Edit

Click-to-edit text field. Used for content author field edits.

**3.33.1 States + anatomy**

| State | Spec |
|---|---|
| Read (default) | Value as `body` 14 px / 400 / `text-primary`; trailing 14 px pencil icon appears on hover |
| Hover | Value background → `surface-tertiary`; pencil visible |
| Editing | Swaps to Input §3.1 inline; width auto-fills container; Enter saves, Esc cancels, blur saves |
| Saving | Value + spinner; `aria-busy="true"`; input disabled |
| Error | After save fail: inline error text below (12 px / `danger-fg`) + Retry button |

**3.33.2 Behaviour + a11y**

- Click or Enter / Space enters edit mode.
- Validation runs on blur; failure keeps the edit mode open.
- Escape always reverts to previous value without saving.
- Announce save success via polite live region.

---

### 3.34 Accordion

Single- or multi-expand collapsible sections.

**3.34.1 Anatomy**

| Property | Value |
|---|---|
| Header height | 48 px |
| Header padding | 0 `space-4` |
| Header font | 14 px / 500 / `text-primary` |
| Chevron | 16 px `text-muted`; rotates 180° on expand |
| Border between items | 1 px `border-default` |
| Body padding | `space-4` |
| Body background | `surface-primary` |
| Expand animation | height 220 ms `easing.standard` |

**3.34.2 States**

| State | Header bg | Chevron |
|---|---|---|
| Collapsed | `surface-primary` | down |
| Hover | `surface-tertiary` | — |
| Expanded | `surface-primary` | up |
| Focus-visible | — | `focus-ring` on header |
| Disabled | `surface-secondary` | `text-disabled` |

**3.34.3 Behaviour + a11y**

- Header = `<button aria-expanded>`; body has `id` that header references via `aria-controls`.
- Keyboard: Enter / Space toggles; Tab moves between headers.
- Modes: `single` (only one open — others collapse) or `multiple` (independent).
- Respect `prefers-reduced-motion` — drop the height animation.

---

### 3.35 Question Card (MCQ renderer)

Student quiz screen primary surface. Renders one question with its answer options.

**3.35.1 Anatomy**

| Property | Value |
|---|---|
| Container | Data Card §3.14 with padding `space-6` |
| Question number badge | "Q 3 of 10" 12 px / 500 / `text-muted`, top-left |
| Subject tag | Badge §3.3 tone info, top-right |
| Question text | `sectionHeading` (16 px / 600 / `text-primary`), line-height 1.5 |
| Question image slot | optional, max-height 320 px, radius `radius.card`, border 1 px `border-default` |
| Options area | Radio Group §3.29 with extended Option Button §3.36 |
| Footer | "Skip" ghost button + "Submit" primary button, right-aligned |
| Timer (optional) | top-right, monospace; turns `warning-fg` at < 30 s, `danger-fg` at < 10 s with pulse |

**3.35.2 Behaviour + a11y**

- `<section aria-labelledby="q-title">`; question text carries the `id`.
- Keyboard: 1–9 number keys select option 1–9 (when present and enabled).
- On submit: disable all options and the submit button; show Feedback state (§3.36 correct / incorrect variants).
- Hindi locale: `lang="hi"` on question container; `lang="en"` on any inline English term per §5.

---

### 3.36 Answer Option Button

Single answer choice inside a Question Card. Inherits Radio but renders as a card.

**3.36.1 Anatomy**

| Property | Value |
|---|---|
| Min-height | 52 px |
| Padding | `space-3` `space-4` |
| Border | 1 px `border-default` |
| Radius | `radius.card` (8 px) |
| Option letter (A/B/C/D) | 24 px circle, 1 px `border-strong`, font 12 px / 600 / `text-secondary`, centered |
| Letter-to-text gap | `space-3` |
| Text | `body` (14 px / 400), `text-primary` |
| Trailing indicator area | 24 px wide (correct tick / wrong cross on Feedback) |

**3.36.2 States**

| State | Border | Background | Letter circle | Text |
|---|---|---|---|---|
| Default | 1 px `border-default` | `surface-primary` | `border-strong` | `text-primary` |
| Hover | 1 px `brand-primary` | `brand-tint` | `brand-primary` | `text-primary` |
| Selected (pre-submit) | 2 px `brand-primary` | `brand-tint` | `brand-primary` fill + `#FFFFFF` letter | `text-primary` 500 |
| Focus-visible | — | — | — | `focus-ring` on container |
| Correct (post-submit) | 2 px `success-fg` | `success-bg` | `success-fg` fill | `text-primary` 500 + trailing check |
| Incorrect (post-submit, was selected) | 2 px `danger-fg` | `danger-bg` | `danger-fg` fill | `text-primary` + trailing cross |
| Correct-not-selected (post-submit) | 2 px dashed `success-fg` | `surface-primary` | `success-fg` outline | `text-primary` + trailing check |
| Disabled | 1 px `border-default` | `surface-secondary` | `border-default` | `text-disabled` |

**3.36.3 Behaviour + a11y**

- Composed into Radio Group (§3.29) — single tab stop, arrow-key traversal.
- Tap target ≥ 52 px (mobile).
- Feedback animations respect `prefers-reduced-motion`.

---

### 3.37 Readiness Score Ring

Student's current readiness. Composed from Circular Progress §3.11 with custom layers.

**3.37.1 Anatomy**

| Layer | Spec |
|---|---|
| Outer track | Circular Progress §3.11 lg (96 px) — 12 px stroke |
| Arc | Gradient (`brand-primary` 0% → `success-fg` 100%) in one sweep; segment length = score% |
| Center value | `pageTitle` 20 px / 700 / `text-primary` (e.g. "78") |
| Center "%" | 11 px / 500 / `text-muted`, baseline-aligned to value |
| Caption below | 11 px / `text-muted` ("Updated 2 min ago") |
| Delta pill | Optional Badge §3.3 above value — tone success (+N) or danger (-N) |

**3.37.2 Behaviour + a11y**

- `role="meter"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.
- Animate arc sweep on mount (600 ms); never on every small update.
- Long-press / click reveals breakdown modal §3.23 with per-subject mastery bars §3.12.

---

### 3.38 Streak Counter

Flame-icon counter showing consecutive-day practice streak.

**3.38.1 Anatomy**

| Property | Value |
|---|---|
| Container | Inline pill, 28 px height, radius `radius.pill`, padding 0 10 px |
| Icon | 16 px flame |
| Value | 14 px / 600 |
| Background | `surface-tertiary` (default) |
| Active (streak > 0 today) | Background `warning-bg`, icon + value `warning-fg` |
| At-risk (streak at risk — > 20h since last activity) | Background `warning-bg` with subtle pulse; tooltip explains |
| Paused (freeze used) | Background `info-bg`, icon `info-fg`, value with small snowflake overlay |

**3.38.2 Behaviour + a11y**

- `aria-label="N-day streak"` (include locale-formatted number).
- No motion beyond the at-risk pulse (0.5 opacity oscillation, 2 s loop) — respects `prefers-reduced-motion`.

---

### 3.39 Leaderboard Row

One row in the leaderboard list.

**3.39.1 Anatomy**

| Property | Value |
|---|---|
| Row height | 56 px |
| Row padding | `space-3` `space-4` |
| Rank cell | 32 px wide, 14 px / 600 / `text-primary`, tabular-nums |
| Rank medal (ranks 1–3) | Colored circle (gold #F59E0B / silver #94A3B8 / bronze #B45309) around rank number |
| Avatar | §3.32 size sm |
| Name | 14 px / 500 / `text-primary`, flex-grow, truncate |
| Score | 14 px / 600 / `text-primary`, tabular-nums, right-aligned |
| Current-user row | Background `brand-tint`; left accent border 3 px `brand-primary` |
| Divider | 1 px `border-default` between rows |

**3.39.2 Behaviour + a11y**

- `<ol>` semantic for the list; each row `<li>`.
- If row is a link to the user's profile (only public profiles), wrap the clickable area in an `<a>`; Current-user row is never a link.
- Keyboard: Tab reaches each linked row.

---

## 4. Package Layout

```
packages/
├── design-system/          # @alp/design-system — tokens + primitives (§3.1–3.34)
│   ├── src/tokens/         # TS exports of §2 tokens
│   ├── src/primitives/     # Input, Button, Badge, etc.
│   ├── src/composites/     # DataTable, Modal, etc.
│   └── stories/            # Storybook
├── design-tokens-flutter/  # Dart mirror of §2 tokens for apps/mobile
├── icons/                  # @alp/icons — SVG icon set (Lucide-based)
├── api-client/             # @alp/api-client — generated from openapi/phase1.yaml
└── auth-client/            # @alp/auth-client — JWT/refresh/SSO flow (shared across 3 web apps)
```

**Rules**
- Web apps import from `@alp/design-system`; never reach into `packages/design-system/src/*`.
- Flutter app imports from `packages/design-tokens-flutter` via path dependency.
- Token changes require a minor-version bump; visual-breaking changes require a major bump + ADR.
- Storybook is the canonical docs surface — every primitive has at least one story covering default / hover / focus / disabled / error states.

---

## 5. A11y Baseline (all controls)

- Keyboard-operable: tab reaches, shift-tab leaves, space/enter activates (buttons), arrows within composite controls (tabs, radio, menu).
- Focus visible: every interactive control shows the `focus-ring` elevation on `:focus-visible`.
- SR support: ARIA roles + names correct. Errors surface via `aria-invalid` + `aria-describedby`.
- Colour contrast: body text ≥ 4.5:1, large text ≥ 3:1 (WCAG AA).
- `prefers-reduced-motion` respected per §2.6.
- Language attributes: pages set `lang="en"` or `lang="hi"` based on user preference; bilingual strings use `<span lang="...">`.

---

## 6. i18n

- Library: `react-i18next` (web) + `flutter_localizations` (mobile).
- Initial locales: `en-IN` (default), `hi-IN` (Sprint 2 on for search + quiz).
- Number + date formatting: `Intl.NumberFormat('en-IN')` / `Intl.DateTimeFormat`.
- Currency: INR by default; symbol from `@alp/design-system` constant.

---

## 7. Sprint fit

- **Sprint 0**: this spec approved; `@alp/design-system` v0.1 published with §2 tokens + §3.1–3.3 primitives (Input, Button, Badge); Flutter token mirror stubbed; Storybook deployed on Vercel/S3.
- **Sprint 1**: primitives needed for auth + onboarding screens land (Nav, Modal, Tabs, Stepper, Form controls). Data Table deferred to Sprint 2.
- **Sprint 2**: Data Table + Table Toolbar + Pagination for content authoring in `web-portal`.
- **Sprint 3**: remaining operator/admin controls (Context Menu, Inline Edit, Log Row, Audit rows). Flag UI on `web-admin` consumes Toggle Switch + Data Table + Audit Log Row.
- **Sprint 4**: polish — token audit, Lighthouse pass, accessibility audit with external vendor.

---

## 8. Sign-off

| Role | Name | Date |
|---|---|---|
| Designer | _______________________ | _________ |
| FE Lead A | _______________________ | _________ |
| FE Lead B | _______________________ | _________ |
| Tech Lead | _______________________ | _________ |
| Head of Product | _______________________ | _________ |
