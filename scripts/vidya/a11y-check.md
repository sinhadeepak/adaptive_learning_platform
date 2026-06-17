# Vidya · accessibility QA playbook

Vidya targets WCAG 2.2 Level AA across all 108 reference screens. The full token-level contrast verification is in
`docs/02-design/design-system/06_accessibility.md`. This file is the runtime check list — what to actually do before
flipping the visual regression gate green.

## Automated checks (run in CI)

### axe-core via Playwright

Install once:

```bash
pnpm add -D -w @axe-core/playwright @playwright/test
```

Then create `tests/a11y.spec.ts` per web app, hitting the 10 highest-traffic routes per app. Vidya target: **0 serious / 0 critical violations** per route.

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = ["/", "/quiz", "/insights", "/study-plan", "/profile"];

for (const route of ROUTES) {
  test(`a11y: ${route}`, async ({ page }) => {
    await page.goto(`http://localhost:35173${route}`);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}
```

### Lighthouse CI

```bash
pnpm add -D -w @lhci/cli
```

`.lighthouserc.json` at repo root — assert a11y category score ≥ 95.

### Stylelint

Already configured in `.stylelintrc.json`. Install:

```bash
pnpm add -D -w stylelint stylelint-config-standard
```

Run:

```bash
pnpm exec stylelint "apps/**/*.css" "packages/**/*.css"
```

## Manual checks (per release)

| Surface | Tool | Frequency |
|---|---|---|
| iOS Safari | VoiceOver | monthly |
| macOS Safari | VoiceOver | monthly |
| Android Chrome | TalkBack | monthly |
| Windows Firefox | NVDA | quarterly |
| Colorblind sim | Coblis / Sim Daltonism | per design review |

## Tokens to spot-check by hand

| Token pair | Min ratio | Check |
|---|---|---|
| `--ink` on `--paper` | 19.5 : 1 | body text + headings everywhere |
| `--ink-3` on `--paper` | 5.1 : 1 | captions, meta, timestamps |
| `--accent` on `--paper` | 7.0 : 1 | links + active nav |
| white on `--accent` | 7.0 : 1 | primary buttons |
| `--gold-2` on `--paper` | 7.4 : 1 | AI tag, gold readout |
| `--ink` (dark) on `--paper` (dark) | 17.2 : 1 | dark mode body |
| `--ink-4` | (decorative only) | NEVER used for body |

`--ink-4` (#A8A8B0) is intentionally too low-contrast for body text. Use it only for ornament (rule lines, faint placeholder, disabled badge fill). The eslint rule + stylelint can't catch this — code review is the gate.

## Density + persona matrix

Every screen must render correctly across:

- 2 themes (light, dark)
- 3 densities (compact, regular, comfy)
- 5 personas (aspirant, junior, senior, pro, lifelong)

That's 30 visual combinations per screen. Verify with Storybook stories that toggle `data-theme`, `data-density`, `data-persona` on a wrapper. Add to CI as part of the visual regression set.

## Motion

`@media (prefers-reduced-motion: reduce)` is enforced globally in `vidya/tokens.css`. Hand-test:

1. macOS: System Settings → Accessibility → Display → Reduce motion
2. iOS: Settings → Accessibility → Motion → Reduce Motion
3. Windows: Settings → Accessibility → Visual effects → Animation effects off

Then exercise: stars animation, score reveal pop, skeleton shimmer, page transitions, confetti, AI commentary updates. All must collapse to instant / static.

## Color independence

Audit each meaningful state for non-color cues:

| State | Color | Shape/icon | Text |
|---|---|---|---|
| Correct answer | --good | ✓ | "Correct" |
| Wrong answer | --bad | ✗ | "Wrong · −1" |
| At-risk student | --bad | red dot + flag | "AT RISK" pill |
| Mastery weak | --m-weak | bar position | "Weak · 31%" mono |
| AI signal | --gold | ◈ | "AI insight" overline |

Colorblind sim must show the icon + text still convey the state without the color.
