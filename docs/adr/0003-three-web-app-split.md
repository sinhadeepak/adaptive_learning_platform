# ADR-0003: Three-web-app split for Phase 1

- **Status**: Proposed (Tech Lead + FE Leads + CTO sign-off pending)
- **Date**: 2026-04-22
- **Deciders**: Tech Lead, FE Leads × 2, CTO, Head of Product
- **Related**: [HLD §3.1 Container Diagram](../01_design/01_HLD_Adaptive_Learning_Platform.docx) (deviation), [User Stories v2](../00_requirements/05_UserStories_v2_Adaptive_Learning_Platform.docx) (10 epics across 4 roles), [ADR-0001](0001-feature-flag-platform.md) (Super Admin panel — flags UI lands in Sprint 3 web-admin), [ADR-0002](0002-flutter-mobile-stack.md) (mobile stack)

## Context

The Sprint 0 scaffold ships with a single `apps/web` (React+Vite+TypeScript) and a single `apps/mobile` (Flutter). The signed [HLD §3.1](../01_design/01_HLD_Adaptive_Learning_Platform.docx) calls for two web surfaces:

- **Web Application** (port 3000) — "Student + teacher web interface. SSR for SEO. Responsive."
- **Admin Portal** (port 3001) — "Platform admin and institution admin dashboard. Desktop-optimised. No SSR needed."

Two issues with the HLD's split surfaced during Sprint 0 review (2026-04-22):

1. **Student and teacher experiences have fundamentally different UX shapes** — the student app is a polished consumer surface (P0 SLO, frequent iteration, marketing pages, mobile-first responsive design), while teacher workflows are dense table-driven content authoring + review flows (P1 SLO, deeper forms, desktop-first). Conflating them into one Next.js app forces design-language compromises that hurt both.
2. **Phase 1 feature timing** — student MVP ships Sprint 1–2, teacher features ship Sprint 3, super-admin features (ADR-0001 flag UI etc.) also Sprint 3. A single `web` app churns under the student work for 6 weeks, then needs invasive teacher additions. Two surfaces let the student app stabilise while the portal is built independently.

User Stories v2 makes the role separation explicit at the epic level:

- EPIC-01..07 — Student (63 stories)
- EPIC-08 — Expert & Teacher (18 stories)
- EPIC-09 — Moderation (11 stories) — internal/external moderators (web only)
- EPIC-10 — Platform Administration (20 stories) — cross-tenant super admin (web only)

Mobile remains student-only (industry standard; teacher/moderator/admin work density is desktop work).

## Decision

We will deliver Phase 1 with **three web applications** plus one mobile application:

```
apps/
├── web-student/    React+Vite — student-facing; mirrors mobile feature set; public marketing pages
├── web-portal/     React+Vite — teacher + moderator + institution-admin (tenant-scoped operators)
├── web-admin/      React+Vite — platform super admin (cross-tenant; ADR-0001 flag UI; institution CRUD)
└── mobile/         Flutter — student-only (per ADR-0002)

packages/
└── design-system/  shared design tokens + base components (avoid 3× duplication)
```

This **supersedes the HLD §3.1 web split**. The HLD will be amended at the next design-doc revision; until then, this ADR is the authoritative source on Phase 1 web architecture.

## Alternatives considered

