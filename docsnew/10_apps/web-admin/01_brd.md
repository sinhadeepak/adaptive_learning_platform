# Business Requirements Document — web-admin (Vidya Admin)

| | |
|---|---|
| **Surface** | `apps/web-admin` |
| **Persona** | Ravi (Platform Admin) · Maya (Moderator) · Rahul (Institution Admin) |
| **Tech** | Vite + React 18 + TypeScript + Vidya Design System v3 |
| **Doc Version** | 0.1 (DRAFT) |
| **Date** | 2026-05-27 |
| **Anchored to** | [Master BRD §5.1.3](../../00_platform/02_master_brd/master_brd.md#513-web-admin-vidya-admin) |

---

## 1. Purpose

Vidya Admin is the **internal-ops surface** — for platform admins, moderators, and institution admins. Every action on this surface is **audit-logged**, **RBAC-scoped**, and **revocable**. The platform's safety, content quality, and operational health depend on this app.

## 2. Scope

### 2.1 In Scope

| Domain | Capability |
|---|---|
| **Admin auth** | SSO (OQ-WA-01: Okta vs Google Workspace), role-based access, hardware MFA, session timeout, IP allowlist |
| **User management** | Search, view, suspend/unsuspend, force-reset, **impersonate-with-audit**, account deletion |
| **Content moderation** | Queue with filters, approve/reject/revise with feedback, kappa drift dashboards, AI Gateway auto-pause alerts |
| **Exam & blueprint config** | Manage exams (NEET/JEE/UPSC/CBSE-N), blueprints, PYQ ingestion, syllabus tree |
| **Institution management** | Create institution, seat licenses, assign institution admins, view batch dashboards |
| **Marketplace ops** | Tutor application review, KYC review, payout disputes, ban/restore |
| **Billing ops** | Subscriptions list, refunds, disputes, MRR/ARR snapshots, retention dashboards |
| **Feature flag mgmt** | Per ADR-0001 — tenant-aware flags, rollout % gradual control |
| **Platform health** | Service SLOs, error rates, latency, cost per MAU dashboards |
| **Broadcast** | Platform-wide announcements (in-app + email) |
| **Audit log** | All admin actions, searchable, exportable, retention-policied |
| **AI Gateway control** | Auto-pause overrides, provider selection, cost caps, kappa thresholds |
| **Settings** | Profile, MFA, language |

### 2.2 Out of Scope

| Item | Lives In |
|---|---|
| Student-facing flows | web-student / mobile |
| Expert authoring | web-portal |
| Tutor-facing earnings UI | web-portal |
| Live session join | not applicable for admin |
| Direct DB access | infra; admin app uses APIs only |

### 2.3 Scope by Phase

| Phase | Web-admin must ship |
|---|---|
| **Phase 1 (M0–M6)** | Admin auth · User mgmt (search, view, suspend, force-reset) · Content moderation queue · Exam config (NEET/JEE only initially) · Feature flags · Billing ops (refunds) · Platform health (basic SLOs) · Audit log |
| **Phase 2 (M6–M12)** | Institution mgmt · Marketplace ops · Tutor KYC review · Advanced analytics · Broadcast · AI Gateway control panel · Impersonate-with-audit · Custom dashboards |
| **Phase 3 (M12–M18)** | Cohort-A/B experimentation · Custom report builder · Multi-region health · Advanced compliance reports |

---

## 3. Stakeholders

| Stakeholder | Role | Decision Authority |
|---|---|---|
| **Platform Admin (Ravi)** | Primary user | UX feedback |
| **Moderator (Maya)** | Primary user | Moderation workflow UX |
| **Institution Admin (Rahul)** | B2B user (Phase 2) | Batch dashboard requirements |
| **Compliance** | Audit + retention | Sign-off on log policy |
| **SRE** | Health dashboards | Metric selection |
| **Finance** | Billing ops | Refund/dispute workflows |
| **Security** | Auth + audit | SSO + impersonation policy |

## 4. Personas

### 4.1 Ravi — Platform Admin

- **Profile**: 30 yr ops manager. Runs platform health, billing ops, escalations.
- **Frequency**: Multiple times/day. Power user.
- **Goal**: Single pane of glass.
- **Frustration**: "Right now I need 4 dashboards open and a SQL terminal."

### 4.2 Maya — Moderator

- **Profile**: 25 yr content reviewer. Reviews ~80 items/day.
- **Goal**: Clear queue within SLA; clear feedback to authors.
- **Frustration**: "Old queue lost my progress when I refreshed."

### 4.3 Rahul — Institution Admin

- **Profile**: 40 yr coaching-centre manager. 500 students.
- **Frequency**: Weekly check-ins, monthly deep-dives.
- **Goal**: See batch performance, identify struggling students.
- **Frustration**: "I don't know who's falling behind until they fail a test."

## 5. User Journeys (Top 10)

| # | Journey | Persona | Critical Path |
|---|---------|---------|---------------|
| 1 | Daily moderation queue | Maya | Login → SSO → Mod queue → Review item → Approve/Reject |
| 2 | Suspend user (abuse report) | Ravi | Audit alert → User search → View → Suspend → Reason |
| 3 | Issue refund | Ravi | Billing → Find subscription → Refund → Reason → Confirm |
| 4 | Toggle feature flag | Ravi | Flags → Find flag → Adjust rollout % → Confirm |
| 5 | Investigate high error rate | Ravi | Health dashboard → Drill service → Logs → Identify |
| 6 | Approve a tutor application | Ravi/Maya | Marketplace → Apps → Review docs → Approve → Notify |
| 7 | Send broadcast | Ravi | Broadcast → Compose → Target → Schedule → Send |
| 8 | Review AI kappa drift alert | Ravi | Alert → AI Gateway → Kappa view → Pause provider → Notify |
| 9 | Audit user impersonation | Compliance | Audit log → Filter "impersonate" → Export |
| 10 | Institution batch view | Rahul | Login → My institution → Batch → Drill |

## 6. Functional Areas

| Area | Description | Source Service |
|------|-------------|----------------|
| FA-01 Admin Auth (SSO) | OAuth/SSO, MFA, IP allowlist, session timeout | identity |
| FA-02 User Mgmt | Search, suspend, force-reset, impersonate-with-audit, delete | identity |
| FA-03 Content Moderation | Queue, approve/reject/revise, kappa, AI auto-pause | learning |
| FA-04 Exam & Blueprint Config | Exam, syllabus, blueprint, PYQ ingestion | learning |
| FA-05 Institution Mgmt | Create, seats, batch dashboards | identity (institution context) + learning |
| FA-06 Marketplace Ops | Tutor approval, KYC review, payout disputes | marketplace + payment |
| FA-07 Billing Ops | Subscriptions, refunds, disputes, MRR/ARR | payment |
| FA-08 Feature Flag Mgmt | Per ADR-0001, tenant + rollout % | flag platform |
| FA-09 Platform Health | SLO dashboards, error/latency/cost panels | observability |
| FA-10 Broadcast | Compose, target, schedule, send | engagement |
| FA-11 Audit Log | Search, filter, export | identity + all services |
| FA-12 AI Gateway Control | Auto-pause overrides, provider, cost cap, kappa | learning AI Gateway |
| FA-13 Settings | Profile, MFA, language | identity |
| FA-XC Cross-Cutting | A11y, perf, error, i18n | local |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-WA-01 | Performance | TTI | < 3 s (internal) |
| NFR-WA-02 | Performance | Search results | < 500 ms p95 |
| NFR-WA-03 | Security | SSO required | Yes; no email/password auth (OQ-WA-01) |
| NFR-WA-04 | Security | Hardware MFA | Required for admin role |
| NFR-WA-05 | Security | Session timeout (idle) | 15 min |
| NFR-WA-06 | Security | Session timeout (absolute) | 8 hr |
| NFR-WA-07 | Security | IP allowlist (configurable) | Yes — optional Phase 1, mandatory Phase 2 |
| NFR-WA-08 | Audit | All actions audit-logged | 100% |
| NFR-WA-09 | Audit | Audit retention | ≥ 1 year (OQ-WA-02) |
| NFR-WA-10 | Audit | Audit log tamper-evident | Append-only + hash chain |
| NFR-WA-11 | Impersonation | Requires reason + auto-audit | Yes |
| NFR-WA-12 | Impersonation | Max session 30 min | Yes |
| NFR-WA-13 | Impersonation | Visible banner during impersonation | Yes |
| NFR-WA-14 | RBAC | Granular roles (super_admin, admin, moderator, institution_admin) | Yes |
| NFR-WA-15 | RBAC | Permission audit per role | Documented matrix |
| NFR-WA-16 | A11y | WCAG | 2.1 AA |
| NFR-WA-17 | Browser | Chrome/Edge latest 2 majors only | (Internal tool — narrower matrix OK) |
| NFR-WA-18 | i18n | English only Phase 1 | OK |
| NFR-WA-19 | Observability | Sentry + OTel | Yes |
| NFR-WA-20 | Cost | Heavy queries paginated | Cursor-based |
| NFR-WA-21 | Reliability | Bulk-action confirmation | Two-step (preview + confirm) |
| NFR-WA-22 | Reliability | Undo window (where reversible) | 60 s for non-destructive |

---

## 8. Constraints & Assumptions

### 8.1 Constraints

- **C-WA-01** Vidya design system v3
- **C-WA-02** SSO only — no email/password (OQ-WA-01 picks provider)
- **C-WA-03** RBAC enforced at API + UI level
- **C-WA-04** All mutations idempotent
- **C-WA-05** Impersonation requires reason + auto-expires
- **C-WA-06** Audit log append-only + tamper-evident
- **C-WA-07** Two-step confirm on destructive actions (suspend, refund, delete)
- **C-WA-08** No bulk delete in UI (only via runbook + DBA)
- **C-WA-09** Test stack: Vitest + Playwright
- **C-WA-10** State: React Query + Zustand

### 8.2 Assumptions

- **A-WA-01** SSO provider procured by Phase 1 Week 2
- **A-WA-02** Audit log infrastructure (immutable storage) provisioned
- **A-WA-03** Hardware MFA tokens issued (Yubikey or platform authenticator)

## 9. Dependencies

| ID | Depends on | For |
|----|-----------|-----|
| D-WA-01 | identity (SSO, RBAC, user CRUD, audit) | Auth + user mgmt |
| D-WA-02 | learning (catalog, content, moderation API, AI Gateway control) | Moderation + exam config + AI control |
| D-WA-03 | marketplace (tutor apps, KYC, disputes) | Marketplace ops |
| D-WA-04 | payment (subs, refunds, MRR) | Billing ops |
| D-WA-05 | engagement (broadcasts) | Broadcast |
| D-WA-06 | Feature flag platform (per ADR-0001) | Flag UI |
| D-WA-07 | LGTM observability stack | Health dashboards |
| D-WA-08 | SSO provider (Okta/Google Workspace) | Auth |
| D-WA-09 | Audit log infra (e.g. CloudTrail-style append-only) | Audit |

## 10. Risks

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R-WA-01 | Compromised admin account → mass user data leak | Low | Critical | Hardware MFA + IP allowlist + impersonation audit |
| R-WA-02 | Moderation queue backlog blows SLA | Med | High | Burst capacity + AI-pre-triage |
| R-WA-03 | Feature flag mis-toggle (global outage) | Med | High | Two-step confirm + auto-rollback on error rate spike |
| R-WA-04 | Refund issued to wrong account | Low | High | Two-step confirm + audit |
| R-WA-05 | Audit log tampered | Low | Critical | Append-only storage + hash chain + offline backup |

## 11. Success Criteria

Web-admin Phase 1 **Done** when:

1. All P0 stories shipped
2. NFRs verified
3. SSO + MFA + audit live
4. Mod queue handles 200 items/day with < 24 hr SLA
5. Feature flag UI used to gate every Phase 2 capability
6. Audit log searchable, exportable, retention tested
7. Pen-test passed (admin surface critical)

## 12. Open Questions

| # | Question | Owner | Resolve By |
|---|----------|-------|------------|
| OQ-WA-01 | SSO provider — Okta vs Google Workspace vs custom | DevOps + Security | Phase 1 Week 1 |
| OQ-WA-02 | Audit retention — 90 d / 1 yr / forever | Compliance | Phase 1 Week 2 |
| OQ-WA-03 | Moderation SLA enforcement: hard block (queue full) vs soft alert | Product + Mod Lead | Phase 1 Week 4 |
| OQ-WA-04 | Impersonation policy: full session (write) vs read-only "view as" | Security + Product | Phase 1 Week 2 |
| OQ-WA-05 | Bulk actions UX: in-app vs script-only | Product | Phase 2 |
| OQ-WA-06 | Custom dashboard builder: Phase 2 or 3 | Product | Phase 2 kickoff |
| OQ-WA-07 | Multi-tenant data partitioning visibility in UI | Architecture | Phase 2 |
| OQ-WA-08 | Mobile-friendly admin (responsive vs separate) | Design | Phase 2 |

## 13. Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | _Pending_ | | |
| Frontend Lead | _Pending_ | | |
| Security Lead | _Pending_ | | |
| Compliance | _Pending_ | | |
| QA Lead | _Pending_ | | |
