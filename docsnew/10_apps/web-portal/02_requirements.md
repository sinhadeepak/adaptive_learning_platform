# Requirements Catalogue — web-portal (Vidya Portal)

**Anchored to:** [BRD §6](./01_brd.md#6-functional-areas) · [Master BRD §5.1.2](../../00_platform/02_master_brd/master_brd.md#512-web-portal-vidya-portal)

**ID convention:** `FR-WP-<FA>-<NN>` · NFRs in [BRD §7](./01_brd.md#7-non-functional-requirements)

---

## FA-01 — Auth & Expert Onboarding

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-01-01 | Sign up as expert (intent = expert during signup) | P0 | 1 | identity |
| FR-WP-01-02 | Sign in (email/password + OAuth) | P0 | 1 | identity |
| FR-WP-01-03 | Role bootstrapping: new expert lands in "pending application" state | P0 | 1 | identity |
| FR-WP-01-04 | Submit application: subjects, qualifications, sample work | P0 | 1 | marketplace |
| FR-WP-01-05 | Application status visible to user | P0 | 1 | marketplace |
| FR-WP-01-06 | Admin approval transitions expert to `active` | P0 | 1 | identity (transition) + marketplace |
| FR-WP-01-07 | Sign out, refresh, password reset (same as web-student) | P0 | 1 | identity |
| FR-WP-01-08 | Device list + revoke | P1 | 1 | identity |
| FR-WP-01-09 | Account deletion (with payout reconciliation block) | P0 | 2 | identity + payment |

## FA-02 — KYC

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-02-01 | Start KYC via Stripe Identity (link out / embedded) | P0 | 1 | marketplace + Stripe Identity |
| FR-WP-02-02 | Show KYC status (not_started / in_progress / verified / rejected) | P0 | 1 | marketplace |
| FR-WP-02-03 | On rejection, show actionable reason + retry CTA | P0 | 2 | marketplace |
| FR-WP-02-04 | Re-verify annual (OQ-WP-02 — interval) | P1 | 2 | marketplace |
| FR-WP-02-05 | No payouts permitted until KYC = verified | P0 | 2 | marketplace + payment |
| FR-WP-02-06 | Webhook from Stripe Identity reflects in UI within 60 s | P0 | 2 | marketplace |

## FA-03 — Single-Item Authoring

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-03-01 | Pick question type (one of 22 per ADR-0018) | P0 | 1 (subset) / 2 (all) | learning |
| FR-WP-03-02 | Type-specific editor renders correctly (delegated to Type Handler) | P0 | 1 | learning |
| FR-WP-03-03 | Rich text + LaTeX (KaTeX render) | P0 | 1 | local |
| FR-WP-03-04 | Image upload (≤ 5 MB, resize server-side) | P0 | 1 | learning + S3 |
| FR-WP-03-05 | Video embed (YouTube/Vimeo URL) | P0 | 1 | local |
| FR-WP-03-06 | Multi-part items (max 10 parts) | P0 | 1 | learning |
| FR-WP-03-07 | Tag with concept(s), Bloom level, difficulty, exam(s) | P0 | 1 | learning |
| FR-WP-03-08 | Preview (renders exactly as student sees) | P0 | 1 | local |
| FR-WP-03-09 | Save as draft (auto-save every 30 s) | P0 | 1 | learning |
| FR-WP-03-10 | Submit for moderation | P0 | 1 | learning + moderation queue |
| FR-WP-03-11 | View moderation outcome (accepted / rejected / revise) | P0 | 1 | learning + admin |
| FR-WP-03-12 | Resubmit after revision | P0 | 1 | learning |
| FR-WP-03-13 | Withdraw a draft | P1 | 1 | learning |

## FA-04 — AI Draft Panel (Phase 2 onwards)

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-04-01 | "Draft with AI" CTA on author screen | P1 | 2 | learning (AI Gateway) |
| FR-WP-04-02 | AI prompt seed: topic + difficulty + Bloom level + type | P1 | 2 | learning |
| FR-WP-04-03 | AI returns draft within 8 s p95 | P1 | 2 | learning |
| FR-WP-04-04 | Author edits before submit (never auto-submit) | P0 | 2 | learning |
| FR-WP-04-05 | Show provider + model used (for transparency) | P1 | 2 | learning |
| FR-WP-04-06 | Per-user daily AI draft quota | P1 | 2 | learning + flags |
| FR-WP-04-07 | AI usage tracked against author's quota | P1 | 2 | learning |
| FR-WP-04-08 | AI draft marked in metadata (for kappa analytics) | P0 | 2 | learning |

## FA-05 — Bulk Authoring

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-05-01 | Download CSV template per question type | P0 | 1 | learning |
| FR-WP-05-02 | Upload CSV; client-side preview | P0 | 1 | local |
| FR-WP-05-03 | Server-side validation (schema + content rules) | P0 | 1 | learning |
| FR-WP-05-04 | Validation report: errors per row + downloadable | P0 | 1 | learning |
| FR-WP-05-05 | Dryrun (validate but don't ingest) | P0 | 1 | learning |
| FR-WP-05-06 | Commit ingest creates batch; each item enters moderation | P0 | 1 | learning |
| FR-WP-05-07 | Batch status tracker (queued / in moderation / accepted / partial) | P0 | 1 | learning |
| FR-WP-05-08 | Max 1000 items per batch Phase 1; 5000 Phase 2 | P0 | 1 | learning |
| FR-WP-05-09 | Excel (.xlsx) support | P1 | 2 | learning |

## FA-06 — Quality Dashboards

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-06-01 | Acceptance rate (own items, monthly) | P0 | 1 | learning + admin |
| FR-WP-06-02 | Revision rate | P0 | 1 | learning |
| FR-WP-06-03 | Drill-in to rejected items with reasons | P0 | 1 | learning |
| FR-WP-06-04 | Cohen's kappa per criterion (OQ-WP-09 — author visibility) | P1 | 2 | learning |
| FR-WP-06-05 | Top topics authored | P1 | 2 | learning |
| FR-WP-06-06 | Trend chart (acceptance rate over time) | P1 | 2 | learning |
| FR-WP-06-07 | Comparison to peer avg (opt-in) | P2 | 2 | learning |

## FA-07 — Tutor Profile

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-07-01 | Edit bio (rich text, max 1500 chars) | P1 | 2 | marketplace |
| FR-WP-07-02 | Subjects taught (multi-select) | P1 | 2 | marketplace |
| FR-WP-07-03 | Languages spoken | P1 | 2 | marketplace |
| FR-WP-07-04 | Hourly rate (within band per ADR-0008) | P1 | 2 | marketplace |
| FR-WP-07-05 | Profile photo (max 2 MB, square crop) | P1 | 2 | marketplace |
| FR-WP-07-06 | Qualifications (multiple) | P1 | 2 | marketplace |
| FR-WP-07-07 | Public profile preview | P1 | 2 | marketplace |
| FR-WP-07-08 | Profile completion meter | P1 | 2 | marketplace |

## FA-08 — Availability Calendar

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-08-01 | Weekly recurring availability | P1 | 2 | marketplace |
| FR-WP-08-02 | Exceptions (one-off blackout) | P1 | 2 | marketplace |
| FR-WP-08-03 | Slot length config (30 / 60 / 90 min) | P1 | 2 | marketplace |
| FR-WP-08-04 | Lead time min (e.g. 4 hr before slot) | P1 | 2 | marketplace |
| FR-WP-08-05 | Time zone shown in user TZ | P0 | 2 | local |
| FR-WP-08-06 | iCal feed of upcoming bookings | P2 | 2 | marketplace |

## FA-09 — Live Session Mgmt

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-09-01 | Today's sessions panel on home | P1 | 2 | marketplace |
| FR-WP-09-02 | "Join" button activates T-5 min | P1 | 2 | marketplace |
| FR-WP-09-03 | Daily.co room embed (browser-supported) | P1 | 2 | Daily.co JS SDK |
| FR-WP-09-04 | Session notes (pre + post + saved with booking) | P1 | 2 | marketplace |
| FR-WP-09-05 | Session timer (countdown when live) | P1 | 2 | local |
| FR-WP-09-06 | Whiteboard (Phase 2 vs 3 — OQ-WP-05) | P2 | 2/3 | marketplace |
| FR-WP-09-07 | Auto-end after slot duration + grace | P1 | 2 | marketplace |
| FR-WP-09-08 | Mark no-show + claim partial pay | P1 | 2 | marketplace + payment |

## FA-10 — Earnings & Payouts

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-10-01 | Earnings dashboard (lifetime, this month) | P1 | 2 | payment |
| FR-WP-10-02 | Pending balance vs paid out | P1 | 2 | payment |
| FR-WP-10-03 | Payout history (date, amount, status) | P1 | 2 | payment |
| FR-WP-10-04 | Stripe Connect Express onboarding (link out) | P1 | 2 | payment + Stripe Connect |
| FR-WP-10-05 | Re-link if Connect account dropped | P1 | 2 | payment |
| FR-WP-10-06 | Tax docs (Form 16, 1099 equivalent — country dep) | P2 | 2 | payment |
| FR-WP-10-07 | Currency: INR Phase 1; other Phase 2 (OQ-WP-03) | P0 | 1/2 | payment |
| FR-WP-10-08 | Payout failed → notif + remediation steps | P0 | 2 | payment |

## FA-11 — Disputes

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-11-01 | Dispute list (open / resolved) | P1 | 2 | marketplace |
| FR-WP-11-02 | View dispute detail + student claim | P1 | 2 | marketplace |
| FR-WP-11-03 | Submit evidence (file + text) | P1 | 2 | marketplace |
| FR-WP-11-04 | Status updates (under review / resolved-tutor / resolved-student) | P1 | 2 | marketplace |
| FR-WP-11-05 | Resolution affects payout (hold / refund) | P1 | 2 | marketplace + payment |

## FA-12 — Author Analytics

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-12-01 | Items submitted/accepted/rejected (monthly) | P1 | 2 | learning |
| FR-WP-12-02 | Avg review time | P1 | 2 | learning |
| FR-WP-12-03 | Student engagement on my items (attempts, accuracy, time spent) | P1 | 2 | learning + quiz |
| FR-WP-12-04 | Top topics + earnings (for tutors) | P1 | 2 | learning + payment |

## FA-13 — Teacher Cohort View (Phase 2)

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-13-01 | List my assigned cohorts | P1 | 2 | identity (institution context) |
| FR-WP-13-02 | Read-only batch progress dashboard | P1 | 2 | learning + analytics |
| FR-WP-13-03 | Drill into a student (within own cohort) | P1 | 2 | learning |
| FR-WP-13-04 | Export cohort progress CSV | P2 | 2 | learning |
| FR-WP-13-05 | Permission strictly read-only (no impersonation) | P0 | 2 | identity RBAC |

## FA-14 — Settings

| ID | Requirement | P | Phase | Src |
|----|-------------|---|-------|-----|
| FR-WP-14-01 | Edit profile | P0 | 1 | identity |
| FR-WP-14-02 | Banking info (Stripe Connect link) | P1 | 2 | payment |
| FR-WP-14-03 | Re-verify KYC | P1 | 2 | marketplace |
| FR-WP-14-04 | Notification prefs | P1 | 1 | engagement |
| FR-WP-14-05 | Language (en/hi) | P0 | 1 | local |
| FR-WP-14-06 | A11y prefs | P0 | 1 | local |
| FR-WP-14-07 | Delete account (with payout block) | P0 | 2 | identity + payment |

---

## Cross-Cutting (FA-XC)

| ID | Requirement | P |
|----|-------------|---|
| FR-WP-XC-01 | Forms validate via Zod | P0 |
| FR-WP-XC-02 | Idempotent mutations | P0 |
| FR-WP-XC-03 | Auth-guarded routing with role check (expert/tutor) | P0 |
| FR-WP-XC-04 | Error boundary at route level | P0 |
| FR-WP-XC-05 | Skeleton / spinner thresholds | P0 |
| FR-WP-XC-06 | Empty states | P0 |
| FR-WP-XC-07 | Toast system | P0 |
| FR-WP-XC-08 | Pagination | P0 |
| FR-WP-XC-09 | Date/time in user TZ | P0 |
| FR-WP-XC-10 | Lazy-loaded route chunks | P0 |
| FR-WP-XC-11 | 44 px touch targets | P0 |
| FR-WP-XC-12 | Focus rings visible | P0 |
| FR-WP-XC-13 | i18n strings extracted (en + hi) | P0 |
| FR-WP-XC-14 | Sentry + OTel | P0 |
