# Vidya · Component anatomy

The token system is canonical. Components are recipes built only from tokens.

This doc covers the 14 core components used across all 108 screens.

---

## 1. Button

```
Family: Btn
Variants: primary · secondary (default) · ghost
Sizes: sm (28px) · md (36px) · lg (44px) · xl (56px hero)
```

### Anatomy
- Height = `--touch-target` (or smaller for `sm`)
- Padding-x = `var(--sp-3)` (sm) / `var(--sp-4)` (md/lg)
- Radius = `var(--r-md)`
- Font = `var(--t-label-size)` · weight 500
- Gap (icon→label) = `var(--sp-2)`

### Tokens used

| Variant | Bg | Color | Border | Hover |
|---|---|---|---|---|
| primary | `--accent` | `white` | `--accent-2` | bg→`--accent-2` |
| secondary | `--card` | `--ink` | `--rule-2` | bg→`--paper-2` |
| ghost | transparent | `--ink-2` | transparent | bg→`--paper-2` |

**Never**: drop-shadow on buttons, gradient fills, color other than accent/ink/bad.

---

## 2. Card

```
Family: card
Variants: default · tinted · elevated · hero (dark)
```

### Anatomy
- Bg = `--card`
- Border = `1px solid var(--rule)`
- Radius = `var(--r-lg)` (14px)
- Padding = `var(--d-card-p)` (density-scaled)

### Variants
- `card-tinted` — bg `--paper-2`, border transparent
- `card-elevated` — adds `--shadow-md`
- Hero (dark) — bg `--ink`, color `--paper`. Used for signature cards (Readiness, Earnings, AI commentary)

---

## 3. Pill / Badge

```
Family: pill
Tones: default · good · warn · bad · accent · ai
```

### Anatomy
- Height = 22px (fixed across densities)
- Padding-x = 8px
- Radius = `var(--r-pill)`
- Font = 11px · weight 500 · tracking 0.01em
- Border = 1px

### Tokens

| Tone | Bg | Color | Border |
|---|---|---|---|
| default | `--paper-2` | `--ink-2` | `--rule` |
| good | `--good-soft` | `--good` | transparent |
| warn | `--warn-soft` | `--warn` (or `--gold-2`) | transparent |
| bad | `--bad-soft` | `--bad` | transparent |
| accent | `--accent-soft` | `--accent` | transparent |
| ai | `--gold-soft` | `--gold-2` | transparent |

---

## 4. Form field

```
Family: form-field
States: rest · focus · error · disabled
```

### Anatomy
- Padding = 12px 14px
- Border = `1.5px solid var(--rule)`
- Border (focus) = `1.5px solid var(--accent)` + bg `var(--accent-soft)`
- Border (error) = `1.5px solid var(--bad)`
- Radius = `var(--r-md)` (10px)
- Label = overline above input · 10px mono uppercase
- Inline trailing text = `--ink-3` mono 11px

---

## 5. Stat / KPI tile

```
Family: Stat
Sizes: sm · md · lg
```

### Anatomy
- Wrapper = `card`
- Label = overline (10px mono uppercase, `--ink-3`)
- Icon = right of label, 14px, `--ink-3`
- Number = `--font-display`, weight 400, size 24/32/44 (sm/md/lg)
- Unit = mono 12px, `--ink-3`, baseline-aligned
- Delta = 11px row: arrow + value + comparison label

**Color rule**: number uses `--ink` by default. Use `--accent` / `--gold-2` / `--good` / `--bad` only when the metric meaning warrants it.

---

## 6. Mastery bar / stack

### MasteryBar (single)
- Height = 8px (5px on mobile)
- Radius = 999px (pill)
- Bg = `--rule`
- Fill color picked by bucket:
  - `>= 0.9` → `--m-mastered`
  - `>= 0.7` → `--m-strong`
  - `>= 0.4` → `--m-dev`
  - `> 0` → `--m-weak`
  - `0` → `--m-none`

