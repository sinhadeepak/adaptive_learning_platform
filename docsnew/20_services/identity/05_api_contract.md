# API Contract — identity (service)

**Base URL:** `https://api.vidya.example/v1/identity` (versioned)
**Auth:** Most endpoints require `Authorization: Bearer <access_token>` unless marked `[anonymous]`. Admin endpoints additionally require `X-Admin-Reauth: <token>` (re-auth proof).
**Idempotency:** All mutating endpoints accept `Idempotency-Key` header (UUID v4 recommended; server stores 24 h).
**Error shape:** `{ "code": "ERR_CODE", "message": "human-readable", "details": {...}, "request_id": "..." }`.

> Full OpenAPI 3.1 spec lives in `/openapi/identity.yaml` (generated from this contract).

---

## Account Lifecycle

### `POST /signup` — [anonymous]
Create account.
- **Body:** `{ email?, phone?, password?, intent?: "student" | "expert", accept_tos: true, locale }`
- **200:** `{ user_id, otp_channel: "email" | "sms", otp_expires_at }`
- **409 `EMAIL_EXISTS` / `PHONE_EXISTS`** · **422 `VALIDATION_FAILED`** · **429 `RATE_LIMITED`**

### `POST /auth/otp/verify` — [anonymous]
Verify the OTP from signup or phone login.
- **Body:** `{ identifier, otp, purpose: "signup" | "login" | "change_email" | "change_phone" }`
- **200:** `{ access_token, refresh_token, user, expires_in }`
- **401 `INVALID_OTP`** · **410 `OTP_EXPIRED`** · **423 `OTP_LOCKED`** (after 5 fails)

### `POST /auth/otp/resend` — [anonymous]
- **Body:** `{ identifier, channel: "email" | "sms", purpose }`
- **200:** `{ otp_expires_at }` · **429 `RATE_LIMITED`** (max 3/30min)

### `PATCH /me` — auth required
Edit own profile (name, photo URL, locale).
- **200:** updated profile

### `POST /me/email-change` — auth required
- **Body:** `{ new_email }` → triggers OTP to new email; status `email_change_pending`
- **200:** `{ otp_expires_at }`

### `POST /me/phone-change` — auth required
Analogous to email-change.

### `DELETE /me` — auth required
Soft delete; sets `deleted_pending`. Purged T+30d.
- **200:** `{ purge_scheduled_at }`

### `POST /me/cancel-deletion` — auth required (during grace)
- **200:** restored

---

## Authentication

### `POST /auth/login` — [anonymous]
Email/phone + password.
- **Body:** `{ identifier, password, captcha_token? }`
- **200:** `{ access_token, refresh_token, user, expires_in }`
- **401 `INVALID_CREDENTIALS`** (same shape for wrong email and wrong password)
- **403 `SUSPENDED` / `NOT_VERIFIED`** · **410 `DELETION_PENDING`**
- **429 `RATE_LIMITED`** with `retry_after_sec`

### `POST /auth/login/google` — [anonymous]
- **Body:** `{ id_token }` (Google ID token)
- **200:** tokens + user. New user → record provisioned.

### `POST /auth/login/apple` — [anonymous]
- **Body:** `{ id_token, authorization_code? }`
- **200:** tokens + user.

### `POST /auth/login/phone-otp` — [anonymous]
Two-step. First: `POST /auth/otp/send`. Second: `POST /auth/otp/verify { purpose: "login" }`.

### `POST /auth/forgot-password` — [anonymous]
- **Body:** `{ identifier }`
- **204:** always (no enumeration). Sends link if account exists.

### `POST /auth/reset-password` — [anonymous]
- **Body:** `{ reset_token, new_password }`
- **204:** success; all sessions revoked.

### `POST /auth/biometric/bind` — auth required
- **Body:** `{ device_id, public_key, attestation? }`
- **204**

### `POST /auth/biometric/challenge` — [anonymous]
- **Body:** `{ device_id, identifier }`
- **200:** `{ challenge }`

### `POST /auth/biometric/unlock` — [anonymous]
- **Body:** `{ device_id, challenge_signature }`
- **200:** tokens + user · **401 `BIOMETRIC_INVALID`**

---

## Session & Token

### `POST /auth/refresh` — [anonymous] (refresh token in body or cookie)
- **Body:** `{ refresh_token }` (web may use HttpOnly cookie instead)
- **200:** `{ access_token, refresh_token, expires_in }` (rotated)
- **401 `REFRESH_INVALID`** · **403 `REFRESH_REPLAY`** (chain revoked)

### `POST /auth/logout` — auth required
Revoke this refresh token + this access (TTL).
- **204**

### `POST /auth/logout-everywhere` — auth required
- **204**

### `GET /auth/jwks.json` — [anonymous, cacheable]
Public keys for JWT validation.
- **200:** `{ keys: [...] }`

