# Vidya · Token reference

Every token, what it means, and when to use it. **Treat this as the source of truth.**

---

## 1. Color · light theme (default)

### Surfaces (warm white scale)

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FFFFFF` | Page background. Pure white. |
| `--paper-2` | `#F6F6F8` | Sunken surface · form fields · disabled bg · table stripe |
| `--card` | `#FFFFFF` | Raised card on `--paper` |
| `--rule` | `#EEEEF1` | Hairline border · table dividers |
| `--rule-2` | `#DCDCE0` | Stronger border · input outline · focus |

### Ink (text + foreground)

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0A0A0F` | Primary text · numbers · headings |
| `--ink-2` | `#383841` | Body text · secondary headings |
| `--ink-3` | `#6E6E78` | Muted text · meta · timestamps · captions |
| `--ink-4` | `#A8A8B0` | Faint · placeholder · disabled text |

### Brand · semantic

| Token | Hex | Reserved for |
|---|---|---|
| `--accent` | `#1F6B4A` (emerald) | Primary CTA · active nav · selection · links |
| `--accent-2` | `#144C34` | Hover / pressed state of accent |
| `--accent-soft` | `#EDF3EF` | Tinted bg (10% accent) · selected row · pill bg |
| `--gold` | `#A88143` | **AI signal · readiness numeral · celebration** |
| `--gold-2` | `#7B5C26` | Hover state of gold · darker gold text |
| `--gold-soft` | `#F5EFE2` | AI card tinted bg |

### Status

| Token | Hex | Use |
|---|---|---|
| `--good` | `#1F6B4A` | Strong mastery · success · on-track |
| `--good-soft` | `#EDF3EF` | Success pill bg |
| `--warn` | `#A88143` | Developing · pending · warning |
| `--warn-soft` | `#F5EFE2` | Warning pill bg |
| `--bad` | `#A83A3A` | Weak · at-risk · error |
| `--bad-soft` | `#F3E4E4` | Error pill bg |
| `--info` | `#2F5D8C` | Info · neutral pointer |
| `--info-soft` | `#E5EBF3` | Info pill bg |

### Mastery scale (canonical · 5 buckets)

EWA mastery: `0 / 0.01-0.39 / 0.40-0.69 / 0.70-0.89 / 0.90-1.0`

| Token | Hex | Bucket |
|---|---|---|
| `--m-none` | `#E4E4E8` | 0 (not started) |
| `--m-weak` | `#A83A3A` | 0.01 – 0.39 |
| `--m-dev` | `#A88143` | 0.40 – 0.69 |
| `--m-strong` | `#3B8A5E` | 0.70 – 0.89 |
| `--m-mastered` | `#1F6B4A` | 0.90 – 1.0 |

### Subject encoding (8 subjects)

Used on the **3px left border** of subject rows + chart series.

| Token | Hex | Subject |
|---|---|---|
| `--subj-physics` | `#2F5D8C` | Physics |
| `--subj-chemistry` | `#A88143` | Chemistry |
| `--subj-biology` | `#1F6B4A` | Biology |
| `--subj-maths` | `#5B3A8C` | Maths |
| `--subj-english` | `#B43A6B` | English |
| `--subj-history` | `#8C5A2F` | History · Social |
| `--subj-cs` | `#2F5D8C` | Computer Science |
| `--subj-hindi` | `#B43A3A` | Hindi · Sanskrit |

---

## 2. Color · dark theme `[data-theme="dark"]`

Same names. Designed pairs (NOT inverted).

| Token | Hex |
|---|---|
| `--paper` | `#0C0F14` |
| `--paper-2` | `#14181F` |
| `--card` | `#181D26` |
| `--ink` | `#F1EEE7` (warm bone, not pure white — avoids eye-fatigue) |
| `--ink-2` | `#C7C3BA` |
| `--ink-3` | `#8A8579` |
| `--ink-4` | `#5E5A50` |
| `--rule` | `#262B35` |
| `--rule-2` | `#353B47` |
| `--accent` | `#4FA37A` (lifted emerald) |
| `--gold` | `#D4A560` (lifted gold) |
| `--good` | `#4FA37A` |
| `--warn` | `#D4A560` |
| `--bad` | `#E07A7A` |

---

## 3. Persona accent overrides `[data-persona="..."]`

The whole system stays the same — only the headline numeral and one accent shift.

| Persona | `--accent` override | Headline metric (changes UI text) |
|---|---|---|
| `aspirant` (default) | `#1F6B4A` (emerald) | Readiness 0–900 |
| `junior` | `#A88143` → becomes primary (stars are gold) | Stars (1–5 per topic) |
| `senior` | `#2F5D8C` (info blue) | Predicted board % · A1–E2 |
| `pro` | `#0A0A0F` (ink) — black is business | Cert readiness % · pass threshold |
| `lifelong` | `#3B8A5E` (lifted emerald) | Topics explored · depth dots |

---

## 4. Typography

### Families

| Token | Stack |
|---|---|
| `--font-display` | `"Instrument Serif", "Source Serif 4", Georgia, serif` |
| `--font-ui` | `"Geist", "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif` |
| `--font-mono` | `"Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, monospace` |

> **License notes** — Instrument Serif (SIL OFL), Geist (SIL OFL, MIT). Both free for commercial use. Host self · don't fetch from Google Fonts in production.

### Type scale

Always paired: **size · line · weight · tracking · family**.

