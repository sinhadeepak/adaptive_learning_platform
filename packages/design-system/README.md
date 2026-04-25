# @alp/design-system

Shared design tokens + primitive components for the three ALP web apps (`web-student`, `web-portal`, `web-admin`).

Spec: [docs/01_design/07_CommonControls_Specification_AdaptiveLearningPlatform.md](../../docs/01_design/07_CommonControls_Specification_AdaptiveLearningPlatform.md).

## Sprint 0 scope (v0.1)

- Tokens: colors, typography, spacing, shape, elevation (§2 of spec).
- Primitives: `<Button>`, `<Input>`, `<Badge>` (§3.1–3.3).
- Everything else in §3 is TODO across Sprints 1–3 per the spec's §7 delivery plan.

## Usage

```tsx
import { Button, Badge, tokens } from "@alp/design-system";

<Button variant="primary" size="md">Save</Button>
<Badge tone="success">Active</Badge>
```

Token values (hex / font-family / etc.) are **placeholders** — Designer locks them in Sprint 0 Day 5 per the spec. To swap brand values without touching TSX, edit `src/tokens/*.ts` and rebuild.