---

## RBAC & Entitlements

### `PUT /entitlements/{user_id}` — service-to-service auth
Set entitlement claims for a user. Called by payment + marketplace.
- **Body:** `{ entitlements: { premium: true, premium_until: "...", marketplace_payouts_enabled: false, ... } }`
- **204**

### `GET /me` — auth required
- **200:** full user incl roles + entitlements.

### `GET /roles` — admin
- **200:** roles + permission matrix.

### `POST /users/{user_id}/role` — admin
- **Body:** `{ role, scope?: { institution_id? } }`
- **204**

---

## MFA

### `POST /me/mfa/totp/enroll` — auth required
- **200:** `{ secret, qr_url, backup_codes: [...] }`

### `POST /me/mfa/totp/verify` — auth required (during enrollment)
- **Body:** `{ otp }`
- **204**

### `DELETE /me/mfa/totp` — auth required
- **204**

### `POST /me/mfa/webauthn/register` — auth required
- Standard WebAuthn ceremony.

---

## Device Management

### `GET /me/devices` — auth required
- **200:** `[{ id, label, ua, last_used, created_at, trusted }]`

### `DELETE /me/devices/{device_id}` — auth required
- **204**

---

## Audit

### `GET /admin/audit` — admin auth + re-auth
Search audit events.
- **Query:** `actor, target, action, from, to, cursor`
- **200:** `{ events: [...], next_cursor }`

### `POST /admin/audit/export` — admin
Async export job; returns `job_id`. Status via `GET /admin/jobs/{id}`.

---

## DPDPA

### `POST /me/data-export` — auth required
Start async export.
- **200:** `{ job_id }`

### `GET /me/data-export/{job_id}` — auth required
- **200:** `{ status: "queued" | "running" | "ready" | "failed", download_url?, expires_at? }`

---

## Admin Operations

### `GET /admin/users` — admin
Search by query.
- **Query:** `q, role?, status?, cursor`
- **200:** results page.

### `GET /admin/users/{user_id}` — admin
- **200:** profile + sessions + recent audit.

### `POST /admin/users/{user_id}/suspend` — admin + re-auth
- **Body:** `{ reason, until? }`
- **204**

### `POST /admin/users/{user_id}/unsuspend` — admin + re-auth
- **204**

### `POST /admin/users/{user_id}/force-reset` — admin + re-auth
- **204**

### `POST /admin/users/{user_id}/force-logout` — admin + re-auth
- **204**

### `POST /admin/impersonate` — super_admin + re-auth (Phase 2)
- **Body:** `{ target_user_id, reason, ticket_id? }`
- **200:** `{ imp_token, expires_at }`
- All actions during impersonated session audit-logged as `actor + impersonating + target`.

### `POST /admin/impersonate/end` — admin
- **204**

---

## Federation (Phase 2)

### `GET /auth/sso/redirect` — [anonymous]
- **Query:** `provider, return_to`
- **302:** redirect to IdP.

### `POST /auth/sso/callback` — [anonymous]
- **Body / Query:** IdP response.
- **200:** tokens.

---

## Rate Limits (per endpoint class)

| Class | Endpoints | Limit |
|---|---|---|
| Auth init | `/signup`, `/auth/login*`, `/auth/forgot-password` | 5/identifier/15min |
| OTP send | `/auth/otp/send`, `/auth/otp/resend` | 3/identifier/30min |
| OTP verify | `/auth/otp/verify` | 5 attempts/OTP, then locked |
| Refresh | `/auth/refresh` | 60/min/user |
| Admin | `/admin/*` | 60/min/admin user |
| Other auth | `/me/*` | 120/min/user |

---

## Common Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_FAILED` | 422 | Schema failed |
| `EMAIL_EXISTS` / `PHONE_EXISTS` | 409 | Duplicate |
| `INVALID_CREDENTIALS` | 401 | Wrong pw / token |
| `NOT_VERIFIED` | 403 | OTP not done |
| `SUSPENDED` | 403 | Account suspended |
| `DELETION_PENDING` | 410 | Soft deleted in grace |
| `RATE_LIMITED` | 429 | Throttled (include `Retry-After`) |
| `INVALID_OTP` | 401 | Wrong OTP |
| `OTP_EXPIRED` | 410 | Past TTL |
| `OTP_LOCKED` | 423 | Max attempts |
| `REFRESH_INVALID` | 401 | Bad refresh token |
| `REFRESH_REPLAY` | 403 | Replay detected — chain revoked |
| `MFA_REQUIRED` | 401 | Login needs MFA second step |
| `BIOMETRIC_INVALID` | 401 | Signature mismatch |
| `FORBIDDEN_ROLE` | 403 | RBAC denied |
| `IMPERSONATION_REQUIRED` | 401 | Endpoint allows only impersonated calls |
