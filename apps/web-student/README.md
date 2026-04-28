# web-student

Student-facing web surface. Mirrors the Flutter mobile app's feature set (registration, onboarding, catalog browse, quiz take, progress views) plus public marketing / catalog pages that benefit from SEO.

**Audience**: Student role only (STU-REQ-*). Authenticated routes + public marketing.
**Target bundle**: < 200KB initial JS (per HLD §11.1).
**SLO tier**: P0.
**Host port**: 35173 (follows `+30000` convention; see `.env.example`).

React 18 + Vite + TypeScript + Vitest + React Router v6. Package manager: **pnpm 9**. Shared primitives from `@alp/design-system`; auth + API via `@alp/auth-client` + `@alp/api-client`.

## Run locally

```bash
pnpm install
pnpm dev          # http://localhost:35173
```

## Layout

- `src/App.tsx` — root that wraps `<AuthProvider>` + `<RouterProvider>`.
- `src/routes.tsx` — Sprint 1 route table. All routes listed in [Pass 1 wireframes](../../docs/01_design/08_Wireframes_Sprint1_Student_AdaptiveLearningPlatform.md); Login is the only page implemented in Sprint 0. Everything else renders `<Placeholder>` cross-referenced to its wireframe + user story.
- `src/lib/api.ts` — singleton `auth` (from `@alp/auth-client`) + `api` (from `@alp/api-client`). Session-expiry handler navigates to `/login?reason=expired` and preserves the return path in `sessionStorage`.
- `src/lib/auth-provider.tsx` — React context wrapping the framework-agnostic `@alp/auth-client`. Rehydrates `user` on mount via `/profile/me` if tokens exist in storage.
- `src/lib/protected-route.tsx` — `<ProtectedRoute>` (redirects unauthenticated → `/login`, gates onboarding FSM) + `<GuestOnlyRoute>` (redirects authenticated → `/home`).
- `src/pages/Placeholder.tsx` — generic "not yet implemented" card for unrouted screens; shows wireframe + story refs.

## Env vars

See [.env.example](./.env.example). Copy to `.env.local` for overrides.

## Test / lint

```bash
pnpm test
pnpm lint
pnpm format
```

## See also

- [ADR-0003](../../docs/adr/0003-three-web-app-split.md) — why three web apps, not one.
- [apps/web-portal](../web-portal/) — teacher + moderator + institution admin.
- [apps/web-admin](../web-admin/) — platform super admin.
- [packages/design-system](../../packages/design-system/) — shared tokens + base components.