| Role | Size | Line | Weight | Tracking | Family | When |
|---|---|---|---|---|---|---|
| `display-2xl` | 128 / 96 mobile | 0.92 | 400 | -0.03em | display | Cover · landing hero |
| `display-xl` | 88 / 64 | 0.95 | 400 | -0.025em | display | Section heros |
| `display-l` | 64 / 48 | 1.0 | 400 | -0.02em | display | Page titles |
| `display-m` | 44 / 32 | 1.1 | 400 | -0.02em | display | Card titles · hero numerals |
| `display-s` | 28 / 22 | 1.2 | 400 | -0.015em | display | Subheads |
| `display-xs` | 20 / 18 | 1.25 | 400 | -0.01em | display | Card section titles |
| `body-l` | 16 | 1.6 | 400 | 0 | ui | Long-form paragraphs |
| `body` | 14 | 1.55 | 400 | 0 | ui | Default body |
| `body-s` | 12.5 | 1.5 | 400 | 0 | ui | Compact text |
| `label` | 13 | 1.4 | 500 | 0 | ui | Form labels · buttons |
| `overline` | 10 | 1.4 | 500 | 0.1em | mono | ALL CAPS section headers |
| `mono` | 11–12 | 1.5 | 400 | 0 | mono | Data · IDs · timestamps |
| `num` | varies | 0.9 | 400 | -0.02em | display | Standalone numerals |

### Editorial pattern

Display + italic accent dot is the brand:

```html
<h1>Welcome back<em style="font-style: italic; color: var(--accent)">.</em></h1>
```

The italic comma/dot/word is reserved — never overuse.

---

## 5. Spacing (4pt grid)

```
--sp-1   4px      Tight (icon to label)
--sp-2   8px      Default gap
--sp-3   12px     Card inner padding compact
--sp-4   16px     Default card gap · row padding
--sp-5   20px     Section gap mobile
--sp-6   24px     Card outer padding
--sp-8   32px     Section gap default
--sp-10  40px     Section gap large
--sp-12  48px     Page section
--sp-16  64px     Hero block
--sp-20  80px     Editorial hero
```

**Rule:** never invent values. If `--sp-7` would help, the layout is wrong.

---

## 6. Density `[data-density="compact|regular|comfy"]`

Scales spacing + type without recoloring.

| Variable | compact | regular (default) | comfy |
|---|---|---|---|
| `--d-row-h` | 36px | 44px | 52px |
| `--d-card-p` | 14px | 20px | 24px |
| `--d-gap` | 10px | 16px | 20px |
| `--d-font` | 13px | 14px | 15px |
| `--touch-target` | 36px | 44px | 52px |

**Junior persona** forces `comfy` by default (larger hit targets for kids).

---

## 7. Radius

```
--r-xs    4px     Inline tags
--r-sm    6px     Small chips
--r-md    10px    Buttons · inputs
--r-lg    14px    Cards (default)
--r-xl    20px    Modals
--r-pill  999px   Pills · circular avatars
```

**Rule:** one radius per family. A card uses `--r-lg`. Don't mix `--r-md` and `--r-lg` in the same card stack.

---

## 8. Shadow / elevation

Vidya prefers **hairline borders + warm subtle drop** over chunky elevation.

```
--shadow-xs   0 0 0 1px var(--rule)
              Hairline only. Default for cards.

--shadow-sm   0 1px 2px rgba(10,10,15,0.04), 0 0 0 1px var(--rule)
              Subtle lift. Dropdowns, popovers.

--shadow-md   0 4px 14px -6px rgba(10,10,15,0.10), 0 0 0 1px var(--rule)
              Cards on `--paper-2`. Floating panels.

--shadow-lg   0 18px 40px -16px rgba(10,10,15,0.18), 0 0 0 1px var(--rule)
              Modals, focus overlays.
```

Dark mode replaces drop shadows with **inset rings of `rgba(255,255,255,0.05)`** plus a deeper drop — never light up the surface, ring it.

---

## 9. Motion

```
--m-fast    120ms     Hover · focus · micro-feedback
--m-base    180ms     Most state changes
--m-slow    280ms     Page transitions · accordions
--m-ease    cubic-bezier(0.4, 0, 0.2, 1)         Default
--m-spring  cubic-bezier(0.34, 1.56, 0.64, 1)    Celebrations only
```

`@media (prefers-reduced-motion: reduce)` zeros all > 50ms. Stars, streak flames, score reveals — all opt-out via this query.

---

## 10. Z-index scale

```
--z-base       0
--z-sticky     100
--z-drawer     200
--z-modal      300
--z-toast      400
--z-tooltip    500
```

Never use `z-index` literals. If you need 350, you're modeling the layer wrong.

---

## 11. Breakpoints

```
--bp-xs     0       Mobile portrait
--bp-sm     480px   Mobile landscape · small tablet
--bp-md     768px   Tablet
--bp-lg     1024px  Desktop
--bp-xl     1280px  Large desktop
--bp-2xl    1536px  Wide
```

Mobile-first cascade. Web portals target `--bp-lg+`. Marketing site is fully responsive.

---

## 12. Focus ring

```
--focus-ring-color   var(--accent)
--focus-ring-width   2px
--focus-ring-offset  2px
```

`:focus-visible` only. **Never strip the outline.** Skip-links honored.

---

*End of token reference. Implementation: `02_tokens.css` (web) · `03_tokens.dart` (Flutter).*
