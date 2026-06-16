# Adaptive Learning Platform — Rebuild Documentation Pack

**Purpose:** Clean-slate documentation pack for rebuilding the platform without inheriting the issues of the current implementation. Existing `docs/` is preserved untouched as a reference.

**Standards:** BABOK v3 · ISO/IEC/IEEE 29148:2018 · ISO 25010 · PMBOK 7 · Agile/Scrum · TOGAF 10

**Generated:** 2026-05-27 · **Status:** v0.1 DRAFT — Complete

---

## Quick Start

1. Start at the **[Master BRD](00_platform/02_master_brd/master_brd.md)** — the platform anchor (~10 sections, all surfaces).
2. Read the **[Vision & Personas](00_platform/01_vision/vision.md)** for product context.
3. Use the **[Integration Matrix](00_platform/04_integration_matrix/integration_matrix.md)** to understand which app talks to which service.
4. Open the relevant app or service folder for deep specs (BRD + Requirements + Stories + WBS + API + Data).
5. Cross-reference the **[Master WBS & Roadmap](00_platform/07_roadmap_wbs/roadmap_master_wbs.md)** for sprint planning.

---

## Structure

```
docsnew/
├── README.md                         ← you are here (master index)
├── 00_platform/                      ← cross-cutting foundation
│   ├── 01_vision/                    ← Vision & Personas
│   ├── 02_master_brd/                ← Platform-wide BRD (authoritative)
│   ├── 03_glossary/                  ← Domain terms + acronyms
│   ├── 04_integration_matrix/        ← App ↔ Service contracts + NATS subjects
│   ├── 05_nfr/                       ← Non-functional requirements (67 NFRs)
│   ├── 06_data_model/                ← Cross-service data model overview
│   └── 07_roadmap_wbs/               ← Roadmap, master WBS, capacity, critical path
├── 10_apps/                          ← one folder per user-facing surface
│   ├── web-student/                  ← Vidya student web (4 files)
│   ├── web-portal/                   ← Teacher/Expert portal (4 files)
│   ├── web-admin/                    ← Internal admin (4 files)
│   └── mobile/                       ← Flutter mobile (4 files)
├── 20_services/                      ← one folder per backend service
│   ├── identity/                     ← auth, accounts, roles (6 files)
│   ├── learning/                     ← adaptive engine + content + AI Gateway (6 files)
│   ├── quiz/                         ← quiz/test orchestration Go (6 files)
│   ├── battle/                       ← real-time battle Go (6 files)
│   ├── marketplace/                  ← creator economy + Connect (6 files)
│   ├── payment/                      ← billing, subscriptions, Stripe (6 files)
│   └── engagement/                   ← notifications, community, gamification (6 files)
└── 30_appendices/                    ← cross-cutting reference
    ├── risk_register.md
    ├── raci_matrix.md
    ├── traceability_matrix.md
    └── launch_checklist.md
```

Each app folder contains: `01_brd.md`, `02_requirements.md`, `03_user_stories.md`, `04_wbs.md`.
Each service folder contains the same + `05_api_contract.md`, `06_data_model.md`.

---

## Surface Inventory

### Apps (4)

| App | Tech | Primary Persona | Pack |
|-----|------|-----------------|------|
| **web-student** | Vite + React 18 + TS | Aryan (self-driven) · Priya (institution) | [folder](10_apps/web-student/) |
| **web-portal** | Vite + React 18 + TS | Dr. Sharma (expert/tutor) | [folder](10_apps/web-portal/) |
| **web-admin** | Vite + React 18 + TS | Ravi (admin) · Maya (moderator) · Rahul (institution admin) | [folder](10_apps/web-admin/) |
| **mobile** | Flutter 3.x | Aryan · Priya (mobile-first) | [folder](10_apps/mobile/) |

### Services (7)

| Service | Tech | Domain | Pack |
|---------|------|--------|------|
| **identity** | Python + FastAPI | Auth, users, roles, sessions, RBAC, entitlements, audit, DPDPA | [folder](20_services/identity/) |
| **learning** | Python + FastAPI | Adaptive engine, content, 22 question types (Type Handler Protocol), AI Gateway, screening, SM-2, rank prediction, recommendation, localisation, analytics | [folder](20_services/learning/) |
| **quiz** | Go (stdlib) | Quiz/test orchestration, scoring (NEVER returns marks from learning — quiz computes marks from blueprint), idempotent answers, resumable sessions | [folder](20_services/quiz/) |
| **battle** | Go | Real-time multiplayer battles via WebSocket | [folder](20_services/battle/) |
| **marketplace** | Python + FastAPI | Tutor onboarding + KYC (Stripe Identity), profile, availability, bookings, Daily.co live sessions, payouts via Stripe Connect Express | [folder](20_services/marketplace/) |
| **payment** | Python + FastAPI | Stripe Checkout, subscriptions, webhooks, entitlement events to identity within 60 s | [folder](20_services/payment/) |
| **engagement** | Python + FastAPI | Notifications (in-app/email/push/SMS), community, gamification, broadcasts, NATS event ingestion | [folder](20_services/engagement/) |

