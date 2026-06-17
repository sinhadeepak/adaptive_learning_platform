# Phase 1 Launch Checklist

**Status:** DRAFT v0.1 · 2026-05-27
**Anchored to:** Master BRD §11 · Roadmap §10 · `docs/05_launch/Go-Live_Checklist.docx`

Each item must be checked before Phase 1 go-live. Owner column shows who signs off.

---

## 1. Architecture & Documentation

| ✓ | Item | Owner |
|---|------|-------|
| ⬜ | All 11 per-surface BRDs signed off | Product + Tech Lead |
| ⬜ | Master BRD signed off | Business Owner |
| ⬜ | All OQs in §12 of each BRD resolved or explicitly deferred | Tech Lead |
| ⬜ | All ADRs accepted (Phase 1 set) | Tech Lead |
| ⬜ | OQ-EN-00 (service ceiling) ADR-resolved | Architecture |
| ⬜ | OQ-WA-01 (SSO provider) chosen | DevOps + Security |
| ⬜ | OQ-MB-01 (iOS payments) decided | Product + Legal |

## 2. Code & Build

| ✓ | Item | Owner |
|---|------|-------|
| ⬜ | All 7 services have OpenAPI 3.1 published + JWT validate lib integrated | BE leads |
| ⬜ | All 4 apps using Vidya v3 design tokens (lint enforced) | FE + Design |
| ⬜ | CI passing on `main` for all surfaces | DevOps |
| ⬜ | Lighthouse ≥ 90 perf / 95 a11y on web-student + web-admin Home + critical routes | FE + QA |
| ⬜ | Mobile crash-free rate ≥ 99.5% in 1-week soak (TestFlight + Play Internal) | Mobile + QA |
| ⬜ | APK ≤ 30 MB · IPA ≤ 40 MB | Mobile |
| ⬜ | Bundle budget gates green (initial JS < 200 KB gz) | FE |
| ⬜ | Code coverage ≥ 80% unit / 60% integration | QA |

## 3. Database & Storage

| ✓ | Item | Owner |
|---|------|-------|
| ⬜ | All 8 schemas migrated to prod | DevOps |
| ⬜ | Per-service DB roles configured (least privilege) | DevOps |
| ⬜ | Multi-AZ Aurora live; backup verified by restore drill | DevOps |
| ⬜ | Redis cluster live with replicas | DevOps |
| ⬜ | OpenSearch cluster indexed with seed content | DevOps + Content |
| ⬜ | S3 buckets configured with proper ACLs + lifecycle | DevOps |
| ⬜ | CloudFront live for content media | DevOps |
| ⬜ | NATS JetStream streams configured per integration matrix | DevOps |

## 4. Security & Compliance

| ✓ | Item | Owner |
|---|------|-------|
| ⬜ | Pen-test passed (CRITICAL) — no Critical/High open | Security |
| ⬜ | OWASP ASVS L2 self-assessment | Security |
| ⬜ | TLS 1.3 enforced everywhere; HSTS preload | DevOps |
| ⬜ | JWT signing key in KMS; rotation drill done | DevOps + Security |
| ⬜ | Stripe webhook signing secret in KMS; rotation drill done | DevOps + Security |
| ⬜ | Audit log tamper-evident verified (hash chain check) | Security |
| ⬜ | Audit log immutable S3 copy live (object lock) | DevOps |
| ⬜ | DPDPA compliance attestation | Compliance |
| ⬜ | "Download my data" + delete account verified end-to-end | Compliance + QA |
| ⬜ | Privacy policy + ToS live and linked from auth pages | Legal |
| ⬜ | Cookie consent (where applicable) | Legal |
| ⬜ | Dependency scanning green (Snyk/Trivy) — no critical | DevOps |
| ⬜ | PCI-DSS scope attestation (Stripe-tokenised, minimal scope) | Compliance |
| ⬜ | Parental consent flow (under-18 per DPDPA §9) — at least UX scaffolded | Compliance + Product |

## 5. Observability

| ✓ | Item | Owner |
|---|------|-------|
| ⬜ | OTel tracing live across all services + web + mobile | DevOps |
| ⬜ | Sentry (web + mobile + backend) live in prod | DevOps |
| ⬜ | RUM dashboard live for web + mobile | DevOps + FE/Mobile |
| ⬜ | Prometheus/Mimir metrics with RED + USE per service | DevOps |
| ⬜ | Loki logs retention 30 d configured | DevOps |
| ⬜ | Grafana SLO dashboards live in web-admin | DevOps + FE |
| ⬜ | SLO burn-rate alerts wired to on-call rotation | DevOps |
| ⬜ | Per-touchpoint AI Gateway cost dashboard live | Learning + DevOps |
| ⬜ | Per-channel notification delivery dashboard live | Engagement + DevOps |
| ⬜ | Webhook event-type latency dashboard (payment) live | Payment + DevOps |

