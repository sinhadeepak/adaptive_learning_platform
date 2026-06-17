# Non-Functional Requirements — Platform-Wide

**Anchored to:** [Master BRD §6](../02_master_brd/master_brd.md#6-non-functional-requirements-summary)

Surface-specific NFRs are in each app/service's `01_brd.md` §7. This document is the **platform-wide** floor — every surface must meet or exceed.

ID convention: `NFR-PLAT-<NN>`. ISO 25010 quality category in parens.

---

## Performance (ISO 25010 — Performance Efficiency)

| ID | Requirement | Target (Phase 1) | Target (Phase 2) | Verification |
|----|-------------|------------------|------------------|--------------|
| NFR-PLAT-01 | API p95 latency (read) | < 300 ms | < 200 ms | k6 load test in CI; RUM in prod |
| NFR-PLAT-02 | API p95 latency (write) | < 500 ms | < 300 ms | same |
| NFR-PLAT-03 | API p99 latency | < 1.5 s | < 800 ms | same |
| NFR-PLAT-04 | Quiz answer-ack p95 | < 200 ms | < 150 ms | quiz service load test |
| NFR-PLAT-05 | Battle answer-ack p99 | < 150 ms | < 100 ms | battle WS chaos test |
| NFR-PLAT-06 | Readiness Score recompute | < 500 ms | < 300 ms | learning unit + integration |
| NFR-PLAT-07 | Web LCP (4G) | < 2.5 s | < 2.0 s | Lighthouse CI on every PR |
| NFR-PLAT-08 | Mobile cold start | < 2.0 s | < 1.5 s | Firebase Performance |

## Scalability

| ID | Requirement | Phase 1 | Phase 5 (longterm) |
|----|-------------|---------|--------------------|
| NFR-PLAT-09 | Concurrent users | 10,000 | 1,000,000 |
| NFR-PLAT-10 | Quiz sessions/sec | 500 | 50,000 |
| NFR-PLAT-11 | Battle concurrent | 1,000 | 100,000 |
| NFR-PLAT-12 | Horizontal scale | Karpenter autoscale on EKS | — |

## Availability (ISO 25010 — Reliability)

| ID | Requirement | Phase 1 | Phase 2 |
|----|-------------|---------|---------|
| NFR-PLAT-13 | Overall API uptime | 99.9% | 99.95% |
| NFR-PLAT-14 | Identity availability | 99.95% | 99.99% (auth blocks everything) |
| NFR-PLAT-15 | RPO | 15 min | 5 min |
| NFR-PLAT-16 | RTO | 1 hr | 30 min |
| NFR-PLAT-17 | Multi-AZ for Aurora, Redis | required | required |
| NFR-PLAT-18 | Graceful degradation | AI Gateway down ≠ platform down | AI features degrade to cached/heuristic |

## Security (ISO 25010 — Security)

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PLAT-19 | TLS in transit | 1.3 minimum; HSTS preload |
| NFR-PLAT-20 | Encryption at rest | AES-256 (Aurora, S3, Redis snapshot) |
| NFR-PLAT-21 | Field-level encryption | PII (email, phone, KYC data) |
| NFR-PLAT-22 | Auth | OAuth2 + JWT + refresh rotation |
| NFR-PLAT-23 | Password hashing | bcrypt cost ≥ 12 |
| NFR-PLAT-24 | Token lifetime | access 15 min · refresh 30 d sliding |
| NFR-PLAT-25 | Refresh token rotation | every use; replay detection |
| NFR-PLAT-26 | Rate limiting | per-IP and per-user; differentiated by endpoint class |
| NFR-PLAT-27 | OWASP ASVS | L2 minimum |
| NFR-PLAT-28 | Dependency scanning | Snyk / Trivy in CI; high/critical fails build |
| NFR-PLAT-29 | Secrets management | AWS Secrets Manager; no plaintext in repo |
| NFR-PLAT-30 | Pen-test | Annual + before each major release |
| NFR-PLAT-31 | DDoS protection | CloudFront + WAF |
| NFR-PLAT-32 | CSP | `default-src 'self'`; nonces for inline; no `unsafe-inline` |

## Compliance

| ID | Requirement | Region |
|----|-------------|--------|
| NFR-PLAT-33 | DPDPA (Digital Personal Data Protection Act) | India — Phase 1 mandatory |
| NFR-PLAT-34 | GDPR | Phase 2 (when expanding outside India) |
| NFR-PLAT-35 | PCI-DSS | Stripe-tokenised; we never touch PANs |
| NFR-PLAT-36 | Child protection (DPDPA §9) | Parental consent flow for < 18 |
| NFR-PLAT-37 | Right to deletion | 30-day soft delete + permanent purge job |
| NFR-PLAT-38 | Right to data export | "Download my data" within 7 days |
| NFR-PLAT-39 | Data residency | India primary (ap-south-1); Phase 2 multi-region |
| NFR-PLAT-40 | Cookie consent | EU + India compliant banner Phase 2 |

## Usability (ISO 25010 — Usability)

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PLAT-41 | WCAG | 2.1 AA across all student-facing surfaces |
| NFR-PLAT-42 | Keyboard | Every action reachable without mouse |
| NFR-PLAT-43 | Screen reader | NVDA + VoiceOver pass on top 10 journeys |
| NFR-PLAT-44 | Languages | en + hi at launch; 5+ by Phase 3 |
| NFR-PLAT-45 | Click targets | ≥ 44 × 44 px |
| NFR-PLAT-46 | Motion-reduce | `prefers-reduced-motion` honoured |
| NFR-PLAT-47 | Font scaling | Up to 200% without layout break |
| NFR-PLAT-48 | Onboarding completion | ≥ 80% of started funnels finish screening |

## Maintainability (ISO 25010 — Maintainability)

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PLAT-49 | Code coverage | ≥ 80% unit · ≥ 60% integration |
| NFR-PLAT-50 | Static analysis | ruff + mypy strict (Python); golangci-lint (Go); eslint + ts-strict (web); dart analyze (Flutter) |
| NFR-PLAT-51 | API versioning | `/v1/...` prefix; backwards-compatible additions only |
| NFR-PLAT-52 | OpenAPI 3.1 | Every REST endpoint documented |
| NFR-PLAT-53 | ADR coverage | Every significant decision has an ADR before code |
| NFR-PLAT-54 | Service boundaries | Honour ADR-0005 ceiling (6); new domain = module |

## Observability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PLAT-55 | Distributed tracing | OpenTelemetry across all services + web SDK |
| NFR-PLAT-56 | Metrics | Prometheus / Mimir; RED + USE per service |
| NFR-PLAT-57 | Logs | Structured JSON; Loki retention 30 d |
| NFR-PLAT-58 | Dashboards | RED + business KPIs per service in Grafana |
| NFR-PLAT-59 | Alerting | SLO burn-rate alerts; on-call rotation |
| NFR-PLAT-60 | Error tracking | Sentry (web + mobile + backend) |
| NFR-PLAT-61 | Frontend RUM | Real user metrics dashboard live |

## Cost Efficiency

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PLAT-62 | Infra cost per MAU | < ₹40 (Phase 1) · < ₹15 (Phase 5) |
| NFR-PLAT-63 | AI Gateway cost | Per-tenant + per-feature hard caps |
| NFR-PLAT-64 | Egress | CDN cached; minimise S3 → client egress |

## Portability / Compatibility

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PLAT-65 | Browser matrix | Chrome/Edge/Firefox/Safari last 2 majors |
| NFR-PLAT-66 | Mobile OS | iOS 14+ · Android API 24+ |
| NFR-PLAT-67 | Cloud-agnostic (long term) | Avoid AWS-only services where alternative exists (e.g. prefer Postgres over DynamoDB) |

---

## Verification Matrix

| NFR Class | Owner | Frequency |
|-----------|-------|-----------|
| Performance | SRE + each squad | Per release + continuous |
| Security | SecEng + DevOps | Annual pen-test + per release scan |
| Compliance | Legal + Eng | Annual audit |
| Usability | Design + QA | Per release |
| Maintainability | Tech Lead | Continuous |
| Observability | SRE | Continuous |
| Cost | Finance + SRE | Monthly review |