> ⚠ **Service count = 7, violating ADR-0005 ceiling of 6.** See [OQ-EN-00](20_services/engagement/01_brd.md#12-open-questions). Resolution: fold engagement into learning + marketplace, OR file a new ADR superseding ADR-0005. **Decision required in rebuild Phase 1 Week 2.**

---

## Status Tracker

| # | Document | Status | Owner | Updated |
|---|----------|--------|-------|---------|
| 1 | Master Index (this file) | **COMPLETE v0.1** | — | 2026-05-27 |
| 2 | 00_platform / Vision & Personas | **DRAFT** | — | 2026-05-27 |
| 3 | 00_platform / Master BRD | **DRAFT** | — | 2026-05-27 |
| 4 | 00_platform / Glossary | **DRAFT** | — | 2026-05-27 |
| 5 | 00_platform / Integration Matrix | **DRAFT** | — | 2026-05-27 |
| 6 | 00_platform / NFRs | **DRAFT** | — | 2026-05-27 |
| 7 | 00_platform / Data Model overview | **DRAFT** | — | 2026-05-27 |
| 8 | 00_platform / Roadmap & Master WBS | **DRAFT** | — | 2026-05-27 |
| 9 | apps / web-student (4 files, gold-standard) | **DRAFT** | — | 2026-05-27 |
| 10 | apps / web-portal (4 files) | **DRAFT** | — | 2026-05-27 |
| 11 | apps / web-admin (4 files) | **DRAFT** | — | 2026-05-27 |
| 12 | apps / mobile (4 files) | **DRAFT** | — | 2026-05-27 |
| 13 | services / identity (6 files) | **DRAFT** | — | 2026-05-27 |
| 14 | services / learning (6 files) | **DRAFT** | — | 2026-05-27 |
| 15 | services / quiz (6 files) | **DRAFT** | — | 2026-05-27 |
| 16 | services / battle (6 files) | **DRAFT** | — | 2026-05-27 |
| 17 | services / marketplace (6 files) | **DRAFT** | — | 2026-05-27 |
| 18 | services / payment (6 files) | **DRAFT** | — | 2026-05-27 |
| 19 | services / engagement (6 files) | **DRAFT (OQ-EN-00 pending)** | — | 2026-05-27 |
| 20 | Appendices: risk register | **DRAFT** | — | 2026-05-27 |
| 21 | Appendices: RACI | **DRAFT** | — | 2026-05-27 |
| 22 | Appendices: traceability matrix | **DRAFT** | — | 2026-05-27 |
| 23 | Appendices: launch checklist | **DRAFT** | — | 2026-05-27 |

**Total files:** 1 index + 7 platform docs + 16 app docs + 42 service docs + 4 appendix docs = **70 markdown files**.

---

## Source Material Salvaged

This pack is built on top of the following existing artifacts (preserved in `docs/` as reference):

- `docs/00_requirements/02_BRD_v2_Adaptive_Learning_Platform.docx` — McKinsey/Big4-grade BRD (113 stories, 782 SP). **Primary source for product intent.**
- `docs/00_requirements/03_PRD_Adaptive_Learning_Platform.docx`
- `docs/00_requirements/05_UserStories_v2_Adaptive_Learning_Platform.docx`
- `docs/adr/*.md` — 29 ADRs (0001–0029, all accepted). **Hard architectural commitments — load-bearing.**
- `docs/04_low_level_design/*` — per-service LLDs
- Memory files at `/home/deepak/.claude/projects/-home-deepak-projects-adaptive-learning-platform/memory/` — project facts (status, ADR index, screening reality, statistics guidance, etc.).

What's **deliberately changed** in this rebuild:

- 3 web apps + 1 mobile app (matches actual repo) — old BRD assumed 1 web app.
- 7 services in repo (vs old BRD's 11 services / vs ADR-0005 ceiling of 6) — open question OQ-EN-00 to resolve.
- Aurora v2 → Vidya v3 design system (per ADR-0028, 0029, 0034).
- **Resolution contract enforced**: learning service never returns marks. Quiz computes them from blueprint scoring profile. CI gate planned.
- **AI Gateway as module inside learning** (per ADR-0019) — not a separate service.

---

## Reading Guide for Different Roles

| Role | Start here |
|------|-----------|
| **Business Owner / Founder** | [Master BRD](00_platform/02_master_brd/master_brd.md) §1–3, §11; [Vision](00_platform/01_vision/vision.md); [Roadmap](00_platform/07_roadmap_wbs/roadmap_master_wbs.md) |
| **Product Owner** | All BRDs §1–6 + §11–12 (OQs); [Vision](00_platform/01_vision/vision.md); [Roadmap](00_platform/07_roadmap_wbs/roadmap_master_wbs.md) |
| **Tech Lead** | [Master BRD](00_platform/02_master_brd/master_brd.md) §4; [Integration Matrix](00_platform/04_integration_matrix/integration_matrix.md); each service's `01_brd.md` + `05_api_contract.md` + `06_data_model.md` |
| **Frontend Lead** | All app `01_brd.md` + `02_requirements.md` + `03_user_stories.md`; [Vidya design notes in glossary](00_platform/03_glossary/glossary.md) |
| **Mobile Lead** | [mobile](10_apps/mobile/) all 4 files |
| **Backend Squad Lead** | Their service's all 6 files; the services they integrate with's `05_api_contract.md` |
| **ML Lead** | [learning](20_services/learning/) all 6 files; ADRs 0017/0018/0019 |
| **DevOps Lead** | [Integration Matrix](00_platform/04_integration_matrix/integration_matrix.md); [Platform Data Model](00_platform/06_data_model/platform_data_model.md); [Launch Checklist](30_appendices/launch_checklist.md) |
| **QA Lead** | All `03_user_stories.md` (test cases); [Traceability](30_appendices/traceability_matrix.md); [Launch Checklist](30_appendices/launch_checklist.md) |
| **Designer** | All app `01_brd.md` + `03_user_stories.md` (UX notes); [Vision](00_platform/01_vision/vision.md) |
| **Compliance** | [Master BRD §3, §7](00_platform/02_master_brd/master_brd.md); [NFRs §Compliance](00_platform/05_nfr/nfr.md); [RACI](30_appendices/raci_matrix.md); [identity](20_services/identity/) + [payment](20_services/payment/) BRDs |
| **New engineer** | [Vision](00_platform/01_vision/vision.md) → [Master BRD](00_platform/02_master_brd/master_brd.md) → [Glossary](00_platform/03_glossary/glossary.md) → your service's pack |

---

## Top Critical Open Questions (Must-Resolve Before Phase 1)

| OQ | Subject | Resolve By |
|----|---------|-----------|
| **OQ-EN-00** | Engagement service ceiling — fold or new ADR | Phase 1 Week 2 |
| **OQ-WA-01** | Admin SSO provider (Okta vs Google Workspace) | Phase 1 Week 1 |
| **OQ-WA-04 / OQ-ID-06** | Impersonation: read-only "view as" or full session | Phase 1 Week 2 |
| **OQ-MB-01** | iOS payments: Stripe WebView vs StoreKit IAP | Phase 1 Week 4 |
| **OQ-ID-02** | Audit retention floor (1 yr / 3 yr / 7 yr) | Phase 1 Week 2 |
| **OQ-LR-01** | Embedding model choice | Phase 1 Week 2 |
| **OQ-WP-01** | Rich editor: TipTap vs Slate | Phase 1 Week 2 |
| **OQ-EN-01** | Email provider: SendGrid vs SES | Phase 1 Week 2 |

(See [Traceability Matrix](30_appendices/traceability_matrix.md) §OQ for the full list of ~60 OQs.)

---

## Change Log

| Date | Version | Author | Change |
|------|---------|--------|--------|
| 2026-05-27 | 0.1 | Rebuild kick-off | Full pack v0.1 — 70 files, ~4,760 SP catalogued across 11 surfaces + platform + appendices |

---

## Next Steps After This Pack

1. **Review & sign-off**: Business Owner + Product + Tech Lead + Design + QA + Compliance.
2. **Resolve top OQs** (above).
3. **File new ADRs** for any decisions that emerge (esp OQ-EN-00).
4. **Provision external dependencies**: AWS, Stripe India, Daily.co, FCM/APNS, LLM providers (see [Launch Checklist §9](30_appendices/launch_checklist.md)).
5. **Set up CI/CD per-service** with the contract tests (Resolution-no-marks gate, idempotency tests, etc.).
6. **Start Phase 1 sprint 0** per the [Roadmap §7](00_platform/07_roadmap_wbs/roadmap_master_wbs.md).
7. **Author QA test register** referencing every story's AC.
8. **Maintain this doc pack**: every accepted ADR, every resolved OQ updates the relevant pack.
