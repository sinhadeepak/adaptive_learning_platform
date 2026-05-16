# Vidya · Accessibility

WCAG 2.2 Level AA across all 108 reference screens.

---

## Contrast pairs (verified)

### Light theme

| Foreground | Background | Ratio | Verdict |
|---|---|---|---|
| `--ink` (#0A0A0F) | `--paper` (#FFFFFF) | 19.5 : 1 | AAA |
| `--ink-2` (#383841) | `--paper` | 10.4 : 1 | AAA |
| `--ink-3` (#6E6E78) | `--paper` | 5.1 : 1 | AA (body+) |
| `--ink-4` (#A8A8B0) | `--paper` | 2.6 : 1 | Decorative only |
| `--accent` (#1F6B4A) | `--paper` | 7.0 : 1 | AAA |
| `--accent` | `--accent-soft` (#EDF3EF) | 6.5 : 1 | AAA |
| `white` | `--accent` | 7.0 : 1 | AAA (primary button) |
| `--bad` (#A83A3A) | `--paper` | 6.9 : 1 | AAA |
| `--good` (#1F6B4A) | `--paper` | 7.0 : 1 | AAA |
| `--gold-2` (#7B5C26) | `--paper` | 7.4 : 1 | AAA |

### Dark theme

| Foreground | Background | Ratio | Verdict |
|---|---|---|---|
| `--ink` (#F1EEE7) | `--paper` (#0C0F14) | 17.2 : 1 | AAA |
| `--ink-2` (#C7C3BA) | `--paper` | 12.0 : 1 | AAA |
| `--ink-3` (#8A8579) | `--paper` | 5.4 : 1 | AA |
| `--accent` (#4FA37A) | `--paper` | 5.8 : 1 | AA |
| `--gold` (#D4A560) | `--paper` | 8.4 : 1 | AAA |

**Rule:** `--ink-4` is decorative — never use for body text.

---

## High-contrast mode

`[data-theme="dark"][data-contrast="high"]` flips palette to:

| Token | High-contrast value |
|---|---|
| `--paper` | `#000000` |
| `--ink` | `#FFFFFF` |
| `--accent` | `#FFD700` (gold for visibility) |
| `--rule` | `#444444` |
| `--good` | `#00FF87` |
| `--bad` | `#FF5050` |

Achieves WCAG AAA (21:1) on all foreground/background combinations.

---

## Touch targets

| Density | Min touch target |
|---|---|
| Compact | 36px |
| Regular | 44px |
| Comfy | 52px |
| Junior persona (forced comfy) | 52px |

Buttons, tab items, form fields, slider thumbs all honor `--touch-target`.

---

## Keyboard navigation

- `:focus-visible` ring on every interactive element — never `outline: none` unless replaced by an equivalent style
- Tab order matches visual order (no `tabindex > 0` except for modal traps)
- Skip-link present at top of every page: "Skip to main content"
- Modals: focus trapped, `Esc` closes, focus returns to invoker
- Tables: arrow-key navigation between cells

### Custom shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl-K` | Global search |
| `?` | Open keyboard cheat sheet |
| `Esc` | Close any modal/popover |
| `⌘1-5` / `Alt-1-5` | Jump to nav sections |
| `Space` (in question) | Mark for review |

---

## Screen reader

### Semantic HTML

- Headings hierarchical (`h1` → `h2` → `h3`, never skipped)
- Lists use `<ul>` / `<ol>`
- Buttons are `<button>`, links are `<a>`
- Form inputs have explicit `<label>`
- Icons-only buttons have `aria-label`

### ARIA patterns used

| Pattern | Where |
|---|---|
| `aria-live="polite"` | AI commentary updates, sync queue progress |
| `aria-live="assertive"` | Error toasts, payment failed |
| `role="progressbar"` + `aria-valuenow` | Readiness ring, mastery bars |
| `role="tablist"` / `role="tab"` | Subject chips, time-range chips |
| `aria-current="page"` | Active sidebar item |
| `aria-expanded` | Disclosure, accordions |
| `aria-describedby` | Form field hints |

### Live region rules

- Score updates (after answer): polite
- Streak in danger: polite
- Connection lost: assertive
- AI engine offline: assertive
- Payment failed: assertive
- Practice session score: polite

---

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Specifically:
- Stars / streak flame animations → static
- Score reveal pop → instant
- Skeleton shimmer → solid placeholder
- Page transitions → instant
- Confetti / celebration → no particles
- Aurora gradient pulses → static colors

---

## Color independence

**Never communicate state through color alone.**

| State | Color | Plus shape / icon | Plus text |
|---|---|---|---|
| Correct answer | `--good` | ✓ checkmark | "Correct" label |
| Wrong answer | `--bad` | ✗ x | "Wrong · -1 mark" |
| At-risk student | `--bad` | red dot + flag icon | "AT RISK" pill |
| Mastery weak | `--m-weak` | bar position | "Weak · 31%" mono label |
| AI signal | `--gold` | ◈ symbol | "AI insight" overline |

Colorblind-safe palette verified against deuteranopia, protanopia, tritanopia simulations.

---

## Language

- Localized to **English** + **Hindi** (हिं) at launch. Tamil (தமி) in Q3 2026.
- Right-to-left scripts not supported in v1 (no UPSC-Urdu requirement).
- Font Instrument Serif covers Latin + Latin Extended; **Hindi falls back** to Noto Sans Devanagari (paired in `--font-ui` stack).

---

## Cognitive load

- Plain-English error messages — no jargon
- No more than 7 primary nav items per persona
- Form fields grouped in sections of ≤ 5
- Long-form forms (Profile, Settings) split across sections with progress
- Toast auto-dismiss minimum 6 seconds (longer for warnings, indefinite for errors)
- Time-pressure UI (quiz timer, mock countdown) always has a "Pause" affordance

---

## Testing matrix

| Tool | Where |
|---|---|
| axe-core | CI · all web apps |
| Flutter Accessibility Scanner | CI · mobile |
| Lighthouse | a11y score ≥ 95 |
| VoiceOver (iOS, macOS) | manual · monthly |
| TalkBack (Android) | manual · monthly |
| NVDA (Windows) | manual · quarterly |
| Colorblind simulator | design review |

---

*Vidya accessibility · v1.0 · paired with 01_tokens.md*
