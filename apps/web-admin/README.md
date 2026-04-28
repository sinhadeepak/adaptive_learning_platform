# web-admin

Platform super-admin surface. Cross-tenant, internal operations only.

Primary workflows (from User Stories v2 EPIC-10):

- **Overview + drill-down dashboards** (ADM-REQ-01, 02)
- **User management** — search, suspend/ban, impersonate, merge accounts, grant admin access (ADM-REQ-03..08)
- **Institution management** — CRUD, performance views (ADM-REQ-09, 10)
- **Revenue + subscription + institution billing + refunds** (ADM-REQ-11..14)
- **Platform config** — exam/syllabus, screening test, plans + pricing, moderation team, audit log, announcements (ADM-REQ-15..20)
- **Feature flag management** per [ADR-0001](../../docs/adr/0001-feature-flag-platform.md) — the Super Admin panel UI lands in Sprint 3 here.

Desktop-only. Behind MFA. Restrictive IP allow-list considered for launch (Security review Sprint 4).

**Audience**: Platform super admins only — internal staff with `admin_access_level = PLATFORM`.
**SLO tier**: P2 (internal tool; brief unavailability is tolerable).
**Host port**: 35175 (follows `+30000` convention; see `.env.example`).

React 18 + Vite + TypeScript + Vitest. Package manager: **pnpm 9**. Shared primitives from `@alp/design-system`.

## Run locally

```bash
pnpm install
pnpm dev          # http://localhost:35175
```

## Test / lint

```bash
pnpm test
pnpm lint
pnpm format
```

## See also

- [ADR-0001](../../docs/adr/0001-feature-flag-platform.md) — feature-flag platform (Super Admin panel lives here).
- [ADR-0003](../../docs/adr/0003-three-web-app-split.md) — why three web apps, not one.
- [apps/web-student](../web-student/) — student app.
- [apps/web-portal](../web-portal/) — teacher + moderator + institution-admin portal.
- [packages/design-system](../../packages/design-system/) — shared tokens + base components.
