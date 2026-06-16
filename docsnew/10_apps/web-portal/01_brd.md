# Business Requirements Document — web-portal (Vidya Portal)

| | |
|---|---|
| **Surface** | `apps/web-portal` |
| **Persona** | Dr. Sharma (expert/teacher/tutor) · Anjali (institution teacher) · Rohan (independent content creator) |
| **Tech** | Vite + React 18 + TypeScript + Vidya Design System v3 |
| **Doc Version** | 0.1 (DRAFT) |
| **Date** | 2026-05-27 |
| **Anchored to** | [Master BRD §5.1.2](../../00_platform/02_master_brd/master_brd.md#512-web-portal-vidya-portal) |

---

## 1. Purpose

The Vidya Portal is the **expert / teacher / tutor surface** — the production tool where domain experts author content, manage their tutor profile, run live sessions, and monitor earnings. It is the supply-side counterpart to the student surfaces (web-student + mobile).

It is **not** for moderation (web-admin), nor for end-learner consumption (web-student / mobile).

## 2. Scope

### 2.1 In Scope

| Domain | Capability |
|---|---|
| **Expert onboarding** | Application, profile, qualification verification, role assignment |
| **KYC** | Stripe Identity (per ADR-0006) — document upload, selfie, status tracking |
| **Authoring — single item** | Create question (any of 22 types per ADR-0018), with rich editor, media, tags, blueprint linkage |
| **Authoring — bulk** | CSV/Excel ingest with validation; versioned dryrun |
| **Authoring — AI Draft Panel** | LLM-assisted draft (per ADR-0019 authoring touchpoint) — review and edit before submit |
| **Authoring — multimedia** | Image / video / interactive (LaTeX, geometry, chemistry — via shared widgets) |
| **Quality dashboards** | Acceptance rate, Cohen's kappa (vs moderation), revision rate, ban rate |
| **Tutor profile** | Bio, subjects taught, languages, hourly rate (within band per ADR-0008), availability calendar |
| **Live session mgmt** | Pre-session lobby, Daily.co room handoff (per ADR-0009), session notes, whiteboard (Phase 2) |
| **Earnings & payouts** | Stripe Connect Express (per ADR-0007) — 15% take, weekly payout, payout history, tax docs |
| **Marketplace pricing** | Set rate within platform band; cannot exceed band ceiling |
| **Disputes** | View open disputes, submit evidence, see resolution |
| **Author analytics** | Items submitted/accepted, average review time, top topics, student engagement on my items |
| **Teacher cohort view (Phase 2)** | Institution teachers see their batch's progress (read-only) |
| **Settings** | Profile, banking, KYC re-verify, notification prefs, language |

### 2.2 Out of Scope

| Item | Lives In |
|---|---|
| Student practice / quiz | web-student / mobile |
| Moderation queue | web-admin |
| Platform-wide admin (user mgmt, feature flags) | web-admin |
| Direct messaging at scale | engagement service (Phase 2 in-app chat) |
| Content versioning UI (advanced) | Phase 3 — defer beyond simple author-side draft/published |

### 2.3 Scope by Phase

| Phase | Web-portal must ship |
|---|---|
| **Phase 1 (M0–M6)** | Expert auth (signup + role bootstrapping) · Single-question authoring (5–8 of 22 types) · Bulk CSV (validate + dryrun) · Quality v1 (acceptance rate + revision rate) · Settings · KYC start flow (Stripe Identity link out) |
| **Phase 2 (M6–M12)** | Full KYC + Stripe Connect onboarding · Tutor profile + availability · Daily.co session · Earnings + payouts · All 22 question type authoring · AI Draft Panel · Teacher cohort read-only view · Author analytics deep dive |
| **Phase 3 (M12–M18)** | AI evaluation co-pilot · Multi-language authoring (translation gateway) · Whiteboard · Advanced versioning |

---

## 3. Stakeholders

| Stakeholder | Role | Decision Authority |
|---|---|---|
| **Expert / Teacher / Tutor** | Primary user | UX feedback |
| **Product Owner** | Functional scope | AC approval |
| **Frontend Lead** | Tech owner | Architecture |
| **Design Lead** | UX owner | Flows + tone |
| **Content Lead** | Editorial owner | Authoring standards |
| **Moderation Lead** | Quality gate | Review SLAs |
| **Marketplace Lead** | Marketplace owner | Pricing, payouts |
| **Compliance** | KYC + tax owner | Legal sign-off |

## 4. Personas

### 4.1 Dr. Sharma — Independent Domain Expert

- **Profile**: PhD Physics. Authors 30–50 high-quality items/month. Occasional live sessions.
- **Tools**: Desktop primarily. LaTeX-fluent.
- **Goal**: Earn supplementary income + reputation.
- **Frustration**: "Authoring tools elsewhere are clunky. I lose time fighting the editor."

### 4.2 Anjali — Institution Teacher

- **Profile**: 8 yr school physics teacher. Authors when assigned. Wants to see her batch's progress.
- **Goal**: Match her syllabus to platform content + monitor batch.

### 4.3 Rohan — Indie Content Creator

- **Profile**: 27 yr UPSC topper. Full-time creator. Live tutor + author.
- **Goal**: Build student following + book sessions + maximise hourly rate.

## 5. User Journeys (Top 10)

| # | Journey | Frequency | Critical Path |
|---|---------|-----------|---------------|
| 1 | Author a question (single) | Daily for active authors | Home → Author → Type → Compose → Preview → Submit |
| 2 | Author with AI Draft | Daily Phase 2 | Author → "Draft with AI" → Review → Edit → Submit |
| 3 | Bulk CSV upload | Weekly | Author → Bulk → Upload → Validate → Confirm |
| 4 | Check quality dashboard | Weekly | Home → Dashboard → Drill into rejected |
| 5 | Tutor session — pre-session | Per booking | Home → Today's Sessions → Join → Daily.co |
| 6 | View earnings + payout status | Weekly | Home → Earnings |
| 7 | Update availability calendar | Weekly | Profile → Availability → Edit slots |
| 8 | Respond to a dispute | Occasional | Notifications → Dispute → Submit evidence |
| 9 | KYC re-verify (annual) | Annual | Settings → KYC → Stripe Identity → return |
| 10 | View my items' student engagement | Weekly | Analytics → My Items → Drill |

## 6. Functional Areas

| Area | Description | Source Service |
|------|-------------|----------------|
| FA-01 Auth & Expert Onboarding | Signup with `role=expert` flag, application review | identity |
| FA-02 KYC | Stripe Identity flow + status sync | marketplace + payment |
| FA-03 Single-Item Authoring | All 22 question types with rich editor | learning (authoring API) |
| FA-04 AI Draft Panel | LLM-assisted authoring via AI Gateway | learning (AI Gateway) |
| FA-05 Bulk Authoring | CSV/Excel ingest + validation + dryrun | learning |
| FA-06 Quality Dashboards | Acceptance, kappa, revision, ban metrics | learning + admin |
| FA-07 Tutor Profile | Bio, subjects, languages, rate, photo | marketplace |
| FA-08 Availability Calendar | Slots, recurring rules, blackout dates | marketplace |
| FA-09 Live Session Mgmt | Pre-session lobby, Daily.co launch, session notes | marketplace + Daily.co |
| FA-10 Earnings & Payouts | Stripe Connect dashboards, payout history, tax docs | payment + marketplace |
| FA-11 Disputes | View, evidence upload, status track | marketplace + payment |
| FA-12 Author Analytics | My items' performance, student engagement | learning + analytics |
| FA-13 Teacher Cohort View (Phase 2) | Read-only batch view for institution teachers | learning + institution context |
| FA-14 Settings | Profile, banking, KYC re-verify, language, prefs | identity + marketplace + payment |
| FA-XC Cross-Cutting | Same standards as web-student (a11y, perf, error states, i18n) | local |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-WP-01 | Performance | TTI (3G simulated) | < 4 s |
| NFR-WP-02 | Performance | LCP | < 2.5 s |
| NFR-WP-03 | Performance | Author save round-trip | < 500 ms |
| NFR-WP-04 | Bundle | Initial JS (gz) | < 280 KB (heavier due to editor) |
| NFR-WP-05 | A11y | WCAG | 2.1 AA |
| NFR-WP-06 | Browser | Supported | Chrome/Edge/Firefox/Safari last 2 |
| NFR-WP-07 | i18n | UI languages | English + Hindi |
| NFR-WP-08 | i18n | Authoring languages | Phase 2: full multi-language item authoring |
| NFR-WP-09 | Editor | LaTeX render | MathJax / KaTeX, both supported |
| NFR-WP-10 | Editor | Auto-save | every 30 s + on focus loss |
| NFR-WP-11 | Editor | Conflict resolution (concurrent edits) | last-write-wins with banner; defer CRDT |
| NFR-WP-12 | Security | RBAC | role=expert,tutor; cannot access admin endpoints |
| NFR-WP-13 | Security | KYC PII | encrypted in transit + at rest; never logged |
| NFR-WP-14 | Security | Banking info | Stripe-tokenised; never our DB |
| NFR-WP-15 | Compliance | Tax docs | retain 7 years; downloadable as PDF |
| NFR-WP-16 | Observability | Sentry + OTel | as per platform |
| NFR-WP-17 | Resilience | Authoring autosave on net loss | local draft preserved |
| NFR-WP-18 | Cost | AI Draft per-user limit | configurable; defaults per plan |
| NFR-WP-19 | A/V | Live session connection success | ≥ 98% (Daily.co SLA dependent) |
| NFR-WP-20 | Editor | Image upload max | 5 MB · resize server-side |
| NFR-WP-21 | Editor | Video embed | YouTube/Vimeo only Phase 1; native upload Phase 3 |
| NFR-WP-22 | Performance | CSV bulk validate (1000 items) | < 30 s server-side |

---

## 8. Constraints & Assumptions

### 8.1 Constraints

- **C-WP-01** Vidya design system v3 only
- **C-WP-02** Vite SPA (no SSR)
- **C-WP-03** State: React Query + Zustand; no Redux
- **C-WP-04** Routing: react-router v6
- **C-WP-05** Forms: react-hook-form + Zod
- **C-WP-06** Test: Vitest + Playwright
- **C-WP-07** Rich text editor: **TipTap** (OQ-WP-01 — vs Slate)
- **C-WP-08** Math editor: KaTeX (rendering) + LaTeX source authoring
- **C-WP-09** All authoring submissions go through moderation before student exposure
- **C-WP-10** No payouts without completed Stripe Connect onboarding
- **C-WP-11** Pricing must fall within platform-defined band per ADR-0008
- **C-WP-12** AI Draft must never auto-submit — author always confirms

### 8.2 Assumptions

- **A-WP-01** Backend OpenAPI published
- **A-WP-02** Daily.co JS SDK suitable for browser-embedded session UI
- **A-WP-03** Stripe Identity returns webhook within 24 hr of submission
- **A-WP-04** Stripe Connect Express onboarding works for Indian sellers (verified separately by Finance)

## 9. Dependencies

| ID | Depends on | For |
|----|-----------|-----|
| D-WP-01 | identity (expert role onboarding) | Auth |
| D-WP-02 | marketplace (KYC, profile, availability, bookings) | Tutor profile + sessions |
| D-WP-03 | payment (Stripe Connect, payouts, disputes) | Earnings |
| D-WP-04 | learning (authoring API, AI Gateway) | All authoring |
| D-WP-05 | engagement (notifications) | Comms |
| D-WP-06 | Daily.co JS SDK | Live sessions |
| D-WP-07 | Stripe Identity (KYC) | Compliance |
| D-WP-08 | TipTap editor + KaTeX | Rich authoring |
| D-WP-09 | Vidya design system v3 | UI |
| D-WP-10 | Feature flag platform (gradual rollout) | Phased capabilities |

## 10. Risks

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R-WP-01 | Editor performance on large items (≥ 30 parts) degrades | Med | High | Virtualise parts list; defer non-visible parts |
| R-WP-02 | KYC rejection rate high → tutor pipeline empty | Med | High | Pre-launch tutor seeding + clearer rejection feedback |
| R-WP-03 | AI Draft kappa drift causes mass rejections | Med | Med | Per ADR-0019 — auto-pause at < 0.7 + manual review |
| R-WP-04 | Daily.co outage during live session | Low | High | Fallback to instructions to switch tool + refund policy |
| R-WP-05 | Stripe Connect not approved for Indian sellers without changes | Med | High | Validate with Finance pre-Phase 2 |

## 11. Success Criteria

Web-portal Phase 1 is **Done** when:

1. All Phase 1 FRs shipped + passing tests
2. NFRs verified via CI
3. 5 expert flows pass Playwright E2E (signup, single item author, bulk CSV, dashboard, settings)
4. 10 pilot experts onboarded successfully (real-user validation)
5. Lighthouse ≥ 85 perf · ≥ 95 a11y on author + dashboard routes
6. AI Draft kappa monitored (Phase 2)
7. Cost-per-author-session telemetry live (AI usage)

## 12. Open Questions

| # | Question | Owner | Resolve By |
|---|----------|-------|------------|
| OQ-WP-01 | Rich editor: TipTap vs Slate | FE Lead | Phase 1 Week 2 |
| OQ-WP-02 | KYC re-verify cadence (annual vs every 2 yr) | Compliance | Phase 2 Week 1 |
| OQ-WP-03 | Payout currency for non-INR tutors (Phase 2) | Finance | Phase 2 Week 4 |
| OQ-WP-04 | Diagram canvas: build vs buy (Excalidraw vs custom) | Design + FE | Phase 2 Week 8 |
| OQ-WP-05 | Whiteboard during live session (Phase 2 vs 3) | Product | Phase 2 kickoff |
| OQ-WP-06 | CSV versioning UI (Phase 2 vs 3) | Content Lead | Phase 2 kickoff |
| OQ-WP-07 | Course "storefront" URL for tutors | Marketplace | Phase 2 |
| OQ-WP-08 | AI Draft quota by tier (free vs premium expert) | Finance + Product | Phase 1 Week 6 |
| OQ-WP-09 | Kappa score visibility to author (see own kappa or not?) | Content + Product | Phase 1 Week 4 |
| OQ-WP-10 | Tax jurisdictions (TDS 194O) | Finance | Phase 2 Week 1 |

## 13. Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | _Pending_ | | |
| Frontend Lead | _Pending_ | | |
| Content Lead | _Pending_ | | |
| Marketplace Lead | _Pending_ | | |
| Compliance | _Pending_ | | |
| QA Lead | _Pending_ | | |
