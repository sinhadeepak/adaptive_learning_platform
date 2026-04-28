# alp-identity

Consolidated service that absorbs `services/auth/`, `services/user-profile/`, and `services/institution/`.

Per [ADR-0005](../../docs/adr/0005-service-consolidation.md), this is the destination for everything about *who the user is and what they can access* — credentials, profiles, tenants, cohorts, and feature flags.

## State

**Sprint A**: skeleton — boots `/health` only.
**Sprint D**: modules move in (auth → user-profile → institution); routers mount at `/auth/*`, `/profile/*`, `/institution/*`, `/flags/*`. JWT issuance, role contract, and the `flag.changed` NATS subject all preserved.

## Storage

Postgres DB `identity` with three schemas:

- `auth_schema` (users, refresh_tokens, otp_tokens, user_exam_selections, invite_links)
- `profile_schema` (profiles, exam_selections, bookmarks, achievements, mock_attempts, notification_prefs)
- `institution_schema` (feature_flags + overrides + audit, tenants, cohorts, cohort_invites)

Each schema keeps its own `alembic_version` table via `version_table_schema=<schema>`.

Plus Redis for auth lockout + flag cache (carries over from auth + institution).

## Cross-service edges (preserved)

- **`alp-identity → alp-payment`** (HTTP) — premium fallback when `payment.subscription.changed` is missed. 1s timeout + circuit-breaker per Sprint 8 R-2.
- **`alp-identity` consumes `payment.subscription.changed`** (NATS, durable) — flips `users.premium_until` on subscription state change. Subject + durable name unchanged from today's auth-side subscriber.
