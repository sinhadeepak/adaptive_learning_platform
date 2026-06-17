# Business Requirements Document — identity (service)

| | |
|---|---|
| **Service** | `services/identity` |
| **Tech** | Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2 · Alembic · bcrypt · pyjwt |
| **Schema** | `auth_schema` (Aurora Postgres 15) |
| **Doc Version** | 0.1 (DRAFT) |
| **Date** | 2026-05-27 |
| **Anchored to** | [Master BRD §5.2.1](../../00_platform/02_master_brd/master_brd.md#521-identity) |

---

## 1. Purpose

The `identity` service is the **foundation** every other service depends on. It owns:
- User accounts (lifecycle, profile basics, deletion)
- Authentication (password, OTP, social, biometric token bind)
- Authorisation (JWT issuance, RBAC, entitlements)
- Session/device management
- Audit logging for security events
- DPDPA compliance: download-my-data, deletion grace period

If identity goes down, the platform goes down. Treat it accordingly.

## 2. Scope

### 2.1 In Scope

| Domain | Capability |
|---|---|
| **Account lifecycle** | Signup, verify, activate, suspend, delete (soft + grace + purge) |
| **Authentication** | Password (bcrypt cost 12), email OTP, SMS OTP (Twilio), Google OAuth, Apple Sign In, biometric token bind |
| **Sessions** | JWT issuance, refresh-token rotation, replay detection, device binding |
| **RBAC** | Roles: student, expert, tutor, moderator, admin, super_admin, institution_admin |
| **Entitlements** | `premium`, `institution_seats`, `marketplace_payouts_enabled` — driven by payment + marketplace webhooks |
| **MFA** | TOTP enrollment (Phase 2 students; Phase 1 mandatory admins) |
| **Device mgmt** | List + revoke devices/sessions; biometric bind metadata |
| **Audit** | Security events (login, logout, password change, impersonate, delete) tamper-evident |
| **DPDPA** | Download my data (≤ 7 days); delete account with 30 d grace |
| **Admin operations** | Force-reset, impersonate-with-audit, suspend, unsuspend |
| **SSO (Phase 2)** | OIDC/SAML federation for institutions + internal admin |
| **Rate limiting** | Per-IP + per-user on auth endpoints |

### 2.2 Out of Scope

| Item | Lives In |
|---|---|
| Subscription/billing state | payment |
| Learning profile (exam, screening result, mastery) | learning |
| Institution business logic (seats, batch mgmt) | learning (institution context) for now |
| Notifications | engagement |
| Social profile (avatar choice, etc beyond signup) | learning (extended profile) |

### 2.3 Scope by Phase

| Phase | identity ships |
|---|---|
| **Phase 1 (M0–M6)** | Account lifecycle · Password + OTP + Google · JWT + refresh rotation · RBAC · Sessions + devices · Audit · DPDPA · Admin ops basics · Twilio + SES integrations · Rate limits |
| **Phase 2 (M6–M12)** | TOTP MFA · Apple Sign In · SSO (OIDC/SAML) for admin + institutions · Impersonation flow · Advanced audit (export) · Password breach API |
| **Phase 3+** | Passkeys (FIDO2) · Multi-region replication · Federated identity providers per-tenant |

---

## 3. Stakeholders

| Stakeholder | Role | Decision Authority |
|---|---|---|
| **Backend Lead** | Tech owner | Architecture |
| **Security Lead** | Threat model + sign-off | Auth standards |
| **Compliance** | DPDPA / audit | Retention policy |
| **All other service owners** | Consumers | API contract review |
| **DevOps** | Secrets, rotation, observability | Operability |

## 4. Personas (Service View)

This service has no end-user persona — every persona authenticates *through* it.

- **Caller persona 1**: front-end apps (web-student, mobile, web-portal, web-admin) — needs fast login, biometric, refresh.
- **Caller persona 2**: peer services — needs cheap JWT validation, role/entitlement claims.
- **Caller persona 3**: web-admin operators — needs user search, suspend, impersonate, audit.

## 5. Top Internal Journeys

| # | Journey | Triggered by | Critical |
|---|---------|--------------|----------|
| 1 | Signup → OTP → activated | App | Yes |
| 2 | Login → JWT issue | App | Yes |
| 3 | Token refresh | App (silent) | Yes |
| 4 | Force reset / suspend | Admin | Yes |
| 5 | Delete request | User | Yes |
| 6 | Entitlement webhook → JWT claims updated | payment / marketplace | Yes |
| 7 | Impersonate session creation | Admin | Yes |
| 8 | Audit query | Admin / Compliance | Yes |

## 6. Functional Areas

| Area | Description |
|------|-------------|
| FA-01 Account Lifecycle | Signup, activate, suspend, delete |
| FA-02 Authentication | Password, OTP, Google, Apple, biometric |
| FA-03 Session & Token | JWT, refresh rotation, replay detection |
| FA-04 RBAC & Entitlements | Roles + permissions matrix; entitlement claims in JWT |
| FA-05 MFA | TOTP enrollment + verify |
| FA-06 Device Mgmt | List + revoke devices/sessions |
| FA-07 Audit & Security Events | Append-only log + tamper-evident hash chain |
| FA-08 DPDPA Compliance | Data export + soft-delete + 30 d grace + purge |
| FA-09 Admin Operations | Search users, force-reset, impersonate, suspend |
| FA-10 Federation (Phase 2) | OIDC/SAML SSO for admin + institutions |
| FA-XC Cross-cutting | Health/ready endpoints · structured logs · OTel spans |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-ID-01 | Performance | JWT validate (internal endpoint or shared lib) | < 20 ms p95 |
| NFR-ID-02 | Performance | Login | < 300 ms p95 |
| NFR-ID-03 | Performance | Signup | < 500 ms p95 |
| NFR-ID-04 | Performance | Token refresh | < 100 ms p95 |
| NFR-ID-05 | Availability | Identity uptime | 99.95% Phase 1 → 99.99% Phase 2 |
| NFR-ID-06 | Security | bcrypt cost | ≥ 12 |
| NFR-ID-07 | Security | JWT alg | RS256 (asymmetric); HS256 only internal |
| NFR-ID-08 | Security | JWT signing-key rotation | quarterly + on incident |
| NFR-ID-09 | Security | Access-token TTL | 15 min |
| NFR-ID-10 | Security | Refresh-token TTL | 30 days sliding; rotate on every use |
| NFR-ID-11 | Security | Refresh replay detection | rotate-and-invalidate-chain; alert on reuse |
| NFR-ID-12 | Security | Password breach check | HIBP k-anonymity API (OQ-ID-01) |
| NFR-ID-13 | Security | Rate limit signup | 5/IP/hour |
| NFR-ID-14 | Security | Rate limit login | 5/identifier/15min |
| NFR-ID-15 | Security | Rate limit OTP | 3 sends/30min |
| NFR-ID-16 | Security | OWASP ASVS | L2 |
| NFR-ID-17 | Security | TLS | 1.3 |
| NFR-ID-18 | Security | PII at rest | field-level AES-256 (email index hashed) |
| NFR-ID-19 | Compliance | DPDPA delete grace | 30 days |
| NFR-ID-20 | Compliance | Audit retention | 1 year (OQ-ID-02 — could be longer) |
| NFR-ID-21 | Compliance | Audit tamper-evident | hash chain |
| NFR-ID-22 | Reliability | OTP idempotency | yes (Idempotency-Key header) |
| NFR-ID-23 | Reliability | Migration up/down | always implemented |
| NFR-ID-24 | Observability | OTel spans | login, signup, refresh, otp endpoints |
| NFR-ID-25 | Observability | Metrics | per-endpoint RED + auth failure rate alert |
| NFR-ID-26 | Cost | OTP send budget | per-tenant cap (Twilio cost) |
| NFR-ID-27 | DR | RPO / RTO | 15 min / 1 hr (Aurora multi-AZ) |
| NFR-ID-28 | Backwards compat | API versioning | `/v1/...` strict |

---

## 8. Constraints & Assumptions

### 8.1 Constraints
- **C-ID-01** FastAPI + Pydantic v2; no sync I/O on hot paths.
- **C-ID-02** Asyncpg + SQLAlchemy 2 async.
- **C-ID-03** Alembic migrations append-only with downgrade.
- **C-ID-04** JWT claims schema is shared via versioned spec; consumers pin version.
- **C-ID-05** Email casing normalised to lowercase; phone normalised to E.164.
- **C-ID-06** Refresh tokens stored as SHA-256 hash (never plaintext).
- **C-ID-07** Audit events written in same transaction as the mutation.
- **C-ID-08** No cross-schema FK to other services' schemas.

### 8.2 Assumptions
- **A-ID-01** Twilio + SES (or SendGrid via engagement) provisioned.
- **A-ID-02** Aurora Postgres 15 multi-AZ provisioned.
- **A-ID-03** Redis 7 cluster for OTP cache + rate-limit counters.
- **A-ID-04** AWS KMS for JWT signing key custody.

## 9. Dependencies

| ID | Depends on | For |
|----|-----------|-----|
| D-ID-01 | Twilio (SMS) | Phone OTP |
| D-ID-02 | SES or SendGrid via engagement | Email OTP + reset links |
| D-ID-03 | KMS | JWT signing key |
| D-ID-04 | Aurora Postgres | Primary store |
| D-ID-05 | Redis | OTP cache + rate limit |
| D-ID-06 | Stripe Identity (Phase 2 — via marketplace) | KYC link in user record |
| D-ID-07 | HIBP k-anonymity API (OQ-ID-01) | Breach check |
| D-ID-08 | IdP (Okta or Google Workspace — OQ-WA-01) | Admin SSO |

## 10. Risks

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R-ID-01 | Refresh-token theft (XSS or device compromise) | Med | Critical | Rotation + replay detection + HttpOnly+SameSite cookies on web; secure storage on mobile |
| R-ID-02 | JWT signing key leak | Low | Critical | KMS-managed; rotation policy; never logged |
| R-ID-03 | OTP brute force | Med | High | 6-digit + max 5 attempts + lockout |
| R-ID-04 | DDoS on login endpoint | Med | High | WAF + per-IP rate + behavioural challenge |
| R-ID-05 | Cross-tab race on refresh | High | Med | Single-flight refresh; BroadcastChannel sync on web |
| R-ID-06 | Soft-delete data lingering past grace | Low | High | Daily purge job + monitoring |

## 11. Success Criteria

identity Phase 1 is **Done** when:

1. All P0 FRs implemented + tests
2. NFR-ID-* verified
3. p95 login < 300 ms in staging load test (1000 concurrent)
4. JWT validate lib published + integrated by every other service
5. Audit log tamper-evident verified
6. DPDPA "download my data" + delete grace verified
7. Pen-test passed (CRITICAL)
8. Disaster recovery rehearsed (failover + restore from snapshot)

## 12. Open Questions

| # | Question | Owner | Resolve By |
|---|----------|-------|------------|
| OQ-ID-01 | Password breach check — HIBP k-anonymity vs local bloom | Security | Phase 1 Week 4 |
| OQ-ID-02 | Audit retention floor — 1 yr / 3 yr / 7 yr (legal) | Compliance | Phase 1 Week 2 |
| OQ-ID-03 | Refresh-token rotation: sliding vs absolute lifetime | Backend Lead | Phase 1 Week 3 |
| OQ-ID-04 | Email-change verification: must verify new email before old invalidated? | Product + Security | Phase 1 Week 5 |
| OQ-ID-05 | Phone-change cooldown? | Product | Phase 1 Week 5 |
| OQ-ID-06 | Impersonation: read-only vs full session (also OQ-WA-04) | Security + Product | Phase 1 Week 6 |
| OQ-ID-07 | Apple Sign In email-relay reconciliation | Mobile + Backend | Phase 1 Week 8 |
| OQ-ID-08 | Federation for institutions — Phase 2 vs 3 | Architecture | Phase 2 kickoff |

## 13. Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Backend Lead | _Pending_ | | |
| Security Lead | _Pending_ | | |
| Compliance | _Pending_ | | |
| QA Lead | _Pending_ | | |
