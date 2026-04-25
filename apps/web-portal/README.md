# web-portal

Operator web surface for tenant-scoped roles — Expert / Teacher, Moderator, Institution Admin.

Primary workflows (by User Stories v2 epic):

- **EPIC-08 — Expert & Teacher**: course authoring, question upload, review queues, doubt answering, community participation, student assignment, batch analytics.
- **EPIC-09 — Moderation**: pending-question review, approve/reject/return, flagged-post triage, user warnings, admin escalation.
- **Institution admin slices** from EPIC-10: user search, invite-link management, institution performance views.

Desktop-optimised, table-dense, keyboard-friendly. Not a consumer surface.

**Audience**: Expert / Teacher / Moderator / Institution Admin. **NOT** student, **NOT** platform super admin.
**Target bundle**: less critical than student app (operators are already engaged) — soft target < 500KB initial JS.
**SLO tier**: P1.
**Host port**: 35174 (follows `+30000` convention; see `.env.example`).

React 18 + Vite + TypeScript + Vitest. Package manager: **pnpm 9**. Shared primitives from `@alp/design-system`.

## Run locally

```bash
pnpm install
pnpm dev          # http://localhost:35174
```

## Test / lint

```bash
pnpm test
pnpm lint
pnpm format
```

## See also

- [ADR-0003](../../docs/adr/0003-three-web-app-split.md) — why three web apps, not one.
- [apps/web-student](../web-student/) — student app.
- [apps/web-admin](../web-admin/) — platform super admin.
- [packages/design-system](../../packages/design-system/) — shared tokens + base components.
