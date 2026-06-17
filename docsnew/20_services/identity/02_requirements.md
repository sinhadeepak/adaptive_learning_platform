# Requirements Catalogue — identity (service)

**Anchored to:** [BRD §6](./01_brd.md#6-functional-areas) · [Master BRD §5.2.1](../../00_platform/02_master_brd/master_brd.md#521-identity)

---

## FA-01 — Account Lifecycle

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-ID-01-01 | Signup with email + password creates `users` row, status `pending_otp` | P0 | 1 |
| FR-ID-01-02 | Signup with phone + OTP creates row, status `pending_otp` | P0 | 1 |
| FR-ID-01-03 | OTP verify transitions `pending_otp` → `active` | P0 | 1 |
| FR-ID-01-04 | Email/phone uniqueness enforced (case-normalised) | P0 | 1 |
| FR-ID-01-05 | Soft delete: status → `deleted_pending`, scheduled purge T+30d | P0 | 1 |
| FR-ID-01-06 | Daily purge job permanently removes rows past grace | P0 | 1 |
| FR-ID-01-07 | Suspend: status → `suspended`; reason + duration optional | P0 | 1 |
| FR-ID-01-08 | Unsuspend: returns to `active` | P0 | 1 |
| FR-ID-01-09 | Email-change requires verify-new flow | P0 | 1 |
| FR-ID-01-10 | Phone-change requires OTP on new number | P0 | 1 |
| FR-ID-01-11 | Account reactivation within grace allowed | P1 | 1 |
| FR-ID-01-12 | Email reservation: deleted email cannot resignup for 30 days | P0 | 1 |

## FA-02 — Authentication

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-ID-02-01 | Login with email + password | P0 | 1 |
| FR-ID-02-02 | Login with phone + OTP | P0 | 1 |
| FR-ID-02-03 | Google OAuth (web + mobile) | P0 | 1 |
| FR-ID-02-04 | Apple Sign In (iOS) | P0 | 1 |
| FR-ID-02-05 | Biometric bind: store device-bound refresh proof | P0 | 1 |
| FR-ID-02-06 | Biometric unlock: validate proof → issue tokens | P0 | 1 |
| FR-ID-02-07 | Send OTP via email (10 min TTL) | P0 | 1 |
| FR-ID-02-08 | Send OTP via SMS (5 min TTL) | P0 | 1 |
| FR-ID-02-09 | OTP verify with max 5 attempts | P0 | 1 |
| FR-ID-02-10 | Forgot password: send reset link (30 min TTL) | P0 | 1 |
| FR-ID-02-11 | Reset password invalidates all sessions | P0 | 1 |
| FR-ID-02-12 | Failed login: 5 attempts / 15 min lockout | P0 | 1 |
| FR-ID-02-13 | CAPTCHA after 3 failed logins per identifier | P0 | 1 |
| FR-ID-02-14 | Password breach check at signup + reset | P1 | 1 |

## FA-03 — Session & Token

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-ID-03-01 | Issue access JWT (15 min) signed RS256 | P0 | 1 |
| FR-ID-03-02 | Issue refresh token (30 d sliding) | P0 | 1 |
| FR-ID-03-03 | Refresh endpoint rotates token + returns new pair | P0 | 1 |
| FR-ID-03-04 | Replay detection: reused refresh → invalidate chain + alert | P0 | 1 |
| FR-ID-03-05 | Logout revokes refresh token | P0 | 1 |
| FR-ID-03-06 | Logout-everywhere revokes all sessions | P1 | 1 |
| FR-ID-03-07 | JWT validate (shared lib) public-key from JWKS | P0 | 1 |
| FR-ID-03-08 | JWKS endpoint exposes public keys + kid | P0 | 1 |
| FR-ID-03-09 | Signing key rotation: dual-publish then retire old | P0 | 1 |
| FR-ID-03-10 | Refresh token stored as SHA-256 hash | P0 | 1 |
| FR-ID-03-11 | Single-flight refresh: concurrent refreshes deduplicate | P0 | 1 |

## FA-04 — RBAC & Entitlements

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-ID-04-01 | Roles: student, expert, tutor, moderator, admin, super_admin, institution_admin | P0 | 1 |
| FR-ID-04-02 | Permissions per role documented in code (single source of truth) | P0 | 1 |
| FR-ID-04-03 | JWT carries `role` + `entitlements` claims | P0 | 1 |
| FR-ID-04-04 | Entitlement update webhook from payment | P0 | 1 |
| FR-ID-04-05 | Entitlement flip propagates within 60 s (rotate or short-TTL access token) | P0 | 1 |
| FR-ID-04-06 | Marketplace payouts_enabled entitlement from marketplace service | P0 | 2 |
| FR-ID-04-07 | Institution-admin role scoped to specific institution(s) | P1 | 2 |
| FR-ID-04-08 | Role escalation (e.g. student → expert applicant → expert) flow | P0 | 1 |

## FA-05 — MFA

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-ID-05-01 | TOTP enrollment: QR + secret + backup codes | P0 (admin) / P2 (student) | 1 / 2 |
| FR-ID-05-02 | TOTP verify on login (if enrolled) | P0 (admin) / P2 (student) | 1 / 2 |
| FR-ID-05-03 | Remove TOTP factor | P1 | 1 |
| FR-ID-05-04 | Hardware MFA (FIDO2/WebAuthn) for admin | P1 | 1 |
| FR-ID-05-05 | Backup-code use marked consumed | P0 | 1 |

## FA-06 — Device Management

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-ID-06-01 | Record device on each session (UA, IP-derived geo, device label) | P0 | 1 |
| FR-ID-06-02 | List my devices/sessions | P1 | 1 |
| FR-ID-06-03 | Revoke specific device → invalidate refresh tokens for that device | P1 | 1 |
| FR-ID-06-04 | Trust-device: longer sliding refresh for trusted | P2 | 2 |

## FA-07 — Audit & Security Events

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-ID-07-01 | Emit audit event on: signup, login_success, login_fail, logout, otp_send, otp_verify, password_change, role_change, suspend, unsuspend, delete, impersonate_start, impersonate_end, mfa_enroll, mfa_remove | P0 | 1 |
| FR-ID-07-02 | Audit event includes: actor, target, action, before/after, ip, ua, request_id, timestamp | P0 | 1 |
| FR-ID-07-03 | Append-only storage + hash chain | P0 | 1 |
| FR-ID-07-04 | Search audit by actor / target / action / time range | P0 | 1 |
| FR-ID-07-05 | Export audit (CSV/JSON) | P1 | 1 |
| FR-ID-07-06 | Retention policy enforced (OQ-ID-02) | P0 | 1 |

## FA-08 — DPDPA Compliance

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-ID-08-01 | Download my data: aggregate from identity + learning + quiz + payment + marketplace | P0 | 1 |
| FR-ID-08-02 | Async export job → email link to ZIP (signed S3 URL, 7-day expiry) | P0 | 1 |
| FR-ID-08-03 | Delete account: soft → grace → purge | P0 | 1 |
| FR-ID-08-04 | Cancel deletion within grace | P0 | 1 |
| FR-ID-08-05 | Cross-service purge: emits `user.purged` event | P0 | 1 |
| FR-ID-08-06 | Audit-event retention overrides delete (legal hold) | P0 | 1 |
| FR-ID-08-07 | Parental consent gate for under-18 (DPDPA §9) | P1 | 1 |

## FA-09 — Admin Operations

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-ID-09-01 | Search users (by email / phone / id / name) | P0 | 1 |
| FR-ID-09-02 | View user profile (read-only) | P0 | 1 |
| FR-ID-09-03 | Force password reset | P0 | 1 |
| FR-ID-09-04 | Suspend / unsuspend | P0 | 1 |
| FR-ID-09-05 | Impersonate session (Phase 2; OQ-ID-06) | P1 | 2 |
| FR-ID-09-06 | Force logout-everywhere on user | P0 | 1 |
| FR-ID-09-07 | Initiate deletion on user behalf | P0 | 1 |

## FA-10 — Federation (Phase 2)

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-ID-10-01 | OIDC IdP integration (Okta / Google Workspace) for admin | P0 | 1 (Phase 1.5) |
| FR-ID-10-02 | SAML IdP for institutions | P1 | 2 |
| FR-ID-10-03 | Just-in-time provisioning for SSO users | P1 | 2 |
| FR-ID-10-04 | Per-tenant IdP config | P2 | 3 |

## Cross-Cutting

| ID | Requirement | P |
|----|-------------|---|
| FR-ID-XC-01 | `/health` + `/ready` endpoints | P0 |
| FR-ID-XC-02 | Structured JSON logs | P0 |
| FR-ID-XC-03 | OTel spans on every endpoint | P0 |
| FR-ID-XC-04 | Idempotency-Key on all mutating endpoints | P0 |
| FR-ID-XC-05 | Versioned API (`/v1/`) | P0 |
| FR-ID-XC-06 | OpenAPI 3.1 published | P0 |
| FR-ID-XC-07 | Migrations always up + down | P0 |
| FR-ID-XC-08 | No cross-schema FK | P0 |
| FR-ID-XC-09 | Rate-limit headers in responses | P0 |
| FR-ID-XC-10 | Sentry SDK | P0 |
