# AdaptiveLearn — Student Portal UI Kit
**Version 1.0 · April 2026 · CONFIDENTIAL**

## File Index

| File | Description |
|------|-------------|
| `00_design-system.css` | Global CSS — design tokens, reset, layout helpers, all shared components |
| `00_components.js` | Shared JS — reusable component renderers, utilities, navigation |
| `00_README.md` | This file |
| `01_welcome-register.html` | Welcome / Landing page + Registration form |
| `02_screening-test.html` | Guest AI Screening Test — 3 steps: exam select → quiz → results |
| `03_login-verify-reset.html` | Login · Email Verification · Reset Password · New Password |
| `04_profile-settings.html` | Profile & Settings — all sections |
| `05_master-dashboard.html` | Master Dashboard — cross-exam overview (Screen 1A) |
| `06_exam-dashboard.html` | NEET Exam Dashboard drill-down (Screen 1B) |
| `07_study-map.html` | Study Map — topic browser with mock test section (Screen 2) |
| `08_ai-practice.html` | AI Practice — active quiz session (Screen 3A) |
| `09_practice-results.html` | AI Practice — session results (Screen 3B) |
| `10_analysis.html` | My AI Analysis — score trajectory, topic table (Screen 4) |
| `11_expert-help.html` | Expert Help — doubt thread view (Screen 5) |
| `12_leaderboard.html` | Leaderboard — institute + global rankings (Screen 6) |

## Design System

### Colour Tokens
| Token | Value | Usage |
|-------|-------|-------|
| `--color-ai` | `#22D4EE` | AI features — cyan accent |
| `--color-blue` | `#4F87F6` | Primary interactive |
| `--color-green` | `#10C47A` | Success, STRONG strength |
| `--color-amber` | `#F5A623` | Warning, streak |
| `--color-red` | `#F43F5E` | Error, WEAK strength |
| `--color-purple` | `#A78BFA` | Secondary accent |
| `--bg-base` | `#07090F` | App background |
| `--bg-surface1` | `#0C1422` | Sidebar, panels |
| `--bg-surface2` | `#101A30` | Cards |
| `--bg-surface3` | `#162038` | Inputs, inner elements |

### Strength Labels (from Analytics LLD — EWA mastery model)
| Strength | Mastery % | Colour | CSS class |
|----------|-----------|--------|-----------|
| STRONG | ≥ 70% | Green | `.str-strong` |
| DEVELOPING | 40–69% | Blue | `.str-dev` |
| WEAK | 1–39% | Red | `.str-weak` |
| NOT STARTED | 0% | Muted | `.str-new` |

### Typography
- **UI font:** Outfit (Google Fonts) — all weights 300–900
- **Monospace / data:** Space Mono — numbers, θ values, IRT parameters
- **Base size:** 13px · Line height: 1.5

### Layout
- **Sidebar:** 60px fixed width
- **Topbar:** 44px fixed height
- **App grid:** `grid-template-columns: 60px 1fr`
- **Content scroll:** `overflow-y: auto` with custom 3px scrollbar

### AI Design Language
Every AI-powered feature uses the `--color-ai` (#22D4EE) cyan accent and the `◈` symbol as a consistent AI identifier. This distinguishes AI-generated content from static UI at a glance.

- AI Pill: `.ai-pill` — "◈ AI INTELLIGENCE ENGINE"
- AI Card: `.card-ai` — cyan border + tinted background
- AI Badge: `.tag-ai` — small cyan tag
- AI Recommendation: `.reco-card` — the "right now" action card

### Components (via 00_components.js)
```js
ALP.renderSidebar(activeId)          // Sidebar HTML
ALP.renderTopbar({ title, chips })   // Topbar HTML
ALP.recoCard({ title, meta, impact })// AI recommendation card
ALP.kpiTile({ value, label, delta }) // KPI stat tile
ALP.subjectRow({ name, pct, strength })// Mastery bar row
ALP.insightList([ { color, text } ]) // AI insight bullets
ALP.readinessRing({ score, size })   // SVG readiness ring
ALP.trajectoryChart({ todayScore, predictedScore }) // SVG chart
ALP.topicCell({ name, pct, strength })// Topic matrix cell
ALP.decayWarn({ topics })            // Mastery decay warning
ALP.strength(pct)                    // 'STRONG' | 'DEVELOPING' | 'WEAK' | 'NOT STARTED'
ALP.strengthColor(pct)               // CSS color variable
ALP.fmt.score(v)                     // '68.4'
ALP.fmt.pts(v)                       // '+1.8 pts'
ALP.fmt.theta(v)                     // 'θ 0.71'
```

## How to include in any HTML file
```html
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="00_design-system.css">
</head>
<body>
  <!-- your screen HTML -->
  <script src="00_components.js"></script>
  <script>
    // use ALP.* component functions
  </script>
</body>
```

## Architecture Notes
- All screens are standalone HTML files. No build step required.
- Each screen self-contains its CSS in a `<style>` block that inherits from `00_design-system.css`.
- The `ALP` global object from `00_components.js` provides all shared component renderers.
- Production implementation: components migrate to React/Next.js using the same design tokens.

---
*AdaptiveLearn · Confidential · Internal Design Use Only*