- **Option A — Stick with the HLD's two web apps** (Student+Teacher | Admin). Rejected because the student/teacher conflation creates the design-language and SLO problems described in §Context. Cost saving (one fewer scaffold) does not compensate.
- **Option B — One web app, role-based routing** (current scaffold's implicit direction). Rejected because: (i) student bundle includes teacher/admin code → larger initial JS than the < 200KB target; (ii) RBAC-by-route is weaker than physical separation for security review; (iii) student-app SLO and admin-app SLO cannot be set independently; (iv) deploy cadence is forced to be uniform.
- **Option C — Three web apps as decided** (Student | Portal | Admin). Selected. Adds one scaffold over the HLD but cleanly separates concerns at the audience boundary.
- **Option D — Four web apps** (Student | Teacher | Moderator | Admin). Rejected because Teacher + Moderator + Institution-admin share so much UX surface (tables, audit views, content review queues) that splitting them creates maintenance burden without clear benefit. They share `web-portal` with role-aware navigation; if a sub-audience grows enough to warrant its own app, we can split out later.
- **Option E — Flutter Web for the student app** (one Flutter codebase serves iOS + Android + student web). Rejected for Phase 1: SEO is critical for student acquisition (catalogue and marketing pages), Flutter Web's SEO story is weak, and the React+Vite team is already stood up. May revisit in Phase 2.

## Consequences

### Positive

- Student bundle stays minimal (target < 200KB initial JS). Teacher / admin code is physically absent from the student app.
- Each app has its own design density, navigation model, and visual language. Student is consumer-grade; portal is workflow-dense; admin is control-panel-dense.
- Independent deploy cadences and SLOs — student-app at P0, portal at P1, admin at P2. ArgoCD applications are separate; an admin-portal incident does not block a student-app deploy.
- Security boundary at the subdomain level. `student.adaptivelearn.in` → `app.adaptivelearn.in`; `portal.adaptivelearn.in`; `admin.adaptivelearn.in`. Different WAF rules, different CORS, different MFA enforcement.
- Auth flow can require MFA on portal + admin without affecting student UX.
- Sprint 1 student work and Sprint 3 portal/admin work can proceed without code-level interference.
- Aligns with the ADR-0001 Sprint 3 deliverable (Super Admin panel for feature flags) — a clear home in `apps/web-admin` instead of a sub-route in a generic `apps/web`.

### Negative

- One additional scaffold compared to HLD's spec — ~7-8 SP added to Sprint 0/1 cumulatively (3 × 1.5 SP scaffolding + 3 SP design-system package).
- Three CI lanes (lint/test/build) and three image builds — ~3× the FE pipeline time per PR. Mitigated by `dorny/paths-filter` so a PR touching only one app runs only that app's lane.
- FE Lead × 2 may feel stretched if all three apps have substantial Sprint scope simultaneously. Mitigation: Phase 1 sequencing — Student in Sprint 1–2, Portal in Sprint 3, Admin minimal until Sprint 3 (only flag UI + audit log view).
- Three design implementations risk visual drift. Mitigated by `packages/design-system` as the single source of tokens + base components.
- `web-admin` and `web-portal` share ~60% of patterns (auth, tables, audit logs, search). Some duplication is acceptable in exchange for the clean separation; if duplication grows beyond 60% we revisit a unified `web-operator` app.

### Follow-up work

- [x] Scaffold all three apps from the same Vite template (2026-04-22)
- [x] Create `packages/design-system` stub (2026-04-22)
- [ ] Update Makefile, CI workflows, security scan paths
- [ ] HLD §3.1 amendment — update Container Diagram and §3.1 Container Summary at next design-doc revision
- [ ] Sprint Plan §Sprint 1 + §Sprint 3 — clarify which scope lands in which web app
- [ ] Helm charts: add `web-student`, `web-portal`, `web-admin` once these apps need deployment (Sprint 1 staging deploy, AWS-deferred)
- [ ] ArgoCD applications: three new entries under `infrastructure/argocd/applications/services/` (Sprint 1)
- [ ] Subdomain plan: `app.adaptivelearn.in` (student), `portal.adaptivelearn.in` (portal), `admin.adaptivelearn.in` (admin). Route 53 + CloudFront config in Terraform — DevOps to add to `s3-cloudfront` module call.
- [ ] CSP / CORS / WAF rules per subdomain — Security Lead to review before Sprint 4 hardening.
- [ ] Decide `packages/design-system` distribution: workspace symlink (pnpm workspace) vs published-to-internal-registry. Pnpm workspace recommended for Phase 1 simplicity.

## Review

Revisit if any of the following triggers fire:
- Phase 2 plan to add a fourth web audience (e.g. parents, B2B sales portal).
- Duplication between `web-portal` and `web-admin` exceeds 60% of components — consider merging into a single `web-operator` app.
- Flutter Web maturity reaches a point where the student app could move to Flutter (would change the entire architecture; Phase 2 review at earliest).