## 6. Resilience & DR

| ✓ | Item | Owner |
|---|------|-------|
| ⬜ | DR rehearsal: kill primary Aurora → failover → verify | DevOps |
| ⬜ | Restore from snapshot drill done | DevOps |
| ⬜ | Chaos test: kill identity pod → JWT validate fallback verified | DevOps + QA |
| ⬜ | Chaos test: kill quiz pod mid-session → resume verified | DevOps + QA |
| ⬜ | Chaos test: Stripe webhook duplicate event → idempotent | Payment + QA |
| ⬜ | Chaos test: NATS down → producer retains; consumer replays on recovery | DevOps + QA |
| ⬜ | Force-update gate tested on mobile | Mobile + QA |
| ⬜ | Runbooks for: identity outage, learning outage, quiz outage, payment outage, NATS outage | Tech Lead + Squad leads |

## 7. Performance

| ✓ | Item | Owner |
|---|------|-------|
| ⬜ | Load test 10K concurrent users — p95 targets met (NFR-PLAT-01..08) | QA + DevOps |
| ⬜ | Quiz answer-ack p95 < 100 ms at 1000 concurrent | QA + DevOps |
| ⬜ | Mock test 1000 concurrent | QA + DevOps |
| ⬜ | Mobile cold-start P50 < 2 s on Pixel 4a | Mobile + QA |
| ⬜ | Web LCP < 2.5 s on 4G | FE + QA |
| ⬜ | Recommendation p95 < 100 ms | Learning + QA |
| ⬜ | Entitlement flip p95 < 60 s | Payment + QA |
| ⬜ | Webhook replay test (10× same event) → idempotent | Payment + QA |

## 8. Content & Configuration

| ✓ | Item | Owner |
|---|------|-------|
| ⬜ | Initial item seed loaded (1000 NEET / 1000 JEE / 500 UPSC items) | Content |
| ⬜ | All items moderation-approved | Content + Moderation |
| ⬜ | Blueprints configured for each exam | Content |
| ⬜ | Catalog indexed in OpenSearch | Content + DevOps |
| ⬜ | Email templates rendered + i18n verified (en + hi) | Engagement + Design |
| ⬜ | Push template rendered (FCM + APNS) | Engagement + Mobile |

## 9. Integrations

| ✓ | Item | Owner |
|---|------|-------|
| ⬜ | Stripe India merchant approved + LIVE keys configured | Finance + DevOps |
| ⬜ | Stripe webhook endpoint live + verified | Payment + DevOps |
| ⬜ | Twilio (SMS) live + cost cap configured | DevOps + Finance |
| ⬜ | SendGrid / SES live + sender domain verified | DevOps |
| ⬜ | FCM + APNS keys configured | Mobile + DevOps |
| ⬜ | LLM provider API keys live in KMS (Anthropic + OpenAI minimum; fallback configured) | DevOps + Learning |
| ⬜ | (Phase 2 prep) Stripe Connect, Stripe Identity, Daily.co accounts ready | Marketplace + Finance |

## 10. Mobile-Specific

| ✓ | Item | Owner |
|---|------|-------|
| ⬜ | Apple Developer + Google Play Console accounts active | DevOps |
| ⬜ | Privacy nutrition labels + data-safety form completed | Mobile + Legal |
| ⬜ | Apple App Review pass on first submission | Mobile |
| ⬜ | Google Play 10%→50%→100% staged rollout configured | Mobile |
| ⬜ | Min-supported-version gate tested | Mobile + QA |
| ⬜ | Force-update banner copy live | Mobile + Product |

## 11. Beta & Launch Communications

| ✓ | Item | Owner |
|---|------|-------|
| ⬜ | 4-week closed beta with 100 pilot users | Product |
| ⬜ | < 2 P1 issues outstanding from beta | QA + Product |
| ⬜ | Marketing site live (separate workstream) | Marketing |
| ⬜ | Launch announcement plan | Marketing |
| ⬜ | Support docs / FAQ live | Support |
| ⬜ | Support team trained (impersonation, suspend, refund flows) | Support + Eng |
| ⬜ | Roll-back plan documented + rehearsed | Tech Lead + DevOps |

## 12. Final Sign-offs

| Role | Name | Date | Status |
|------|------|------|--------|
| Business Owner | _Pending_ | | |
| Product Owner | _Pending_ | | |
| Tech Lead | _Pending_ | | |
| Design Lead | _Pending_ | | |
| QA Lead | _Pending_ | | |
| DevOps Lead | _Pending_ | | |
| Security | _Pending_ | | |
| Compliance | _Pending_ | | |
| Finance | _Pending_ | | |

---

**Launch is GO when all items checked + all sign-offs above.**