### MasteryStack (segmented bar)
- 5 segments left-to-right: mastered · strong · dev · weak · none
- Height = 10px · border 1px `--rule`

---

## 7. Readiness ring

```
Component: ReadinessRing
Sizes: 120 · 180 (default) · 220
```

### Anatomy
- SVG circle, stroke-width 6px
- Bg ring = `--rule`
- Fill ring = `--accent` (or `--gold` on dark hero cards)
- Tick marks at every 5% (longer at 25/50/75/100)
- Center: overline label · `--font-display` number 0.34× size · mono `/ max + delta`

---

## 8. Avatar

```
Component: Avatar
Sizes: 24 · 28 · 32 · 36 · 48 · 56 · 80 · 120
```

### Anatomy
- Circle, `--rule` border 1px
- Initials in `--font-ui`, weight 500
- Hue derived from `name.charCodeAt(0)` → `oklch(85% 0.05 <hue>)`

**Never** color avatar bg from brand tokens.

---

## 9. Sidebar (web)

```
Component: Sidebar
Width: 232px (fixed)
```

### Anatomy
- Bg = `--paper`, right border `--rule`
- Wordmark top · padding `20px 14px`
- Group label = overline, `padding 0 10px 6px`
- Item = 34px tall · 10px radius · gap 10px · icon 15px
- Active state: bg `--accent-soft`, color `--accent`, weight 500
- Footer = user card with avatar 32 + plan label

---

## 10. Topbar (web)

```
Component: Topbar
Height: 68px
```

### Anatomy
- Crumbs (10px mono overline above title)
- Title in `--font-display` 22px
- Subtitle 12px `--ink-3`
- Search field (right of title) — 36px, `--paper-2` bg, `⌘K` kbd
- Chips (right of search)
- Actions (far right)

---

## 11. Table

```
Component: table
Family: data-grid
```

### Anatomy
- Row height = `--d-row-h`
- Header row: 10px mono uppercase, `--ink-3`, weight 500, tracking 0.06em
- Border between rows = `1px solid var(--rule)`
- Hover bg = `--paper-2`
- Selected row bg = `--accent-soft`
- Tabular numerals: `font-variant-numeric: tabular-nums`

---

## 12. AI tag

```
Component: AiTag
```

```html
<span class="ai-tag">AI insight</span>
```

### Anatomy
- 10.5px mono · uppercase · tracking 0.1em
- Color `--gold-2`
- Before pseudo: 6px circle, `--gold` bg

The **only** place gold is used as a primary color. Anywhere AI is involved (readiness, next-best-action, drafts, calibration), the ◈ or gold dot appears.

---

## 13. Sparkline

```
Component: Sparkline
Dimensions: variable (width × height)
```

### Anatomy
- SVG path 1.6px stroke
- End dot at last point (2.5r)
- Fill area at 10% opacity (toggleable)
- Stroke color = subject color OR `--accent` OR `--gold`

---

## 14. Mobile tab bar

```
Component: MobileTabBar
Height: iOS 76px (incl. home indicator) · Android 54px
```

### Anatomy
- Bg = `--paper`, top border `--rule`
- 5 items max
- Icon 18px + label 10px
- Active color = `--accent`, weight 500
- Touch target ≥ `--touch-target` (44/52px)

---

## Anti-patterns (don't do this)

| Don't | Do |
|---|---|
| `box-shadow: 0 8px 32px rgba(0,0,0,0.15)` | Use `--shadow-md` |
| `background: linear-gradient(...)` | Use `--paper` / `--card` / `--ink` |
| `color: #1F6B4A` | `color: var(--accent)` |
| `padding: 17px` | Use `--sp-4` (16) or `--sp-5` (20) |
| `border-radius: 12px` | `--r-md` (10) or `--r-lg` (14) |
| `font-size: 15px` for body | Use `--t-body-size` (14) or `--t-body-lg-size` (16) |
| Gold on buttons | Gold is for AI signal only |
| Cyan/violet anywhere | Removed with Aurora |
| Drop shadow on dark surfaces | Inset ring instead |
