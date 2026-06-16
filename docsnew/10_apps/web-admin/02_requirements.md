# Requirements Catalogue — web-admin (Vidya Admin)

**Anchored to:** [BRD §6](./01_brd.md#6-functional-areas) · [Master BRD §5.1.3](../../00_platform/02_master_brd/master_brd.md#513-web-admin-vidya-admin)

**ID convention:** `FR-WA-<FA>-<NN>`

---

## FA-01 — Admin Auth (SSO)

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-01-01 | SSO login via configured provider (OQ-WA-01) | P0 | 1 | identity + SSO |
| FR-WA-01-02 | Hardware MFA required at first sign-in (TOTP or FIDO2/WebAuthn) | P0 | 1 | identity |
| FR-WA-01-03 | Idle timeout 15 min, absolute 8 hr | P0 | 1 | identity |
| FR-WA-01-04 | IP allowlist enforcement (configurable) | P1 | 1 | identity + edge |
| FR-WA-01-05 | Sign out (revoke server-side) | P0 | 1 | identity |
| FR-WA-01-06 | Re-auth required for sensitive actions (refund, suspend) | P0 | 1 | identity |

## FA-02 — User Management

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-02-01 | Search users by email, phone, ID, name | P0 | 1 | identity |
| FR-WA-02-02 | View user profile (read-only mirror) | P0 | 1 | identity + learning |
| FR-WA-02-03 | Suspend user (with reason, duration optional) | P0 | 1 | identity |
| FR-WA-02-04 | Unsuspend user | P0 | 1 | identity |
| FR-WA-02-05 | Force password reset (sends email) | P0 | 1 | identity |
| FR-WA-02-06 | View user's recent sessions/devices | P0 | 1 | identity |
| FR-WA-02-07 | Revoke user device/session | P0 | 1 | identity |
| FR-WA-02-08 | Initiate account deletion (DPDPA) | P0 | 1 | identity |
| FR-WA-02-09 | **Impersonate** with reason; auto-audit; banner; 30-min expire | P1 | 2 | identity (special API) |
| FR-WA-02-10 | View user's subscription state | P0 | 1 | payment |
| FR-WA-02-11 | Send password-reset link copy to clipboard (for support call) | P0 | 1 | identity |
| FR-WA-02-12 | Flag user as VIP (priority queue for support) | P2 | 2 | identity |

## FA-03 — Content Moderation

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-03-01 | Moderation queue filterable by status / type / author / topic | P0 | 1 | learning |
| FR-WA-03-02 | Take next item from queue (round-robin lock) | P0 | 1 | learning |
| FR-WA-03-03 | Approve item | P0 | 1 | learning |
| FR-WA-03-04 | Reject item with reason | P0 | 1 | learning |
| FR-WA-03-05 | Request revision with feedback | P0 | 1 | learning |
| FR-WA-03-06 | Auto-save mid-review state (don't lose on refresh) | P0 | 1 | local |
| FR-WA-03-07 | View author's history (acceptance rate) | P0 | 1 | learning |
| FR-WA-03-08 | Kappa drift dashboard (per criterion) | P1 | 2 | learning |
| FR-WA-03-09 | AI Gateway auto-pause alert + override | P0 | 1 | learning |
| FR-WA-03-10 | Re-assign item to another moderator | P1 | 2 | learning |
| FR-WA-03-11 | Bulk-approve trusted-author items (with safeguard) | P2 | 2 | learning |
| FR-WA-03-12 | SLA timer per item (24 hr default) | P0 | 1 | learning |
| FR-WA-03-13 | Queue burst-capacity dashboard | P1 | 2 | learning |

## FA-04 — Exam & Blueprint Config

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-04-01 | Create exam (NEET/JEE/UPSC/CBSE-N) | P0 | 1 | learning |
| FR-WA-04-02 | Edit exam metadata | P0 | 1 | learning |
| FR-WA-04-03 | Manage syllabus tree (subjects/topics/concepts) | P0 | 1 | learning |
| FR-WA-04-04 | Create / edit blueprint per ADR-0012 | P0 | 1 | learning |
| FR-WA-04-05 | PYQ ingestion (file upload) | P0 | 1 | learning |
| FR-WA-04-06 | Versioning of syllabus changes | P1 | 2 | learning |
| FR-WA-04-07 | Preview as student | P1 | 2 | learning |

## FA-05 — Institution Management (Phase 2)

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-05-01 | Create institution (name, contract terms) | P1 | 2 | identity (inst ctx) |
| FR-WA-05-02 | Seat license CRUD | P1 | 2 | payment + identity |
| FR-WA-05-03 | Assign institution admin (Rahul-like) | P1 | 2 | identity RBAC |
| FR-WA-05-04 | Batch / cohort CRUD | P1 | 2 | learning |
| FR-WA-05-05 | Batch dashboards (read-only) | P1 | 2 | learning |
| FR-WA-05-06 | Bulk seat invite via CSV | P1 | 2 | identity |
| FR-WA-05-07 | Institution-level reporting | P2 | 2 | learning |

## FA-06 — Marketplace Ops

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-06-01 | Tutor application queue | P1 | 2 | marketplace |
| FR-WA-06-02 | Approve/reject tutor application | P1 | 2 | marketplace |
| FR-WA-06-03 | Review KYC status (read-only of Stripe Identity) | P1 | 2 | marketplace |
| FR-WA-06-04 | Open disputes queue | P1 | 2 | marketplace + payment |
| FR-WA-06-05 | Resolve dispute (refund / partial / deny) | P1 | 2 | marketplace + payment |
| FR-WA-06-06 | Ban tutor (with reason + effects) | P1 | 2 | marketplace |
| FR-WA-06-07 | Pricing band configuration | P1 | 2 | marketplace |
| FR-WA-06-08 | Payout failure dashboard + retry | P1 | 2 | payment |

## FA-07 — Billing Ops

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-07-01 | Subscription search/filter | P0 | 1 | payment |
| FR-WA-07-02 | View subscription detail + history | P0 | 1 | payment |
| FR-WA-07-03 | Issue refund (full/partial) | P0 | 1 | payment |
| FR-WA-07-04 | Cancel subscription (admin override) | P0 | 1 | payment |
| FR-WA-07-05 | Dispute dashboard | P0 | 1 | payment |
| FR-WA-07-06 | MRR / ARR snapshot | P0 | 1 | payment |
| FR-WA-07-07 | Retention dashboard | P1 | 2 | payment |
| FR-WA-07-08 | Failed-charge dashboard | P0 | 1 | payment |
| FR-WA-07-09 | Coupon / discount CRUD | P2 | 2 | payment |

## FA-08 — Feature Flag Management

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-08-01 | List all flags | P0 | 1 | flag platform |
| FR-WA-08-02 | Toggle flag (on/off) | P0 | 1 | flag platform |
| FR-WA-08-03 | Set rollout % (0–100) | P0 | 1 | flag platform |
| FR-WA-08-04 | Target by tenant / cohort | P0 | 1 | flag platform |
| FR-WA-08-05 | Flag change history (audit) | P0 | 1 | flag platform |
| FR-WA-08-06 | Two-step confirm on prod flag changes | P0 | 1 | local |
| FR-WA-08-07 | Auto-rollback on error spike (Phase 2) | P1 | 2 | flag + observability |

## FA-09 — Platform Health

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-09-01 | Service SLO dashboard (RED + USE) per service | P0 | 1 | LGTM |
| FR-WA-09-02 | Error rate dashboard | P0 | 1 | LGTM |
| FR-WA-09-03 | Latency dashboard (p50/p95/p99) | P0 | 1 | LGTM |
| FR-WA-09-04 | Cost-per-MAU dashboard | P1 | 2 | finance + LGTM |
| FR-WA-09-05 | Alert feed | P0 | 1 | LGTM |
| FR-WA-09-06 | Service status indicator on top bar | P0 | 1 | LGTM |

## FA-10 — Broadcast

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-10-01 | Compose broadcast (rich text) | P1 | 2 | engagement |
| FR-WA-10-02 | Target audience (all / exam / role / cohort / tenant) | P1 | 2 | engagement |
| FR-WA-10-03 | Schedule | P1 | 2 | engagement |
| FR-WA-10-04 | Preview | P1 | 2 | local |
| FR-WA-10-05 | Send / cancel scheduled | P1 | 2 | engagement |
| FR-WA-10-06 | Broadcast history + deliverability metrics | P1 | 2 | engagement |

## FA-11 — Audit Log

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-11-01 | Search audit log by actor / action / target | P0 | 1 | identity + all services |
| FR-WA-11-02 | Filter by time range | P0 | 1 | identity |
| FR-WA-11-03 | Export results (CSV/JSON) | P1 | 1 | identity |
| FR-WA-11-04 | Audit retention enforcement (per policy) | P0 | 1 | identity |
| FR-WA-11-05 | Tamper-evident log (hash chain) | P0 | 1 | identity |
| FR-WA-11-06 | View own audit log (admin self-view) | P1 | 1 | identity |

## FA-12 — AI Gateway Control

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-12-01 | View AI Gateway status (per touchpoint × provider) | P0 | 1 | learning |
| FR-WA-12-02 | Override auto-pause | P0 | 1 | learning |
| FR-WA-12-03 | Switch provider (Anthropic ↔ OpenAI ↔ Google ↔ Llama) | P0 | 1 | learning |
| FR-WA-12-04 | Cost cap per touchpoint | P0 | 1 | learning |
| FR-WA-12-05 | Kappa threshold per criterion | P0 | 1 | learning |
| FR-WA-12-06 | View call volume + cost trend | P1 | 2 | learning |
| FR-WA-12-07 | Kappa drift alerts | P0 | 1 | learning |

## FA-13 — Settings

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WA-13-01 | Profile | P0 | 1 | identity |
| FR-WA-13-02 | MFA management | P0 | 1 | identity |
| FR-WA-13-03 | Language | P3 | 3 | local |

---

## Cross-Cutting

| ID | Requirement | P |
|----|-------------|---|
| FR-WA-XC-01 | Forms via Zod | P0 |
| FR-WA-XC-02 | Idempotent mutations | P0 |
| FR-WA-XC-03 | RBAC at UI level (hide actions user can't perform) | P0 |
| FR-WA-XC-04 | Error boundary | P0 |
| FR-WA-XC-05 | Two-step confirm on destructive | P0 |
| FR-WA-XC-06 | Toast system | P0 |
| FR-WA-XC-07 | Cursor pagination | P0 |
| FR-WA-XC-08 | Impersonation banner | P0 |
| FR-WA-XC-09 | "Admin" badge on top bar | P0 |
| FR-WA-XC-10 | Sentry + OTel | P0 |
| FR-WA-XC-11 | Lighthouse / a11y / bundle gates | P0 |
| FR-WA-XC-12 | Feature flag client | P0 |
